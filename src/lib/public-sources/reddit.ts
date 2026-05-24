import type { PublicSourceItem } from "@/lib/public-sources/types";

type RedditListing = {
  data?: {
    children?: Array<{
      data?: {
        title?: string;
        selftext?: string;
        permalink?: string;
        created_utc?: number;
      };
    }>;
  };
};

export async function fetchRedditNewPosts({
  subreddit,
  bearerToken,
  userAgent,
  limit = 25,
}: {
  subreddit: string;
  bearerToken: string;
  userAgent: string;
  limit?: number;
}): Promise<PublicSourceItem[]> {
  if (!bearerToken) {
    throw new Error("Reddit API bearer token is required.");
  }

  const response = await fetch(
    `https://oauth.reddit.com/r/${encodeURIComponent(subreddit)}/new.json?limit=${limit}`,
    {
      headers: {
        authorization: `Bearer ${bearerToken}`,
        "user-agent": userAgent,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Reddit API request failed with ${response.status}.`);
  }

  const listing = (await response.json()) as RedditListing;
  return (listing.data?.children ?? []).map((child) => {
    const post = child.data ?? {};
    const title = post.title ?? "Untitled Reddit post";
    const selftext = post.selftext ?? "";
    return {
      title,
      text: `${title}. ${selftext}`.trim(),
      url: post.permalink ? `https://www.reddit.com${post.permalink}` : null,
      published_at: post.created_utc
        ? new Date(post.created_utc * 1000).toISOString()
        : null,
      platform: "Reddit",
    };
  });
}
