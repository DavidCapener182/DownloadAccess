"use client";

import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Eye,
  ExternalLink,
  FileDown,
  ImageIcon,
  Megaphone,
  MessageCircle,
  PanelLeftOpen,
  QrCode,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  X,
  UserCheck,
} from "lucide-react";
import type React from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
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
  Source,
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

const allFilter = "All";
const mediaCommentPrefix = "[image] ";

type BrowserNotificationPermission =
  | NotificationPermission
  | "unsupported";

type PostFeedItem =
  | {
      kind: "event";
      created_at: string;
      event: SourceEvent;
      caseRecord?: CaseRecord;
    }
  | {
      kind: "case";
      created_at: string;
      caseRecord: CaseRecord;
    };

export function LiveMonitorDashboard({
  initialSnapshot,
}: {
  initialSnapshot: DashboardSnapshot;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [manualText, setManualText] = useState("");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [postsDrawerOpen, setPostsDrawerOpen] = useState(false);
  const [triageCategory, setTriageCategory] = useState(allFilter);
  const [triageRelevance, setTriageRelevance] = useState(allFilter);
  const [triageQuery, setTriageQuery] = useState("");
  const [newEventNotice, setNewEventNotice] = useState<string | null>(null);
  const [notificationPermission, setNotificationPermission] =
    useState<BrowserNotificationPermission>(() =>
      typeof window !== "undefined" && "Notification" in window
        ? Notification.permission
        : "unsupported",
    );
  const [manualBusy, startManualTransition] = useTransition();
  const [refreshing, startRefreshTransition] = useTransition();
  const seenEventIdsRef = useRef(
    new Set(initialSnapshot.source_events.map((event) => event.id)),
  );

  const notifyForNewEvents = useCallback((events: SourceEvent[]) => {
    const incoming = events.filter((event) => !seenEventIdsRef.current.has(event.id));
    for (const event of events) {
      seenEventIdsRef.current.add(event.id);
    }

    if (!incoming.length) {
      return;
    }

    const count = incoming.length;
    const first = incoming[0];
    const title =
      first.post_title || first.predicted_category || "New monitored post";
    setNewEventNotice(
      `${count} new monitored post${count === 1 ? "" : "s"} captured for review.`,
    );

    if (typeof window !== "undefined" && "Notification" in window) {
      setNotificationPermission(Notification.permission);
      if (Notification.permission === "granted") {
        new Notification("KSS Accessibility Live Monitor", {
          body: title,
          tag: `source-event-${first.id}`,
        });
      }
    }
  }, []);

  const refresh = useCallback(() => {
    startRefreshTransition(() => {
      void fetch("/api/dashboard/live", { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error("Live feed request failed.");
          }
          const nextSnapshot = (await response.json()) as DashboardSnapshot;
          notifyForNewEvents(nextSnapshot.source_events);
          setSnapshot(nextSnapshot);
          setConnectionError(null);
        })
        .catch(() => {
          setConnectionError("Live feed connection interrupted. Retrying.");
        });
    });
  }, [notifyForNewEvents, startRefreshTransition]);

  const enableBrowserNotifications = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
  }, []);

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
  const filteredReviewEvents = useMemo(
    () =>
      filterReviewEvents(reviewEvents, {
        category: triageCategory,
        relevance: triageRelevance,
        query: triageQuery,
      }),
    [reviewEvents, triageCategory, triageQuery, triageRelevance],
  );
  const reviewCategories = useMemo(
    () => buildFilterOptions(reviewEvents.map((event) => event.predicted_category)),
    [reviewEvents],
  );
  const reviewRelevances = useMemo(
    () => buildFilterOptions(reviewEvents.map((event) => event.relevance)),
    [reviewEvents],
  );
  const triageSummary = useMemo(() => buildTriageSummary(reviewEvents), [reviewEvents]);
  const postFeedCount = useMemo(
    () => buildPostFeedItems(snapshot.source_events, snapshot.cases).length,
    [snapshot.source_events, snapshot.cases],
  );
  const summary = buildSummary(snapshot);

  const moveToPostTarget = useCallback((targetId: string | null) => {
    if (targetId) {
      document.getElementById(targetId)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
    setPostsDrawerOpen(false);
  }, []);

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
    <main className="mx-auto w-full max-w-[96rem] flex-1 px-4 py-5 sm:px-6 lg:px-8">
      {postsDrawerOpen ? (
        <div className="fixed inset-0 z-50 xl:hidden">
          <button
            aria-label="Close posts feed"
            className="absolute inset-0 bg-slate-950/45"
            type="button"
            onClick={() => setPostsDrawerOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-[min(28rem,calc(100vw-2rem))] flex-col bg-background shadow-2xl">
            <AllPostsFeed
              cases={snapshot.cases}
              events={snapshot.source_events}
              onClose={() => setPostsDrawerOpen(false)}
              onNavigate={moveToPostTarget}
              sources={snapshot.sources}
              variant="drawer"
            />
          </div>
        </div>
      ) : null}

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

      {newEventNotice ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-950">
          <div className="flex items-center gap-2">
            <Bell aria-hidden className="h-4 w-4 shrink-0" />
            <span>{newEventNotice}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {notificationPermission === "default" ? (
              <Button size="sm" variant="secondary" onClick={enableBrowserNotifications}>
                Enable browser alerts
              </Button>
            ) : null}
            <Button size="sm" variant="secondary" onClick={() => setNewEventNotice(null)}>
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 xl:hidden">
        <div>
          <h2 className="text-sm font-semibold">All monitored posts</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {postFeedCount} captured from approved sources
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => setPostsDrawerOpen(true)}
          aria-expanded={postsDrawerOpen}
        >
          <PanelLeftOpen aria-hidden className="h-4 w-4" />
          Posts
        </Button>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[300px_minmax(0,1.35fr)_minmax(320px,0.8fr)]">
        <aside className="hidden xl:block">
          <AllPostsFeed
            cases={snapshot.cases}
            events={snapshot.source_events}
            onNavigate={moveToPostTarget}
            sources={snapshot.sources}
            variant="rail"
          />
        </aside>

        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Needs triage"
              meta={`${filteredReviewEvents.length} of ${reviewEvents.length} posts visible`}
            />
            <TriageControls
              category={triageCategory}
              categoryOptions={reviewCategories}
              onCategoryChange={setTriageCategory}
              onQueryChange={setTriageQuery}
              onRelevanceChange={setTriageRelevance}
              onReset={() => {
                setTriageCategory(allFilter);
                setTriageRelevance(allFilter);
                setTriageQuery("");
              }}
              query={triageQuery}
              relevance={triageRelevance}
              relevanceOptions={reviewRelevances}
              summary={triageSummary}
            />
            <div className="divide-y divide-border">
              {filteredReviewEvents.length ? (
                filteredReviewEvents.map((event) => (
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
                  No posts match the active filters.
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Cases we are looking into"
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
                    generatedAt={snapshot.generated_at}
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
                    {source.active && source.approved_for_monitoring ? "Approved" : "Off"}
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

function TriageControls({
  category,
  categoryOptions,
  onCategoryChange,
  onQueryChange,
  onReset,
  onRelevanceChange,
  query,
  relevance,
  relevanceOptions,
  summary,
}: {
  category: string;
  categoryOptions: Array<{ label: string; count: number }>;
  onCategoryChange: (value: string) => void;
  onQueryChange: (value: string) => void;
  onReset: () => void;
  onRelevanceChange: (value: string) => void;
  query: string;
  relevance: string;
  relevanceOptions: Array<{ label: string; count: number }>;
  summary: Array<{ label: string; value: number; className: string }>;
}) {
  const filtersActive =
    category !== allFilter || relevance !== allFilter || query.trim().length > 0;

  return (
    <div className="border-b border-border bg-slate-50/70 p-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {summary.map((item) => (
          <div
            key={item.label}
            className={cn(
              "flex items-center justify-between rounded-md border px-3 py-2 text-sm",
              item.className,
            )}
          >
            <span className="font-medium">{item.label}</span>
            <span className="text-base font-semibold">{item.value}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_13rem_13rem_auto]">
        <label className="relative block">
          <span className="sr-only">Search posts and comments</span>
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            className="h-9 w-full rounded-md border border-border bg-white pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search posts or comments"
            value={query}
          />
        </label>

        <label className="block">
          <span className="sr-only">Category filter</span>
          <select
            className="h-9 w-full rounded-md border border-border bg-white px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            onChange={(event) => onCategoryChange(event.target.value)}
            value={category}
          >
            {categoryOptions.map((option) => (
              <option key={option.label} value={option.label}>
                {option.label} ({option.count})
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="sr-only">Relevance filter</span>
          <select
            className="h-9 w-full rounded-md border border-border bg-white px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            onChange={(event) => onRelevanceChange(event.target.value)}
            value={relevance}
          >
            {relevanceOptions.map((option) => (
              <option key={option.label} value={option.label}>
                {option.label} ({option.count})
              </option>
            ))}
          </select>
        </label>

        <Button
          disabled={!filtersActive}
          onClick={onReset}
          size="sm"
          type="button"
          variant="secondary"
        >
          Reset
        </Button>
      </div>
    </div>
  );
}

function AllPostsFeed({
  cases,
  events,
  onClose,
  onNavigate,
  sources,
  variant,
}: {
  cases: CaseRecord[];
  events: SourceEvent[];
  onClose?: () => void;
  onNavigate: (targetId: string | null) => void;
  sources: Source[];
  variant: "drawer" | "rail";
}) {
  const sourceById = useMemo(
    () => new Map(sources.map((source) => [source.id, source])),
    [sources],
  );
  const feedItems = useMemo(() => buildPostFeedItems(events, cases), [events, cases]);
  const needsAttention = feedItems.filter(postFeedItemNeedsAttention).length;

  return (
    <section
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-sm",
        variant === "rail"
          ? "sticky top-24 max-h-[calc(100vh-7rem)]"
          : "h-full rounded-none border-0 shadow-none",
      )}
    >
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">All monitored posts</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {feedItems.length} captured - {needsAttention} need attention
          </p>
        </div>
        {onClose ? (
          <Button
            aria-label="Close posts feed"
            variant="secondary"
            size="icon"
            onClick={onClose}
          >
            <X aria-hidden className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {feedItems.length ? (
          <div className="space-y-3">
            {feedItems.map((item) => {
              const sourceId =
                item.kind === "event"
                  ? item.event.source_id ?? item.caseRecord?.source_id
                  : item.caseRecord.source_id;
              const key =
                item.kind === "event"
                  ? `event-${item.event.id}`
                  : `case-${item.caseRecord.id}`;

              return (
                <SourcePostCard
                  key={key}
                  item={item}
                  onNavigate={onNavigate}
                  source={sourceId ? sourceById.get(sourceId) : undefined}
                />
              );
            })}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border bg-white px-3 py-8 text-center text-sm text-muted-foreground">
            No posts captured yet.
          </div>
        )}
      </div>
    </section>
  );
}

function SourcePostCard({
  item,
  onNavigate,
  source,
}: {
  item: PostFeedItem;
  onNavigate: (targetId: string | null) => void;
  source?: Source;
}) {
  const text =
    item.kind === "event"
      ? item.event.post_text || item.event.redacted_text
      : item.caseRecord.post_text || item.caseRecord.redacted_text;
  const title =
    item.kind === "event"
      ? item.event.post_title || item.event.predicted_category
      : item.caseRecord.post_title || item.caseRecord.title;
  const createdAt = item.created_at;
  const category =
    item.kind === "event" ? item.event.predicted_category : item.caseRecord.category;
  const severity =
    item.kind === "event" ? item.event.predicted_severity : item.caseRecord.severity;
  const rawComments =
    item.kind === "event" ? item.event.comments : item.caseRecord.comments;
  const comments = visibleComments(rawComments);
  const mediaUrls =
    item.kind === "event"
      ? mediaUrlsForRecord(item.event)
      : mediaUrlsForRecord(item.caseRecord);
  const sourceUrl = item.kind === "event" ? item.event.source_url : item.caseRecord.source_url;
  const status = sourcePostStatus(item);
  const target = sourcePostTarget(item);

  return (
    <article className="rounded-md border border-border bg-white p-3 shadow-sm">
      <div className="flex gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-700 text-sm font-semibold text-white">
          {sourceInitial(source)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold">
                {title}
              </h3>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {source?.name ?? sourceFallbackLabel(item)} - {formatDateTime(createdAt)}
              </p>
            </div>
            <Badge className={cn("shrink-0", status.className)}>{status.label}</Badge>
          </div>

          <p className="mt-3 line-clamp-4 text-sm leading-5 text-slate-700">{text}</p>
          <CompactMediaPreview urls={mediaUrls ?? []} />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <SeverityBadge severity={severity} />
            <Badge>{category}</Badge>
            {mediaUrls?.length ? (
              <span className="inline-flex h-6 items-center gap-1 rounded-md bg-slate-100 px-2 text-xs font-medium text-slate-700 ring-1 ring-border">
                <ImageIcon aria-hidden className="h-3.5 w-3.5" />
                {mediaUrls.length}
              </span>
            ) : null}
            {comments.length ? (
              <span className="inline-flex h-6 items-center gap-1 rounded-md bg-slate-100 px-2 text-xs font-medium text-slate-700 ring-1 ring-border">
                <MessageCircle aria-hidden className="h-3.5 w-3.5" />
                {comments.length}
              </span>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {target.id ? (
              <Button variant="secondary" size="sm" onClick={() => onNavigate(target.id)}>
                <Eye aria-hidden className="h-4 w-4" />
                {target.label}
              </Button>
            ) : null}
            {sourceUrl ? (
              <a
                className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-teal-800 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                href={sourceUrl}
                rel="noreferrer"
                target="_blank"
              >
                <ExternalLink aria-hidden className="h-3.5 w-3.5" />
                Source
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function buildPostFeedItems(events: SourceEvent[], cases: CaseRecord[]): PostFeedItem[] {
  const caseById = new Map(cases.map((record) => [record.id, record]));
  const caseIdsAlreadyShown = new Set<string>();
  const items: PostFeedItem[] = events.map((event) => {
    const caseRecord = event.converted_case_id
      ? caseById.get(event.converted_case_id)
      : undefined;

    if (caseRecord) {
      caseIdsAlreadyShown.add(caseRecord.id);
    }

    return {
      kind: "event",
      created_at: event.created_at,
      event,
      caseRecord,
    };
  });

  for (const record of cases) {
    if (caseIdsAlreadyShown.has(record.id)) {
      continue;
    }

    items.push({
      kind: "case",
      created_at: record.created_at,
      caseRecord: record,
    });
  }

  return items.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

function postFeedItemNeedsAttention(item: PostFeedItem) {
  if (item.kind === "case") {
    return openStatuses.includes(item.caseRecord.status);
  }

  if (!item.event.converted_case_id) {
    return item.event.review_status === "New" && !item.event.ignored;
  }

  return Boolean(
    item.caseRecord && openStatuses.includes(item.caseRecord.status),
  );
}

function sourcePostStatus(item: PostFeedItem) {
  const caseRecord = item.kind === "event" ? item.caseRecord : item.caseRecord;

  if (caseRecord && openStatuses.includes(caseRecord.status)) {
    return { label: "Looking into", className: "bg-teal-50 text-teal-900" };
  }

  if (caseRecord) {
    return { label: caseRecord.status, className: "bg-slate-100 text-slate-700" };
  }

  if (item.kind === "case") {
    return { label: item.caseRecord.status, className: "bg-slate-100 text-slate-700" };
  }

  const { event } = item;

  if (event.ignored || event.review_status === "Ignored") {
    return { label: "Ignored", className: "bg-slate-100 text-slate-700" };
  }

  if (event.review_status === "New") {
    return { label: "Needs review", className: "bg-amber-100 text-amber-950" };
  }

  return { label: event.review_status, className: "bg-sky-100 text-sky-950" };
}

function sourcePostTarget(item: PostFeedItem) {
  const caseRecord = item.kind === "event" ? item.caseRecord : item.caseRecord;

  if (caseRecord && openStatuses.includes(caseRecord.status)) {
    return { id: `case-${caseRecord.id}`, label: "Open case" };
  }

  if (item.kind === "case") {
    return { id: `case-${item.caseRecord.id}`, label: "Open case" };
  }

  if (
    item.event.review_status === "New" &&
    !item.event.ignored &&
    !item.event.converted_case_id
  ) {
    return { id: `source-event-${item.event.id}`, label: "Review" };
  }

  return { id: null, label: "Review" };
}

function sourceInitial(source?: Source) {
  return (source?.name ?? "Post").trim().charAt(0).toUpperCase() || "P";
}

function sourceFallbackLabel(item: PostFeedItem) {
  if (item.kind === "case") {
    return (
      item.caseRecord.source_type ??
      item.caseRecord.source_platform ??
      "Case record"
    );
  }

  return "Monitored source";
}

function SourceEventRow({
  event,
  onReview,
}: {
  event: SourceEvent;
  onReview: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [busy, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const severityForEscalation =
    event.predicted_severity === "Low" ? "Medium" : event.predicted_severity;
  const text = event.post_text || event.redacted_text;
  const lane = operationalLane(event);
  const comments = visibleComments(event.comments ?? []);
  const mediaUrls = mediaUrlsForRecord(event);
  const appearsCollapsedAtCapture = /\u2026|\.{3}|(?:^|\s)see more(?:\s|$)/i.test(text);
  const canExpand =
    text.length > 220 ||
    appearsCollapsedAtCapture ||
    comments.length > 0 ||
    mediaUrls.length > 0;

  return (
    <article id={`source-event-${event.id}`} className="scroll-mt-24 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={event.predicted_severity} />
            <Badge>{event.relevance}</Badge>
            <Badge className={lane.className}>{lane.label}</Badge>
            <Badge>{event.predicted_category}</Badge>
          </div>
          <h3 className="mt-3 text-base font-semibold">
            {event.post_title || event.predicted_category}
          </h3>
          <p
            className={cn(
              "mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700",
              !expanded && "line-clamp-3",
            )}
          >
            {text}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {canExpand ? (
              <button
                className="inline-flex items-center gap-1 text-sm font-semibold text-teal-800 hover:underline"
                type="button"
                onClick={() => setExpanded((value) => !value)}
              >
                <Eye aria-hidden className="h-4 w-4" />
                {expanded ? "Show less" : "Show more"}
              </button>
            ) : null}
            {comments.length ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <MessageCircle aria-hidden className="h-3.5 w-3.5" />
                {comments.length} comment{comments.length === 1 ? "" : "s"} captured
              </span>
            ) : null}
            {event.source_url ? (
              <a
                className="inline-flex items-center gap-1 text-xs font-medium text-teal-800 hover:underline"
                href={event.source_url}
                rel="noreferrer"
                target="_blank"
              >
                <ExternalLink aria-hidden className="h-3.5 w-3.5" />
                Source
              </a>
            ) : null}
          </div>
          {expanded && mediaUrls.length ? <MediaPreview urls={mediaUrls} /> : null}
          <CommentAccordion comments={comments} />
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
  generatedAt,
  record,
  profiles,
  locations,
  actions,
  onUpdate,
  onAction,
}: {
  generatedAt: string;
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
  const ageMinutes = minutesBetween(record.created_at, new Date(generatedAt));

  return (
    <article id={`case-${record.id}`} className="scroll-mt-24 p-4">
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
          <MediaPreview urls={mediaUrlsForRecord(record)} />
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
  const displayComments = visibleComments(comments);

  if (!displayComments.length) {
    return null;
  }

  return (
    <details className="mt-3 rounded-md border border-border bg-white">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
        Comments ({displayComments.length})
      </summary>
      <div className="divide-y divide-border">
        {displayComments.map((comment, index) => (
          <p key={`${index}-${comment.slice(0, 16)}`} className="px-3 py-2 text-sm text-slate-700">
            {comment}
          </p>
        ))}
      </div>
    </details>
  );
}

function visibleComments(comments: string[] = []) {
  return comments.filter((comment) => !comment.trim().startsWith(mediaCommentPrefix));
}

function mediaUrlsForRecord(record: {
  comments?: string[] | null;
  media_urls?: string[] | null;
}) {
  const direct = Array.isArray(record.media_urls) ? record.media_urls : [];
  const fromComments = (record.comments ?? [])
    .map((comment) => comment.trim())
    .filter((comment) => comment.startsWith(mediaCommentPrefix))
    .map((comment) => comment.slice(mediaCommentPrefix.length).trim())
    .filter(Boolean);

  return [...new Set([...direct, ...fromComments])];
}

function CompactMediaPreview({ urls }: { urls: string[] }) {
  const first = urls[0];
  if (!first) {
    return null;
  }

  return (
    <a
      className="mt-3 block overflow-hidden rounded-md border border-border bg-slate-100"
      href={first}
      rel="noreferrer"
      target="_blank"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- Facebook CDN media is dynamic and cannot be configured safely for next/image. */}
      <img
        alt="Visible Facebook post attachment"
        className="h-28 w-full object-cover"
        loading="lazy"
        referrerPolicy="no-referrer"
        src={first}
      />
    </a>
  );
}

function MediaPreview({ urls }: { urls: string[] }) {
  if (!urls.length) {
    return null;
  }

  return (
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {urls.slice(0, 6).map((url, index) => (
        <a
          key={`${index}-${url}`}
          className="group overflow-hidden rounded-md border border-border bg-slate-100"
          href={url}
          rel="noreferrer"
          target="_blank"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- Facebook CDN media is dynamic and cannot be configured safely for next/image. */}
          <img
            alt={`Visible Facebook post attachment ${index + 1}`}
            className="aspect-[4/3] w-full object-cover transition group-hover:scale-[1.02]"
            loading="lazy"
            referrerPolicy="no-referrer"
            src={url}
          />
        </a>
      ))}
    </div>
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

function buildFilterOptions(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [
    { label: allFilter, count: values.length },
    ...[...counts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label)),
  ];
}

function filterReviewEvents(
  events: SourceEvent[],
  filters: { category: string; relevance: string; query: string },
) {
  const query = filters.query.trim().toLowerCase();

  return [...events]
    .filter((event) => {
      if (filters.category !== allFilter && event.predicted_category !== filters.category) {
        return false;
      }

      if (filters.relevance !== allFilter && event.relevance !== filters.relevance) {
        return false;
      }

      if (!query) {
        return true;
      }

      const searchableText = [
        event.post_title,
        event.post_text,
        event.redacted_text,
        event.predicted_category,
        event.relevance,
        event.classification_reason,
        ...(event.comments ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(query);
    })
    .sort((left, right) => {
      const priorityDelta = reviewEventPriority(right) - reviewEventPriority(left);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    });
}

function reviewEventPriority(event: SourceEvent) {
  const severityScore = {
    Critical: 400,
    High: 300,
    Medium: 200,
    Low: 100,
  }[event.predicted_severity];
  const relevanceScore = {
    Actionable: 80,
    "Needs review": 60,
    Information: 20,
    "Not relevant": 0,
  }[event.relevance];
  const categoryScore = {
    Security: 40,
    Welfare: 38,
    Facilities: 30,
    "KSS / external": 28,
    "Access admin": 24,
    "Travel / parking": 20,
    Campsite: 18,
    Information: 0,
  }[event.predicted_category] ?? 10;

  return severityScore + relevanceScore + categoryScore;
}

function buildTriageSummary(events: SourceEvent[]) {
  const count = (predicate: (event: SourceEvent) => boolean) =>
    events.filter(predicate).length;

  return [
    {
      label: "Needs review",
      value: count((event) => event.relevance === "Needs review"),
      className: "border-amber-200 bg-amber-50 text-amber-950",
    },
    {
      label: "Welfare",
      value: count((event) => event.predicted_category === "Welfare"),
      className: "border-sky-200 bg-sky-50 text-sky-950",
    },
    {
      label: "Security",
      value: count((event) => event.predicted_category === "Security"),
      className: "border-red-200 bg-red-50 text-red-950",
    },
    {
      label: "KSS / external",
      value: count(
        (event) =>
          event.predicted_category === "KSS / external" ||
          event.predicted_category === "Access admin",
      ),
      className: "border-teal-200 bg-teal-50 text-teal-950",
    },
  ];
}

function operationalLane(event: SourceEvent) {
  if (
    event.predicted_severity === "Critical" ||
    event.predicted_severity === "High" ||
    event.relevance === "Actionable"
  ) {
    return {
      label: "Action lane",
      className: "bg-red-100 text-red-950 ring-red-200",
    };
  }

  if (event.predicted_category === "Security") {
    return {
      label: "Security",
      className: "bg-red-50 text-red-950 ring-red-200",
    };
  }

  if (event.predicted_category === "Welfare") {
    return {
      label: "Welfare",
      className: "bg-sky-50 text-sky-950 ring-sky-200",
    };
  }

  if (
    event.predicted_category === "KSS / external" ||
    event.predicted_category === "Access admin"
  ) {
    return {
      label: "KSS check",
      className: "bg-teal-50 text-teal-950 ring-teal-200",
    };
  }

  if (event.relevance === "Information" || event.relevance === "Not relevant") {
    return {
      label: "Info only",
      className: "bg-slate-100 text-slate-700 ring-slate-200",
    };
  }

  return {
    label: "Ops review",
    className: "bg-amber-50 text-amber-950 ring-amber-200",
  };
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
      comments: visibleComments(record.comments ?? []).join(" | "),
      media_urls: mediaUrlsForRecord(record).join(" | "),
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
