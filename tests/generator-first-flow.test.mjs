import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../app/home-page-client.tsx", import.meta.url), "utf8");

function position(marker) {
  const index = source.indexOf(marker);
  assert.notEqual(index, -1, `Expected home-page-client.tsx to contain: ${marker}`);
  return index;
}

test("first-generation controls keep input -> generate -> optional tuning order", () => {
  const noReplyMessage = position('id="last-outgoing-message"');
  const noReplyDuration = position('id="no-reply-duration-value"');
  const noReplyUnit = position('id="no-reply-duration-unit"');
  const incomingMessage = position('id="incoming-message"');
  const screenshotInput = position('accept="image/*"');
  const primaryGenerate = position("onClick={handleMainSubmit}");
  const compactTone = position("ref={toneOptionsRef}");
  const advancedOptions = position("ref={advancedOptionsRef}");

  assert.ok(noReplyMessage < noReplyDuration);
  assert.ok(noReplyDuration < noReplyUnit);
  assert.ok(noReplyUnit < primaryGenerate, "no_reply CTA must follow all required inputs");
  assert.ok(incomingMessage < screenshotInput);
  assert.ok(screenshotInput < primaryGenerate, "incoming CTA must follow text/screenshot input");
  assert.ok(primaryGenerate < compactTone, "generate must precede tone tuning");
  assert.ok(compactTone < advancedOptions, "tone tuning must precede advanced tuning");
});

test("tone stays optional, defaults to flowing, and preserves selection and locks", () => {
  assert.match(source, /useState<ToneOption>\('זורם'\)/);
  assert.match(source, /<span className="font-black">וייב: \{tone\}<\/span>/);
  assert.match(source, /options=\{shouldShowMonthlyFeatureOptions \? toneOptions : freeToneOptions\}/);
  assert.match(source, /lockedOptions=\{hasUnlimitedAccess \? \[\] : monthlyOnlyToneOptions\}/);
  assert.match(source, /trackEvent\('tone_select', \{ value: nextValue \}\);\s*setTone\(nextValue\);/);
});

test("generate analytics retain the simplified flow and activation timing payload", () => {
  assert.match(source, /GENERATOR_FLOW_VERSION = 'simplified_v1'/);

  const generateHandlerStart = position("async function handleMainSubmit()");
  const generateHandlerEnd = position("async function handleReplyAction(");
  const generateHandler = source.slice(generateHandlerStart, generateHandlerEnd);

  assert.match(generateHandler, /trackEvent\('generate_click', \{/);
  assert.match(generateHandler, /\.\.\.getActivationTimingPayload\(\)/);
  assert.match(generateHandler, /tone,/);
  assert.match(generateHandler, /await runGeneration\(\{[\s\S]*?tone,/);
  assert.match(source, /time_from_page_load_ms:/);
  assert.match(source, /time_from_input_start_ms:/);
});
