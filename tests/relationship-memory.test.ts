import assert from "node:assert/strict";
import test from "node:test";
import type { RelationshipTopic } from "../lib/conversation-profile-types.js";
import { deriveTopicUpdate, effectiveTopicStatus, selectRelevantRelationshipMemory } from "../lib/relationship-memory.js";

const NOW = new Date("2026-09-05T12:00:00.000Z");
function topic(overrides: Partial<RelationshipTopic> = {}): RelationshipTopic {
  return { id: "exam", topicKey: "exam", summary: "התמודדות עם מבחן או לימודים מלחיצים",
    status: "active", confidence: .9, createdAt: "2026-09-04T12:00:00.000Z",
    lastReferencedAt: "2026-09-05T11:55:00.000Z", closedAt: null,
    supportingInteractionCount: 1, ...overrides };
}
function select(message: string, topics = [topic()], overrides = {}) {
  return selectRelevantRelationshipMemory({ message, topics, context: "קראש", tone: "זורם",
    memoryNote: null, now: NOW, ...overrides });
}

test("direct continuation selects one confident active topic", () => {
  assert.deepEqual(select("הלך לי ממש גרוע").topics.map((item) => item.topicKey), ["exam"]);
});
test("a new topic excludes a recent unrelated exam", () => {
  assert.equal(select("בא לך לצאת שישי?").topics.length, 0);
});
test("a five-minute explicit topic switch is not mistaken for recency relevance", () => {
  assert.equal(select("אגב אמא שלי שאלה עליך 😂").topics.length, 0);
});
test("an archived episode is reactivated only by an explicit strong topic match", () => {
  const archived = topic({ status: "archived", lastReferencedAt: "2026-08-01T12:00:00.000Z" });
  assert.equal(select("יש לי שוב מבחן ואני בלחץ בדיוק כמו פעם", [archived]).topics.length, 1);
  assert.equal(select("זה שוב קורה", [archived]).topics.length, 0);
});
test("current explicit relationship state and tone override stored state", () => {
  const result = select("מה נשמע?", [], { explicitContext: "בן/בת זוג", explicitTone: "ישיר" });
  assert.equal(result.relationshipContext, null);
  assert.equal(result.relationshipTone, null);
});
test("ambiguous relevance selects no historical topic", () => {
  assert.equal(select("לא יודעת מה לחשוב").topics.length, 0);
});
test("manual trusted hint is not injected without strong overlap", () => {
  const result = select("בא לך לצאת שישי?", [], { memoryNote: "לא אוהבת מסיבות רועשות" });
  assert.equal(result.trustedHint, null);
});
test("topic lifecycle cools and archives without making recency relevance", () => {
  assert.equal(effectiveTopicStatus(topic({ lastReferencedAt: "2026-08-31T12:00:00.000Z" }), NOW), "cooling");
  assert.equal(effectiveTopicStatus(topic({ lastReferencedAt: "2026-07-01T12:00:00.000Z" }), NOW), "archived");
});
test("only recognized abstract topics create persistence updates and no raw message is returned", () => {
  const raw = "יש לי מבחן מחר ואני בלחץ";
  const update = deriveTopicUpdate(raw, NOW);
  assert.ok(update);
  assert.equal(update.topicKey, "exam");
  assert.equal(JSON.stringify(update).includes(raw), false);
  assert.equal(deriveTopicUpdate("משהו עמום לחלוטין", NOW), null);
});
