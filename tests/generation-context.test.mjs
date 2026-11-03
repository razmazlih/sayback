import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "..");

// Execute the actual handler with isolated service boundaries: no credentials,
// Firebase writes, paid AI calls, or Next request lifecycle are needed.
function harness({ monthly = false, bypass = false, profile = null, allowed = true, fail = false, credits = 0, subscriptionStatus = null, generatedIntent = "כוונה" } = {}) {
  const calls = { generation: [], updates: [], refunds: [], logs: [], persisted: [], events: [], memory: [], voice: [], consumption: 0 };
  const pendingTasks = [];
  const snapshot = { hasUnlimited: monthly || bypass, billingBypassEnabled: bypass, credits, subscriptionStatus };
  class AIRequestError extends Error { status = 400; }
  class UnauthorizedError extends Error { status = 401; }
  class ConversationProfileError extends Error { status = 400; }
  const mocks = {
    "@/lib/ai": {
      AIRequestError,
      generateRepliesWithModelSource: async (input) => {
        calls.generation.push(input);
        if (fail) throw new AIRequestError("generation failed");
        return { result: { intent: generatedIntent, replies: ["א", "ב", "ג"] }, modelSource: "local" };
      },
    },
    "@/lib/auth": { UnauthorizedError, requireAuthenticatedUser: async () => ({ uid: "user", email: null, isAnonymous: true }) },
    "@/lib/billing": {
      consumeGenerationAccess: async () => { calls.consumption++; return { allowed, snapshot, consumption: "initial_free" }; },
      getBillingSnapshot: async () => snapshot,
      isBillingBypassEnabled: () => bypass,
      refundGenerationAccess: async (...args) => calls.refunds.push(args),
    },
    "@/lib/local-usage-logs": {
      clearLocalUsageLogConversationBackgroundLength() {},
      completeLocalUsageLog: (_id, input) => calls.logs.push(input),
      startLocalUsageLog: (input) => { calls.logs.push(input); return "log"; },
    },
    "@/lib/persisted-usage-logs": { persistUsageLog: (input) => calls.persisted.push(input) },
    "@/lib/rate-limit": { consumeRateLimit: async () => ({ allowed: true }) },
    "@/lib/conversation-profiles": {
      ConversationProfileError,
      getConversationProfile: async () => profile,
      listRelationshipTopicCandidates: async () => [],
      recordRelationshipMemoryTurn: async (...args) => calls.memory.push(args),
      updateConversationProfileAfterGeneration: async (...args) => calls.updates.push(args[2]),
    },
    "@/lib/my-voice-logic": { buildMyVoiceInstruction: () => null },
    "@/lib/my-voice": { loadMyVoicePreferencesSafely: async () => null, recordSuccessfulRefineSignal: (...args) => calls.voice.push(args) },
    "@/lib/visitor-identity": { readVisitorIdentity: () => null, resolveUserId: () => null },
    "@/lib/product-events": { recordServerProductEvent: (input) => calls.events.push(input) },
    "next/server": { after: (fn) => pendingTasks.push(fn) },
  };
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const output = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const loadedModule = { exports: {} };
    cache.set(file, loadedModule.exports);
    const localRequire = (id) => {
      if (id in mocks) return mocks[id];
      if (id.startsWith("@/")) return load(resolve(root, `${id.slice(2)}.ts`));
      if (id.startsWith(".")) return load(resolve(file, "..", `${id}.ts`));
      return require(id);
    };
    new Function("require", "module", "exports", output)(localRequire, loadedModule, loadedModule.exports);
    return loadedModule.exports;
  }
  const { POST } = load(resolve(root, "app/api/generate/route.ts"));
  return {
    calls,
    context: load(resolve(root, "lib/reply-context.ts")),
    request: async (body) => {
      const response = await POST(new Request("http://localhost/api/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "היי", ...body }),
      }));
      await Promise.all(pendingTasks.splice(0).map((fn) => fn()));
      return response;
    },
  };
}

const profile = {
  id: "profile", label: "בדיקה", context: "בוס", tone: "ישיר", memoryNote: null,
  usageCount: 0, lastUsedAt: new Date().toISOString(),
};

const invalidInputs = [
  { languagePreferences: null },
  { languagePreferences: [] },
  { languagePreferences: "masculine" },
  { languagePreferences: { speaker: "guess" } },
  { languagePreferences: { recipient: false } },
  { languagePreferences: { speaker: "neutral", name: "דנה" } },
  { previousOutgoingMessage: null },
  { previousOutgoingMessage: " " },
  { previousOutgoingMessage: 123 },
  { previousOutgoingMessage: "א".repeat(241) },
  { previousOutgoingMessage: "נשלח", noReplyMode: true },
  { previousOutgoingMessage: "נשלח", noReplyMode: "false" },
  { commitmentMode: "yes" },
  { commitmentMode: null },
  { commitmentMode: "provided" },
  { commitmentMode: "provided", commitmentDetails: " " },
  { commitmentMode: "provided", commitmentDetails: "א".repeat(181) },
  { commitmentMode: "provided", commitmentDetails: 100 },
  { commitmentMode: "ask", commitmentDetails: "100₪" },
  { commitmentDetails: "100₪" },
];

test("invalid optional context is rejected before billing, generation, or logging", async () => {
  const app = harness();
  for (const input of invalidInputs) {
    const response = await app.request(input);
    assert.equal(response.status, 400, JSON.stringify(input));
    assert.ok((await response.json()).error);
  }
  assert.equal(app.calls.consumption, 0);
  assert.equal(app.calls.generation.length, 0);
  assert.equal(app.calls.refunds.length, 0);
  assert.equal(app.calls.logs.length, 0);
  assert.equal(app.calls.persisted.length, 0);
});

test("omitted controls retain the simple request; partial preferences default to neutral", async () => {
  const app = harness();
  await app.request({});
  assert.equal(app.calls.generation[0].languagePreferences, undefined);
  assert.equal(app.calls.generation[0].commitmentMode, undefined);
  await app.request({ languagePreferences: { speaker: "feminine" } });
  assert.deepEqual(app.calls.generation[1].languagePreferences, { speaker: "feminine", recipient: "neutral" });
});

test("boundary lengths pass without truncation and only supplied grammatical preferences are used", async () => {
  const app = harness();
  const sent = "א".repeat(240), details = "ב".repeat(180);
  const response = await app.request({
    previousOutgoingMessage: ` ${sent} `,
    commitmentMode: "provided", commitmentDetails: details,
    languagePreferences: { speaker: "neutral", recipient: "masculine" },
  });
  assert.equal(response.status, 200);
  assert.equal(app.calls.generation[0].previousOutgoingMessage, sent);
  assert.equal(app.calls.generation[0].commitmentDetails, details);
  assert.deepEqual(app.calls.generation[0].languagePreferences, { speaker: "neutral", recipient: "masculine" });
  assert.equal(app.calls.consumption, 1);
});

for (const extra of [
  { previousOutgoingMessage: "הודעה פרטית שנשלחה" },
  { commitmentMode: "provided", commitmentDetails: "מחיר פרטי 829₪" },
]) {
  test(`temporary context never reaches persistence or remembered model intent: ${Object.keys(extra).join(",")}`, async () => {
    const app = harness({ profile, generatedIntent: "הודעה פרטית שנשלחה במחיר פרטי 829₪" });
    const response = await app.request({ conversationId: profile.id, languagePreferences: { speaker: "feminine" }, ...extra });
    assert.equal(response.status, 200);
    assert.equal(app.calls.updates.length, 0);
    assert.equal(app.calls.memory.length, 0);
    assert.ok(app.calls.persisted.length > 0);
    const recorded = JSON.stringify({ logs: app.calls.logs, persisted: app.calls.persisted, events: app.calls.events, voice: app.calls.voice });
    // Include the currency marker: a short number alone can occur in timestamps or request IDs.
    for (const forbidden of ["הודעה פרטית", "829₪", "previousOutgoingMessage", "commitmentDetails", "languagePreferences", "feminine"]) {
      assert.equal(recorded.includes(forbidden), false, forbidden);
    }
  });
}

test("new optional controls survive standard and custom refine while only the action is learned", async () => {
  const app = harness({ profile });
  for (const action of ["softer", "sharper", "retry"]) {
    const response = await app.request({
      conversationId: profile.id, action, sourceReply: "הנוסח הנוכחי", refineInstruction: "קצר יותר",
      previousOutgoingMessage: "מה שבאמת שלחתי", commitmentMode: "defer",
      languagePreferences: { recipient: "feminine" },
    });
    assert.equal(response.status, 200);
    const input = app.calls.generation.at(-1);
    assert.equal(input.previousOutgoingMessage, "מה שבאמת שלחתי");
    assert.equal(input.commitmentMode, "defer");
    assert.equal(input.languagePreferences.recipient, "feminine");
  }
  assert.deepEqual(app.calls.voice, [["user", "softer"], ["user", "sharper"], ["user", "retry"]]);
  assert.equal(app.calls.updates.length, 0);
});

test("context normalization is immutable and rejects invalid direct engine inputs", () => {
  const { normalizeReplyContext } = harness().context;
  const input = { languagePreferences: { recipient: "feminine" }, previousOutgoingMessage: "  נשלח  " };
  const before = JSON.stringify(input);
  assert.deepEqual(normalizeReplyContext(input), {
    languagePreferences: { speaker: "neutral", recipient: "feminine" }, previousOutgoingMessage: "נשלח",
  });
  assert.equal(JSON.stringify(input), before);
  for (const invalid of invalidInputs) assert.throws(() => normalizeReplyContext(invalid));
});

test("commitment choice appears for relevant offers/questions, not ordinary conversation", () => {
  const { getMissingCommitmentKind } = harness().context;
  for (const text of ["כמה זה עולה?", "מה המחיר למשלוח?", "אפשר ב־300 ש״ח?", "נסגור על 200₪?", "100 שקל?"]) {
    assert.equal(getMissingCommitmentKind(text), "price", text);
  }
  for (const text of ["מתי ניפגש?", "אפשר לקבוע למחר בערב?", "תגיע מחר ב18:30?", "באיזו שעה מתאים לך?", "אפשר להיפגש בערב?", "מתי נוח לך?", "אפשר בשמונה?", "האם אפשר בשעה תשע?", "נדבר מחר?", "מתי אפשר לדבר?", "מתאים באחת עשרה?"]) {
    assert.equal(getMissingCommitmentKind(text), "time", text);
  }
  for (const text of ["", "היי מה שלומך?", "תודה על העזרה", "מתי הייתה המלחמה?", "מחר יש לי מבחן", "יש לי 100 שקל", "זה לא עולה על הדעת", "מתי ראית סרט?", "מתי נוחת המטוס?", "היה אפשר בשמונה", "אפשר עזרה?"]) {
    assert.equal(getMissingCommitmentKind(text), null, text);
  }
});
