import { classifyVisibleText, hashText } from "./classifier";
import { getSettings, pageAllowed } from "./settings";
import type { DetectedIssue } from "./types";

const seen = new Set<string>();
let observer: MutationObserver | null = null;

void start();

async function start() {
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

  for (const node of document.querySelectorAll<HTMLElement>(
    'article,[role="article"],[data-pagelet],div[aria-label*="comment" i],div[aria-label*="post" i]',
  )) {
    void inspectNode(node);
  }
}

async function inspectNode(node: HTMLElement) {
  if (!isVisible(node)) {
    return;
  }

  const text = extractText(node);
  if (!text) {
    return;
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
    return;
  }

  const classification = classifyVisibleText(text);
  if (!classification.matched.length) {
    return;
  }

  const id = await hashText(`${window.location.href}:${text}`);
  if (seen.has(id)) {
    return;
  }
  seen.add(id);

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

  if (
    issue.severity === "Low" ||
    settings.monitoringMode === "manual_review" ||
    (settings.monitoringMode === "auto_send_critical_only" &&
      issue.severity !== "Critical")
  ) {
    await chrome.runtime.sendMessage({ type: "DETECTED_ISSUE", issue });
    return;
  }

  await chrome.runtime.sendMessage({ type: "DETECTED_ISSUE", issue });
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
