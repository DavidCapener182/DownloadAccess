"use client";

import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  FileDown,
  Megaphone,
  QrCode,
  Radio,
  RefreshCw,
  Send,
  ShieldAlert,
  UserCheck,
} from "lucide-react";
import Link from "next/link";
import type React from "react";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Badge, SeverityBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import type {
  Alert,
  CaseRecord,
  CaseStatus,
  DashboardSnapshot,
  Profile,
  SiteLocation,
  SourceEvent,
} from "@/lib/types";
import { cn, formatDateTime, minutesBetween } from "@/lib/utils";

const openStatuses: CaseStatus[] = [
  "New",
  "Reviewing",
  "Assigned",
  "In Progress",
  "Escalated",
];

const statusOptions: CaseStatus[] = [
  "New",
  "Reviewing",
  "Assigned",
  "In Progress",
  "Escalated",
  "Resolved",
  "Closed",
  "Ignored / Not Relevant",
];

export function LiveMonitorDashboard({
  initialSnapshot,
}: {
  initialSnapshot: DashboardSnapshot;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [manualText, setManualText] = useState("");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [manualBusy, startManualTransition] = useTransition();
  const [refreshing, startRefreshTransition] = useTransition();

  const refresh = useCallback(() => {
    startRefreshTransition(() => {
      void fetch("/api/dashboard/live", { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error("Live feed request failed.");
          }
          setSnapshot(await response.json());
          setConnectionError(null);
        })
        .catch(() => {
          setConnectionError("Live feed connection interrupted. Retrying.");
        });
    });
  }, [startRefreshTransition]);

  useEffect(() => {
    const timer = window.setInterval(refresh, 6000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const openCases = useMemo(
    () => snapshot.cases.filter((item) => openStatuses.includes(item.status)),
    [snapshot.cases],
  );
  const criticalAlerts = snapshot.alerts.filter(
    (alert) => alert.severity === "Critical" && !alert.acknowledged,
  );
  const highAlerts = snapshot.alerts.filter(
    (alert) => alert.severity === "High" && !alert.acknowledged,
  );
  const reviewEvents = snapshot.source_events.filter(
    (event) =>
      event.review_status === "New" &&
      !event.converted_case_id &&
      !event.ignored,
  );
  const summary = buildSummary(snapshot);

  const createManualCase = () => {
    startManualTransition(() => {
      void fetch("/api/cases", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: manualText, status: "Reviewing" }),
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error("Manual intake request failed.");
          }
          setManualText("");
          refresh();
        })
        .catch(() => {
          setConnectionError("Manual intake could not reach the API.");
        });
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-teal-700 text-white">
              <Radio aria-hidden className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">
                Download Festival operations
              </p>
              <h1 className="text-xl font-semibold tracking-normal">
                KSS Accessibility Live Monitor
              </h1>
            </div>
          </div>
          <nav className="flex flex-wrap items-center gap-2 text-sm">
            <Link className="rounded-md px-3 py-2 font-medium hover:bg-muted" href="/">
              Live
            </Link>
            <Link
              className="rounded-md px-3 py-2 font-medium hover:bg-muted"
              href="/report"
            >
              QR form
            </Link>
            <Link
              className="rounded-md px-3 py-2 font-medium hover:bg-muted"
              href="/extension"
            >
              Extension
            </Link>
            <Link
              className="rounded-md px-3 py-2 font-medium hover:bg-muted"
              href="/compliance"
            >
              Compliance
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        {criticalAlerts.length ? (
          <CriticalBanner
            alerts={criticalAlerts}
            cases={snapshot.cases}
            onAcknowledge={async (id) => {
              await fetch(`/api/alerts/${id}/acknowledge`, { method: "POST" });
              refresh();
            }}
          />
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Open cases" value={openCases.length.toString()} />
          <Metric
            label="Critical"
            value={summary.criticalOpen.toString()}
            intent={summary.criticalOpen ? "danger" : "default"}
          />
          <Metric label="High alerts" value={highAlerts.length.toString()} />
          <Metric label="Latest signal" value={summary.latestSignal} compact />
        </div>

        {connectionError ? (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            <AlertTriangle aria-hidden className="h-4 w-4 shrink-0" />
            <span>{connectionError}</span>
          </div>
        ) : null}

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.85fr)]">
          <div className="space-y-5">
            <Card>
              <CardHeader
                title="Source review"
                meta={`${reviewEvents.length} waiting for control-room triage`}
              />
              <div className="divide-y divide-border">
                {reviewEvents.length ? (
                  reviewEvents.map((event) => (
                    <SourceEventRow
                      key={event.id}
                      event={event}
                      onReview={async (payload) => {
                        await fetch(`/api/source-events/${event.id}`, {
                          method: "PATCH",
                          headers: { "content-type": "application/json" },
                          body: JSON.stringify(payload),
                        });
                        refresh();
                      }}
                    />
                  ))
                ) : (
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No source events waiting review.
                  </div>
                )}
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Live feed"
                meta={`${openCases.length} open, refreshed ${formatDateTime(snapshot.generated_at)}`}
              >
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={exportCases(snapshot)}>
                    <FileDown aria-hidden className="h-4 w-4" />
                    CSV
                  </Button>
                  <Button variant="secondary" size="icon" onClick={refresh} title="Refresh feed">
                    <RefreshCw
                      aria-hidden
                      className={cn("h-4 w-4", refreshing && "animate-spin")}
                    />
                  </Button>
                </div>
              </CardHeader>
              <div className="divide-y divide-border">
                {openCases.length ? (
                  openCases.map((record) => (
                    <CaseRow
                      key={record.id}
                      record={record}
                      profiles={snapshot.profiles}
                      locations={snapshot.locations}
                      actions={snapshot.case_actions.filter(
                        (action) => action.case_id === record.id,
                      )}
                      onUpdate={async (payload) => {
                        await fetch(`/api/cases/${record.id}`, {
                          method: "PATCH",
                          headers: { "content-type": "application/json" },
                          body: JSON.stringify(payload),
                        });
                        refresh();
                      }}
                      onAction={async (note) => {
                        await fetch(`/api/cases/${record.id}/actions`, {
                          method: "POST",
                          headers: { "content-type": "application/json" },
                          body: JSON.stringify({
                            action_type: "Action taken",
                            note,
                          }),
                        });
                        refresh();
                      }}
                    />
                  ))
                ) : (
                  <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                    No open cases.
                  </div>
                )}
              </div>
            </Card>

            <Card>
              <CardHeader title="Manual intake" meta="Control room entry" />
              <div className="space-y-3 p-4">
                <textarea
                  className="min-h-24 w-full rounded-md border border-border bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  value={manualText}
                  onChange={(event) => setManualText(event.target.value)}
                  placeholder="Paste an operational issue summary..."
                />
                <div className="flex justify-end">
                  <Button
                    disabled={manualBusy || manualText.trim().length < 3}
                    onClick={createManualCase}
                  >
                    <Send aria-hidden className="h-4 w-4" />
                    Create case
                  </Button>
                </div>
              </div>
            </Card>
          </div>

          <aside className="space-y-5">
            <Card>
              <CardHeader title="Daily summary" meta="Operational readout" />
              <div className="grid gap-3 p-4 text-sm">
                <SummaryLine label="Top location" value={summary.topLocation} />
                <SummaryLine label="Primary category" value={summary.topCategory} />
                <SummaryLine label="Restricted cases" value={summary.restricted.toString()} />
                <SummaryLine label="Duplicate signals" value={summary.duplicates.toString()} />
              </div>
            </Card>

            <BreakdownCard
              title="Cases by status"
              items={groupCounts(snapshot.cases, "status")}
            />
            <BreakdownCard
              title="Cases by severity"
              items={groupCounts(snapshot.cases, "severity")}
            />
            <BreakdownCard
              title="Cases by location"
              items={groupLocationCounts(snapshot.cases, snapshot.locations)}
            />
            <BreakdownCard
              title="Cases by source"
              items={groupCounts(snapshot.cases, "source_type")}
            />

            <Card>
              <CardHeader title="Source controls" meta="Approved routes only" />
              <div className="space-y-3 p-4">
                {snapshot.sources.map((source) => (
                  <div
                    key={source.id}
                    className="flex items-start justify-between gap-3 rounded-md border border-border p-3"
                  >
                    <div>
                      <p className="text-sm font-medium">{source.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {source.platform} - {source.source_type}
                      </p>
                      {source.url ? (
                        <a
                          className="mt-1 block text-xs font-medium text-teal-800 underline"
                          href={source.url}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Open source
                        </a>
                      ) : null}
                    </div>
                    <Badge
                      className={
                        source.active && source.approved_for_monitoring
                          ? "bg-teal-50 text-teal-900"
                          : "bg-slate-100 text-slate-700"
                      }
                    >
                      {source.active && source.approved_for_monitoring
                        ? "Approved"
                        : "Off"}
                    </Badge>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <CardHeader title="Privacy flags" meta="UK GDPR posture" />
              <div className="space-y-3 p-4 text-sm">
                <FlagLine icon={ShieldAlert} text="Original text is restricted data." />
                <FlagLine icon={Bell} text="Medical and safeguarding terms are marked." />
                <FlagLine icon={QrCode} text="Direct reports require consent." />
              </div>
            </Card>
          </aside>
        </div>
      </main>
    </div>
  );
}

function CriticalBanner({
  alerts,
  cases,
  onAcknowledge,
}: {
  alerts: Alert[];
  cases: CaseRecord[];
  onAcknowledge: (id: string) => Promise<void>;
}) {
  return (
    <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-red-950">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <AlertTriangle aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <h2 className="text-sm font-semibold">Critical alerts</h2>
            <div className="mt-2 space-y-1 text-sm">
              {alerts.map((alert) => {
                const record = cases.find((item) => item.id === alert.case_id);
                return (
                  <p key={alert.id}>
                    {alert.message}
                    {record ? ` - ${record.status}` : ""}
                  </p>
                );
              })}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {alerts.map((alert) => (
            <Button
              key={alert.id}
              variant="danger"
              size="sm"
              onClick={() => onAcknowledge(alert.id)}
            >
              <CheckCircle2 aria-hidden className="h-4 w-4" />
              Acknowledge
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  compact,
  intent = "default",
}: {
  label: string;
  value: string;
  compact?: boolean;
  intent?: "default" | "danger";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-white p-4 shadow-sm",
        intent === "danger" && "border-red-200 bg-red-50",
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 font-semibold tracking-normal",
          compact ? "text-base" : "text-3xl",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function SourceEventRow({
  event,
  onReview,
}: {
  event: SourceEvent;
  onReview: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [busy, startTransition] = useTransition();
  const severityForEscalation =
    event.predicted_severity === "Low" ? "Medium" : event.predicted_severity;
  const text = event.post_text || event.redacted_text;

  return (
    <article className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={event.predicted_severity} />
            <Badge>{event.relevance}</Badge>
            <Badge>{event.predicted_category}</Badge>
          </div>
          <h3 className="mt-3 text-base font-semibold">
            {event.post_title || event.predicted_category}
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-700">{text}</p>
          <CommentAccordion comments={event.comments ?? []} />
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>Source signal</span>
            <span>{event.classification_reason ?? "Awaiting review"}</span>
            <span>Created: {formatDateTime(event.created_at)}</span>
          </div>
        </div>
        <div className="flex min-w-52 flex-col gap-2">
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              startTransition(() => {
                void onReview({ action: "acknowledge" });
              })
            }
          >
            <CheckCircle2 aria-hidden className="h-4 w-4" />
            Acknowledge
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              startTransition(() => {
                void onReview({
                  action: "ignore",
                  note: "Reviewed by control room and marked not relevant.",
                });
              })
            }
          >
            Not relevant
          </Button>
          <Button
            disabled={busy}
            onClick={() =>
              startTransition(() => {
                void onReview({
                  action: "escalate",
                  severity: severityForEscalation,
                  title: event.post_title ?? undefined,
                });
              })
            }
          >
            <ShieldAlert aria-hidden className="h-4 w-4" />
            Escalate
          </Button>
        </div>
      </div>
    </article>
  );
}

function CaseRow({
  record,
  profiles,
  locations,
  actions,
  onUpdate,
  onAction,
}: {
  record: CaseRecord;
  profiles: Profile[];
  locations: SiteLocation[];
  actions: { id: string; note: string; created_at: string }[];
  onUpdate: (payload: Record<string, unknown>) => Promise<void>;
  onAction: (note: string) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [busy, startTransition] = useTransition();
  const location = locations.find((item) => item.id === record.location_id);
  const assigned = profiles.find((item) => item.id === record.assigned_to);
  const ageMinutes = minutesBetween(record.created_at);

  return (
    <article className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={record.severity} />
            <Badge>{record.status}</Badge>
            {record.duplicate_of ? <Badge>Duplicate</Badge> : null}
            {record.special_category_risk ? (
              <Badge className="bg-violet-50 text-violet-950">Restricted detail</Badge>
            ) : null}
          </div>
          <h3 className="mt-3 text-base font-semibold">{record.title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            {record.post_text || record.redacted_text}
          </p>
          <CommentAccordion comments={record.comments ?? []} />
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>{location?.name ?? "Location pending"}</span>
            <span>Source: {record.source_type ?? "Unknown"}</span>
            <span>{record.relevance}</span>
            <span>SLA age: {ageMinutes}m</span>
            <span>Created: {formatDateTime(record.created_at)}</span>
          </div>
        </div>
        <div className="flex min-w-48 flex-col gap-2">
          <select
            className="h-9 rounded-md border border-border bg-white px-2 text-sm"
            value={record.status}
            onChange={(event) => onUpdate({ status: event.target.value })}
          >
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border border-border bg-white px-2 text-sm"
            value={record.assigned_to ?? ""}
            onChange={(event) =>
              onUpdate({ assigned_to: event.target.value || null, status: "Assigned" })
            }
          >
            <option value="">Unassigned</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.full_name}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onUpdate({ status: "In Progress" })}
            >
              <UserCheck aria-hidden className="h-4 w-4" />
              Start
            </Button>
            <Button
              size="sm"
              onClick={() => onUpdate({ status: "Resolved" })}
            >
              <CheckCircle2 aria-hidden className="h-4 w-4" />
              Resolve
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 rounded-md bg-slate-50 p-3 md:grid-cols-[1fr_auto]">
        <input
          className="h-9 rounded-md border border-border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={
            assigned ? `Action note for ${assigned.full_name}` : "Action taken..."
          }
        />
        <Button
          variant="secondary"
          disabled={busy || note.trim().length < 3}
          onClick={() =>
            startTransition(async () => {
              await onAction(note);
              setNote("");
            })
          }
        >
          <Megaphone aria-hidden className="h-4 w-4" />
          Log action
        </Button>
      </div>
      {actions.length ? (
        <div className="mt-3 space-y-1 text-xs text-muted-foreground">
          {actions.slice(0, 2).map((action) => (
            <p key={action.id}>
              {formatDateTime(action.created_at)} - {action.note}
            </p>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function CommentAccordion({ comments }: { comments: string[] }) {
  if (!comments.length) {
    return null;
  }

  return (
    <details className="mt-3 rounded-md border border-border bg-white">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
        Comments ({comments.length})
      </summary>
      <div className="divide-y divide-border">
        {comments.map((comment, index) => (
          <p key={`${index}-${comment.slice(0, 16)}`} className="px-3 py-2 text-sm text-slate-700">
            {comment}
          </p>
        ))}
      </div>
    </details>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function FlagLine({
  icon: Icon,
  text,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  text: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon aria-hidden className="h-4 w-4 text-teal-800" />
      <span>{text}</span>
    </div>
  );
}

function BreakdownCard({
  title,
  items,
}: {
  title: string;
  items: Array<{ label: string; value: number }>;
}) {
  return (
    <Card>
      <CardHeader title={title} />
      <div className="space-y-2 p-4">
        {items.length ? (
          items.slice(0, 6).map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
            >
              <span>{item.label}</span>
              <span className="font-semibold">{item.value}</span>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No data.</p>
        )}
      </div>
    </Card>
  );
}

function buildSummary(snapshot: DashboardSnapshot) {
  const openCases = snapshot.cases.filter((item) => openStatuses.includes(item.status));
  const latestSignal = snapshot.source_events[0]?.predicted_severity ?? "No events";
  const locationCounts = groupLocationCounts(snapshot.cases, snapshot.locations);
  const categoryCounts = groupCounts(snapshot.cases, "category");

  return {
    criticalOpen: openCases.filter((item) => item.severity === "Critical").length,
    latestSignal,
    topLocation: locationCounts[0]?.label ?? "None",
    topCategory: categoryCounts[0]?.label ?? "None",
    restricted: snapshot.cases.filter((item) => item.special_category_risk).length,
    duplicates: snapshot.cases.filter((item) => Boolean(item.duplicate_of)).length,
  };
}

function groupCounts<T extends Record<string, unknown>>(items: T[], key: keyof T) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const value = String(item[key] ?? "Unknown");
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function groupLocationCounts(cases: CaseRecord[], locations: SiteLocation[]) {
  const locationById = new Map(locations.map((item) => [item.id, item.name]));
  const counts = new Map<string, number>();

  for (const record of cases) {
    const label = record.location_id
      ? locationById.get(record.location_id) ?? "Unknown"
      : "Location pending";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function exportCases(snapshot: DashboardSnapshot) {
  return () => {
    const locationById = new Map(snapshot.locations.map((item) => [item.id, item.name]));
    const rows = snapshot.cases.map((record) => ({
      id: record.id,
      title: record.title,
      severity: record.severity,
      relevance: record.relevance,
      status: record.status,
      location: record.location_id
        ? locationById.get(record.location_id) ?? ""
        : "",
      source: record.source_type ?? "",
      created_at: record.created_at,
      updated_at: record.updated_at,
      redacted_text: record.redacted_text,
      comments: (record.comments ?? []).join(" | "),
    }));
    const header = Object.keys(rows[0] ?? { id: "" });
    const csv = [
      header.join(","),
      ...rows.map((row) =>
        header
          .map((field) => `"${String(row[field as keyof typeof row]).replace(/"/g, '""')}"`)
          .join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `kss-accessibility-cases-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
}
