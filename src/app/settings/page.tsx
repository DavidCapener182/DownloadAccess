import {
  AlertTriangle,
  Database,
  Link2,
  Settings,
  Lock,
} from "lucide-react";
import { Badge, SeverityBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { sanitizeDashboardSnapshot } from "@/lib/privacy";
import { getStore } from "@/lib/store";
import type { CaseRecord, DashboardSnapshot, SourceEvent } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SettingsPageProps = {
  searchParams: Promise<{
    locked?: string | string[];
  }>;
};

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const query = await searchParams;
  const snapshot = sanitizeDashboardSnapshot(await getStore().listDashboard());
  const sourcesById = new Map(snapshot.sources.map((source) => [source.id, source]));
  const standaloneCases = snapshot.cases.filter((record) => !record.source_event_id);
  const linkedCaseCount = snapshot.cases.filter((record) => record.source_event_id).length;
  const lockedMessage = firstParam(query.locked);

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 lg:px-8">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <section className="rounded-lg border border-border bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-teal-700 text-white">
                  <Settings aria-hidden className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">
                    Settings
                  </p>
                  <h1 className="text-2xl font-semibold tracking-normal">
                    System cleanup
                  </h1>
                </div>
              </div>
              <Badge className="bg-slate-100 text-slate-800">
                {snapshot.source_events.length} posts loaded
              </Badge>
            </div>
          </section>

          {lockedMessage ? (
            <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              <AlertTriangle aria-hidden className="h-4 w-4 shrink-0" />
              <span>{lockedMessage}</span>
            </div>
          ) : null}

          <Card>
            <CardHeader
              title="Stored source posts"
              meta="Review captured posts; deletion is locked until admin auth is added"
            />
            <div className="divide-y divide-border">
              {snapshot.source_events.length ? (
                snapshot.source_events.map((event) => (
                  <SourceEventCleanupRow
                    key={event.id}
                    event={event}
                    linkedCases={findLinkedCases(event, snapshot)}
                    sourceName={sourcesById.get(event.source_id ?? "")?.name ?? "Unknown source"}
                  />
                ))
              ) : (
                <EmptyState label="No source posts are currently stored." />
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Standalone cases"
              meta="Manual intake and QR reports without a source post"
            />
            <div className="divide-y divide-border">
              {standaloneCases.length ? (
                standaloneCases.map((record) => (
                  <StandaloneCaseCleanupRow key={record.id} record={record} />
                ))
              ) : (
                <EmptyState label="No standalone cases are currently stored." />
              )}
            </div>
          </Card>
        </div>

        <aside className="space-y-5">
          <Card>
            <CardHeader title="Cleanup scope" meta="Current loaded records" />
            <div className="space-y-3 p-4 text-sm">
              <SummaryLine label="Source posts" value={snapshot.source_events.length} />
              <SummaryLine label="Linked cases" value={linkedCaseCount} />
              <SummaryLine label="Standalone cases" value={standaloneCases.length} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Cleanup status" />
            <div className="space-y-3 p-4 text-sm text-slate-700">
              <EffectLine text="Review rows here before deciding whether old test data should be removed." />
              <EffectLine text="Removal controls are disabled until this route has authenticated admin access." />
              <EffectLine text="Use Supabase audit history for any manual cleanup performed before admin auth exists." />
            </div>
          </Card>
        </aside>
      </div>
    </main>
  );
}

function SourceEventCleanupRow({
  event,
  linkedCases,
  sourceName,
}: {
  event: SourceEvent;
  linkedCases: CaseRecord[];
  sourceName: string;
}) {
  const title = event.post_title || event.predicted_category;
  const text = event.post_text || event.redacted_text;

  return (
    <article className="grid gap-4 p-4 lg:grid-cols-[1fr_auto]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={event.predicted_severity} />
          <Badge>{event.review_status}</Badge>
          <Badge>{event.relevance}</Badge>
          {linkedCases.length ? (
            <Badge className="bg-teal-50 text-teal-900">
              {linkedCases.length} linked case{linkedCases.length === 1 ? "" : "s"}
            </Badge>
          ) : null}
        </div>
        <h2 className="mt-3 truncate text-base font-semibold">{title}</h2>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-700">
          {text}
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span>{sourceName}</span>
          <span>{formatDateTime(event.created_at)}</span>
          {event.source_url ? (
            <a
              className="inline-flex items-center gap-1 font-medium text-teal-800 underline"
              href={event.source_url}
              rel="noreferrer"
              target="_blank"
            >
              <Link2 aria-hidden className="h-3 w-3" />
              Source
            </a>
          ) : null}
        </div>
      </div>
      <LockedCleanupButton />
    </article>
  );
}

function StandaloneCaseCleanupRow({ record }: { record: CaseRecord }) {
  return (
    <article className="grid gap-4 p-4 lg:grid-cols-[1fr_auto]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={record.severity} />
          <Badge>{record.status}</Badge>
          <Badge>{record.source_type ?? "Manual"}</Badge>
        </div>
        <h2 className="mt-3 truncate text-base font-semibold">{record.title}</h2>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-700">
          {record.post_text || record.redacted_text}
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span>{record.category}</span>
          <span>{formatDateTime(record.created_at)}</span>
        </div>
      </div>
      <LockedCleanupButton />
    </article>
  );
}

function LockedCleanupButton() {
  return (
    <div className="flex items-start justify-end">
      <Button type="button" variant="secondary" size="sm" disabled>
        <Lock aria-hidden className="h-4 w-4" />
        Locked
      </Button>
    </div>
  );
}

function SummaryLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function EffectLine({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2">
      <Database aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-teal-800" />
      <span>{text}</span>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="px-4 py-10 text-center text-sm text-muted-foreground">{label}</div>;
}

function findLinkedCases(event: SourceEvent, snapshot: DashboardSnapshot) {
  return snapshot.cases.filter((record) => {
    return (
      record.source_event_id === event.id ||
      Boolean(event.converted_case_id && record.id === event.converted_case_id)
    );
  });
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
