import type { Severity } from "./types";

type Rule = {
  keyword: string;
  category: string;
  severity: Severity;
};

const rules: Rule[] = [
  ["wheelchair stuck", "Mobility access", "Critical"],
  ["stuck in mud", "Ground condition", "Critical"],
  ["cannot get out", "Mobility access", "Critical"],
  ["can't get out", "Mobility access", "Critical"],
  ["medical emergency", "Medical", "Critical"],
  ["need medic", "Medical", "Critical"],
  ["insulin", "Medical", "Critical"],
  ["medication fridge", "Medical", "Critical"],
  ["fallen", "Injury", "Critical"],
  ["injured", "Injury", "Critical"],
  ["unsafe", "Safety", "Critical"],
  ["vulnerable", "Safeguarding", "Critical"],
  ["abandoned", "Safeguarding", "Critical"],
  ["missing person", "Safeguarding", "Critical"],
  ["safeguarding", "Safeguarding", "Critical"],
  ["panic attack", "Welfare", "Critical"],
  ["distressed", "Welfare", "Critical"],
  ["blocked access", "Access route", "Critical"],
  ["no accessible access", "Access route", "Critical"],
  ["accessible toilet blocked", "Accessible toilet", "High"],
  ["accessible toilet overflowing", "Accessible toilet", "High"],
  ["no accessible toilet", "Accessible toilet", "High"],
  ["accessible shower broken", "Accessible shower", "High"],
  ["blue badge issue", "Parking", "High"],
  ["carer pass issue", "Ticketing", "High"],
  ["pa wristband issue", "Ticketing", "High"],
  ["charging point broken", "Power", "High"],
  ["shuttle not arrived", "Transport", "High"],
  ["cannot reach campsite", "Transport", "High"],
  ["trackway problem", "Ground condition", "High"],
  ["ground condition", "Ground condition", "High"],
  ["viewing platform issue", "Viewing platform", "High"],
  ["queue too long", "Queue", "High"],
  ["left waiting", "Queue", "High"],
  ["confusing signage", "Signage", "Medium"],
  ["information request", "Information", "Medium"],
  ["long queue", "Queue", "Medium"],
  ["delay", "Delay", "Medium"],
  ["staff did not know", "Staff briefing", "Medium"],
  ["access route unclear", "Access route", "Medium"],
  ["parking confusion", "Parking", "Medium"],
  ["campsite facilities", "Facilities", "Medium"],
  ["complaint", "Complaint", "Medium"],
  ["feedback", "Feedback", "Low"],
  ["suggestion", "Feedback", "Low"],
  ["general question", "Information", "Low"],
].map(([keyword, category, severity]) => ({
  keyword,
  category,
  severity: severity as Severity,
}));

const severityRank: Record<Severity, number> = {
  Low: 1,
  Medium: 2,
  High: 3,
  Critical: 4,
};

const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const phonePattern =
  /(?:(?:\+44\s?|0)(?:\d[\s-]?){9,10})|(?:\b\d{5}\s?\d{6}\b)/g;
const profileUrlPattern =
  /https?:\/\/(?:www\.)?(?:facebook|instagram|x|twitter|tiktok|threads)\.com\/[^\s]+/gi;
const socialHandlePattern = /(^|\s)@[a-z0-9_.-]{2,}/gi;

function normalise(value: string) {
  return value
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function includesPhrase(text: string, phrase: string) {
  const target = normalise(phrase);
  return text.includes(target) || text.includes(target.replace("can't", "can not"));
}

export function redactText(value: string) {
  return value
    .replace(profileUrlPattern, "[redacted profile URL]")
    .replace(emailPattern, "[redacted email]")
    .replace(phonePattern, "[redacted phone]")
    .replace(socialHandlePattern, "$1[redacted handle]");
}

export function classifyVisibleText(value: string) {
  const text = normalise(value);
  const matched = rules.filter((rule) => includesPhrase(text, rule.keyword));
  let severity: Severity = "Low";
  let category = "Unclassified";

  for (const rule of matched) {
    if (severityRank[rule.severity] > severityRank[severity]) {
      severity = rule.severity;
      category = rule.category;
    }
  }

  return {
    matched,
    severity,
    category,
    redactedText: redactText(value),
  };
}

export async function hashText(value: string) {
  const buffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalise(value)),
  );
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
