import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { getSettings, normalisePageUrl, pageAllowed, saveSettings } from "./settings";
import type {
  BackfillResult,
  DetectedIssue,
  ExtensionSettings,
  StoredState,
} from "./types";

function Popup() {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [recent, setRecent] = useState<DetectedIssue[]>([]);
  const [host, setHost] = useState("");
  const [currentPage, setCurrentPage] = useState("");
  const [backfillResult, setBackfillResult] = useState<BackfillResult | null>(null);
  const [backfillBusy, setBackfillBusy] = useState(false);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    const nextSettings = await getSettings();
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const hostname = tab.url ? new URL(tab.url).hostname : "";
    const pageUrl = tab.url ? normalisePageUrl(tab.url) : "";
    const stored = (await chrome.storage.local.get("recentDetections")) as StoredState;
    setSettings(nextSettings);
    setHost(hostname);
    setCurrentPage(pageUrl);
    setRecent(stored.recentDetections ?? []);
  }

  if (!settings) {
    return <Shell>Loading...</Shell>;
  }

  const enabled = pageAllowed(
    currentPage,
    host,
    settings.allowedDomains,
    settings.allowedPageUrls,
  );

  async function backfillVisiblePosts() {
    setBackfillBusy(true);
    setBackfillResult(null);

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) {
        throw new Error("No active tab found.");
      }

      const response = (await chrome.tabs.sendMessage(tab.id, {
        type: "BACKFILL_VISIBLE",
      })) as BackfillResult;

      setBackfillResult(response);
      await refresh();
    } catch (error) {
      setBackfillResult({
        ok: false,
        scanned: 0,
        matched: 0,
        submitted: 0,
        queued: 0,
        error:
          error instanceof Error
            ? error.message
            : "Reload the Facebook page and try again.",
      });
    } finally {
      setBackfillBusy(false);
    }
  }

  return (
    <Shell>
      <div className="header">
        <strong>KSS Accessibility Monitor</strong>
        <span>{host || "No active page"}</span>
      </div>

      <button
        className={enabled ? "secondary" : "primary"}
        onClick={async () => {
          const allowedPageUrls = enabled
            ? settings.allowedPageUrls.filter(
                (pageUrl) => normalisePageUrl(pageUrl) !== currentPage,
              )
            : [...settings.allowedPageUrls, currentPage].filter(Boolean);
          await saveSettings({ allowedPageUrls });
          await refresh();
        }}
      >
        {enabled ? "Stop monitoring current page" : "Start monitoring current page"}
      </button>

      <div className="grid">
        <button
          className="secondary"
          onClick={async () => {
            await saveSettings({ paused: !settings.paused });
            await refresh();
          }}
        >
          {settings.paused ? "Resume monitoring" : "Pause monitoring"}
        </button>
        <button
          className="secondary"
          onClick={async () => {
            await saveSettings({
              monitoringMode:
                settings.monitoringMode === "manual_review"
                  ? "auto_send_critical_only"
                  : "manual_review",
            });
            await refresh();
          }}
        >
          {settings.monitoringMode === "manual_review"
            ? "Manual Review Mode"
            : "Auto-Send Critical Only"}
        </button>
      </div>

      <button
        className="primary full"
        disabled={!enabled || settings.paused || backfillBusy}
        onClick={backfillVisiblePosts}
      >
        {backfillBusy ? "Scanning loaded posts..." : "Backfill visible loaded posts"}
      </button>
      <p className="hint">
        Leave the authorised Facebook group open for live monitoring. New visible
        post cards are sent to dashboard review with comments and visible images;
        the backfill button sends up to 60 loaded cards.
      </p>
      {backfillResult ? (
        <div className={backfillResult.ok ? "status" : "status error"}>
          {backfillResult.ok
            ? `Scanned ${backfillResult.scanned}, sent ${backfillResult.submitted} to dashboard, queued ${backfillResult.queued} locally.`
            : backfillResult.error}
        </div>
      ) : null}

      <a className="link" href={chrome.runtime.getURL("options.html")} target="_blank">
        Options
      </a>

      <div className="sectionTitle">
        <h2>Recent detected issues</h2>
        <button
          className="linkButton"
          onClick={async () => {
            await chrome.runtime.sendMessage({ type: "CLEAR_RECENT" });
            await refresh();
          }}
        >
          Clear
        </button>
      </div>
      <div className="list">
        {recent.length ? (
          recent.map((issue) => (
            <div className="item" key={issue.id}>
              <div className="itemTop">
                <strong>{issue.severity}</strong>
                <span>{new Date(issue.detectedAt).toLocaleTimeString()}</span>
              </div>
              <p>{issue.redactedText}</p>
              {(issue.mediaUrls ?? []).length ? (
                <small>{(issue.mediaUrls ?? []).length} visible image attachment(s)</small>
              ) : null}
              {issue.submittedAt ? <small>Submitted</small> : null}
              {issue.submitError ? <small className="error">{issue.submitError}</small> : null}
              {!issue.submittedAt ? (
                <button
                  className="secondary"
                  onClick={async () => {
                    await chrome.runtime.sendMessage({
                      type: "SUBMIT_DETECTION",
                      issueId: issue.id,
                    });
                    await refresh();
                  }}
                >
                  Submit
                </button>
              ) : null}
            </div>
          ))
        ) : (
          <p className="empty">No posts captured yet.</p>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{styles}</style>
      <main>{children}</main>
    </>
  );
}

const styles = `
  body { margin: 0; min-width: 360px; color: #102033; background: #f4f7fb; font: 14px system-ui, sans-serif; }
  main { padding: 12px; }
  .header { display: flex; flex-direction: column; gap: 2px; margin-bottom: 10px; }
  .header span, small, .empty { color: #66778d; }
  button, .link { display: inline-flex; min-height: 36px; align-items: center; justify-content: center; border-radius: 6px; border: 1px solid #d5dee9; padding: 0 10px; font-weight: 600; cursor: pointer; text-decoration: none; box-sizing: border-box; }
  button:disabled { cursor: not-allowed; opacity: 0.5; }
  .primary { width: 100%; border-color: #0f766e; background: #0f766e; color: white; }
  .secondary, .link { background: white; color: #102033; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
  .full { margin-top: 8px; }
  .hint { margin: 8px 0 0; color: #66778d; font-size: 12px; line-height: 1.4; }
  .status { margin-top: 8px; border: 1px solid #a7f3d0; border-radius: 6px; background: #ecfdf5; color: #064e3b; padding: 8px; font-size: 12px; line-height: 1.4; }
	  .link { width: 100%; margin-top: 8px; }
	  h2 { margin: 14px 0 8px; font-size: 13px; }
	  .sectionTitle { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
	  .linkButton { min-height: 28px; background: white; color: #102033; font-size: 12px; }
	  .list { display: grid; gap: 8px; }
  .item { border: 1px solid #d5dee9; border-radius: 8px; background: white; padding: 10px; }
  .itemTop { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .item p { margin: 8px 0; line-height: 1.4; }
  .error { display: block; color: #b91c1c; margin-bottom: 6px; }
`;

createRoot(document.getElementById("root")!).render(<Popup />);
