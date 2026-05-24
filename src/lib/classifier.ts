import { createHash } from "node:crypto";
import { seedKeywords, seedLocations } from "@/lib/seed";
import type { ClassificationResult, Severity, SiteLocation } from "@/lib/types";

const severityOrder: Record<Severity, number> = {
  Low: 1,
  Medium: 2,
  High: 3,
  Critical: 4,
};

const phonePattern =
  /(?:(?:\+44\s?|0)(?:\d[\s-]?){9,10})|(?:\b\d{5}\s?\d{6}\b)/g;
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const socialHandlePattern = /(^|\s)@[a-z0-9_.-]{2,}/gi;
const profileUrlPattern =
  /https?:\/\/(?:www\.)?(?:facebook|instagram|x|twitter|tiktok|threads)\.com\/[^\s]+/gi;
const explicitNamePattern =
  /\b(name|called|contact name)\s*[:\-]\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}/g;

const specialCategoryTerms = [
  "accessibility",
  "disabled",
  "disability",
  "wheelchair",
  "autistic",
  "autism",
  "adhd",
  "anxiety",
  "panic attack",
  "insulin",
  "medication",
  "medical",
  "carer",
  "pa wristband",
  "assistance",
];

const safeguardingMedicalTerms = [
  "medical emergency",
  "need medic",
  "medic",
  "fallen",
  "injured",
  "insulin",
  "medication fridge",
  "vulnerable",
  "abandoned",
  "missing person",
  "safeguarding",
  "panic attack",
  "distressed",
];

const urgentNowPatterns = [
  /\b(right now|currently|at the moment|now|urgent|asap|immediately)\b/i,
  /\b(i'?m|i am|they'?re|they are|someone is|person is)\s+(having|in|stuck|trapped|distressed|injured|fallen)\b/i,
  /\b(having|having a)\s+panic attack\b/i,
  /\b(can'?t|cannot)\s+(breathe|move|get out|cope|reach)\b/i,
  /\bneed(s)?\s+(help|medic|security|welfare|assistance)\b/i,
];

const informationContextPatterns = [
  /\b(i|we)\s+(have|suffer|suffer from|live with|am diagnosed with|got)\b.{0,80}\b(panic attacks?|ptsd|cptsd|eupd|anxiety|autism|adhd|disability|medical condition)\b/i,
  /\b(first time|wondering|does anyone|has anyone|any advice|any tips|experience of|how do you manage|what should i expect)\b/i,
  /\b(i am|i'm)\s+(nervous|worried|anxious)\s+about\s+(coming|attending|going)\b/i,
];

const negatedUrgencyPattern =
  /\b(not urgent|is not urgent|isn't urgent|not currently|not happening now|planning ahead|just planning)\b/i;

const securityTerms = [
  "security",
  "fight",
  "assault",
  "harassment",
  "threat",
  "threatening",
  "aggressive",
  "stolen",
  "theft",
  "violence",
];

const topicSignals: Array<{
  category: string;
  severity: Severity;
  relevance: ClassificationResult["relevance"];
  terms: string[];
}> = [
  {
    category: "Security",
    severity: "Medium",
    relevance: "Needs review",
    terms: [
      "security",
      "fight",
      "assault",
      "harassment",
      "threat",
      "threatening",
      "aggressive",
      "stolen",
      "theft",
      "violence",
    ],
  },
  {
    category: "KSS / external",
    severity: "Medium",
    relevance: "Needs review",
    terms: [
      "kss",
      "access team",
      "download access team",
      "guest services",
      "steward",
      "stewards",
      "staff",
      "box office",
      "welfare tent",
    ],
  },
  {
    category: "Access admin",
    severity: "Low",
    relevance: "Needs review",
    terms: [
      "essential companion",
      "companion ticket",
      "carer",
      "carer pass",
      "pa wristband",
      "wristband",
      "access package",
      "access application",
      "disabled child",
    ],
  },
  {
    category: "Travel / parking",
    severity: "Low",
    relevance: "Needs review",
    terms: [
      "access carpark",
      "access car park",
      "car park",
      "carpark",
      "parking",
      "drop off",
      "pick up",
      "traffic",
      "drive in",
      "monday morning",
    ],
  },
  {
    category: "Campsite",
    severity: "Low",
    relevance: "Needs review",
    terms: ["access camp", "camping in access", "camp a", "camp b", "pitch up"],
  },
  {
    category: "Facilities",
    severity: "Low",
    relevance: "Needs review",
    terms: ["toilet", "shower", "charging", "fridge", "trackway"],
  },
  {
    category: "Welfare",
    severity: "Low",
    relevance: "Information",
    terms: ["panic", "anxiety", "overwhelmed", "worried", "nervous", "ptsd"],
  },
  {
    category: "Information",
    severity: "Low",
    relevance: "Information",
    terms: [
      "packing",
      "what are you bringing",
      "how long",
      "first time",
      "wondering",
      "any advice",
    ],
  },
];

function normalise(value: string) {
  return value
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function containsPhrase(text: string, phrase: string) {
  const target = normalise(phrase);
  if (text.includes(target)) {
    return true;
  }

  if (target.includes("can't")) {
    return text.includes(target.replace("can't", "can not"));
  }

  return false;
}

function maxSeverity(current: Severity, next: Severity) {
  return severityOrder[next] > severityOrder[current] ? next : current;
}

function matches(pattern: RegExp, value: string) {
  pattern.lastIndex = 0;
  return pattern.test(value);
}

export function isAtLeastSeverity(value: Severity, floor: Severity) {
  return severityOrder[value] >= severityOrder[floor];
}

export function hashText(value: string) {
  return createHash("sha256")
    .update(normalise(value))
    .digest("hex");
}

export function redactOperationalText(value: string) {
  return value
    .replace(profileUrlPattern, "[redacted profile URL]")
    .replace(emailPattern, "[redacted email]")
    .replace(phonePattern, "[redacted phone]")
    .replace(explicitNamePattern, "$1: [redacted name]")
    .replace(socialHandlePattern, "$1[redacted handle]");
}

export function detectPersonalData(value: string) {
  return (
    matches(phonePattern, value) ||
    matches(emailPattern, value) ||
    matches(socialHandlePattern, value) ||
    matches(profileUrlPattern, value) ||
    matches(explicitNamePattern, value)
  );
}

export function detectLocation(
  value: string,
  locations: SiteLocation[] = seedLocations,
) {
  const text = normalise(value);
  return (
    locations.find((location) => text.includes(normalise(location.name))) ??
    locations.find((location) =>
      normalise(location.name)
        .split(/\s+/)
        .filter((part) => part.length > 2)
        .every((part) => text.includes(part)),
    ) ??
    null
  );
}

export function classifyText(
  value: string,
  locations: SiteLocation[] = seedLocations,
): ClassificationResult {
  const text = normalise(value);
  const matched = seedKeywords.filter(
    (entry) => entry.active && containsPhrase(text, entry.keyword),
  );

  let severity: Severity = "Low";
  let category = matched[0]?.category ?? "Unclassified";

  for (const match of matched) {
    const previousSeverity: Severity = severity;
    severity = maxSeverity(severity, match.severity);
    if (severity !== previousSeverity) {
      category = match.category;
    }
  }

  const specialCategoryRisk = specialCategoryTerms.some((term) =>
    containsPhrase(text, term),
  );
  const safeguardingOrMedicalFlag = safeguardingMedicalTerms.some((term) =>
    containsPhrase(text, term),
  );
  const urgentNow =
    !negatedUrgencyPattern.test(value) &&
    urgentNowPatterns.some((pattern) => pattern.test(value));
  const informationContext =
    !urgentNow && informationContextPatterns.some((pattern) => pattern.test(value));
  const personalDataPresent = detectPersonalData(value);
  const location = detectLocation(value, locations);
  const matchedKeywords = [...new Set(matched.map((entry) => entry.keyword))];
  const hasSecuritySignal = securityTerms.some((term) => containsPhrase(text, term));
  const topicSignal = topicSignals.find((signal) =>
    signal.terms.some((term) => containsPhrase(text, term)),
  );

  if (hasSecuritySignal && category === "Unclassified") {
    category = "Security";
    severity = maxSeverity(severity, "Medium");
  }

  if (!matchedKeywords.length && topicSignal) {
    category = topicSignal.category;
    severity = maxSeverity(severity, topicSignal.severity);
  }

  let relevance: ClassificationResult["relevance"] = "Needs review";
  let reason = "Keyword match needs control-room review.";

  if (!matchedKeywords.length && !hasSecuritySignal && topicSignal) {
    relevance = topicSignal.relevance;
    reason = `${topicSignal.category} topic flag found; review for operational relevance.`;
  } else if (!matchedKeywords.length && !hasSecuritySignal) {
    relevance = "Not relevant";
    reason = "No monitored operational keyword was found.";
  } else if (informationContext) {
    relevance = "Information";
    severity = "Low";
    category = "Information";
    reason =
      "Wording appears to describe a condition, advice request, or future concern rather than a live incident.";
  } else if (severity === "Critical" || severity === "High") {
    relevance = "Actionable";
    reason = urgentNow
      ? "Urgent wording indicates this may be happening now."
      : "High-risk operational keyword found.";
  }

  const primaryKeyword =
    relevance === "Information"
      ? "information request"
      : matchedKeywords[0] ??
        (hasSecuritySignal ? "security" : topicSignal?.category ?? "manual review");

  return {
    title: `${severity}: ${primaryKeyword}`,
    category,
    severity,
    relevance,
    reason,
    matched_keywords: matchedKeywords,
    location_name: location?.name ?? null,
    redacted_text: redactOperationalText(value),
    personal_data_present: personalDataPresent,
    special_category_risk: specialCategoryRisk,
    safeguarding_or_medical_flag: safeguardingOrMedicalFlag,
  };
}

export function summariseForTitle(value: string) {
  const clean = redactOperationalText(value).replace(/\s+/g, " ").trim();
  return clean.length > 80 ? `${clean.slice(0, 77)}...` : clean;
}
