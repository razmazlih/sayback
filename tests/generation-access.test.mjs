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
function harness({ monthly = false, bypass = false, profile = null, allowed = true, fail = false, credits = 0, subscriptionStatus = null } = {}) {
  const calls = { generation: [], updates: [], refunds: [] };
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
        return { result: { intent: "כוונה", replies: ["א", "ב", "ג"] }, modelSource: "local" };
      },
    },
    "@/lib/auth": { UnauthorizedError, requireAuthenticatedUser: async () => ({ uid: "user", email: null, isAnonymous: true }) },
    "@/lib/billing": {
      consumeGenerationAccess: async () => ({ allowed, snapshot, consumption: "initial_free" }),
      getBillingSnapshot: async () => snapshot,
      isBillingBypassEnabled: () => bypass,
      refundGenerationAccess: async (...args) => calls.refunds.push(args),
    },
    "@/lib/local-usage-logs": {
      clearLocalUsageLogConversationBackgroundLength() {}, completeLocalUsageLog() {}, startLocalUsageLog: () => "log",
    },
    "@/lib/persisted-usage-logs": { persistUsageLog() {} },
    "@/lib/rate-limit": { consumeRateLimit: async () => ({ allowed: true }) },
    "@/lib/conversation-profiles": {
      ConversationProfileError,
      getConversationProfile: async () => profile,
      listRelationshipTopicCandidates: async () => [],
      recordRelationshipMemoryTurn: async () => {},
      updateConversationProfileAfterGeneration: async (...args) => calls.updates.push(args[2]),
    },
    "@/lib/my-voice-logic": { buildMyVoiceInstruction: () => null },
    "@/lib/my-voice": { loadMyVoicePreferencesSafely: async () => null, recordSuccessfulRefineSignal() {} },
    "@/lib/visitor-identity": { readVisitorIdentity: () => null, resolveUserId: () => null },
    "@/lib/product-events": { recordServerProductEvent() {} },
    "next/server": { after() {} },
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
    request: (body) => POST(new Request("http://localhost/api/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "היי", ...body }),
    })),
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
