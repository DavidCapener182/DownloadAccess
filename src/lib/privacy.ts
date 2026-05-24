import type {
  CaseRecord,
  DashboardSnapshot,
  SourceEvent,
} from "@/lib/types";

export function sanitizeCase(record: CaseRecord): CaseRecord {
  return {
    ...record,
    original_text: null,
  };
}

export function sanitizeSourceEvent(event: SourceEvent): SourceEvent {
  return {
    ...event,
    raw_text: event.redacted_text,
  };
}

export function sanitizeDashboardSnapshot(
  snapshot: DashboardSnapshot,
): DashboardSnapshot {
  return {
    ...snapshot,
    cases: snapshot.cases.map(sanitizeCase),
    source_events: snapshot.source_events.map(sanitizeSourceEvent),
  };
}

export function sanitizeIngestionResult<T extends Record<string, unknown>>(
  result: T,
) {
  return {
    ...result,
    event: result.event
      ? sanitizeSourceEvent(result.event as SourceEvent)
      : result.event,
    case: result.case ? sanitizeCase(result.case as CaseRecord) : result.case,
    duplicate: result.duplicate
      ? sanitizeCase(result.duplicate as CaseRecord)
      : result.duplicate,
  };
}
