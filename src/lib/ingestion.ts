import {
  classifyText,
  hashText,
  isAtLeastSeverity,
  redactOperationalText,
  summariseForTitle,
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
  post_title?: string | null;
  post_text?: string | null;
  comments?: unknown;
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

function normalizeComments(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        return item.trim();
      }

      if (
        item &&
        typeof item === "object" &&
        "text" in item &&
        typeof item.text === "string"
      ) {
        return item.text.trim();
      }

      return "";
    })
    .filter((item) => item.length >= 3)
    .slice(0, 20);
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim().length ? value.trim() : null;
}

function composeStructuredText(postText: string, comments: string[]) {
  return [postText, ...comments.map((comment) => `Comment: ${comment}`)]
    .filter(Boolean)
    .join("\n");
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

  const comments = normalizeComments(payload.comments);
  const payloadPostText = optionalText(payload.post_text);
  const rawText = requireText(
    payload.raw_text ?? payload.text ?? composeStructuredText(payloadPostText ?? "", comments),
    "text",
  );
  const postText = payloadPostText ?? rawText;
  const postTitle = optionalText(payload.post_title);
  const locations = await store.listLocations();
  const classification = classifyText(rawText, locations);
  const sourceUrl = payload.source_url ?? source.url;
  const textHash = hashText(`${source.id}:${sourceUrl ?? ""}:${rawText}`);
  const duplicate = await store.findDuplicateCase(textHash);
  const redactedPostText = redactOperationalText(postText);
  const redactedComments = comments.map(redactOperationalText);
  const redactedTitle =
    postTitle ? redactOperationalText(postTitle) : summariseForTitle(redactedPostText);

  if (duplicate) {
    const event = await store.createSourceEvent({
      source_id: source.id,
      raw_text: rawText,
      redacted_text: classification.redacted_text,
      post_title: redactedTitle,
      post_text: redactedPostText,
      comments: redactedComments,
      text_hash: textHash,
      source_url: sourceUrl,
      matched_keywords: classification.matched_keywords,
      predicted_category: classification.category,
      predicted_severity: classification.severity,
      relevance: classification.relevance,
      classification_reason: classification.reason,
      review_status: "Ignored",
      review_note: null,
      acknowledged_by: null,
      acknowledged_at: null,
      converted_case_id: duplicate.id,
      ignored: true,
      ignored_reason: "Duplicate of existing case.",
    });

    return { event, case: null, duplicate, classification };
  }

  let createdCase: CaseRecord | null = null;
  let event = await store.createSourceEvent({
    source_id: source.id,
    raw_text: rawText,
    redacted_text: classification.redacted_text,
    post_title: redactedTitle,
    post_text: redactedPostText,
    comments: redactedComments,
    text_hash: textHash,
    source_url: sourceUrl,
    matched_keywords: classification.matched_keywords,
    predicted_category: classification.category,
    predicted_severity: classification.severity,
    relevance: classification.relevance,
    classification_reason: classification.reason,
    review_status: "New",
    review_note: null,
    acknowledged_by: null,
    acknowledged_at: null,
    converted_case_id: null,
    ignored: false,
    ignored_reason: null,
  });

  if (
    classification.relevance === "Actionable" &&
    isAtLeastSeverity(classification.severity, "Medium")
  ) {
    const locationId = await store.getLocationIdByName(
      classification.location_name,
    );

    createdCase = await store.createCase({
      title: postTitle?.trim() || classification.title,
      source_event_id: event.id,
      source_id: source.id,
      source_platform: payload.source_platform ?? source.platform,
      source_type: source.source_type,
      source_url: sourceUrl,
      original_text: rawText,
      redacted_text: classification.redacted_text,
      post_title: redactedTitle,
      post_text: redactedPostText,
      comments: redactedComments,
      text_hash: textHash,
      category: classification.category,
      severity: classification.severity,
      relevance: classification.relevance,
      classification_reason: classification.reason,
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

    const updatedEvent = await store.updateSourceEvent(event.id, {
      converted_case_id: createdCase.id,
      review_status: "Escalated",
    });
    event = updatedEvent ?? event;
  }

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
    source_event_id: null,
    source_id: null,
    source_platform: "KSS form",
    source_type: "Direct QR Report",
    source_url: "/report",
    original_text: reportText,
    redacted_text: redactOperationalText(reportText),
    post_title: issueType,
    post_text: redactOperationalText(reportText),
    comments: [],
    text_hash: textHash,
    category:
      classification.category === "Unclassified" ? issueType : classification.category,
    severity,
    relevance: "Actionable",
    classification_reason: "Direct QR report submitted with explicit consent.",
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
    source_event_id: null,
    source_id: null,
    source_platform: "Manual entry",
    source_type: "Manual Import",
    source_url: null,
    original_text: text,
    redacted_text: classification.redacted_text,
    post_title: payload.title?.trim() || classification.title,
    post_text: classification.redacted_text,
    comments: [],
    text_hash: hashText(`manual:${text}`),
    category: payload.category?.trim() || classification.category,
    severity,
    relevance: classification.relevance,
    classification_reason: classification.reason,
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

export async function reviewSourceEvent(
  id: string,
  payload: Record<string, unknown>,
) {
  const action = typeof payload.action === "string" ? payload.action : null;
  if (!action || !["acknowledge", "ignore", "escalate"].includes(action)) {
    throw new HttpError(400, "Unsupported source event review action.");
  }

  const store = getStore();
  const event = await store.getSourceEvent(id);
  if (!event) {
    throw new HttpError(404, "Source event not found.");
  }

  if (action === "acknowledge") {
    const updated = await store.updateSourceEvent(id, {
      review_status: "Acknowledged",
      review_note: optionalText(payload.note),
      acknowledged_by: null,
      acknowledged_at: new Date().toISOString(),
    });
    return { event: updated, case: null };
  }

  if (action === "ignore") {
    const updated = await store.updateSourceEvent(id, {
      review_status: "Ignored",
      review_note: optionalText(payload.note),
      ignored: true,
      ignored_reason: optionalText(payload.note) || "Marked not relevant by control room.",
      acknowledged_by: null,
      acknowledged_at: new Date().toISOString(),
    });
    return { event: updated, case: null };
  }

  const severity =
    typeof payload.severity === "string" &&
    ["Low", "Medium", "High", "Critical"].includes(payload.severity)
      ? (payload.severity as Severity)
      : event.predicted_severity;
  const assignedTo =
    typeof payload.assigned_to === "string" || payload.assigned_to === null
      ? payload.assigned_to
      : null;

  if (event.converted_case_id) {
    const updatedCase = await store.updateCase(event.converted_case_id, {
      status: "Escalated",
      severity,
      assigned_to: assignedTo,
    });
    const updatedEvent = await store.updateSourceEvent(id, {
      review_status: "Escalated",
      review_note: optionalText(payload.note),
      acknowledged_by: null,
      acknowledged_at: new Date().toISOString(),
    });
    return { event: updatedEvent, case: updatedCase };
  }

  const locations = await store.listLocations();
  const classification = classifyText(event.raw_text, locations);
  const locationId = await store.getLocationIdByName(classification.location_name);
  const createdCase = await store.createCase({
    title:
      optionalText(payload.title) ||
      event.post_title ||
      `${severity}: ${event.predicted_category}`,
    source_event_id: event.id,
    source_id: event.source_id,
    source_platform: event.source_url?.includes("facebook.com")
      ? "Facebook"
      : "Source review",
    source_type: event.source_url?.includes("facebook.com")
      ? "Facebook Group"
      : "Chrome Extension",
    source_url: event.source_url,
    original_text: event.raw_text,
    redacted_text: event.redacted_text,
    post_title: event.post_title,
    post_text: event.post_text,
    comments: event.comments,
    text_hash: event.text_hash,
    category: event.predicted_category,
    severity,
    relevance: "Actionable",
    classification_reason:
      optionalText(payload.note) ||
      event.classification_reason ||
      "Escalated manually by event control.",
    status: "Escalated",
    location_id: locationId,
    assigned_to: assignedTo,
    personal_data_present: classification.personal_data_present,
    special_category_risk: classification.special_category_risk,
    safeguarding_or_medical_flag: classification.safeguarding_or_medical_flag,
    duplicate_of: null,
    created_by: null,
  });

  const updatedEvent = await store.updateSourceEvent(id, {
    converted_case_id: createdCase.id,
    review_status: "Escalated",
    review_note: optionalText(payload.note),
    acknowledged_by: null,
    acknowledged_at: new Date().toISOString(),
  });

  return { event: updatedEvent, case: createdCase };
}
