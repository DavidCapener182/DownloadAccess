import { classifyVisibleText, hashText } from "./classifier";
import { getSettings, pageAllowed } from "./settings";
import type { BackfillResult, DetectedIssue } from "./types";

const seen = new Set<string>();
const capturedIssues = new Map<string, DetectedIssue>();
let observer: MutationObserver | null = null;
let started = false;

type StructuredPost = {
  title: string;
  postText: string;
  comments: string[];
  mediaUrls: string[];
  combinedText: string;
  sourceUrl: string;
};

type InspectOptions = {
  submitAll?: boolean;
  rememberOnly?: boolean;
  notify?: boolean;
};

const backfillLimit = 60;
const commentSelector =
  '[aria-label^="Comment by" i],[aria-label*=" Comment by" i]';

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
          for (const candidate of collectCandidateContainers(node)) {
            void inspectNode(candidate, { submitAll: true, notify: true });
          }
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  for (const node of collectCandidateContainers()) {
    void inspectNode(node, { submitAll: true });
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
  const structuredPosts = uniqueStructuredPosts([
    ...candidates
      .map(extractStructuredPost)
      .filter((post): post is StructuredPost => Boolean(post)),
    ...extractStructuredPostsFromPageText(),
  ]);

  if (!structuredPosts.length) {
    return {
      ok: false,
      scanned: 0,
      matched: 0,
      submitted: 0,
      queued: 0,
      error: `No post cards found. Visible text sample: ${meaningfulLines(document.body.innerText)
        .slice(0, 35)
        .join(" | ")}`,
    };
  }

  capturedIssues.clear();
  for (const structured of structuredPosts) {
    await inspectStructuredPost(structured, { rememberOnly: true, submitAll: true });
  }

  const issues = recentCapturedIssues().slice(0, backfillLimit);
  let submitted = 0;
  let queued = 0;

  for (const issue of issues) {
    const response = await chrome.runtime.sendMessage({
      type: "DETECTED_ISSUE",
      issue,
      submitNow: true,
    });

    if (response?.submitted) {
      submitted += 1;
    } else {
      queued += 1;
    }
  }

  return {
    ok: true,
    scanned: structuredPosts.length,
    matched: issues.length,
    submitted,
    queued,
  };
}

async function inspectNode(
  node: HTMLElement,
  options: InspectOptions = {},
): Promise<"submitted" | "queued" | "skipped"> {
  if (!isVisible(node)) {
    return "skipped";
  }

  const structured = extractStructuredPost(node);
  if (!structured) {
    return "skipped";
  }

  return inspectStructuredPost(structured, options);
}

async function inspectStructuredPost(
  structured: StructuredPost,
  options: InspectOptions = {},
): Promise<"submitted" | "queued" | "skipped"> {
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
  if (!options.submitAll && !classification.matched.length) {
    return "skipped";
  }

  const id = await hashText(`${window.location.href}:${text}`);

  const issue: DetectedIssue = {
    id,
    text,
    title: structured.title,
    postText: structured.postText,
    comments: structured.comments,
    mediaUrls: structured.mediaUrls,
    redactedText: classification.redactedText,
    severity: classification.severity,
    category: classification.category,
    matchedKeywords: classification.matched.map((item) => item.keyword),
    sourceUrl: structured.sourceUrl,
    detectedAt: new Date().toISOString(),
  };

  rememberIssue(issue);

  if (options.rememberOnly) {
    return "skipped";
  }

  const submitNow = Boolean(options.submitAll);

  if (seen.has(id)) {
    return "skipped";
  }

  seen.add(id);

  if (submitNow) {
    const response = await chrome.runtime.sendMessage({
      type: "DETECTED_ISSUE",
      issue,
      submitNow: true,
      notify: options.notify,
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
    notify: options.notify,
  });
  return response?.submitted ? "submitted" : "queued";
}

function uniqueStructuredPosts(posts: StructuredPost[]) {
  const seenPosts = new Set<string>();
  const next: StructuredPost[] = [];

  for (const post of posts) {
    const key = normaliseForComparison(
      `${post.title}:${post.postText}:${post.comments.join("|")}:${post.mediaUrls.join("|")}`,
    );
    if (!key || seenPosts.has(key)) {
      continue;
    }
    seenPosts.add(key);
    next.push(post);
  }

  return next;
}

function rememberIssue(issue: DetectedIssue) {
  if (capturedIssues.has(issue.id)) {
    capturedIssues.delete(issue.id);
  }
  capturedIssues.set(issue.id, issue);

  while (capturedIssues.size > 80) {
    const oldest = capturedIssues.keys().next().value as string | undefined;
    if (!oldest) {
      break;
    }
    capturedIssues.delete(oldest);
  }
}

function recentCapturedIssues() {
  return [...capturedIssues.values()].sort(
    (left, right) =>
      new Date(right.detectedAt).getTime() - new Date(left.detectedAt).getTime(),
  );
}

function collectCandidateContainers(root: ParentNode = document) {
  const containers = new Set<HTMLElement>();
  const actionButtons = [
    ...(root instanceof HTMLElement && isPostActionButton(root) ? [root] : []),
    ...root.querySelectorAll<HTMLElement>('[aria-label*="Actions for this post" i]'),
  ];

  for (const actionButton of actionButtons) {
    const container = findPostContainerFromAction(actionButton);
    if (container && looksLikePostContainer(container)) {
      containers.add(container);
    }
  }

  const contentNodes = root.querySelectorAll<HTMLElement>(
    '[data-ad-preview="message"],[data-ad-comet-preview="message"],div[dir="auto"],span[dir="auto"]',
  );
  for (const contentNode of contentNodes) {
    if ((contentNode.innerText ?? "").replace(/\s+/g, " ").trim().length < 24) {
      continue;
    }

    const container = findPostContainerFromContent(contentNode);
    if (container && looksLikePostContainer(container)) {
      containers.add(container);
    }
  }

  if (!containers.size) {
    for (const node of root.querySelectorAll<HTMLElement>('article,[role="article"]')) {
      if (isVisible(node) && looksLikePostContainer(node) && !isCommentContainer(node)) {
        containers.add(node);
      }
    }
  }

  return [...containers].sort(
    (left, right) =>
      left.getBoundingClientRect().top - right.getBoundingClientRect().top,
  );
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
  const mediaUrls = extractMediaUrls(container);
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
    mediaUrls,
    combinedText,
    sourceUrl: extractSourceUrl(container),
  };
}

function extractMediaUrls(container: HTMLElement) {
  const urls = new Set<string>();
  const images = [...container.querySelectorAll<HTMLImageElement>("img")];

  for (const image of images) {
    if (!isVisible(image) || !looksLikePostMedia(image)) {
      continue;
    }

    const url = bestImageUrl(image);
    if (url) {
      urls.add(url);
    }

    if (urls.size >= 8) {
      break;
    }
  }

  return [...urls];
}

function bestImageUrl(image: HTMLImageElement) {
  const fromSrcSet = bestSrcSetCandidate(image.getAttribute("srcset") ?? "");
  const raw =
    fromSrcSet ||
    image.currentSrc ||
    image.src ||
    image.getAttribute("data-src") ||
    "";

  try {
    const url = new URL(raw.trim(), window.location.href);
    if (url.protocol === "https:" || url.protocol === "http:") {
      return url.toString();
    }
  } catch {
    return "";
  }

  return "";
}

function bestSrcSetCandidate(srcset: string) {
  if (!srcset.trim()) {
    return "";
  }

  const candidates = srcset
    .split(",")
    .map((candidate) => {
      const [url, descriptor = ""] = candidate.trim().split(/\s+/);
      const score = descriptor.endsWith("w")
        ? Number.parseFloat(descriptor)
        : descriptor.endsWith("x")
          ? Number.parseFloat(descriptor) * 1000
          : 0;
      return { url, score: Number.isFinite(score) ? score : 0 };
    })
    .filter((candidate) => candidate.url);

  return candidates.sort((left, right) => right.score - left.score)[0]?.url ?? "";
}

function looksLikePostMedia(image: HTMLImageElement) {
  const rect = image.getBoundingClientRect();
  const label = `${image.alt ?? ""} ${image.getAttribute("aria-label") ?? ""}`;
  const source = image.currentSrc || image.src || "";

  if (rect.width < 96 || rect.height < 72) {
    return false;
  }

  if (
    /(profile|avatar|emoji|sticker|comment with|your profile|reaction)/i.test(label) ||
    /(emoji|static\.xx\.fbcdn\.net\/images|rsrc\.php)/i.test(source)
  ) {
    return false;
  }

  return true;
}

function extractPostBody(container: HTMLElement) {
  const firstComment = container.querySelector<HTMLElement>(commentSelector);
  const messageNodes = [
    ...container.querySelectorAll<HTMLElement>(
      '[data-ad-preview="message"],[data-ad-comet-preview="message"]',
    ),
  ].filter(
    (node) =>
      isVisible(node) &&
      !isInsideCommentContainer(node) &&
      isBeforeFirstComment(node, firstComment),
  );

  if (messageNodes.length) {
    return uniqueText(messageNodes.map((node) => node.innerText)).join("\n");
  }

  const lines = meaningfulLines(container.innerText);
  const start = findPostBodyStart(lines);
  const bodyLines: string[] = [];

  for (const line of lines.slice(start)) {
    if (isPostBodyBoundaryLine(line) && bodyLines.length) {
      break;
    }

    if (!isMetaLine(line)) {
      bodyLines.push(line);
    }
  }

  return bodyLines.slice(0, 10).join("\n");
}

function extractComments(container: HTMLElement) {
  const commentNodes = [
    ...container.querySelectorAll<HTMLElement>(
      '[aria-label^="Comment by" i],[aria-label*=" Comment by" i]',
    ),
  ].filter(
    (node) =>
      node !== container &&
      isVisible(node) &&
      !node.querySelector('[aria-label*="Actions for this post" i]'),
  );
  const fromNodes = uniqueText(
    commentNodes
      .map(extractCommentText)
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
  return normalisedLines(value).filter((line) => !isBoilerplateLine(line));
}

function normalisedLines(value: string) {
  return value
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((line) => !isObfuscatedNoiseLine(line));
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

function extractSourceUrl(container: HTMLElement) {
  const link = container.querySelector<HTMLAnchorElement>(
    'a[href*="/posts/"],a[href*="story_fbid"],a[href*="/groups/downloadfestivalaccess/permalink/"]',
  );

  try {
    return link?.href ? new URL(link.href, window.location.origin).toString() : window.location.href;
  } catch {
    return window.location.href;
  }
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

function extractStructuredPostsFromPageText() {
  const lines = normalisedLines(document.body.innerText);
  const timelinePosts = extractStructuredPostsFromTimelineText(
    lines.filter((line) => !isBoilerplateLine(line)),
  );

  if (timelinePosts.length) {
    return timelinePosts;
  }

  const actionIndexes = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /^actions for this post by\b/i.test(line));

  if (!actionIndexes.length) {
    return [];
  }

  const posts: StructuredPost[] = [];

  for (let actionPosition = 0; actionPosition < actionIndexes.length; actionPosition += 1) {
    const { line: actionLine, index: startIndex } = actionIndexes[actionPosition];
    const endIndex = actionIndexes[actionPosition + 1]?.index ?? lines.length;
    const chunk = lines.slice(startIndex, endIndex);
    const author =
      actionLine.match(/^actions for this post by\s+(.+)$/i)?.[1]?.trim() ?? "";
    const postText = cleanPostText(extractPostTextFromLines(chunk));
    const comments = extractCommentsFromLines(chunk)
      .map(cleanPostText)
      .filter((comment) => comment.length >= 12)
      .slice(0, 12);
    const combinedText = composeCombinedText(postText, comments);

    if (
      combinedText.length < 24 ||
      combinedText.length > 2400 ||
      isLikelyPageShell(combinedText)
    ) {
      continue;
    }

    posts.push({
      title: buildTitle(author ? `${author}: ${postText || comments[0]}` : postText),
      postText: postText || combinedText,
      comments,
      mediaUrls: [],
      combinedText,
      sourceUrl: window.location.href,
    });
  }

  return posts;
}

function extractStructuredPostsFromTimelineText(lines: string[]) {
  const startIndexes = lines
    .map((line, index) => ({ line, index }))
    .filter(
      ({ line, index }) =>
        looksLikePostHeaderLine(line) ||
        looksLikeGenericPostHeaderLine(lines, index) ||
        (isMainPostTimestampLine(line) &&
          !hasPostHeaderImmediatelyBefore(lines, index) &&
          hasLikelyPostBody(lines, index)),
    );
  const posts: StructuredPost[] = [];

  for (let position = 0; position < startIndexes.length; position += 1) {
    const { line: startLine, index: startIndex } = startIndexes[position];
    const endIndex = startIndexes[position + 1]?.index ?? lines.length;
    const chunk = lines.slice(startIndex, endIndex);
    const headerStart =
      looksLikePostHeaderLine(startLine) ||
      looksLikeGenericPostHeaderLine(lines, startIndex);
    const author = headerStart
      ? extractAuthorFromHeader(startLine)
      : extractAuthorBeforeTimestamp(lines, startIndex);
    const postText = cleanPostText(extractPostTextFromLines(["", ...chunk.slice(1)]));
    const comments = uniqueText([
      ...extractCommentsFromLines(chunk),
      ...extractCompactCommentsFromLines(chunk),
    ])
      .map(cleanPostText)
      .filter((comment) => comment.length >= 12)
      .slice(0, 12);
    const combinedText = composeCombinedText(postText, comments);

    if (
      combinedText.length < 24 ||
      combinedText.length > 2400 ||
      isLikelyPageShell(combinedText)
    ) {
      continue;
    }

    posts.push({
      title: buildTitle(author ? `${author}: ${postText || comments[0]}` : postText),
      postText: postText || combinedText,
      comments,
      mediaUrls: [],
      combinedText,
      sourceUrl: window.location.href,
    });
  }

  return posts;
}

function looksLikePostHeaderLine(line: string) {
  return /\basked a question\.?$/i.test(line);
}

function looksLikeGenericPostHeaderLine(lines: string[], index: number) {
  const line = lines[index];
  if (
    !line ||
    line.length > 90 ||
    looksLikePostHeaderLine(line) ||
    isMetaLine(line) ||
    isCommentUiLine(line) ||
    isPostBodyBoundaryLine(line) ||
    /^comment by\b/i.test(line) ||
    /\?$/.test(line)
  ) {
    return false;
  }

  const nextLines = lines.slice(index + 1, index + 5);
  const hasTimestamp = nextLines.some(isTimestampLine);
  if (!hasTimestamp) {
    return false;
  }

  return hasLikelyPostBody(lines, index);
}

function hasPostHeaderImmediatelyBefore(lines: string[], index: number) {
  return lines
    .slice(Math.max(0, index - 3), index)
    .some((line, offset, nearby) => {
      const lineIndex = index - nearby.length + offset;
      return (
        looksLikePostHeaderLine(line) ||
        looksLikeGenericPostHeaderLine(lines, lineIndex)
      );
    });
}

function extractAuthorFromHeader(line: string) {
  return line
    .replace(/\s+asked a question\.?$/i, "")
    .replace(/\s+Follow$/i, "")
    .trim();
}

function hasLikelyPostBody(lines: string[], timestampIndex: number) {
  return lines
    .slice(timestampIndex + 1, timestampIndex + 7)
    .some(
      (line) =>
        line.length >= 24 &&
        !isMetaLine(line) &&
        !isPostBodyBoundaryLine(line) &&
        !isCommentUiLine(line),
    );
}

function extractAuthorBeforeTimestamp(lines: string[], timestampIndex: number) {
  for (let index = timestampIndex - 1; index >= Math.max(0, timestampIndex - 5); index -= 1) {
    const line = lines[index];
    if (/^asked a question\.?$/i.test(line)) {
      continue;
    }
    if (!isMetaLine(line) && !isCommentUiLine(line) && line.length <= 80) {
      return line.replace(/\s+asked a question\.?$/i, "").trim();
    }
  }

  return "";
}

function extractCompactCommentsFromLines(lines: string[]) {
  const markerIndex = lines.findIndex((line) =>
    /^view more (comments|answers)$/i.test(line),
  );

  if (markerIndex < 0) {
    return [];
  }

  const comments: string[] = [];
  const commentLines = lines.slice(markerIndex + 1);

  for (let index = 0; index < commentLines.length; index += 1) {
    const author = commentLines[index];
    const firstBodyLine = commentLines[index + 1];

    if (
      !firstBodyLine ||
      !looksLikeCommentAuthor(author) ||
      isMetaLine(firstBodyLine) ||
      isCommentUiLine(firstBodyLine)
    ) {
      continue;
    }

    const bodyLines: string[] = [];
    for (let innerIndex = index + 1; innerIndex < commentLines.length; innerIndex += 1) {
      const candidate = commentLines[innerIndex];
      if (
        looksLikeCommentAuthor(candidate) ||
        /^write (a )?(public )?(comment|answer)/i.test(candidate) ||
        isMainPostTimestampLine(candidate)
      ) {
        break;
      }

      if (isMetaLine(candidate) || isCommentUiLine(candidate)) {
        continue;
      }

      bodyLines.push(candidate);

      if (bodyLines.join(" ").length > 500) {
        break;
      }
    }

    const comment = cleanPostText(bodyLines.join(" "));
    if (comment.length >= 12) {
      comments.push(comment);
    }
  }

  return uniqueText(comments);
}

function extractPostTextFromLines(lines: string[]) {
  const bodyLines: string[] = [];

  for (const line of lines.slice(1)) {
    if (/^comment by\b/i.test(line) || looksLikePostHeaderLine(line)) {
      break;
    }

    if (isPostBodyBoundaryLine(line)) {
      if (bodyLines.length) {
        break;
      }
      continue;
    }

    if (!isMetaLine(line) && !isCommentUiLine(line)) {
      bodyLines.push(line);
    }

    if (bodyLines.join(" ").length > 900) {
      break;
    }
  }

  return bodyLines.join(" ");
}

function extractCommentsFromLines(lines: string[]) {
  const comments: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!/^comment by\b/i.test(line)) {
      continue;
    }

    const author =
      line.match(/^comment by\s+(.+?)(?:\s+\d|\s+[a-z]+\s+ago|$)/i)?.[1]?.trim() ??
      "";
    const bodyLines: string[] = [];

    for (let innerIndex = index + 1; innerIndex < lines.length; innerIndex += 1) {
      const candidate = lines[innerIndex];
      if (
        /^comment by\b/i.test(candidate) ||
        /^actions for this post by\b/i.test(candidate) ||
        /^write (a )?(public )?(comment|answer)/i.test(candidate)
      ) {
        break;
      }

      if (
        isMetaLine(candidate) ||
        isCommentUiLine(candidate) ||
        (author && candidate.toLowerCase() === author.toLowerCase())
      ) {
        continue;
      }

      bodyLines.push(candidate);

      if (bodyLines.join(" ").length > 500) {
        break;
      }
    }

    const comment = cleanPostText(bodyLines.join(" "));
    if (comment.length >= 12) {
      comments.push(comment);
    }
  }

  return uniqueText(comments);
}

function isBoilerplateLine(line: string) {
  return (
    /^facebook$/i.test(line) ||
    /^number of unread notifications/i.test(line) ||
    /^(like|reply|share|send|react|copy link|write an answer|write a comment)$/i.test(line) ||
    /^(like|comment|send|share|react|leave a comment)$/i.test(line) ||
    /^(see more|view more|most relevant|all comments|top comments)$/i.test(line) ||
    /^(shared with|actions for this post|send this to friends)/i.test(line) ||
    /^(rising contributor|top contributor|group expert|author)$/i.test(line) ||
    /^\d+[dhm]$/i.test(line)
  );
}

function isObfuscatedNoiseLine(line: string) {
  return (
    line.length === 1 ||
    /^[·•]+$/.test(line) ||
    /^\u00a0+$/.test(line)
  );
}

function isCommentUiLine(line: string) {
  return (
    /^(hide or report this|see who reacted to this)$/i.test(line) ||
    /^\d+\s+reaction/i.test(line) ||
    /^unlabelled image\b/i.test(line) ||
    /^may be (an? )?(image|graphic)\b/i.test(line) ||
    /to get missing image descriptions/i.test(line)
  );
}

function normaliseForComparison(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
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
    element.querySelector('[aria-label*="Actions for this post" i]') ||
      element.querySelector('[data-ad-preview="message"],[data-ad-comet-preview="message"]') ||
      /(\bLike\b|\bReply\b|\bShare\b|\bComment\b|View more|Write an answer)/i.test(text),
  );
}

function isPostActionButton(element: HTMLElement) {
  return /actions for this post/i.test(element.getAttribute("aria-label") ?? "");
}

function findPostContainerFromAction(actionButton: HTMLElement) {
  let current = actionButton.parentElement;
  let best: HTMLElement | null = null;

  while (current && current !== document.body) {
    const text = current.innerText?.replace(/\s+/g, " ").trim() ?? "";
    const rect = current.getBoundingClientRect();
    const actionCount = current.querySelectorAll(
      '[aria-label*="Actions for this post" i]',
    ).length;

    if (
      actionCount > 1 ||
      text.length > 5200 ||
      rect.width > Math.min(window.innerWidth * 0.86, 960)
    ) {
      break;
    }

    if (
      actionCount === 1 &&
      text.length >= 24 &&
      rect.width >= 360 &&
      rect.height >= 90 &&
      !isCommentContainer(current) &&
      !isLikelyPageShell(text)
    ) {
      best = current;
    }

    current = current.parentElement;
  }

  return best;
}

function findPostContainerFromContent(contentNode: HTMLElement) {
  let current = contentNode.parentElement;
  let best: HTMLElement | null = null;

  while (current && current !== document.body) {
    const text = current.innerText?.replace(/\s+/g, " ").trim() ?? "";
    const rect = current.getBoundingClientRect();
    const actionCount = current.querySelectorAll(
      '[aria-label*="Actions for this post" i]',
    ).length;

    if (
      actionCount > 1 ||
      text.length > 5200 ||
      rect.width > Math.min(window.innerWidth * 0.86, 960)
    ) {
      break;
    }

    if (
      actionCount === 1 &&
      text.length >= 60 &&
      rect.width >= 360 &&
      rect.height >= 90 &&
      !isCommentContainer(current) &&
      !isLikelyPageShell(text)
    ) {
      best = current;
    }

    current = current.parentElement;
  }

  return best;
}

function isCommentContainer(element: HTMLElement) {
  return /^comment by/i.test(element.getAttribute("aria-label") ?? "");
}

function isInsideCommentContainer(element: HTMLElement) {
  return Boolean(element.closest<HTMLElement>(commentSelector));
}

function isBeforeFirstComment(element: HTMLElement, firstComment: HTMLElement | null) {
  if (!firstComment) {
    return true;
  }

  if (firstComment.contains(element)) {
    return false;
  }

  return Boolean(
    element.compareDocumentPosition(firstComment) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
}

function findPostBodyStart(lines: string[]) {
  const actionIndex = lines.findIndex((line) =>
    /^actions for this post/i.test(line),
  );
  if (actionIndex >= 0) {
    return actionIndex + 1;
  }

  const timeIndex = lines.findIndex(isTimestampLine);
  if (timeIndex >= 0) {
    return timeIndex + 1;
  }

  return 0;
}

function isTimestampLine(line: string) {
  return (
    isScrambledTimestampLine(line) ||
    /^\d+\s*(m|h|d|w)$/i.test(line) ||
    /^\d+\s+(mins?|hours?|days?|weeks?)\s+ago$/i.test(line) ||
    /^yesterday\b/i.test(line) ||
    /^\d{1,2}\s+[a-z]{3,9}\s+at\s+\d{1,2}:\d{2}$/i.test(line)
  );
}

function isMainPostTimestampLine(line: string) {
  return (
    isScrambledTimestampLine(line) ||
    /^\d+\s+(mins?|minutes?|hours?|days?|weeks?)\s+ago$/i.test(line) ||
    /^yesterday\b/i.test(line) ||
    /^\d{1,2}\s+[a-z]{3,9}\s+at\s+\d{1,2}:\d{2}$/i.test(line)
  );
}

function looksLikeCommentAuthor(line: string) {
  return (
    line.length >= 3 &&
    line.length <= 80 &&
    !isMetaLine(line) &&
    !isCommentUiLine(line) &&
    !isPostBodyBoundaryLine(line) &&
    !/\?$/.test(line) &&
    !/[.!?].+\s/.test(line)
  );
}

function isMetaLine(line: string) {
  return (
    isBoilerplateLine(line) ||
    isTimestampLine(line) ||
    /^public$/i.test(line) ||
    /^edited$/i.test(line) ||
    /^\d+$/.test(line) ||
    /^view more (comments|answers)$/i.test(line)
  );
}

function isScrambledTimestampLine(line: string) {
  const tokens = line.split(/\s+/).filter(Boolean);
  if (tokens.length < 12) {
    return false;
  }

  const shortTokens = tokens.filter((token) => /^[a-z0-9]$/i.test(token)).length;
  const shortRatio = shortTokens / tokens.length;

  return shortRatio > 0.7 && /[sotp]/i.test(tokens.join(""));
}

function isPostBodyBoundaryLine(line: string) {
  return (
    isMetaLine(line) ||
    /^(view more|most relevant|all comments|write (a )?(public )?(comment|answer)|\d+\s+(comments?|answers?))\b/i.test(line) ||
    /^comment by\b/i.test(line)
  );
}

function extractCommentText(node: HTMLElement) {
  const label = node.getAttribute("aria-label") ?? "";
  const author = label.match(/^Comment by\s+(.+?)(?:\s+\d|\s+[a-z]+\s+ago|$)/i)?.[1];
  const lines = meaningfulLines(node.innerText).filter((line) => !isMetaLine(line));
  const bodyLines = [...lines];

  if (author && bodyLines[0]?.toLowerCase().includes(author.toLowerCase())) {
    bodyLines.shift();
  }

  return bodyLines.join(" ");
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
