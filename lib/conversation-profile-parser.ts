import type { Timestamp } from "firebase-admin/firestore";
import {
  MAX_CONVERSATION_LABEL_LENGTH,
  type ConversationProfile,
} from "./conversation-profile-types";
import {
  isConversationProfileId,
  normalizeConversationContext,
  normalizeConversationLastIntent,
  normalizeConversationMemoryNote,
  normalizeConversationTone,
} from "./conversation-profile-validation";
import type { ContextOption, ToneOption } from "./generator-options";

export const CONVERSATION_PROFILE_VERSION = 1;

export type StoredConversationProfile = {
  version?: unknown;
  label?: unknown;
  context?: unknown;
  tone?: unknown;
  memoryNote?: unknown;
  lastIntent?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  lastUsedAt?: unknown;
  usageCount?: unknown;
};

export function parseStoredConversationProfile(
  id: string,
  value: unknown,
): ConversationProfile | null {
  if (!isConversationProfileId(id) || !value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const stored = value as StoredConversationProfile;
  const label = typeof stored.label === "string" ? stored.label.trim() : "";
  const context = stored.context === null ? null : stored.context;

  if (
    stored.version !== CONVERSATION_PROFILE_VERSION ||
    label.length < 1 ||
    label.length > MAX_CONVERSATION_LABEL_LENGTH ||
    (context !== null && !safeContext(context)) ||
    !safeTone(stored.tone)
  ) {
    return null;
  }

  const memoryNote = safeOptionalText(normalizeConversationMemoryNote, stored.memoryNote);
  const lastIntent = safeOptionalText(normalizeConversationLastIntent, stored.lastIntent);
  if (memoryNote === undefined || lastIntent === undefined) {
    return null;
  }

  const createdAt = timestampToIso(stored.createdAt);
  const updatedAt = timestampToIso(stored.updatedAt);
  const lastUsedAt = timestampToIso(stored.lastUsedAt);
  if (!createdAt || !updatedAt || !lastUsedAt) {
    return null;
  }

  return {
    id,
    version: CONVERSATION_PROFILE_VERSION,
    label,
    context: context as ContextOption | null,
    tone: stored.tone as ToneOption,
    memoryNote,
    lastIntent,
    createdAt,
    updatedAt,
    lastUsedAt,
    usageCount: readNonNegativeInteger(stored.usageCount),
  };
}

function safeOptionalText(
  normalize: (value: unknown) => string | null,
  value: unknown,
): string | null | undefined {
  try {
    return normalize(value);
  } catch {
    return undefined;
  }
}

function safeContext(value: unknown): value is ContextOption {
  try {
    return normalizeConversationContext(value) !== null;
  } catch {
    return false;
  }
}

function safeTone(value: unknown): value is ToneOption {
  try {
    normalizeConversationTone(value);
    return true;
  } catch {
    return false;
  }
}

function timestampToIso(value: unknown) {
  if (!value || typeof value !== "object" || !("toDate" in value)) {
    return null;
  }
  try {
    const date = (value as Timestamp).toDate();
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  } catch {
    return null;
  }
}

function readNonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}
