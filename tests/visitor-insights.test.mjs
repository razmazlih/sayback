import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import test from "node:test";
import ts from "typescript";

const root = resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const now = new Date("2026-11-04T12:00:00Z");
function harness({ uid = "owner", provider = "google.com", authFails = false, storageFails = false, docs = [],
  email, emailVerified = false, currentUser, userLookupFails = false } = {}) {
  const calls = [];
  const query = {};
  for (const method of ["where", "orderBy", "select", "limit"]) {
    query[method] = (...args) => { calls.push([method, ...args]); return query; };
  }
  query.get = async () => {
    calls.push(["get"]);
    if (storageFails) throw new Error("private database detail");
    return { docs: docs.map((data) => ({ data: () => data })) };
  };
  const firebase = {
    getAdminAuth: async () => ({ verifyIdToken: async (...args) => {
      calls.push(["verifyIdToken", ...args]);
      if (authFails) throw new Error("revoked or invalid");
      return { uid, email, email_verified: emailVerified, firebase: { sign_in_provider: provider } };
    }, getUser: async (lookupUid) => {
      calls.push(["getUser", lookupUid]);
      if (userLookupFails) throw new Error("private user lookup detail");
      return currentUser ?? { uid, email, emailVerified, disabled: false };
    } }),
    getFirestore: async () => ({ collection: (name) => { calls.push(["collection", name]); return query; } }),
  };
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const loadedModule = { exports: {} };
    cache.set(file, loadedModule.exports);
    const source = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const localRequire = (id) => {
      if (id === "server-only") return {};
      if (id === "@/lib/firebase-admin") return firebase;
      if (id.startsWith("@/")) return load(resolve(root, `${id.slice(2)}.ts`));
      if (id.startsWith(".")) return load(resolve(file, "..", `${id}.ts`));
      if (id.startsWith("node:")) return require(id);
      throw new Error(`Unexpected dependency: ${id}`);
    };
    new Function("require", "module", "exports", source)(localRequire, loadedModule, loadedModule.exports);
    return loadedModule.exports;
  }
  return { calls, ...load(resolve(root, "lib/visitor-insights.ts")), ...load(resolve(root, "app/api/insights/route.ts")) };
}

function event(name, overrides = {}) {
  return { eventName: name, source: name === "generation_success" ? "server" : "client",
    uid: "private-user", visitorId: "a".repeat(32), occurredAtMs: now.getTime(), isReturning: false,
    attribution: { firstTouch: { acquisitionSource: "campaign", utm_source: "instagram" } }, ...overrides };
}

test("aggregates distinct visitors, authenticated actors, daily metrics and fixed first-touch sources", () => {
  const { aggregateVisitorInsights } = harness();
  const data = aggregateVisitorInsights([
    event("page_view_home"), event("page_view_home"),
    event("page_view_home", { uid: "another-account", visitorId: "b".repeat(32), attribution: null }),
    event("generation_success"), event("generation_success"),
    event("reply_copy", { isReturning: true }), event("reply_copy", { isReturning: true }),
    event("generation_success", { source: "client" }),
  ], { days: 7, now });
  assert.deepEqual(data.totals, { pageViews: 3, visitors: 2, generations: 2, generatingUsers: 1, copies: 2, copyingUsers: 1, returningUsers: 1 });
  assert.equal(data.daily.length, 7);
  assert.equal(data.daily[6].pageViews, 3);
  assert.equal(data.sources.find((row) => row.source === "instagram").visitors, 1);
  assert.equal(data.sources.find((row) => row.source === "direct_or_unknown").pageViews, 1);
  assert.equal(data.period.start, "2026-10-29T00:00:00.000Z");
});

test("aggregate payload never exposes identifiers, raw attribution, personal content or unknown labels", () => {
  const { aggregateVisitorInsights } = harness();
  const data = aggregateVisitorInsights([event("page_view_home", {
    attribution: { firstTouch: { acquisitionSource: "campaign", utm_source: "secret@example.com", utm_campaign: "private-campaign" } },
    metadata: { message: "private message" }, sessionId: "private-session",
  })], { days: 7, now });
  assert.equal(data.sources.find((row) => row.source === "other_campaign").pageViews, 1);
  const serialized = JSON.stringify(data);
  for (const value of ["private-user", "a".repeat(32), "private-session", "secret@example.com", "private-campaign", "private message"]) {
    assert.equal(serialized.includes(value), false);
  }
});

test("range boundaries and malformed data are excluded; empty data is available with zeros", () => {
  const { aggregateVisitorInsights } = harness();
  const data = aggregateVisitorInsights([null, {}, event("page_view_home", { occurredAtMs: NaN }),
    event("page_view_home", { occurredAtMs: now.getTime() + 1 }),
    event("page_view_home", { occurredAtMs: Date.parse("2026-10-28T23:59:59Z") }),
    event("unknown_event", { isReturning: true }),
    event("generation_success", { source: "client", isReturning: true }),
    event("reply_copy", { source: "server", isReturning: true }),
  ], { days: 7, now });
  assert.equal(data.sample.includedEvents, 0);
  assert.equal(data.available, true);
  assert.equal(data.totals.visitors, 0);
  assert.equal(data.totals.returningUsers, 0);
  assert.equal(data.daily.length, 7);
});

test("reader uses bounded range and projected fields with a truncation sentinel", async () => {
  const h = harness({ docs: Array.from({ length: 1001 }, () => event("page_view_home")) });
  const data = await h.loadVisitorInsights(7, now);
  assert.equal(data.sample.truncated, true);
  assert.equal(data.sample.scannedEvents, 1000);
  assert.equal(data.totals.pageViews, 1000);
  assert.ok(h.calls.some(([name, limit]) => name === "limit" && limit === 1001));
  assert.deepEqual(h.calls.filter(([name]) => name === "where"), [
    ["where", "occurredAtMs", ">=", Date.parse("2026-10-29T00:00:00Z")],
    ["where", "occurredAtMs", "<=", now.getTime()],
  ]);
  assert.equal(h.calls.find(([name]) => name === "select").includes("metadata"), false);
});

function request(query = "", bearer = true) {
  return new Request(`http://localhost/api/insights${query}`, { headers: bearer ? { Authorization: "Bearer test-token" } : {} });
}
async function withViewers(value, fn, emails) {
  const previous = process.env.ANALYTICS_VIEWER_UIDS;
  const previousEmails = process.env.ANALYTICS_VIEWER_EMAILS;
  if (value === undefined) delete process.env.ANALYTICS_VIEWER_UIDS;
  else process.env.ANALYTICS_VIEWER_UIDS = value;
  if (emails === undefined) delete process.env.ANALYTICS_VIEWER_EMAILS;
  else process.env.ANALYTICS_VIEWER_EMAILS = emails;
  try { await fn(); }
  finally {
    if (previous === undefined) delete process.env.ANALYTICS_VIEWER_UIDS;
    else process.env.ANALYTICS_VIEWER_UIDS = previous;
    if (previousEmails === undefined) delete process.env.ANALYTICS_VIEWER_EMAILS;
    else process.env.ANALYTICS_VIEWER_EMAILS = previousEmails;
  }
}

test("private route denies missing, invalid, revoked and anonymous authentication before any reads", async () => {
  await withViewers("owner", async () => {
    for (const [options, bearer] of [[{}, false], [{ authFails: true }, true], [{ provider: "anonymous" }, true], [{ provider: "" }, true]]) {
      const h = harness(options);
      const response = await h.GET(request("", bearer));
      assert.equal(response.status, 401);
      assert.equal(h.calls.some(([name]) => name === "collection"), false);
      assert.equal(response.headers.get("cache-control"), "no-store");
      if (bearer) assert.ok(h.calls.some(([name, , checkRevoked]) => name === "verifyIdToken" && checkRevoked === true));
    }
  });
});

test("email access requires an exact normalized verified address on both token and current account", async () => {
  await withViewers(undefined, async () => {
    const h = harness({ email: "OWNER@EXAMPLE.COM", emailVerified: true,
      currentUser: { uid: "owner", email: "owner@example.com", emailVerified: true, disabled: false } });
    assert.equal((await h.GET(request())).status, 200);
    assert.deepEqual(h.calls.find(([name]) => name === "getUser"), ["getUser", "owner"]);
    assert.ok(h.calls.some(([name, , revoked]) => name === "verifyIdToken" && revoked === true));
  }, " other@example.com, Owner@Example.com ");
});

test("email access denies unverified, stale, disabled, mismatched and anonymous accounts", async () => {
  await withViewers(undefined, async () => {
    const valid = { email: "owner@example.com", emailVerified: true };
    const current = { uid: "owner", ...valid, disabled: false };
    for (const options of [
      { ...valid, emailVerified: false },
      { ...valid, currentUser: { ...current, emailVerified: false } },
      { ...valid, currentUser: { ...current, email: "changed@example.com" } },
      { ...valid, currentUser: { ...current, disabled: true } },
      { ...valid, currentUser: { ...current, uid: "different-account" } },
      { ...valid, email: "owner+alias@example.com" },
      { ...valid, provider: "anonymous" },
    ]) {
      const h = harness(options);
      assert.equal((await h.GET(request())).status, options.provider === "anonymous" ? 401 : 403);
      assert.equal(h.calls.some(([name]) => name === "collection"), false);
    }
    const unavailable = harness({ ...valid, userLookupFails: true });
    assert.equal((await unavailable.GET(request())).status, 503);
    assert.equal(unavailable.calls.some(([name]) => name === "collection"), false);
  }, "owner@example.com");
});

test("email allowlist does not interpret wildcards, domain entries, display names or substring matches", async () => {
  for (const emails of ["*", "*@example.com", "example.com", "Owner <owner@example.com>", "another-owner@example.com"]) {
    await withViewers(undefined, async () => {
      const h = harness({ email: "owner@example.com", emailVerified: true });
      assert.equal((await h.GET(request())).status, 403);
      assert.equal(h.calls.some(([name]) => name === "collection" || name === "getUser"), false);
    }, emails);
  }
});

test("explicit UID authorization still works without a verified email or email lookup", async () => {
  await withViewers("owner", async () => {
    const h = harness({ email: "unverified@example.com", emailVerified: false, userLookupFails: true });
    assert.equal((await h.GET(request())).status, 200);
    assert.equal(h.calls.some(([name]) => name === "getUser"), false);
  }, "different@example.com");
});

test("empty allowlist fails closed; exact UIDs only, never display names or substring matches", async () => {
  for (const [allowlist, code] of [[undefined, "INSIGHTS_NOT_CONFIGURED"], ["owner-extra,another", "INSIGHTS_FORBIDDEN"]]) {
    await withViewers(allowlist, async () => {
      const h = harness();
      const response = await h.GET(request());
      assert.equal(response.status, 403);
      assert.equal((await response.json()).code, code);
      assert.equal(h.calls.some(([name]) => name === "collection"), false);
      if (!allowlist) assert.equal(h.calls.some(([name]) => name === "verifyIdToken"), false);
    });
  }
});

test("authorized requests distinguish empty data from outage and validate requested range", async () => {
  await withViewers(" another, owner ", async () => {
    const h = harness();
    const success = await h.GET(request("?days=30"));
    assert.equal(success.status, 200);
    assert.equal(success.headers.get("vary"), "Authorization");
    assert.equal((await success.json()).period.days, 30);
    const invalid = harness();
    assert.equal((await invalid.GET(request("?days=365"))).status, 400);
    assert.equal(invalid.calls.some(([name]) => name === "collection"), false);
    const failed = harness({ storageFails: true });
    const response = await failed.GET(request());
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.available, false);
    assert.equal(body.totals, undefined);
    assert.equal(JSON.stringify(body).includes("private database detail"), false);
  });
});
