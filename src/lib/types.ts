export type UserRole =
  | "Admin"
  | "Duty Manager"
  | "Control Room Operator"
  | "Field Supervisor"
  | "Monitor"
  | "Read-only Client Viewer";

export type Severity = "Critical" | "High" | "Medium" | "Low";

export type Relevance =
  | "Actionable"
  | "Needs review"
  | "Information"
  | "Not relevant";

export type ReviewStatus = "New" | "Acknowledged" | "Escalated" | "Ignored";

export type CaseStatus =
  | "New"
  | "Reviewing"
  | "Assigned"
  | "In Progress"
  | "Escalated"
  | "Resolved"
  | "Closed"
  | "Ignored / Not Relevant";

export type SourceType =
  | "Chrome Extension"
  | "Facebook Group"
  | "Public API"
  | "RSS"
  | "Official Update"
  | "Weather"
  | "Travel"
  | "Direct QR Report"
  | "Manual Import";

export type Profile = {
  id: string;
  full_name: string;
  role: UserRole;
  active: boolean;
  created_at: string;
};

export type Source = {
  id: string;
  name: string;
  source_type: SourceType;
  platform: string;
  url: string | null;
  active: boolean;
  approved_for_monitoring: boolean;
  notes: string | null;
  created_at: string;
};

export type MonitoredKeyword = {
  id: string;
  keyword: string;
  category: string;
  severity: Severity;
  active: boolean;
  created_at: string;
};

export type SiteLocation = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  created_at: string;
};

export type CaseRecord = {
  id: string;
  title: string;
  source_event_id: string | null;
  source_id: string | null;
  source_platform: string | null;
  source_type: SourceType | string | null;
  source_url: string | null;
  original_text: string | null;
  redacted_text: string;
  post_title: string | null;
  post_text: string | null;
  comments: string[];
  media_urls: string[];
  text_hash: string;
  category: string;
  severity: Severity;
  relevance: Relevance;
  classification_reason: string | null;
  status: CaseStatus;
  location_id: string | null;
  assigned_to: string | null;
  personal_data_present: boolean;
  special_category_risk: boolean;
  safeguarding_or_medical_flag: boolean;
  duplicate_of: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

export type CaseAction = {
  id: string;
  case_id: string;
  action_type: string;
  note: string;
  created_by: string | null;
  created_at: string;
};

export type CaseStatusHistory = {
  id: string;
  case_id: string;
  old_status: CaseStatus | null;
  new_status: CaseStatus;
  changed_by: string | null;
  created_at: string;
};

export type SourceEvent = {
  id: string;
  source_id: string | null;
  raw_text: string;
  redacted_text: string;
  post_title: string | null;
  post_text: string | null;
  comments: string[];
  media_urls: string[];
  text_hash: string;
  source_url: string | null;
  matched_keywords: string[];
  predicted_category: string;
  predicted_severity: Severity;
  relevance: Relevance;
  classification_reason: string | null;
  review_status: ReviewStatus;
  review_note: string | null;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  converted_case_id: string | null;
  ignored: boolean;
  ignored_reason: string | null;
  created_at: string;
};

export type PublicReport = {
  id: string;
  issue_type: string;
  location_id: string | null;
  report_text: string;
  assistance_required_now: boolean;
  callback_required: boolean;
  contact_name: string | null;
  contact_phone: string | null;
  consent_given: boolean;
  converted_case_id: string | null;
  created_at: string;
};

export type AuditLog = {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type Alert = {
  id: string;
  case_id: string | null;
  alert_type: string;
  severity: Severity;
  message: string;
  acknowledged: boolean;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  created_at: string;
};

export type DashboardSnapshot = {
  cases: CaseRecord[];
  alerts: Alert[];
  source_events: SourceEvent[];
  case_actions: CaseAction[];
  profiles: Profile[];
  sources: Source[];
  locations: SiteLocation[];
  generated_at: string;
};

export type ClassificationResult = {
  title: string;
  category: string;
  severity: Severity;
  relevance: Relevance;
  reason: string;
  matched_keywords: string[];
  location_name: string | null;
  redacted_text: string;
  personal_data_present: boolean;
  special_category_risk: boolean;
  safeguarding_or_medical_flag: boolean;
};
