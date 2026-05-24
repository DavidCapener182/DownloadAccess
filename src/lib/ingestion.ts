import {
  classifyText,
  hashText,
  isAtLeastSeverity,
  redactOperationalText,
} from "@/lib/classifier";
import { HttpError } from "@/lib/http";
import { getStore } from "@/lib/store";
import type { CaseRecord, CaseStatus, Severity } from "@/lib/types";

const severityRank: Record<Severity, number> = {
  Low: 1,
  Medium: 2,
  High: 3,
  Critical: 4,
};

const validStatuses: CaseStatus[] = [
  "New",
  "Reviewing",
  "Assigned",
  "In Progress",
  "Escalated",
  "Resolved",
  "Closed",
  "Ignored / Not Relevant",
];

type SourceEventPayload = {
  text?: string;
  raw_text?: string;
  source_id?: string | null;
  source_url?: string | null;
  source_platform?: string | null;
  monitor_mode?: "manual_review" | "auto_send_critical_only";
};

type PublicReportPayload = {
  issue_type?: string;
  location_id?: string | null;
  report_text?: string;
  assistance_required_now?: boolean;
  callback_required?: boolean;
  contact_name?: string | null;
  contact_phone?: string | null;
  consent_given?: boolean;
};

type ManualCasePayload = {
  title?: string;
  text?: string;
  severity?: Severity;
  status?: CaseStatus;
  category?: string;
  location_id?: string | null;
  assigned_to?: string | null;
};

function requireText(value: unknown, fieldName: string) {
  if (typeof value !== "string" || value.trim().length < 3) {
    throw new HttpError(400, `${fieldName} must contain at least 3 characters.`);
  }
  return value.trim();
}

function maxSeverity(a: Severity, b: Severity) {
  return severityRank[b] > severityRank[a] ? b : a;
}

function validateStatus(value: unknown): CaseStatus | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "string" && validStatuses.includes(value as CaseStatus)) {
    return value as CaseStatus;
  }

  throw new HttpError(400, "Invalid case status.");
}

export async function ingestSourceEvent(
  payload: SourceEventPayload,
  token: string | null,
) {
  const store = getStore();
  const source = await store.validateSourceToken(token, payload.source_id ?? null);

  if (!source) {
    throw new HttpError(401, "Source token is missing, invalid, or not approved.");
  }

  const rawText = requireText(payload.raw_text ?? payload.text, "text");
  const locations = await store.listLocations();
  const classification = classifyText(rawText, locations);
  const sourceUrl = payload.source_url ?? source.url;
  const textHash = hashText(`${source.id}:${sourceUrl ?? ""}:${rawText}`);
  const duplicate = await store.findDuplicateCase(textHash);

  if (duplicate) {
    const event = await store.createSourceEvent({
      source_id: source.id,
      raw_text: rawText,
      redacted_text: classification.redacted_text,
      text_hash: textHash,
      source_url: sourceUrl,
      matched_keywords: classification.matched_keywords,
      predicted_category: classification.category,
      predicted_severity: classification.severity,
      converted_case_id: duplicate.id,
      ignored: true,
      ignored_reason: "Duplicate of existing case.",
    });

    return { event, case: null, duplicate, classification };
  }

  let createdCase: CaseRecord | null = null;

  if (isAtLeastSeverity(classification.severity, "Medium")) {
    const locationId = await store.getLocationIdByName(
      classification.location_name,
    );

    createdCase = await store.createCase({
      title: classification.title,
      source_id: source.id,
      source_platform: payload.source_platform ?? source.platform,
      source_type: source.source_type,
      source_url: sourceUrl,
      original_text: rawText,
      redacted_text: classification.redacted_text,
      text_hash: textHash,
      category: classification.category,
      severity: classification.severity,
      status: "New",
      location_id: locationId,
      assigned_to: null,
      personal_data_present: classification.personal_data_present,
      special_category_risk: classification.special_category_risk,
      safeguarding_or_medical_flag:
        classification.safeguarding_or_medical_flag,
      duplicate_of: null,
      created_by: null,
    });
  }

  const event = await store.createSourceEvent({
    source_id: source.id,
    raw_text: rawText,
    redacted_text: classification.redacted_text,
    text_hash: textHash,
    source_url: sourceUrl,
    matched_keywords: classification.matched_keywords,
    predicted_category: classification.category,
    predicted_severity: classification.severity,
    converted_case_id: createdCase?.id ?? null,
    ignored: false,
    ignored_reason: null,
  });

  return { event, case: createdCase, duplicate: null, classification };
}

export async function createCaseFromPublicReport(payload: PublicReportPayload) {
  const reportText = requireText(payload.report_text, "report_text");
  const issueType = requireText(payload.issue_type, "issue_type");

  if (!payload.consent_given) {
    throw new HttpError(400, "Consent is required before submitting a report.");
  }

  const store = getStore();
  const locations = await store.listLocations();
  const location = locations.find((item) => item.id === payload.location_id);
  const classification = classifyText(`${issueType}. ${reportText}`, locations);
  const textHash = hashText(`public-report:${issueType}:${payload.location_id ?? ""}:${reportText}`);
  const baseSeverity = payload.assistance_required_now
    ? maxSeverity(classification.severity, "High")
    : classification.severity;
  const severity = issueType.toLowerCase().includes("medical")
    ? maxSeverity(baseSeverity, "High")
    : baseSeverity;

  const createdCase = await store.createCase({
    title: `${severity}: ${issueType}`,
    source_id: null,
    source_platform: "KSS form",
    source_type: "Direct QR Report",
    source_url: "/report",
    original_text: reportText,
    redacted_text: redactOperationalText(reportText),
    text_hash: textHash,
    category:
      classification.category === "Unclassified" ? issueType : classification.category,
    severity,
    status: payload.assistance_required_now ? "Escalated" : "New",
    location_id: payload.location_id ?? location?.id ?? null,
    assigned_to: null,
    personal_data_present: Boolean(
      classification.personal_data_present ||
        payload.contact_name ||
        payload.contact_phone,
    ),
    special_category_risk: true,
    safeguarding_or_medical_flag:
      classification.safeguarding_or_medical_flag ||
      issueType.toLowerCase().includes("medical"),
    duplicate_of: null,
    created_by: null,
  });

  const report = await store.createPublicReport({
    issue_type: issueType,
    location_id: payload.location_id ?? null,
    report_text: reportText,
    assistance_required_now: Boolean(payload.assistance_required_now),
    callback_required: Boolean(payload.callback_required),
    contact_name: payload.contact_name?.trim() || null,
    contact_phone: payload.contact_phone?.trim() || null,
    consent_given: true,
    converted_case_id: createdCase.id,
  });

  return { report, case: createdCase, classification };
}

export async function createManualCase(payload: ManualCasePayload) {
  const text = requireText(payload.text, "text");
  const store = getStore();
  const locations = await store.listLocations();
  const classification = classifyText(text, locations);
  const locationId =
    payload.location_id ??
    (await store.getLocationIdByName(classification.location_name));
  const severity = payload.severity
    ? maxSeverity(classification.severity, payload.severity)
    : classification.severity;

  const createdCase = await store.createCase({
    title: payload.title?.trim() || classification.title,
    source_id: null,
    source_platform: "Manual entry",
    source_type: "Manual Import",
    source_url: null,
    original_text: text,
    redacted_text: classification.redacted_text,
    text_hash: hashText(`manual:${text}`),
    category: payload.category?.trim() || classification.category,
    severity,
    status: payload.status ?? "New",
    location_id: locationId,
    assigned_to: payload.assigned_to ?? null,
    personal_data_present: classification.personal_data_present,
    special_category_risk: classification.special_category_risk,
    safeguarding_or_medical_flag: classification.safeguarding_or_medical_flag,
    duplicate_of: null,
    created_by: null,
  });

  return { case: createdCase, classification };
}

export async function updateCaseFromPayload(
  id: string,
  payload: Record<string, unknown>,
) {
  const updates: Partial<
    Pick<CaseRecord, "status" | "assigned_to" | "severity">
  > = {};

  const status = validateStatus(payload.status);
  if (status) {
    updates.status = status;
  }

  if (typeof payload.assigned_to === "string" || payload.assigned_to === null) {
    updates.assigned_to = payload.assigned_to;
  }

  if (
    typeof payload.severity === "string" &&
    ["Low", "Medium", "High", "Critical"].includes(payload.severity)
  ) {
    updates.severity = payload.severity as Severity;
  }

  if (!Object.keys(updates).length) {
    throw new HttpError(400, "No supported case fields were provided.");
  }

  const updated = await getStore().updateCase(id, updates, null);
  if (!updated) {
    throw new HttpError(404, "Case not found.");
  }

  return updated;
}
