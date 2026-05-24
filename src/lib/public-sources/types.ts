export type PublicSourceItem = {
  title: string;
  text: string;
  url: string | null;
  published_at: string | null;
  platform: string;
};

export type PublicSourceAdapter = {
  name: string;
  fetchLatest: () => Promise<PublicSourceItem[]>;
};
