import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "..");

// Execute real event persistence/normalization with an isolated transactional store.
// No Firebase credentials, network traffic, or production data are involved.
function harness() {
  const documents = new Map();
  let writes = 0;
  const firestore = {
    collection(path) {
      return {
        doc(id) { return { id, path: path + "/" + id }; },
        orderBy(field, direction) {
          return {
            limit(count) {
              return {
                async get() {
                  return {
                    docs: [...documents.entries()]
                      .filter(([key]) => key.startsWith(path + "/"))
                      .sort(([, a], [, b]) => direction === "desc" ? b[field] - a[field] : a[field] - b[field])
                      .slice(0, count)
                      .map(([key, data]) => ({ id: key.slice(path.length + 1), data: () => structuredClone(data) })),
                  };
                },
              };
            },
          };
        },
      };
    },
    async runTransaction(callback) {
      const pending = [];
      const result = await callback({
        async get(ref) {
          const data = documents.get(ref.path);
          return { exists: data !== undefined, data: () => data === undefined ? undefined : structuredClone(data) };
        },
        set(ref, data, options) { pending.push({ ref, data, options }); },
      });
      for (const { ref, data, options } of pending) {
        documents.set(ref.path, options?.merge ? { ...documents.get(ref.path), ...structuredClone(data) } : structuredClone(data));
        writes += 1;
      }
      return result;
    },
  };
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const output = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const loadedModule = { exports: {} };
    const mockedRequire = (id) => {
      if (id === "server-only") return {};
      if (id === "@/lib/firebase-admin") return { getFirestore: async () => firestore };
      if (id.startsWith("@/")) return load(resolve(root, id.slice(2) + ".ts"));
      return require(id);
    };
    new Function("require", "module", "exports", output)(mockedRequire, loadedModule, loadedModule.exports);
    cache.set(file, loadedModule.exports);
    return loadedModule.exports;
  }
  return { ...load(resolve(root, "lib/product-events.ts")), firestore, documents, writes: () => writes };
}

function client(ai, key, when, attribution = null, eventName = "page_view_home") {
  return ai.persistClientProductEvent(ai.firestore, {
    uid: "user-1", visitorId: "a".repeat(32), sessionId: "b".repeat(32),
    request: ai.normalizeClientProductEventRequest({ eventName, dedupeKey: key, attribution }),
    now: new Date(when),
  });
}
function server(ai, key, when, eventName = "generation_success") {
  return ai.recordServerProductEvent({ uid: "user-1", eventName, dedupeKey: key, now: new Date(when) });
}
function events(ai) {
  return [...ai.documents.entries()].filter(([key]) => key.startsWith("product_events/")).map(([, value]) => value);
}

test("all client and server events on the acquisition day are new, later-day events are returning", async () => {
  const ai = harness();
  await client(ai, "first_page_view", "2026-11-01T23:58:00Z");
  await server(ai, "initial_generation", "2026-11-01T23:59:00Z");
  await client(ai, "first_day_copy", "2026-11-01T23:59:30Z", null, "reply_copy");
  await client(ai, "return_page_view", "2026-11-02T00:00:00Z");
  await server(ai, "return_generation", "2026-11-02T00:01:00Z");
  await client(ai, "return_reply_copy", "2026-11-02T00:02:00Z", null, "reply_copy");
  await server(ai, "return_refinement", "2026-11-02T12:00:00Z", "refine_used");
  await client(ai, "third_day_view", "2026-11-03T12:00:00Z");
  assert.deepEqual(events(ai).map((event) => event.isReturning), [false, false, false, true, true, true, true, true]);
  assert.equal(ai.documents.get("growth_users/user-1").firstActiveDateUtc, "2026-11-01");
  assert.equal(ai.documents.get("growth_users/user-1").lastActiveDateUtc, "2026-11-03");
  assert.equal(ai.aggregateProductEvents(events(ai).slice(4)).returningUsers, 1);
});

test("server-first acquisition and subsequent client events share the same UTC-day cohort", async () => {
  const ai = harness();
  await server(ai, "initial_server", "2026-11-01T10:00:00Z");
  await client(ai, "same_day_client", "2026-11-01T13:00:00Z");
  await server(ai, "next_day_server", "2026-11-02T09:00:00Z");
  await client(ai, "next_day_client", "2026-11-02T10:00:00Z");
  assert.deepEqual(events(ai).map((event) => event.isReturning), [false, false, true, true]);
});

test("deduplication preserves original classification and does not advance activity or overwrite attribution", async () => {
  const ai = harness();
  await client(ai, "deduplicated_view", "2026-11-01T10:00:00Z");
  await server(ai, "deduplicated_generation", "2026-11-01T11:00:00Z");
  const before = structuredClone([...ai.documents]);
  const writes = ai.writes();
  assert.deepEqual(await client(ai, "deduplicated_view", "2026-11-02T10:00:00Z"), { duplicate: true, isReturning: false });
  await server(ai, "deduplicated_generation", "2026-11-02T11:00:00Z");
  assert.deepEqual([...ai.documents], before);
  assert.equal(ai.writes(), writes);
});

test("legacy records recover their first known active day once, keeping later events consistently returning", async () => {
  const ai = harness();
  ai.documents.set("growth_users/user-1", { lastActiveDateUtc: "2026-10-31" });
  await server(ai, "legacy_return", "2026-11-02T08:00:00Z");
  await client(ai, "legacy_reply_copy", "2026-11-02T09:00:00Z", null, "reply_copy");
  assert.deepEqual(events(ai).map((event) => event.isReturning), [true, true]);
  assert.equal(ai.documents.get("growth_users/user-1").firstActiveDateUtc, "2026-10-31");
});

test("campaign acquisition stays fixed while last touch updates across a returning session", async () => {
  const ai = harness();
  const campaign = (source, date) => ({
    version: 1,
    firstTouch: { acquisitionSource: "campaign", utm_source: source, capturedAt: date },
    lastTouch: { acquisitionSource: "campaign", utm_source: source, capturedAt: date },
  });
  await client(ai, "campaign_first", "2026-11-01T10:00:00Z", campaign("instagram", "2026-11-01T10:00:00Z"));
  await client(ai, "campaign_return", "2026-11-02T10:00:00Z", campaign("tiktok", "2026-11-02T10:00:00Z"));
  await server(ai, "campaign_conversion", "2026-11-02T11:00:00Z");
  const result = await ai.listProductEvents();
  assert.equal(result.available, true);
  assert.equal(result.events.length, 3);
  assert.equal(result.events[0].attribution.firstTouch.utm_source, "instagram");
  assert.equal(result.events[0].attribution.lastTouch.utm_source, "tiktok");
  assert.equal(result.events[0].isReturning, true);
});

test("client validation excludes private content and cannot forge server event names", () => {
  const ai = harness();
  const normalized = ai.normalizeClientProductEventRequest({
    eventName: "reply_copy", dedupeKey: "safe_copy_event",
    metadata: { index: 1, message: "private message", reply: "private response", tone: "נעים" },
  });
  assert.deepEqual(normalized.metadata, { index: 1, tone: "נעים" });
  assert.throws(() => ai.normalizeClientProductEventRequest({ eventName: "credits_purchase", dedupeKey: "forged_purchase" }), /לא נתמך/);
});

test("malformed persisted entries are skipped without hiding valid measurement history", async () => {
  const ai = harness();
  await client(ai, "valid_page_event", "2026-11-01T10:00:00Z");
  await server(ai, "valid_generation", "2026-11-01T11:00:00Z");
  const valid = events(ai)[0];
  for (const [index, invalid] of [
    { ...valid, eventName: "credits_purchase", source: "client" },
    { ...valid, source: "server" },
    { ...valid, source: "unknown" },
    { ...valid, metadata: ["invalid"] },
    { ...valid, occurredAtMs: Number.POSITIVE_INFINITY },
    { ...valid, attribution: {} },
    { ...valid, eventName: "not_a_product_event" },
  ].entries()) ai.documents.set("product_events/invalid-" + index, invalid);
  const result = await ai.listProductEvents();
  assert.equal(result.available, true);
  assert.deepEqual(result.events.map((event) => event.eventName), ["generation_success", "page_view_home"]);
});
