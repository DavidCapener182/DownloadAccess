export type Severity = "Critical" | "High" | "Medium" | "Low";

export type MonitoringMode = "manual_review" | "auto_send_critical_only";

export type ExtensionSettings = {
  apiUrl: string;
  apiToken: string;
  sourceId: string;
  sourceName: string;
  allowedDomains: string[];
  allowedPageUrls: string[];
  monitoringMode: MonitoringMode;
  paused: boolean;
};

export type DetectedIssue = {
  id: string;
  text: string;
  title: string;
  postText: string;
  comments: string[];
  redactedText: string;
  severity: Severity;
  category: string;
  matchedKeywords: string[];
  sourceUrl: string;
  detectedAt: string;
  submittedAt?: string;
  submitError?: string;
};

export type StoredState = Partial<ExtensionSettings> & {
  recentDetections?: DetectedIssue[];
};

export type BackfillResult = {
  ok: boolean;
  scanned: number;
  matched: number;
  submitted: number;
  queued: number;
  error?: string;
};
