import { classifyVisibleText, hashText } from "./classifier";
import { getSettings, pageAllowed } from "./settings";
import type { BackfillResult, DetectedIssue } from "./types";

const seen = new Set<string>();
let observer: MutationObserver | null = null;
let started = false;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "BACKFILL_VISIBLE") {
    return false;
  }

  void backfillVisiblePosts()
    .then((result) => sendResponse(result))
    .catch((error) =>
      sendResponse({
        ok: false,
        scanned: 0,
        matched: 0,
        submitted: 0,
        queued: 0,
        error: error instanceof Error ? error.message : "Backfill failed.",
      } satisfies BackfillResult),
    );

  return true;
});

void start();

async function start() {
  if (started) {
    return;
  }

  const settings = await getSettings();
  if (settings.paused) {
    return;
  }

  if (
    !pageAllowed(
      window.location.href,
      window.location.hostname,
      settings.allowedDomains,
      settings.allowedPageUrls,
    )
  ) {
    return;
  }

  started = true;
  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) {
          void inspectNode(node);
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  for (const node of collectCandidateContainers()) {
    void inspectNode(node);
  }
}

async function backfillVisiblePosts(): Promise<BackfillResult> {
  const settings = await getSettings();
  if (
    settings.paused ||
    !pageAllowed(
      window.location.href,
      window.location.hostname,
      settings.allowedDomains,
      settings.allowedPageUrls,
    )
  ) {
    return {
      ok: false,
      scanned: 0,
      matched: 0,
      submitted: 0,
      queued: 0,
      error: "This page is not enabled for monitoring.",
    };
  }

  await start();

  const candidates = collectCandidateContainers();
  let matched = 0;
  let submitted = 0;
  let queued = 0;

  for (const node of candidates) {
    const result = await inspectNode(node, { submitMatched: true });
    if (result === "submitted") {
      matched += 1;
      submitted += 1;
    }
    if (result === "queued") {
      matched += 1;
      queued += 1;
    }
  }

  return {
    ok: true,
    scanned: candidates.length,
    matched,
    submitted,
    queued,
  };
}

async function inspectNode(
  node: HTMLElement,
  options: { submitMatched?: boolean } = {},
): Promise<"submitted" | "queued" | "skipped"> {
  if (!isVisible(node)) {
    return "skipped";
  }

  const text = extractText(node);
  if (!text) {
    return "skipped";
  }

  const settings = await getSettings();
  if (
    settings.paused ||
    !pageAllowed(
      window.location.href,
      window.location.hostname,
      settings.allowedDomains,
      settings.allowedPageUrls,
    )
  ) {
    observer?.disconnect();
    started = false;
    return "skipped";
  }

  const classification = classifyVisibleText(text);
  if (!classification.matched.length) {
    return "skipped";
  }

  const id = await hashText(`${window.location.href}:${text}`);
  const issue: DetectedIssue = {
    id,
    text,
    redactedText: classification.redactedText,
    severity: classification.severity,
    category: classification.category,
    matchedKeywords: classification.matched.map((item) => item.keyword),
    sourceUrl: window.location.href,
    detectedAt: new Date().toISOString(),
  };

  const submitNow =
    Boolean(options.submitMatched) &&
    issue.severity !== "Low";

  if (seen.has(id)) {
    if (submitNow) {
      const response = await chrome.runtime.sendMessage({
        type: "SUBMIT_DETECTION",
        issueId: id,
      });
      return response?.submitted ? "submitted" : "queued";
    }

    return "skipped";
  }

  seen.add(id);

  if (submitNow) {
    const response = await chrome.runtime.sendMessage({
      type: "DETECTED_ISSUE",
      issue,
      submitNow: true,
    });
    return response?.submitted ? "submitted" : "queued";
  }

  if (
    issue.severity === "Low" ||
    settings.monitoringMode === "manual_review" ||
    (settings.monitoringMode === "auto_send_critical_only" &&
      issue.severity !== "Critical")
  ) {
    await chrome.runtime.sendMessage({ type: "DETECTED_ISSUE", issue });
    return "queued";
  }

  const response = await chrome.runtime.sendMessage({
    type: "DETECTED_ISSUE",
    issue,
  });
  return response?.submitted ? "submitted" : "queued";
}

function collectCandidateContainers() {
  const selector =
    'article,[role="article"],[data-pagelet],div[aria-label*="comment" i],div[aria-label*="post" i]';
  const containers = new Set<HTMLElement>();

  for (const node of document.querySelectorAll<HTMLElement>(selector)) {
    const container = node.closest<HTMLElement>(selector) ?? node;
    if (isVisible(container)) {
      containers.add(container);
    }
  }

  return [...containers];
}

function extractText(node: HTMLElement) {
  const container =
    node.closest<HTMLElement>(
      'article,[role="article"],[data-pagelet],div[aria-label*="comment" i],div[aria-label*="post" i]',
    ) ?? node;
  const text = container.innerText.replace(/\s+/g, " ").trim();
  if (text.length < 24 || text.length > 2400) {
    return null;
  }
  return text;
}

function isVisible(element: HTMLElement) {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return (
    style.visibility !== "hidden" &&
    style.display !== "none" &&
    rect.width > 0 &&
    rect.height > 0
  );
}
