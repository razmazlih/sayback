import {
  isContextOption,
  isToneOption,
  type ContextOption,
  type ToneOption,
} from "./generator-options";
import {
  MAX_CONVERSATION_LABEL_LENGTH,
  MAX_CONVERSATION_LAST_INTENT_LENGTH,
  MAX_CONVERSATION_MEMORY_NOTE_LENGTH,
} from "./conversation-profile-types";

const PROFILE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export class ConversationProfileError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
  ) {
    super(message);
    this.name = "ConversationProfileError";
  }
}

export function normalizeConversationLabel(value: unknown) {
  if (typeof value !== "string") {
    throw new ConversationProfileError("צריך לבחור שם לשיחה.", 400);
  }

  const label = value.trim().replace(/\s+/g, " ");

  if (label.length < 1 || label.length > MAX_CONVERSATION_LABEL_LENGTH) {
    throw new ConversationProfileError(
      `שם השיחה צריך להכיל בין 1 ל-${MAX_CONVERSATION_LABEL_LENGTH} תווים.`,
      400,
    );
  }

  return label;
}

export function normalizeConversationContext(value: unknown): ContextOption | null {
  if (value === null) {
    return null;
  }

  if (!isContextOption(value)) {
    throw new ConversationProfileError("סוג הקשר שנבחר לא תקין.", 400);
  }

  return value;
}

export function normalizeConversationTone(value: unknown): ToneOption {
  if (!isToneOption(value)) {
    throw new ConversationProfileError("הווייב שנבחר לא תקין.", 400);
  }

  return value;
}

export function normalizeConversationMemoryNote(value: unknown): string | null {
  return normalizeOptionalBoundedText(
    value,
    MAX_CONVERSATION_MEMORY_NOTE_LENGTH,
    `מה שחשוב לזכור יכול להכיל עד ${MAX_CONVERSATION_MEMORY_NOTE_LENGTH} תווים.`,
  );
}

export function normalizeConversationLastIntent(value: unknown): string | null {
  return normalizeOptionalBoundedText(
    value,
    MAX_CONVERSATION_LAST_INTENT_LENGTH,
    "התקציר האחרון של השיחה אינו תקין.",
  );
}

export function isConversationProfileId(value: unknown): value is string {
  return typeof value === "string" && PROFILE_ID_PATTERN.test(value);
}

function normalizeOptionalBoundedText(value: unknown, maxLength: number, errorMessage: string) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    throw new ConversationProfileError(errorMessage, 400);
  }

  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length === 0) {
    return null;
  }
  if (normalized.length > maxLength) {
    throw new ConversationProfileError(errorMessage, 400);
  }
  return normalized;
}
