import type { DetectedIssue, ExtensionSettings } from "./types";

export async function submitIssue(
  issue: DetectedIssue,
  settings: ExtensionSettings,
) {
  if (!settings.apiToken) {
    throw new Error("Missing source API token.");
  }

  const response = await fetch(`${settings.apiUrl.replace(/\/$/, "")}/api/source-events`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${settings.apiToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      raw_text: issue.text,
      post_title: issue.title,
      post_text: issue.postText,
      comments: issue.comments,
      media_urls: issue.mediaUrls,
      source_id: settings.sourceId || null,
      source_url: issue.sourceUrl,
      source_platform: "Browser",
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `Submission failed with ${response.status}.`);
  }

  return response.json();
}
