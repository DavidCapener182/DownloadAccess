import { classifyVisibleText, hashText } from "./classifier";
import { getSettings, pageAllowed } from "./settings";
import type { BackfillResult, DetectedIssue } from "./types";

const seen = new Set<string>();
let observer: MutationObserver | null = null;
let started = false;

type StructuredPost = {
  title: string;
  postText: string;
  comments: string[];
  combinedText: string;
};

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

  const structured = extractStructuredPost(node);
  if (!structured) {
    return "skipped";
  }
  const text = structured.combinedText;

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
    title: structured.title,
    postText: structured.postText,
    comments: structured.comments,
    redactedText: classification.redactedText,
    severity: classification.severity,
    category: classification.category,
    matchedKeywords: classification.matched.map((item) => item.keyword),
    sourceUrl: window.location.href,
    detectedAt: new Date().toISOString(),
  };

  const submitNow = Boolean(options.submitMatched);

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
  const selector = 'article,[role="article"]';
  const containers = new Set<HTMLElement>();

  for (const node of document.querySelectorAll<HTMLElement>(selector)) {
    const parentArticle = node.parentElement?.closest<HTMLElement>(selector);
    if (!parentArticle && isVisible(node) && looksLikePostContainer(node)) {
      containers.add(node);
    }
  }

  return [...containers];
}

function extractStructuredPost(node: HTMLElement): StructuredPost | null {
  const container = node.closest<HTMLElement>('article,[role="article"]') ?? node;
  if (!looksLikePostContainer(container)) {
    return null;
  }

  const postText = cleanPostText(extractPostBody(container));
  const comments = extractComments(container)
    .map(cleanPostText)
    .filter((comment) => comment.length >= 12)
    .slice(0, 12);
  const combinedText = composeCombinedText(postText, comments);

  if (combinedText.length < 24 || combinedText.length > 2400) {
    return null;
  }

  if (isLikelyPageShell(combinedText)) {
    return null;
  }

  return {
    title: buildTitle(postText || combinedText),
    postText: postText || combinedText,
    comments,
    combinedText,
  };
}

function extractPostBody(container: HTMLElement) {
  const messageNodes = [
    ...container.querySelectorAll<HTMLElement>(
      '[data-ad-preview="message"],[data-ad-comet-preview="message"]',
    ),
  ].filter(isVisible);

  if (messageNodes.length) {
    return uniqueText(messageNodes.map((node) => node.innerText)).join("\n");
  }

  const lines = meaningfulLines(container.innerText);
  const commentStart = lines.findIndex((line) =>
    /^(view more|most relevant|all comments|write (a )?(comment|answer)|\d+\s+(comments?|answers?))\b/i.test(line),
  );
  return lines.slice(0, commentStart > 0 ? commentStart : 8).join("\n");
}

function extractComments(container: HTMLElement) {
  const commentNodes = [
    ...container.querySelectorAll<HTMLElement>(
      '[aria-label*="comment" i],[aria-label*="reply" i]',
    ),
  ].filter((node) => node !== container && isVisible(node));
  const fromNodes = uniqueText(
    commentNodes
      .map((node) => meaningfulLines(node.innerText).join(" "))
      .filter((text) => text.length > 12),
  );

  if (fromNodes.length) {
    return fromNodes;
  }

  const lines = meaningfulLines(container.innerText);
  const markerIndex = lines.findIndex((line) =>
    /^(view more|most relevant|all comments|\d+\s+(comments?|answers?))\b/i.test(line),
  );

  if (markerIndex < 0) {
    return [];
  }

  return uniqueText(
    lines
      .slice(markerIndex + 1)
      .join("\n")
      .split(/\b(?:Like|Reply|Share)\b/i)
      .map((chunk) => cleanPostText(chunk))
      .filter((chunk) => chunk.length > 20),
  );
}

function meaningfulLines(value: string) {
  return value
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((line) => !isBoilerplateLine(line));
}

function cleanPostText(value: string) {
  return meaningfulLines(value)
    .join(" ")
    .replace(/\b(Facebook\s*){2,}/gi, " ")
    .replace(/\b(Like|Reply|Share|See more|View more answers|Write an answer)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function composeCombinedText(postText: string, comments: string[]) {
  return [postText, ...comments.map((comment) => `Comment: ${comment}`)]
    .filter(Boolean)
    .join("\n");
}

function buildTitle(value: string) {
  const firstSentence = value
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)[0]
    ?.trim();
  const title = firstSentence || value.trim();
  return title.length > 96 ? `${title.slice(0, 93)}...` : title;
}

function uniqueText(values: string[]) {
  const seenText = new Set<string>();
  const next: string[] = [];

  for (const value of values) {
    const cleaned = cleanPostText(value);
    const key = cleaned.toLowerCase();
    if (cleaned && !seenText.has(key)) {
      seenText.add(key);
      next.push(cleaned);
    }
  }

  return next;
}

function isBoilerplateLine(line: string) {
  return (
    /^facebook$/i.test(line) ||
    /^(like|reply|share|send|copy link|write an answer|write a comment)$/i.test(line) ||
    /^(see more|view more|most relevant|all comments|top comments)$/i.test(line) ||
    /^\d+[dhm]$/i.test(line)
  );
}

function isLikelyPageShell(text: string) {
  const words = text.split(/\s+/);
  const facebookWords = words.filter((word) => word.toLowerCase() === "facebook").length;
  return facebookWords > 8 || facebookWords / Math.max(words.length, 1) > 0.12;
}

function looksLikePostContainer(element: HTMLElement) {
  const text = element.innerText?.replace(/\s+/g, " ").trim() ?? "";
  if (text.length < 24 || text.length > 3200 || isLikelyPageShell(text)) {
    return false;
  }

  return Boolean(
    element.querySelector('[data-ad-preview="message"],[data-ad-comet-preview="message"]') ||
      /(\bLike\b|\bReply\b|\bShare\b|\bComment\b|View more|Write an answer)/i.test(text),
  );
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
