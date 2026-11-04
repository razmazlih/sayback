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
