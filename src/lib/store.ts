import { createHash, randomUUID } from "node:crypto";
import { seedLocations, seedProfiles, seedSources } from "@/lib/seed";
import { getSupabaseAdmin, hasSupabaseEnv } from "@/lib/supabase/server";
import type {
  Alert,
  AuditLog,
  CaseAction,
  CaseRecord,
  CaseStatusHistory,
  DashboardSnapshot,
  Profile,
  PublicReport,
  SiteLocation,
  Source,
  SourceEvent,
} from "@/lib/types";

function now() {
  return new Date().toISOString();
}

function id(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}

function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function isActiveSource(source: Source | null | undefined) {
  return Boolean(source?.active && source?.approved_for_monitoring);
}

type NewSourceEvent = Omit<SourceEvent, "id" | "created_at">;
type NewCase = Omit<CaseRecord, "id" | "created_at" | "updated_at" | "resolved_at">;
type NewPublicReport = Omit<PublicReport, "id" | "created_at">;

export interface DataStore {
  listDashboard(): Promise<DashboardSnapshot>;
  listLocations(): Promise<SiteLocation[]>;
  findDuplicateCase(textHash: string): Promise<CaseRecord | null>;
  getLocationIdByName(name: string | null): Promise<string | null>;
  validateSourceToken(
    token: string | null,
    requestedSourceId?: string | null,
  ): Promise<Source | null>;
  createSourceEvent(event: NewSourceEvent): Promise<SourceEvent>;
  createCase(record: NewCase): Promise<CaseRecord>;
  updateCase(
    id: string,
    updates: Partial<Pick<CaseRecord, "status" | "assigned_to" | "severity">>,
    changedBy?: string | null,
  ): Promise<CaseRecord | null>;
  addCaseAction(
    caseId: string,
    actionType: string,
    note: string,
    createdBy?: string | null,
  ): Promise<CaseAction>;
  createPublicReport(report: NewPublicReport): Promise<PublicReport>;
  acknowledgeAlert(id: string, userId?: string | null): Promise<Alert | null>;
}

class MemoryStore implements DataStore {
  private profiles: Profile[] = [...seedProfiles];
  private sources: Source[] = [...seedSources];
  private locations: SiteLocation[] = [...seedLocations];
  private cases: CaseRecord[] = [];
  private sourceEvents: SourceEvent[] = [];
  private caseActions: CaseAction[] = [];
  private statusHistory: CaseStatusHistory[] = [];
  private alerts: Alert[] = [];
  private auditLog: AuditLog[] = [];
  private publicReports: PublicReport[] = [];

  constructor() {
    this.seedDemoData();
  }

  async listDashboard(): Promise<DashboardSnapshot> {
    return {
      cases: [...this.cases].sort(sortByNewest),
      alerts: [...this.alerts].sort(sortByNewest),
      source_events: [...this.sourceEvents].sort(sortByNewest).slice(0, 60),
      case_actions: [...this.caseActions].sort(sortByNewest).slice(0, 80),
      profiles: [...this.profiles],
      sources: [...this.sources],
      locations: [...this.locations],
      generated_at: now(),
    };
  }

  async listLocations() {
    return this.locations.filter((location) => location.active);
  }

  async findDuplicateCase(textHash: string) {
    return this.cases.find((record) => record.text_hash === textHash) ?? null;
  }

  async getLocationIdByName(name: string | null) {
    if (!name) {
      return null;
    }

    return (
      this.locations.find(
        (location) => location.name.toLowerCase() === name.toLowerCase(),
      )?.id ?? null
    );
  }

  async validateSourceToken(token: string | null, requestedSourceId?: string | null) {
    const configuredToken = process.env.EXTENSION_API_TOKEN;
    const devToken = process.env.NODE_ENV === "production" ? null : "dev-extension-token";
    const acceptedToken = configuredToken ?? devToken;

    if (!token || !acceptedToken || token !== acceptedToken) {
      return null;
    }

    const requestedSource =
      this.sources.find((source) => source.id === requestedSourceId) ??
      this.sources.find((source) => source.id === "source-chrome-extension") ??
      null;

    return isActiveSource(requestedSource) ? requestedSource : null;
  }

  async createSourceEvent(event: NewSourceEvent) {
    const created: SourceEvent = {
      ...event,
      id: id("event"),
      created_at: now(),
    };
    this.sourceEvents.unshift(created);
    this.audit("source_event.created", "source_events", created.id, {
      severity: event.predicted_severity,
      source_id: event.source_id,
      ignored: event.ignored,
    });
    return created;
  }

  async createCase(record: NewCase) {
    const createdAt = now();
    const created: CaseRecord = {
      ...record,
      id: id("case"),
      created_at: createdAt,
      updated_at: createdAt,
      resolved_at: null,
    };
    this.cases.unshift(created);
    this.statusHistory.unshift({
      id: id("status"),
      case_id: created.id,
      old_status: null,
      new_status: created.status,
      changed_by: created.created_by,
      created_at: createdAt,
    });
    this.audit("case.created", "cases", created.id, {
      severity: created.severity,
      category: created.category,
      location_id: created.location_id,
    });
    this.createAlertsForCase(created);
    return created;
  }

  async updateCase(
    caseId: string,
    updates: Partial<Pick<CaseRecord, "status" | "assigned_to" | "severity">>,
    changedBy?: string | null,
  ) {
    const target = this.cases.find((record) => record.id === caseId);
    if (!target) {
      return null;
    }

    const oldStatus = target.status;
    Object.assign(target, updates, {
      updated_at: now(),
      resolved_at:
        updates.status === "Resolved" || updates.status === "Closed"
          ? now()
          : target.resolved_at,
    });

    if (updates.status && updates.status !== oldStatus) {
      this.statusHistory.unshift({
        id: id("status"),
        case_id: target.id,
        old_status: oldStatus,
        new_status: updates.status,
        changed_by: changedBy ?? null,
        created_at: now(),
      });
    }

    this.audit("case.updated", "cases", target.id, updates);
    return target;
  }

  async addCaseAction(
    caseId: string,
    actionType: string,
    note: string,
    createdBy?: string | null,
  ) {
    const created: CaseAction = {
      id: id("action"),
      case_id: caseId,
      action_type: actionType,
      note,
      created_by: createdBy ?? null,
      created_at: now(),
    };
    this.caseActions.unshift(created);
    this.audit("case_action.created", "case_actions", created.id, {
      case_id: caseId,
      action_type: actionType,
    });
    return created;
  }

  async createPublicReport(report: NewPublicReport) {
    const created: PublicReport = {
      ...report,
      id: id("public-report"),
      created_at: now(),
    };
    this.publicReports.unshift(created);
    this.audit("public_report.created", "public_reports", created.id, {
      assistance_required_now: created.assistance_required_now,
      callback_required: created.callback_required,
    });
    return created;
  }

  async acknowledgeAlert(alertId: string, userId?: string | null) {
    const target = this.alerts.find((alert) => alert.id === alertId);
    if (!target) {
      return null;
    }

    target.acknowledged = true;
    target.acknowledged_by = userId ?? "profile-control-room";
    target.acknowledged_at = now();
    this.audit("alert.acknowledged", "alerts", target.id, {
      user_id: target.acknowledged_by,
    });
    return target;
  }

  private audit(
    action: string,
    entityType: string,
    entityId: string | null,
    metadata: Record<string, unknown>,
  ) {
    this.auditLog.unshift({
      id: id("audit"),
      user_id: null,
      action,
      entity_type: entityType,
      entity_id: entityId,
      metadata,
      created_at: now(),
    });
  }

  private createAlertsForCase(record: CaseRecord) {
    if (record.severity === "Critical") {
      this.alerts.unshift({
        id: id("alert"),
        case_id: record.id,
        alert_type: "Immediate dashboard alert",
        severity: "Critical",
        message: `Critical accessibility issue: ${record.title}`,
        acknowledged: false,
        acknowledged_by: null,
        acknowledged_at: null,
        created_at: now(),
      });
    }

    if (record.severity === "High") {
      this.alerts.unshift({
        id: id("alert"),
        case_id: record.id,
        alert_type: "High priority feed",
        severity: "High",
        message: `High priority case needs control room review: ${record.title}`,
        acknowledged: false,
        acknowledged_by: null,
        acknowledged_at: null,
        created_at: now(),
      });
    }

    if (record.safeguarding_or_medical_flag) {
      this.alerts.unshift({
        id: id("alert"),
        case_id: record.id,
        alert_type: "Restricted visibility",
        severity: record.severity,
        message: "Medical or safeguarding wording detected. Limit visibility and review details.",
        acknowledged: false,
        acknowledged_by: null,
        acknowledged_at: null,
        created_at: now(),
      });
    }

    this.createTrendAlerts(record);
  }

  private createTrendAlerts(record: CaseRecord) {
    if (!record.location_id) {
      return;
    }

    const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
    const recentSameLocation = this.cases.filter((item) => {
      return (
        item.location_id === record.location_id &&
        new Date(item.created_at).getTime() >= thirtyMinutesAgo &&
        item.status !== "Closed" &&
        item.status !== "Ignored / Not Relevant"
      );
    });

    const mediumCount = recentSameLocation.filter(
      (item) => item.severity === "Medium",
    ).length;

    if (mediumCount >= 3) {
      this.alerts.unshift({
        id: id("alert"),
        case_id: record.id,
        alert_type: "Location cluster escalation",
        severity: "High",
        message: "Three medium cases in the same location within 30 minutes. Escalate to High.",
        acknowledged: false,
        acknowledged_by: null,
        acknowledged_at: null,
        created_at: now(),
      });
    }

    const repeatedCategory = recentSameLocation.filter(
      (item) => item.category === record.category,
    ).length;

    if (repeatedCategory >= 2) {
      this.alerts.unshift({
        id: id("alert"),
        case_id: record.id,
        alert_type: "Repeated keyword trend",
        severity: record.severity === "Low" ? "Medium" : record.severity,
        message: `Repeated ${record.category.toLowerCase()} signal in the same location.`,
        acknowledged: false,
        acknowledged_by: null,
        acknowledged_at: null,
        created_at: now(),
      });
    }
  }

  private seedDemoData() {
    const first: CaseRecord = {
      id: "case-demo-critical",
      title: "Critical: wheelchair stuck",
      source_id: "source-chrome-extension",
      source_platform: "Browser",
      source_type: "Chrome Extension",
      source_url: "https://example.invalid/authorised-visible-page",
      original_text:
        "Demo signal: wheelchair stuck near Trackway East and cannot get out.",
      redacted_text:
        "Demo signal: wheelchair stuck near Trackway East and cannot get out.",
      text_hash:
        "demo-critical-wheelchair-stuck-trackway-east-cannot-get-out",
      category: "Mobility access",
      severity: "Critical",
      status: "New",
      location_id: "loc-trackway-east",
      assigned_to: null,
      personal_data_present: false,
      special_category_risk: true,
      safeguarding_or_medical_flag: false,
      duplicate_of: null,
      created_by: null,
      created_at: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
      resolved_at: null,
    };

    const second: CaseRecord = {
      id: "case-demo-high",
      title: "High: accessible toilet blocked",
      source_id: "source-qr-report",
      source_platform: "KSS form",
      source_type: "Direct QR Report",
      source_url: "/report",
      original_text:
        "Demo signal: accessible toilet blocked at Accessible Toilets North.",
      redacted_text:
        "Demo signal: accessible toilet blocked at Accessible Toilets North.",
      text_hash: "demo-high-accessible-toilet-blocked-north",
      category: "Accessible toilet",
      severity: "High",
      status: "Assigned",
      location_id: "loc-accessible-toilets-north",
      assigned_to: "profile-field-supervisor",
      personal_data_present: false,
      special_category_risk: true,
      safeguarding_or_medical_flag: false,
      duplicate_of: null,
      created_by: null,
      created_at: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
      resolved_at: null,
    };

    this.cases = [first, second];
    this.alerts = [
      {
        id: "alert-demo-critical",
        case_id: first.id,
        alert_type: "Immediate dashboard alert",
        severity: "Critical",
        message: `Critical accessibility issue: ${first.title}`,
        acknowledged: false,
        acknowledged_by: null,
        acknowledged_at: null,
        created_at: first.created_at,
      },
      {
        id: "alert-demo-high",
        case_id: second.id,
        alert_type: "High priority feed",
        severity: "High",
        message: `High priority case needs control room review: ${second.title}`,
        acknowledged: false,
        acknowledged_by: null,
        acknowledged_at: null,
        created_at: second.created_at,
      },
    ];
    this.caseActions = [
      {
        id: "action-demo-dispatch",
        case_id: second.id,
        action_type: "Field update",
        note: "Supervisor assigned to inspect and report back.",
        created_by: "profile-control-room",
        created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      },
    ];
  }
}

class SupabaseStore implements DataStore {
  private db = getSupabaseAdmin();
  private schema = process.env.SUPABASE_SCHEMA || "public";
  private tablePrefix = process.env.SUPABASE_TABLE_PREFIX || "dl_";

  private table(tableName: string) {
    return this.db.schema(this.schema).from(`${this.tablePrefix}${tableName}`);
  }

  async listDashboard(): Promise<DashboardSnapshot> {
    const [
      cases,
      alerts,
      sourceEvents,
      caseActions,
      profiles,
      sources,
      locations,
    ] = await Promise.all([
      this.selectMany<CaseRecord>("cases", "created_at", 100),
      this.selectMany<Alert>("alerts", "created_at", 100),
      this.selectMany<SourceEvent>("source_events", "created_at", 60),
      this.selectMany<CaseAction>("case_actions", "created_at", 80),
      this.selectMany<Profile>("profiles", "created_at", 100),
      this.selectMany<Source>("sources", "created_at", 100),
      this.selectMany<SiteLocation>("site_locations", "created_at", 100),
    ]);

    return {
      cases,
      alerts,
      source_events: sourceEvents,
      case_actions: caseActions,
      profiles,
      sources,
      locations,
      generated_at: now(),
    };
  }

  async listLocations() {
    const { data, error } = await this.table("site_locations")
      .select("*")
      .eq("active", true)
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as SiteLocation[];
  }

  async findDuplicateCase(textHash: string) {
    const { data, error } = await this.table("cases")
      .select("*")
      .eq("text_hash", textHash)
      .maybeSingle();
    if (error) throw error;
    return (data as CaseRecord | null) ?? null;
  }

  async getLocationIdByName(name: string | null) {
    if (!name) return null;
    const { data, error } = await this.table("site_locations")
      .select("id")
      .ilike("name", name)
      .maybeSingle();
    if (error) throw error;
    return (data?.id as string | undefined) ?? null;
  }

  async validateSourceToken(token: string | null) {
    if (!token) return null;

    const { data: tokenRow, error: tokenError } = await this.table("source_api_tokens")
      .select("source_id, active")
      .eq("token_hash", hashSecret(token))
      .eq("active", true)
      .maybeSingle();

    if (tokenError) throw tokenError;
    if (!tokenRow?.source_id) return null;

    const { data: source, error: sourceError } = await this.table("sources")
      .select("*")
      .eq("id", tokenRow.source_id)
      .eq("active", true)
      .eq("approved_for_monitoring", true)
      .maybeSingle();

    if (sourceError) throw sourceError;
    return (source as Source | null) ?? null;
  }

  async createSourceEvent(event: NewSourceEvent) {
    const { data, error } = await this.table("source_events")
      .insert(event)
      .select()
      .single();
    if (error) throw error;
    await this.audit("source_event.created", "source_events", data.id, {
      severity: event.predicted_severity,
      source_id: event.source_id,
      ignored: event.ignored,
    });
    return data as SourceEvent;
  }

  async createCase(record: NewCase) {
    const { data, error } = await this.table("cases")
      .insert(record)
      .select()
      .single();
    if (error) throw error;

    const created = data as CaseRecord;
    await this.table("case_status_history").insert({
      case_id: created.id,
      old_status: null,
      new_status: created.status,
      changed_by: created.created_by,
    });
    await this.audit("case.created", "cases", created.id, {
      severity: created.severity,
      category: created.category,
      location_id: created.location_id,
    });
    await this.createAlertsForCase(created);
    return created;
  }

  async updateCase(
    caseId: string,
    updates: Partial<Pick<CaseRecord, "status" | "assigned_to" | "severity">>,
    changedBy?: string | null,
  ) {
    const { data: existing, error: existingError } = await this.table("cases")
      .select("*")
      .eq("id", caseId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing) return null;

    const resolvedPatch =
      updates.status === "Resolved" || updates.status === "Closed"
        ? { resolved_at: now() }
        : {};

    const { data, error } = await this.table("cases")
      .update({ ...updates, ...resolvedPatch, updated_at: now() })
      .eq("id", caseId)
      .select()
      .single();
    if (error) throw error;

    if (updates.status && updates.status !== existing.status) {
      await this.table("case_status_history").insert({
        case_id: caseId,
        old_status: existing.status,
        new_status: updates.status,
        changed_by: changedBy ?? null,
      });
    }

    await this.audit("case.updated", "cases", caseId, updates);
    return data as CaseRecord;
  }

  async addCaseAction(
    caseId: string,
    actionType: string,
    note: string,
    createdBy?: string | null,
  ) {
    const { data, error } = await this.table("case_actions")
      .insert({
        case_id: caseId,
        action_type: actionType,
        note,
        created_by: createdBy ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    await this.audit("case_action.created", "case_actions", data.id, {
      case_id: caseId,
      action_type: actionType,
    });
    return data as CaseAction;
  }

  async createPublicReport(report: NewPublicReport) {
    const { data, error } = await this.table("public_reports")
      .insert(report)
      .select()
      .single();
    if (error) throw error;
    await this.audit("public_report.created", "public_reports", data.id, {
      assistance_required_now: report.assistance_required_now,
      callback_required: report.callback_required,
    });
    return data as PublicReport;
  }

  async acknowledgeAlert(alertId: string, userId?: string | null) {
    const { data, error } = await this.table("alerts")
      .update({
        acknowledged: true,
        acknowledged_by: userId ?? null,
        acknowledged_at: now(),
      })
      .eq("id", alertId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    await this.audit("alert.acknowledged", "alerts", alertId, {
      user_id: userId ?? null,
    });
    return data as Alert;
  }

  private async selectMany<T>(table: string, orderBy: string, limit: number) {
    const { data, error } = await this.table(table)
      .select("*")
      .order(orderBy, { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as T[];
  }

  private async audit(
    action: string,
    entityType: string,
    entityId: string | null,
    metadata: Record<string, unknown>,
  ) {
    await this.table("audit_log").insert({
      user_id: null,
      action,
      entity_type: entityType,
      entity_id: entityId,
      metadata,
    });
  }

  private async createAlertsForCase(record: CaseRecord) {
    const alerts: Array<Omit<Alert, "id" | "created_at">> = [];

    if (record.severity === "Critical") {
      alerts.push({
        case_id: record.id,
        alert_type: "Immediate dashboard alert",
        severity: "Critical",
        message: `Critical accessibility issue: ${record.title}`,
        acknowledged: false,
        acknowledged_by: null,
        acknowledged_at: null,
      });
    }

    if (record.severity === "High") {
      alerts.push({
        case_id: record.id,
        alert_type: "High priority feed",
        severity: "High",
        message: `High priority case needs control room review: ${record.title}`,
        acknowledged: false,
        acknowledged_by: null,
        acknowledged_at: null,
      });
    }

    if (record.safeguarding_or_medical_flag) {
      alerts.push({
        case_id: record.id,
        alert_type: "Restricted visibility",
        severity: record.severity,
        message: "Medical or safeguarding wording detected. Limit visibility and review details.",
        acknowledged: false,
        acknowledged_by: null,
        acknowledged_at: null,
      });
    }

    if (alerts.length) {
      await this.table("alerts").insert(alerts);
    }
  }
}

function sortByNewest(a: { created_at: string }, b: { created_at: string }) {
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

declare global {
  var __kssAccessibilityStore: MemoryStore | undefined;
}

export function getStore(): DataStore {
  if (hasSupabaseEnv()) {
    return new SupabaseStore();
  }

  globalThis.__kssAccessibilityStore ??= new MemoryStore();
  return globalThis.__kssAccessibilityStore;
}
