import { submitIssue } from "./api-client";
import { getSettings, saveSettings } from "./settings";
import type { DetectedIssue, StoredState } from "./types";

chrome.runtime.onInstalled.addListener(async () => {
  const stored = (await chrome.storage.local.get()) as StoredState;
  await saveSettings({
    apiUrl: stored.apiUrl,
    apiToken: stored.apiToken,
    sourceId: stored.sourceId,
    sourceName: stored.sourceName,
    allowedDomains: stored.allowedDomains ?? [],
    allowedPageUrls: stored.allowedPageUrls ?? [
      "https://www.facebook.com/groups/downloadfestivalaccess",
    ],
    monitoringMode: stored.monitoringMode ?? "manual_review",
    paused: stored.paused ?? false,
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void handleMessage(message)
    .then((result) => sendResponse(result))
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});

async function handleMessage(message: {
  type: string;
  issue?: DetectedIssue;
  issueId?: string;
  submitNow?: boolean;
  notify?: boolean;
}) {
  if (message.type === "DETECTED_ISSUE" && message.issue) {
    const issue = await storeDetection(message.issue);
    let submitted = false;
    if (message.submitNow || issue.severity === "Critical") {
      await submitDetection(issue.id);
      submitted = true;
      if (message.notify || issue.severity === "Critical") {
        try {
          await chrome.notifications.create({
            type: "basic",
            iconUrl: chrome.runtime.getURL("icon.svg"),
            title:
              issue.severity === "Critical"
                ? "Critical accessibility issue"
                : "New monitored Facebook post",
            message: (issue.title || issue.redactedText).slice(0, 180),
          });
        } catch {
          // Dashboard submission is the primary alert path; notification UI is best effort.
        }
      }
    }
    return { ok: true, submitted };
  }

  if (message.type === "SUBMIT_DETECTION" && message.issueId) {
    await submitDetection(message.issueId);
    return { ok: true, submitted: true };
  }

  if (message.type === "GET_RECENT") {
    const stored = (await chrome.storage.local.get("recentDetections")) as StoredState;
    return { ok: true, recentDetections: stored.recentDetections ?? [] };
  }

  if (message.type === "CLEAR_RECENT") {
    await chrome.storage.local.set({ recentDetections: [] });
    return { ok: true };
  }

  return { ok: false, error: "Unknown message type." };
}

async function storeDetection(issue: DetectedIssue) {
  const stored = (await chrome.storage.local.get("recentDetections")) as StoredState;
  const recent = stored.recentDetections ?? [];
  const withoutExisting = recent.filter((item) => item.id !== issue.id);
  const next = [issue, ...withoutExisting].slice(0, 50);
  await chrome.storage.local.set({ recentDetections: next });
  return issue;
}

async function submitDetection(issueId: string) {
  const settings = await getSettings();
  const stored = (await chrome.storage.local.get("recentDetections")) as StoredState;
  const recent = stored.recentDetections ?? [];
  const issue = recent.find((item) => item.id === issueId);
  if (!issue) {
    throw new Error("Detection not found.");
  }

  try {
    await submitIssue(issue, settings);
    issue.submittedAt = new Date().toISOString();
    issue.submitError = undefined;
  } catch (error) {
    issue.submitError = error instanceof Error ? error.message : "Submission failed.";
    throw error;
  } finally {
    await chrome.storage.local.set({ recentDetections: [...recent] });
  }
}
