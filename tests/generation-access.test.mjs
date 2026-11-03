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
function harness({ monthly = false, bypass = false, profile = null, allowed = true, fail = false, credits = 0, subscriptionStatus = null, failureMessage = "generation failed", failureStatus = 400, consumptionSource = "initial_free" } = {}) {
  const calls = { generation: [], updates: [], refunds: [], consumption: [], voice: [], events: [], logs: [], persisted: [], memory: [] };
  const pendingTasks = [];
  const snapshot = { hasUnlimited: monthly || bypass, billingBypassEnabled: bypass, credits, subscriptionStatus };
  class AIRequestError extends Error {
    constructor(message, status = 400) { super(message); this.status = status; }
  }
  class UnauthorizedError extends Error { status = 401; }
  class ConversationProfileError extends Error { status = 400; }
  const mocks = {
    "@/lib/ai": {
      AIRequestError,
      generateRepliesWithModelSource: async (input) => {
        calls.generation.push(input);
        if (fail) throw new AIRequestError(failureMessage, failureStatus);
        return { result: { intent: "כוונה", replies: ["א", "ב", "ג"] }, modelSource: "local" };
      },
    },
    "@/lib/auth": { UnauthorizedError, requireAuthenticatedUser: async () => ({ uid: "user", email: null, isAnonymous: true }) },
    "@/lib/billing": {
      consumeGenerationAccess: async (uid) => { calls.consumption.push(uid); return { allowed, snapshot, consumption: consumptionSource }; },
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

const premiumProfile = {
  id: "profile", label: "חבר", context: "משפחה", tone: "רשמי", memoryNote: null,
  usageCount: 0, lastUsedAt: new Date().toISOString(),
};

for (const mode of [{}, { credits: 50 }, { subscriptionStatus: "canceled" }, { bypass: true }]) {
  test(`direct premium fields cannot bypass server access: ${JSON.stringify(mode)}`, async () => {
    const app = harness(mode);
    assert.equal((await app.request({ context: "משפחה", tone: "רשמי", conversationBackground: "רקע" })).status, 200);
    const input = app.calls.generation[0];
    assert.equal(input.context, undefined);
    assert.equal(input.tone, "זורם");
    assert.equal(input.conversationBackground, undefined);
  });

  test(`saved defaults and relationship memory cannot restore premium fields: ${JSON.stringify(mode)}`, async () => {
    const app = harness({ ...mode, profile: premiumProfile });
    assert.equal((await app.request({ conversationId: "profile" })).status, 200);
    const input = app.calls.generation[0];
    assert.equal(input.context, undefined);
    assert.equal(input.tone, "זורם");
    assert.ok(!input.savedConversationMemory?.context);
    assert.ok(!input.savedConversationMemory?.tone);
    assert.equal(app.calls.updates[0].context, undefined);
    assert.equal(app.calls.updates[0].tone, undefined);
    assert.equal(app.calls.updates[0].lastIntent, "כוונה");
  });
}

test("free client fallback values do not overwrite temporarily locked saved preferences", async () => {
  const app = harness({ profile: premiumProfile });
  await app.request({ conversationId: "profile", context: "קראש", tone: "זורם" });
  assert.equal(app.calls.updates[0].context, undefined);
  assert.equal(app.calls.updates[0].tone, undefined);
  assert.equal(app.calls.generation[0].context, "קראש");
});

test("a locked explicit tone cannot overwrite a saved free tone with the fallback", async () => {
  const app = harness({ profile: { ...premiumProfile, context: "בוס", tone: "ישיר" } });
  await app.request({ conversationId: "profile", tone: "רשמי" });
  assert.equal(app.calls.generation[0].tone, "זורם");
  assert.equal(app.calls.updates[0].tone, undefined);
});

test("monthly subscriptions retain premium explicit options and saved memory defaults", async () => {
  const app = harness({ monthly: true, profile: premiumProfile });
  await app.request({ conversationId: "profile", conversationBackground: "רקע" });
  const input = app.calls.generation[0];
  assert.equal(input.context, "משפחה");
  assert.equal(input.tone, "רשמי");
  assert.equal(input.conversationBackground, "רקע");
  assert.equal(input.savedConversationMemory.context, "משפחה");
  assert.equal(input.savedConversationMemory.tone, "רשמי");
  await app.request({ conversationId: "profile", context: "קולגה", tone: "ענייני" });
  assert.equal(app.calls.generation[1].context, "קולגה");
  assert.equal(app.calls.generation[1].tone, "ענייני");
  assert.equal(app.calls.updates[1].context, "קולגה");
  assert.equal(app.calls.updates[1].tone, "ענייני");
});

test("free options and refine actions remain available", async () => {
  for (const action of ["softer", "sharper", "retry"]) {
    const app = harness();
    const response = await app.request({ context: "בוס", tone: "ישיר", action, sourceReply: "תשובה" });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).replies.length, 3);
    assert.equal(app.calls.generation[0].context, "בוס");
    assert.equal(app.calls.generation[0].tone, "ישיר");
    assert.equal(app.calls.generation[0].action, action);
  }
});

test("blocked usage never calls generation, and failed generation is refunded", async () => {
  const blocked = harness({ allowed: false });
  assert.equal((await blocked.request({})).status, 402);
  assert.equal(blocked.calls.generation.length, 0);
  assert.equal(blocked.calls.refunds.length, 0);
  const failed = harness({ fail: true });
  assert.equal((await failed.request({})).status, 400);
  assert.deepEqual(failed.calls.refunds, [["user", "initial_free"]]);
});

const refineRequests = [
  { action: "softer" },
  { action: "sharper" },
  { action: "retry" },
  { action: "retry", refineInstruction: "private-custom-instruction" },
];
const failedRefineOutcomes = [
  { failureStatus: 502, failureMessage: "לא הצלחנו ליצור תשובות כרגע. נסו שוב." },
  { failureStatus: 422, failureMessage: "לא התקבל ניסוח שונה מספיק. אפשר לנסות שינוי אחר או לערוך בעצמך." },
  { failureStatus: 422, failureMessage: "השינוי הזה דורש ניסוח חופשי שאינו זמין כרגע. אפשר לבחור עדין יותר, חד יותר או לערוך בעצמך." },
];

for (const refinement of refineRequests) {
  const name = refinement.refineInstruction ? "custom" : refinement.action;
  test(`refine ${name} preserves source and explicit context in the actual route`, async () => {
    const app = harness({ monthly: true, profile: premiumProfile });
    const response = await app.request({
      ...refinement, sourceReply: "private-source-reply", message: "private-incoming-message",
      previousOutgoingMessage: "private-actual-sent-message", conversationId: "profile",
      languagePreferences: { speaker: "feminine", recipient: "masculine" },
      commitmentMode: "provided", commitmentDetails: "private-confirmed-price-200",
      context: "קולגה", tone: "ענייני",
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).replies.length, 3);
    const input = app.calls.generation[0];
    for (const [key, value] of Object.entries(refinement)) assert.equal(input[key], value);
    assert.equal(input.sourceReply, "private-source-reply");
    assert.equal(input.message, "private-incoming-message");
    assert.equal(input.previousOutgoingMessage, "private-actual-sent-message");
    assert.equal(input.commitmentDetails, "private-confirmed-price-200");
    assert.equal(input.context, "קולגה");
    assert.equal(input.tone, "ענייני");
    assert.deepEqual(input.languagePreferences, { speaker: "feminine", recipient: "masculine" });
    assert.deepEqual(app.calls.voice, [["user", refinement.action]]);
    assert.deepEqual(app.calls.events.map((event) => event.eventName), ["generation_success", "refine_used"]);
    assert.equal(app.calls.refunds.length, 0);
    assert.equal(app.calls.updates.length, 0);
    assert.equal(app.calls.memory.length, 0);
    assert.equal(JSON.stringify({ logs: app.calls.logs, persisted: app.calls.persisted, events: app.calls.events, voice: app.calls.voice }).includes("private-"), false);
  });

  test(`failed or unchanged refine ${name} refunds exactly once and never learns or records success`, async () => {
    for (const outcome of failedRefineOutcomes) {
      for (const consumptionSource of ["initial_free", "daily_free", "credits"]) {
        const app = harness({ fail: true, ...outcome, consumptionSource, profile: premiumProfile });
        const response = await app.request({
          ...refinement, sourceReply: "private-source-reply", message: "private-incoming-message",
          previousOutgoingMessage: "private-actual-sent-message", conversationId: "profile",
          languagePreferences: { speaker: "feminine" },
          commitmentMode: "provided", commitmentDetails: "private-confirmed-price-200",
        });
        assert.equal(response.status, outcome.failureStatus);
        const body = await response.json();
        assert.equal(body.error, outcome.failureMessage);
        assert.equal(body.replies, undefined);
        assert.deepEqual(app.calls.consumption, ["user"]);
        assert.deepEqual(app.calls.refunds, [["user", consumptionSource]]);
        assert.equal(app.calls.generation.length, 1);
        assert.equal(app.calls.voice.length, 0);
        assert.equal(app.calls.events.length, 0);
        assert.equal(app.calls.updates.length, 0);
        assert.equal(app.calls.memory.length, 0);
        assert.equal(app.calls.logs.at(-1).status, "error");
        assert.equal(app.calls.persisted.at(-1).status, "error");
        assert.equal(JSON.stringify({ logs: app.calls.logs, persisted: app.calls.persisted }).includes("private-"), false);
      }
    }
  });
}
