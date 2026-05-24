import type { ExtensionSettings, StoredState } from "./types";

export const defaultSettings: ExtensionSettings = {
  apiUrl: "https://kss-accessibility-live-monitor.vercel.app",
  apiToken: "",
  sourceId: "source-facebook-download-access",
  sourceName: "Download Festival Access Facebook group",
  allowedDomains: [],
  allowedPageUrls: ["https://www.facebook.com/groups/downloadfestivalaccess"],
  monitoringMode: "manual_review",
  paused: false,
};

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = (await chrome.storage.local.get()) as StoredState;
  return {
    ...defaultSettings,
    ...stored,
    allowedDomains: Array.isArray(stored.allowedDomains)
      ? stored.allowedDomains
      : [],
    allowedPageUrls: Array.isArray(stored.allowedPageUrls)
      ? stored.allowedPageUrls
      : defaultSettings.allowedPageUrls,
  };
}

export async function saveSettings(settings: Partial<ExtensionSettings>) {
  await chrome.storage.local.set(settings);
}

export function domainAllowed(hostname: string, allowedDomains: string[]) {
  const normalised = hostname.toLowerCase();
  return allowedDomains.some((domain) => {
    const allowed = domain.trim().toLowerCase();
    return normalised === allowed || normalised.endsWith(`.${allowed}`);
  });
}

export function normalisePageUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return value.trim().replace(/\/$/, "");
  }
}

export function pageAllowed(
  href: string,
  hostname: string,
  allowedDomains: string[],
  allowedPageUrls: string[],
) {
  const current = normalisePageUrl(href);
  const pageMatch = allowedPageUrls.some((entry) => {
    const allowed = normalisePageUrl(entry);
    return current === allowed || current.startsWith(`${allowed}/`);
  });

  return pageMatch || domainAllowed(hostname, allowedDomains);
}
