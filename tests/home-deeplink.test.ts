import assert from "node:assert/strict";
import test from "node:test";
import { buildHomeDeeplink, parseHomeDeeplinkParams } from "../lib/home-deeplink.js";

const options = {
  examples: ["crush-comeback"] as const,
  situations: ["קראש", "לקוח"] as const,
  tones: ["זורם", "עדין"] as const,
  agrees: ["כן", "לא"] as const,
};

test("campaign deep links accept only public existing generator state", () => {
  const parsed = parseHomeDeeplinkParams(
    new URLSearchParams("mode=no_reply&situation=%D7%A7%D7%A8%D7%90%D7%A9&tone=%D7%A2%D7%93%D7%99%D7%9F"),
    options,
  );
  assert.equal(parsed.prefill.mode, "no_reply");
  assert.equal(parsed.prefill.situation, "קראש");
  assert.equal(parsed.prefill.tone, "עדין");
});

test("campaign deep links never parse or build private message content", () => {
  const parsed = parseHomeDeeplinkParams(
    new URLSearchParams("message=%D7%A1%D7%95%D7%93&lastOutgoingMessage=%D7%A1%D7%95%D7%93&mode=invalid"),
    options,
  );
  assert.equal(parsed.hasPrefill, false);
  const url = buildHomeDeeplink({ mode: "incoming", example: "crush-comeback" });
  assert.match(url, /mode=incoming/);
  assert.doesNotMatch(url, /message|lastOutgoingMessage/);
});
