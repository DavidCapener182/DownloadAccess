import { XMLParser } from "fast-xml-parser";
import type { PublicSourceItem } from "@/lib/public-sources/types";

const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
});

export async function fetchRssFeed(feedUrl: string): Promise<PublicSourceItem[]> {
  const response = await fetch(feedUrl, {
    headers: { accept: "application/rss+xml, application/atom+xml, text/xml" },
  });

  if (!response.ok) {
    throw new Error(`RSS fetch failed with ${response.status}.`);
  }

  const xml = await response.text();
  const parsed = parser.parse(xml);
  const rssItems = parsed?.rss?.channel?.item;
  const atomItems = parsed?.feed?.entry;
  const items = Array.isArray(rssItems)
    ? rssItems
    : rssItems
      ? [rssItems]
      : Array.isArray(atomItems)
        ? atomItems
        : atomItems
          ? [atomItems]
          : [];

  return items.map((item: Record<string, unknown>) => {
    const title = String(item.title ?? "Untitled update");
    const description = String(item.description ?? item.summary ?? item.content ?? "");
    const link = extractLink(item.link);

    return {
      title,
      text: `${title}. ${description}`.trim(),
      url: link,
      published_at: String(item.pubDate ?? item.published ?? item.updated ?? "") || null,
      platform: "RSS",
    };
  });
}

function extractLink(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    const first = value[0] as Record<string, unknown> | undefined;
    return typeof first?.["@_href"] === "string" ? first["@_href"] : null;
  }

  if (value && typeof value === "object" && "@_href" in value) {
    const href = (value as Record<string, unknown>)["@_href"];
    return typeof href === "string" ? href : null;
  }

  return null;
}
