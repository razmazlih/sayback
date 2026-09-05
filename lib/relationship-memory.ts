import type { ContextOption, ToneOption } from "./generator-options";
import type { RelationshipTopic, RelationshipTopicStatus } from "./conversation-profile-types";

export const RELATIONSHIP_MEMORY_VERSION = 2;
export const MAX_TOPIC_CANDIDATES = 12;
export const MAX_SELECTED_TOPICS = 2;

type TopicDefinition = { key: string; summary: string; patterns: RegExp[] };
const TOPICS: readonly TopicDefinition[] = [
  { key: "exam", summary: "התמודדות עם מבחן או לימודים מלחיצים", patterns: [/מבח[ןנים]/, /בגרות/, /לימוד/, /ציון/] },
  { key: "plans", summary: "תיאום מפגש או תוכניות קרובות", patterns: [/לצאת/, /נפגש/, /שישי/, /שבת/, /לקבוע/, /בא לך/] },
  { key: "party", summary: "יציאה למסיבה או בילוי", patterns: [/מסיב/, /מועדון/, /לחגוג/] },
  { key: "family", summary: "עניין שקשור למשפחה", patterns: [/אמא/, /אבא/, /משפח/, /אחות/, /אח שלי/] },
  { key: "conflict", summary: "מתח או ריב שעדיין דורש התייחסות", patterns: [/ריב/, /כועס/, /נפגע/, /איחור/, /סליחה/] },
  { key: "work", summary: "עניין עבודה או שיחה מקצועית", patterns: [/לקוח/, /עבודה/, /מחיר/, /בוס/, /פרויקט/] },
] as const;

const CONTINUATION = /^(הלך|היה|יצא|נגמר|עבר|בסוף|עדיין|ממש|וואי)(?:\s|$)/;
const TOPIC_SWITCH = /(?:^|\s)(אגב|בנושא אחר|משהו אחר|דרך אגב)(?:\s|$)/;
const CLOSURE = /(נגמר|סיימתי|עברתי|הסתדר|סגרנו|בוטל)/;

export type MemorySelection = {
  topics: RelationshipTopic[];
  relationshipContext: ContextOption | null;
  relationshipTone: ToneOption | null;
  trustedHint: string | null;
  confidence: "high" | "medium" | "none";
  reason: "topic_match" | "direct_continuation" | "relationship_only" | "no_relevant_memory";
};

export function classifyRelationshipTopic(message: string): TopicDefinition | null {
  const normalized = message.trim().toLowerCase();
  return TOPICS.find((topic) => topic.patterns.some((pattern) => pattern.test(normalized))) ?? null;
}

export function effectiveTopicStatus(topic: RelationshipTopic, now = new Date()): RelationshipTopicStatus {
  if (topic.status === "closed" || topic.status === "archived") return topic.status;
  const ageDays = (now.getTime() - Date.parse(topic.lastReferencedAt)) / 86_400_000;
  if (ageDays > 30) return "archived";
  if (ageDays > 3) return "cooling";
  return "active";
}

export function selectRelevantRelationshipMemory(input: {
  message?: string;
  topics: RelationshipTopic[];
  context: ContextOption | null;
  tone: ToneOption;
  memoryNote: string | null;
  explicitContext?: string;
  explicitTone?: string;
  now?: Date;
}): MemorySelection {
  const message = input.message?.trim() ?? "";
  const now = input.now ?? new Date();
  if (!message) return emptySelection();
  const classified = classifyRelationshipTopic(message);
  const switched = TOPIC_SWITCH.test(message);
  let matches: RelationshipTopic[] = [];
  let reason: MemorySelection["reason"] = "no_relevant_memory";

  if (classified) {
    matches = input.topics.filter((topic) => topic.topicKey === classified.key && topic.confidence >= 0.75);
    // Archived episodes require a clear, explicit topic match; time alone never revives them.
    reason = matches.length ? "topic_match" : reason;
  } else if (!switched && CONTINUATION.test(message)) {
    matches = input.topics.filter((topic) => effectiveTopicStatus(topic, now) === "active" && topic.confidence >= 0.85);
    if (matches.length === 1) reason = "direct_continuation";
    else matches = [];
  }

  matches = matches
    .sort((a, b) => Date.parse(b.lastReferencedAt) - Date.parse(a.lastReferencedAt))
    .slice(0, MAX_SELECTED_TOPICS);
  const relationshipContext = input.explicitContext ? null : input.context;
  const relationshipTone = input.explicitTone ? null : input.tone;
  // A user-authored hint is trusted but only selected on strong lexical evidence.
  const trustedHint = hasStrongHintOverlap(message, input.memoryNote) ? input.memoryNote : null;
  const hasRelationship = Boolean(relationshipContext || relationshipTone || trustedHint);
  if (!matches.length && hasRelationship) reason = "relationship_only";
  return {
    topics: matches,
    relationshipContext,
    relationshipTone,
    trustedHint,
    confidence: matches.length || trustedHint ? "high" : hasRelationship ? "medium" : "none",
    reason,
  };
}

export function deriveTopicUpdate(message: string, now = new Date()) {
  const topic = classifyRelationshipTopic(message);
  if (!topic) return null;
  return {
    topicKey: topic.key,
    summary: topic.summary,
    status: (CLOSURE.test(message) ? "closed" : "active") as RelationshipTopicStatus,
    confidence: 0.9,
    referencedAt: now.toISOString(),
  };
}

function hasStrongHintOverlap(message: string, hint: string | null) {
  if (!hint) return false;
  const words = (value: string) => new Set(value.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? []);
  const current = words(message);
  const remembered = words(hint);
  let overlap = 0;
  for (const word of current) if (remembered.has(word)) overlap += 1;
  return overlap >= 2;
}

function emptySelection(): MemorySelection {
  return { topics: [], relationshipContext: null, relationshipTone: null, trustedHint: null, confidence: "none", reason: "no_relevant_memory" };
}
