import type { PublicSourceItem } from "@/lib/public-sources/types";

export async function fetchWeatherWarnings(apiUrl: string): Promise<PublicSourceItem[]> {
  if (!apiUrl.startsWith("https://")) {
    throw new Error("Weather source must use an HTTPS public API URL.");
  }

  const response = await fetch(apiUrl, {
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Weather warning request failed with ${response.status}.`);
  }

  const data = (await response.json()) as {
    warnings?: Array<{ title?: string; description?: string; url?: string }>;
  };

  return (data.warnings ?? []).map((warning) => ({
    title: warning.title ?? "Weather warning",
    text: `${warning.title ?? "Weather warning"}. ${warning.description ?? ""}`.trim(),
    url: warning.url ?? null,
    published_at: null,
    platform: "Weather",
  }));
}
