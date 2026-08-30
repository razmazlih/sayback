import assert from "node:assert/strict";
import test from "node:test";
import { captureAttributionState, parseAllowedUtmParams } from "../lib/attribution.js";

test("first touch stays fixed while campaign last touch updates", () => {
  const first = captureAttributionState(
    null,
    new URLSearchParams("utm_source=instagram&utm_campaign=crush"),
    "2026-08-30T00:00:00.000Z",
  );
  const next = captureAttributionState(
    first,
    new URLSearchParams("utm_source=tiktok&utm_content=video-2"),
    "2026-08-31T00:00:00.000Z",
  );
  assert.equal(next.firstTouch.utm_source, "instagram");
  assert.equal(next.lastTouch.utm_source, "tiktok");
  assert.equal(next.lastTouch.utm_content, "video-2");
});

test("UTM parsing is allowlisted, bounded, and never includes arbitrary parameters", () => {
  const parsed = parseAllowedUtmParams(new URLSearchParams(
    "utm_source=ok&email=private@example.com&message=private&utm_campaign=" + "x".repeat(200),
  ));
  assert.deepEqual(Object.keys(parsed).sort(), ["utm_campaign", "utm_source"]);
  assert.equal(parsed.utm_campaign?.length, 120);
});
