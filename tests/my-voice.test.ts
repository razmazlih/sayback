import assert from "node:assert/strict";
import test from "node:test";
import {
  applyMyVoiceSignal,
  buildMyVoiceInstruction,
  deriveMyVoicePreferences,
  emptyMyVoiceCounters,
} from "../lib/my-voice-logic.js";
import { parseCopySignal } from "../lib/my-voice-validation.js";
import { metadataOnlyUsageTextFields } from "../lib/persisted-usage-privacy.js";

test("does not activate personalization before three useful observations", () => {
  let counters = emptyMyVoiceCounters();
  counters = applyMyVoiceSignal(counters, copy("short", false));
  counters = applyMyVoiceSignal(counters, copy("short", false));

  const preferences = deriveMyVoicePreferences(counters);
  assert.equal(preferences.active, false);
  assert.equal(buildMyVoiceInstruction(preferences), null);
});

test("derives bounded deterministic copy preferences without retaining text", () => {
  let counters = emptyMyVoiceCounters();
  counters = applyMyVoiceSignal(counters, copy("short", false));
  counters = applyMyVoiceSignal(counters, copy("short", false));
  counters = applyMyVoiceSignal(counters, copy("medium", false));

  const preferences = deriveMyVoicePreferences(counters);
  assert.deepEqual(preferences, {
    active: true,
    observations: 3,
    preferredLength: "short",
    emojiPreference: "avoid",
    toneBias: null,
  });
  const instruction = buildMyVoiceInstruction(preferences);
  assert.match(instruction ?? "", /brief replies/);
  assert.match(instruction ?? "", /avoid emoji/);
  assert.doesNotMatch(instruction ?? "", /private incoming|private selected/i);
});

test("derives softer and sharper bias only from sufficient successful refine signals", () => {
  let counters = emptyMyVoiceCounters();
  counters = applyMyVoiceSignal(counters, { type: "refine_used", action: "softer" });
  counters = applyMyVoiceSignal(counters, { type: "refine_used", action: "softer" });
  counters = applyMyVoiceSignal(counters, { type: "refine_used", action: "sharper" });
  assert.equal(deriveMyVoicePreferences(counters).toneBias, "softer");

  counters = applyMyVoiceSignal(counters, { type: "refine_used", action: "sharper" });
  counters = applyMyVoiceSignal(counters, { type: "refine_used", action: "sharper" });
  assert.equal(deriveMyVoicePreferences(counters).toneBias, "sharper");
});

test("copy endpoint validation rejects text and arbitrary fields", () => {
  assert.deepEqual(parseCopySignal({
    type: "reply_copied",
    lengthBucket: "short",
    hasEmoji: true,
  }), copy("short", true));
  assert.throws(() => parseCopySignal({
    type: "reply_copied",
    lengthBucket: "short",
    hasEmoji: true,
    reply: "private content",
  }));
  assert.throws(() => parseCopySignal({
    type: "reply_copied",
    lengthBucket: "long",
    hasEmoji: false,
  }));
});

test("persistent usage text is discarded even when callers provide raw content", () => {
  assert.deepEqual(metadataOnlyUsageTextFields({
    messageText: "private incoming message",
    conversationBackgroundText: "private history",
    lastOutgoingMessageText: "private outgoing message",
    sourceReplyText: "private selected reply",
    intentText: "private interpretation",
    repliesText: ["one", "two", "three"],
  }), {
    messageText: null,
    conversationBackgroundText: null,
    lastOutgoingMessageText: null,
    sourceReplyText: null,
    intentText: null,
    repliesText: null,
  });
});

function copy(lengthBucket: "short" | "medium", hasEmoji: boolean) {
  return { type: "reply_copied" as const, lengthBucket, hasEmoji };
}
