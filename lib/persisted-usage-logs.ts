import { getFirestore } from "@/lib/firebase-admin";
import { isLocalAdminEnabled } from "@/lib/local-admin";
import type { GenerationConsumption, GenerationModelSource } from "@/lib/local-usage-logs";

const PERSIST_USAGE_LOGS_ENABLED =
  process.env.PERSIST_USAGE_LOGS?.trim().toLowerCase() === "true";
const ALLOW_DEV_PERSIST_USAGE_LOGS =
  process.env.ALLOW_DEV_PERSIST_USAGE_LOGS?.trim().toLowerCase() === "true";
const USAGE_LOG_COLLECTION = "generation_usage_logs";
const MESSAGE_TEXT_LIMIT = 1600;
const CONTEXT_TEXT_LIMIT = 500;
const REPLY_TEXT_LIMIT = 500;
const INTENT_TEXT_LIMIT = 1200;

export type PersistedUsageLogStatus = "success" | "error" | "blocked";

export type PersistedUsageLogInput = {
  uid: string;
  userId?: string | null;
  visitorId?: string | null;
  sessionId?: string | null;
  messageLength?: number | null;
  messageText?: string | null;
  hasImage: boolean;
  context?: string | null;
  tone?: string | null;
  goal?: string | null;
  continuePreference?: string | null;
  conversationBackgroundLength?: number | null;
  conversationBackgroundText?: string | null;
  noReplyMode?: boolean | null;
  noReplyDurationValue?: number | null;
  noReplyDurationUnit?: string | null;
  lastOutgoingMessageLength?: number | null;
  lastOutgoingMessageText?: string | null;
  action?: string | null;
  sourceReplyLength?: number | null;
  sourceReplyText?: string | null;
  status: PersistedUsageLogStatus;
  consumption?: GenerationConsumption | null;
  intentLength?: number | null;
  intentText?: string | null;
  replyCount?: number | null;
  repliesText?: string[] | null;
  schemaValid?: boolean | null;
  error?: string | null;
  modelSource?: GenerationModelSource | null;
};

export type PersistedUsageLogEntry = {
  id: string;
  createdAt: string;
  uid: string;
  userId: string | null;
  visitorId: string | null;
  sessionId: string | null;
  messageLength: number | null;
  messageText: string | null;
  hasImage: boolean;
  context: string | null;
  tone: string | null;
  goal: string | null;
  continuePreference: string | null;
  conversationBackgroundLength: number | null;
  conversationBackgroundText: string | null;
  noReplyMode: boolean | null;
  noReplyDurationValue: number | null;
  noReplyDurationUnit: string | null;
  lastOutgoingMessageLength: number | null;
  lastOutgoingMessageText: string | null;
  action: string | null;
  sourceReplyLength: number | null;
  sourceReplyText: string | null;
  status: PersistedUsageLogStatus;
  consumption: GenerationConsumption | null;
  intentLength: number | null;
  intentText: string | null;
  replyCount: number | null;
  repliesText: string[] | null;
  schemaValid: boolean | null;
  error: string | null;
  modelSource: GenerationModelSource | null;
};

type PersistedUsageLogDocument = Omit<PersistedUsageLogEntry, "id"> & {
  createdAtMs: number;
};

type LegacyPersistedUsageLogDocument = {
  message?: unknown;
  conversationBackground?: unknown;
  lastOutgoingMessage?: unknown;
  sourceReply?: unknown;
  intent?: unknown;
  replies?: unknown;
};

type FirestoreDoc = {
  id: string;
  set: (data: unknown) => Promise<void>;
};

type FirestoreCollectionWriter = {
  doc: (id?: string) => FirestoreDoc;
};

type FirestoreCollectionReader = {
  orderBy: (
    field: string,
    direction: "asc" | "desc",
  ) => {
    limit: (count: number) => {
      get: () => Promise<{
        docs: Array<{ id: string; data: () => unknown }>;
      }>;
    };
  };
};

export function isPersistUsageLoggingEnabled() {
  if (process.env.NODE_ENV !== "production" && isLocalAdminEnabled()) {
    return true;
  }

  if (!PERSIST_USAGE_LOGS_ENABLED) {
    return false;
  }

  if (process.env.NODE_ENV === "production") {
    return true;
  }

  return ALLOW_DEV_PERSIST_USAGE_LOGS;
}

export async function persistUsageLog(input: PersistedUsageLogInput) {
  if (!isPersistUsageLoggingEnabled()) {
    return;
  }

  const now = new Date();
  const document: PersistedUsageLogDocument = {
    createdAt: now.toISOString(),
    createdAtMs: now.getTime(),
    uid: normalizeText(input.uid, 200) ?? "unknown",
    userId: normalizeText(input.userId ?? null, 200),
    visitorId: normalizeText(input.visitorId ?? null, 64),
    sessionId: normalizeText(input.sessionId ?? null, 64),
    messageLength: normalizeLength(input.messageLength),
    messageText: normalizeText(input.messageText ?? null, MESSAGE_TEXT_LIMIT),
    hasImage: input.hasImage === true,
    context: normalizeText(input.context ?? null, 80),
    tone: normalizeText(input.tone ?? null, 80),
    goal: normalizeText(input.goal ?? null, 80),
    continuePreference: normalizeText(input.continuePreference ?? null, 24),
    conversationBackgroundLength: normalizeLength(input.conversationBackgroundLength),
    conversationBackgroundText: normalizeText(
      input.conversationBackgroundText ?? null,
      CONTEXT_TEXT_LIMIT,
    ),
    noReplyMode: normalizeBoolean(input.noReplyMode),
    noReplyDurationValue: normalizeInteger(input.noReplyDurationValue, 1, 999),
    noReplyDurationUnit: normalizeText(input.noReplyDurationUnit ?? null, 16),
    lastOutgoingMessageLength: normalizeLength(input.lastOutgoingMessageLength),
    lastOutgoingMessageText: normalizeText(
      input.lastOutgoingMessageText ?? null,
      CONTEXT_TEXT_LIMIT,
    ),
    action: normalizeText(input.action ?? null, 24),
    sourceReplyLength: normalizeLength(input.sourceReplyLength),
    sourceReplyText: normalizeText(input.sourceReplyText ?? null, CONTEXT_TEXT_LIMIT),
    status: normalizeStatus(input.status),
    consumption: normalizeConsumption(input.consumption),
    intentLength: normalizeLength(input.intentLength),
    intentText: normalizeText(input.intentText ?? null, INTENT_TEXT_LIMIT),
    replyCount: normalizeLength(input.replyCount),
    repliesText: normalizeReplies(input.repliesText),
    schemaValid: normalizeBoolean(input.schemaValid),
    error: normalizeText(input.error ?? null, 500),
    modelSource: normalizeModelSource(input.modelSource),
  };

  try {
    const firestore = await getFirestore();
    const collection = firestore.collection(USAGE_LOG_COLLECTION) as FirestoreCollectionWriter;
    const doc = collection.doc();
    await doc.set(document);
  } catch (error) {
    console.error("Failed to persist generation usage log", error);
  }
}

export async function listPersistedUsageLogs(limit = 200): Promise<PersistedUsageLogEntry[]> {
  const safeLimit = Math.max(1, Math.min(1000, Math.floor(limit)));

  try {
    const firestore = await getFirestore();
    const collection = firestore.collection(USAGE_LOG_COLLECTION) as FirestoreCollectionReader;
    const snapshot = await collection.orderBy("createdAtMs", "desc").limit(safeLimit).get();

    return snapshot.docs
      .map((doc) => normalizeEntry(doc.id, doc.data()))
      .filter((entry): entry is PersistedUsageLogEntry => entry !== null);
  } catch (error) {
    console.error("Failed to read persisted generation usage logs", error);
    return [];
  }
}

function normalizeEntry(id: string, data: unknown): PersistedUsageLogEntry | null {
  const document = (data ?? {}) as Partial<PersistedUsageLogDocument> &
    LegacyPersistedUsageLogDocument;
  const createdAt = readString(document.createdAt);
  const createdAtMs = readNumber(document.createdAtMs);

  if (!createdAt && createdAtMs === null) {
    return null;
  }

  return {
    id,
    createdAt: createdAt ?? new Date(createdAtMs ?? Date.now()).toISOString(),
    uid: readString(document.uid) ?? "unknown",
    userId: readString(document.userId),
    visitorId: readString(document.visitorId),
    sessionId: readString(document.sessionId),
    messageLength: normalizeLength(document.messageLength) ?? readLegacyTextLength(document.message),
    messageText: normalizeText(document.messageText ?? document.message, MESSAGE_TEXT_LIMIT),
    hasImage: document.hasImage === true,
    context: readString(document.context),
    tone: readString(document.tone),
    goal: readString(document.goal),
    continuePreference: readString(document.continuePreference),
    conversationBackgroundLength:
      normalizeLength(document.conversationBackgroundLength) ??
      readLegacyTextLength(document.conversationBackground),
    conversationBackgroundText: normalizeText(
      document.conversationBackgroundText ?? document.conversationBackground,
      CONTEXT_TEXT_LIMIT,
    ),
    noReplyMode: readBoolean(document.noReplyMode),
    noReplyDurationValue: normalizeInteger(document.noReplyDurationValue, 1, 999),
    noReplyDurationUnit: readString(document.noReplyDurationUnit),
    lastOutgoingMessageLength:
      normalizeLength(document.lastOutgoingMessageLength) ??
      readLegacyTextLength(document.lastOutgoingMessage),
    lastOutgoingMessageText: normalizeText(
      document.lastOutgoingMessageText ?? document.lastOutgoingMessage,
      CONTEXT_TEXT_LIMIT,
    ),
    action: readString(document.action),
    sourceReplyLength:
      normalizeLength(document.sourceReplyLength) ?? readLegacyTextLength(document.sourceReply),
    sourceReplyText: normalizeText(
      document.sourceReplyText ?? document.sourceReply,
      CONTEXT_TEXT_LIMIT,
    ),
    status: normalizeStatus(document.status),
    consumption: normalizeConsumption(document.consumption),
    intentLength: normalizeLength(document.intentLength) ?? readLegacyTextLength(document.intent),
    intentText: normalizeText(document.intentText ?? document.intent, INTENT_TEXT_LIMIT),
    replyCount: normalizeLength(document.replyCount) ?? readLegacyReplyCount(document.replies),
    repliesText: normalizeReplies(document.repliesText ?? document.replies),
    schemaValid:
      readBoolean(document.schemaValid) ?? inferLegacySchemaValidity(document.intent, document.replies),
    error: readString(document.error),
    modelSource: normalizeModelSource(document.modelSource),
  };
}

function normalizeReplies(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  return value.slice(0, 3).map((reply) => normalizeText(reply, REPLY_TEXT_LIMIT) ?? "");
}

function normalizeStatus(value: unknown): PersistedUsageLogStatus {
  return value === "success" || value === "error" || value === "blocked"
    ? value
    : "error";
}

function normalizeConsumption(value: unknown): GenerationConsumption | null {
  return value === "initial_free" ||
    value === "daily_free" ||
    value === "credits" ||
    value === "unlimited"
    ? value
    : null;
}

function normalizeModelSource(value: unknown): GenerationModelSource | null {
  return value === "api" || value === "local" ? value : null;
}

function normalizeText(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1))}…`;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readBoolean(value: unknown) {
  return value === true || value === false ? value : null;
}

function normalizeBoolean(value: unknown) {
  return value === true || value === false ? value : null;
}

function normalizeInteger(value: unknown, min: number, max: number) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return null;
  }

  if (value < min || value > max) {
    return null;
  }

  return value;
}

function normalizeLength(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return null;
  }

  return value;
}

function readLegacyTextLength(value: unknown) {
  const text = readString(value);
  return text ? text.length : null;
}

function readLegacyReplyCount(value: unknown) {
  return Array.isArray(value) ? value.length : null;
}

function inferLegacySchemaValidity(intent: unknown, replies: unknown) {
  const hasIntent = readLegacyTextLength(intent) !== null;

  if (!Array.isArray(replies)) {
    return null;
  }

  return hasIntent && replies.length === 3 && replies.every((reply) => readString(reply) !== null);
}
