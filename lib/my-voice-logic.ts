import {
  MY_VOICE_ACTIVATION_THRESHOLD,
  MY_VOICE_MAX_OBSERVATIONS,
  type MyVoiceCounters,
  type MyVoicePreferences,
  type MyVoiceSignal,
} from "./my-voice-types";

export function emptyMyVoiceCounters(): MyVoiceCounters {
  return {
    observations: 0,
    copyObservations: 0,
    shortCopyCount: 0,
    mediumCopyCount: 0,
    emojiCopyCount: 0,
    noEmojiCopyCount: 0,
    softerCount: 0,
    sharperCount: 0,
    retryCount: 0,
  };
}

export function applyMyVoiceSignal(
  current: MyVoiceCounters,
  signal: MyVoiceSignal,
): MyVoiceCounters {
  const next = sanitizeMyVoiceCounters(current);

  if (next.observations >= MY_VOICE_MAX_OBSERVATIONS) {
    return next;
  }

  next.observations += 1;

  if (signal.type === "reply_copied") {
    next.copyObservations += 1;
    if (signal.lengthBucket === "short") {
      next.shortCopyCount += 1;
    } else {
      next.mediumCopyCount += 1;
    }
    if (signal.hasEmoji) {
      next.emojiCopyCount += 1;
    } else {
      next.noEmojiCopyCount += 1;
    }
  } else {
    next[`${signal.action}Count`] += 1;
  }

  return next;
}

export function deriveMyVoicePreferences(counters: MyVoiceCounters): MyVoicePreferences {
  const safe = sanitizeMyVoiceCounters(counters);
  const active = safe.observations >= MY_VOICE_ACTIVATION_THRESHOLD;
  const preferredLength = active && safe.copyObservations >= MY_VOICE_ACTIVATION_THRESHOLD
    ? safe.shortCopyCount > safe.mediumCopyCount
      ? "short"
      : safe.mediumCopyCount > safe.shortCopyCount
        ? "medium"
        : null
    : null;
  const emojiPreference = active && safe.copyObservations >= MY_VOICE_ACTIVATION_THRESHOLD
    ? safe.emojiCopyCount / safe.copyObservations >= 2 / 3
      ? "prefer"
      : safe.noEmojiCopyCount / safe.copyObservations >= 2 / 3
        ? "avoid"
        : null
    : null;
  const directionalRefines = safe.softerCount + safe.sharperCount;
  const toneBias = active && directionalRefines >= MY_VOICE_ACTIVATION_THRESHOLD
    ? safe.softerCount > safe.sharperCount
      ? "softer"
      : safe.sharperCount > safe.softerCount
        ? "sharper"
        : null
    : null;

  return {
    active: active && Boolean(preferredLength || emojiPreference || toneBias),
    observations: safe.observations,
    preferredLength,
    emojiPreference,
    toneBias,
  };
}

export function buildMyVoiceInstruction(preferences: MyVoicePreferences): string | null {
  if (!preferences.active) {
    return null;
  }

  const hints = [
    preferences.preferredLength === "short"
      ? "prefer especially brief replies"
      : preferences.preferredLength === "medium"
        ? "allow a little more detail while staying concise"
        : null,
    preferences.emojiPreference === "prefer"
      ? "an occasional natural emoji is welcome"
      : preferences.emojiPreference === "avoid"
        ? "avoid emoji"
        : null,
    preferences.toneBias === "softer"
      ? "lean slightly gentler when the requested tone permits"
      : preferences.toneBias === "sharper"
        ? "lean slightly more direct when the requested tone permits"
        : null,
  ].filter((value): value is string => Boolean(value));

  if (hints.length === 0) {
    return null;
  }

  return [
    `My Voice preference hint: ${hints.join("; ")}.`,
    "This metadata is only a weak style hint. Never override the current message, context, requested tone, safety, or the requirement for exactly three short natural replies.",
  ].join("\n");
}

export function sanitizeMyVoiceCounters(value: Partial<MyVoiceCounters>): MyVoiceCounters {
  const empty = emptyMyVoiceCounters();

  for (const key of Object.keys(empty) as Array<keyof MyVoiceCounters>) {
    empty[key] = readCounter(value[key]);
  }

  return empty;
}

function readCounter(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(MY_VOICE_MAX_OBSERVATIONS, Math.floor(value)))
    : 0;
}
