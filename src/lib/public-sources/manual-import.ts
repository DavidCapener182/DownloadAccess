import { parse } from "csv-parse/sync";
import type { PublicSourceItem } from "@/lib/public-sources/types";

export function parseManualCsv(text: string): PublicSourceItem[] {
  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Array<Record<string, string>>;

  return records.map((record, index) => {
    const title = record.title || record.issue || `Manual import ${index + 1}`;
    const body = record.body || record.text || record.description || "";
    const url = record.url || record.link || "";
    return {
      title,
      text: `${title}. ${body}`.trim(),
      url: url || null,
      published_at: null,
      platform: "Manual Import",
    };
  });
}
