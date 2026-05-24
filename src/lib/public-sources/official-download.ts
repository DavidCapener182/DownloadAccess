import { fetchRssFeed } from "@/lib/public-sources/rss";
import type { PublicSourceItem } from "@/lib/public-sources/types";

export async function fetchOfficialDownloadUpdates(
  feedUrl: string,
): Promise<PublicSourceItem[]> {
  if (!feedUrl.startsWith("https://")) {
    throw new Error("Official Download source must use an HTTPS public feed URL.");
  }

  const items = await fetchRssFeed(feedUrl);
  return items.map((item) => ({
    ...item,
    platform: "Download Festival",
  }));
}
