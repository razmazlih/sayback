import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const exports = {};
const code = ts.transpileModule(
  readFileSync(new URL("../app/insights/insights-client.tsx", import.meta.url), "utf8"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
).outputText;
new Function("require", "exports", code)(require, exports);
const { isVisitorInsights } = exports;

function report() {
  return {
    available: true,
    generatedAt: "2026-11-04T12:00:00.000Z",
    period: { days: 7, start: "2026-10-29T00:00:00.000Z", end: "2026-11-04T12:00:00.000Z", timeZone: "UTC" },
    sample: { limit: 1000, scannedEvents: 2, includedEvents: 2, truncated: false },
    totals: { pageViews: 1, visitors: 1, generations: 1, generatingUsers: 1, copies: 0, copyingUsers: 0, returningUsers: 0 },
    daily: [{ date: "2026-11-04", pageViews: 1, visitors: 1, generations: 1, copies: 0 }],
    sources: [{ source: "instagram", pageViews: 1, visitors: 1 }],
  };
}

test("complete successful aggregate reports and genuine empty reports are accepted", () => {
  assert.equal(isVisitorInsights(report()), true);
  const empty = report();
  empty.sample.scannedEvents = 0;
  empty.sample.includedEvents = 0;
  for (const key of Object.keys(empty.totals)) empty.totals[key] = 0;
  empty.daily = [];
  empty.sources = [];
  assert.equal(isVisitorInsights(empty), true);
  const truncated = report();
  truncated.sample.truncated = true;
  assert.equal(isVisitorInsights(truncated), true);
});

test("unavailable, permission, and incomplete responses cannot masquerade as zero activity", () => {
  for (const body of [null, [], {}, { available: false }, { error: "database unavailable", code: "INSIGHTS_UNAVAILABLE" }, { code: "INSIGHTS_FORBIDDEN" }]) {
    assert.equal(isVisitorInsights(body), false);
  }
  const body = report();
  delete body.totals.copies;
  assert.equal(isVisitorInsights(body), false);
});

test("invalid counts never become visible totals", () => {
  for (const value of [undefined, null, "0", -1, 0.5, Infinity, NaN]) {
    const body = report();
    body.totals.generations = value;
    assert.equal(isVisitorInsights(body), false);
  }
});

test("raw campaign labels and unrecognized sources are not displayed", () => {
  for (const source of ["unknown", "https://private.example/?email=test", "__proto__", "toString"]) {
    const body = report();
    body.sources[0].source = source;
    assert.equal(isVisitorInsights(body), false);
  }
});

test("invalid dates and unsupported time ranges do not reach date formatting", () => {
  const badTimestamp = report();
  badTimestamp.generatedAt = "not-a-date";
  assert.equal(isVisitorInsights(badTimestamp), false);
  const badDay = report();
  badDay.daily[0].date = "not-a-date";
  assert.equal(isVisitorInsights(badDay), false);
  const badPeriod = report();
  badPeriod.period.days = 365;
  assert.equal(isVisitorInsights(badPeriod), false);
});

function renderState(authState, reportState) {
  const effects = [];
  let index = 0;
  const states = [authState, reportState, 7, 0];
  const hooks = {
    ...require("react"),
    useState: () => [states[index++], () => {}],
    useRef: () => ({ current: 0 }),
    useEffect: (effect) => effects.push(effect),
  };
  const loaded = {};
  new Function("require", "exports", code)((id) => id === "react" ? hooks : require(id), loaded);
  const html = require("react-dom/server").renderToStaticMarkup(loaded.default());
  return { html, effects };
}

test("SSR and every unverified state render no private shell, controls, data or loading copy", () => {
  for (const authState of [{ status: "loading" }, { status: "signed_out" }, { status: "error" }, { status: "ready", user: {} }]) {
    for (const status of ["loading", "permission_pending", "forbidden", "signed_out", "error"]) {
      assert.equal(renderState(authState, { status }).html, "");
    }
    if (authState.status !== "ready") {
      assert.equal(renderState(authState, { status: "ready", data: report() }).html, "");
    }
  }
});

test("only server-authorized complete data reveals the report and period controls", () => {
  const { html } = renderState({ status: "ready", user: {} }, { status: "ready", data: report() });
  assert.match(html, /נתוני שימוש/);
  assert.match(html, /insights-period/);
});

test("denials and errors replace the current history entry with home; loading never redirects", () => {
  const previousWindow = globalThis.window;
  const destinations = [];
  globalThis.window = { location: { replace: (url) => destinations.push(url) } };
  try {
    for (const status of ["signed_out", "error", "permission_pending", "forbidden"]) {
      const { effects, html } = renderState({ status: "ready", user: {} }, { status });
      assert.equal(html, "");
      effects.at(-1)();
    }
    assert.deepEqual(destinations, ["/", "/", "/", "/"]);
    renderState({ status: "loading" }, { status: "loading" }).effects.at(-1)();
    assert.equal(destinations.length, 4);
  } finally {
    globalThis.window = previousWindow;
  }
});

test("public metadata does not name or describe the private report", () => {
  const page = readFileSync(new URL("../app/insights/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /נתוני שימוש|מסך פרטי/);
  assert.match(page, /index: false, follow: false/);
});

test("leaving or hiding the page clears reports before history restore and revalidates on return", () => {
  const oldWindow = globalThis.window;
  const oldDocument = globalThis.document;
  const listeners = new Map();
  const changes = [];
  let index = 0;
  const effects = [];
  const version = { current: 0 };
  const states = [{ status: "ready", user: {} }, { status: "ready", data: report() }, 7, 0];
  const hooks = { ...require("react"),
    useState: () => {
      const slot = index++;
      return [states[slot], (next) => changes.push([slot, next])];
    },
    useRef: () => version,
    useEffect: (effect) => effects.push(effect),
  };
  const eventTarget = {
    addEventListener: (name, handler) => listeners.set(name, handler),
    removeEventListener: (name) => listeners.delete(name),
  };
  globalThis.window = { ...eventTarget };
  globalThis.document = { ...eventTarget, visibilityState: "hidden" };
  try {
    const loaded = {};
    new Function("require", "exports", code)((id) => id === "react" ? hooks : require(id), loaded);
    loaded.default();
    const cleanup = effects[2]();
    listeners.get("pagehide")();
    assert.deepEqual(changes.pop(), [1, { status: "loading" }]);
    assert.equal(version.current, 1);
    listeners.get("pageshow")({ persisted: true });
    assert.equal(changes.pop()[0], 3);
    listeners.get("visibilitychange")();
    assert.deepEqual(changes.pop(), [1, { status: "loading" }]);
    assert.equal(version.current, 2);
    globalThis.document.visibilityState = "visible";
    listeners.get("visibilitychange")();
    assert.equal(changes.pop()[0], 3);
    cleanup();
    assert.equal(listeners.size, 0);
  } finally {
    globalThis.window = oldWindow;
    globalThis.document = oldDocument;
  }
});
