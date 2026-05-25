import { getFirestore } from "@/lib/firebase-admin";
import type { GenerationConsumption, GenerationModelSource } from "@/lib/local-usage-logs";

const PERSIST_USAGE_LOGS_ENABLED =
  process.env.PERSIST_USAGE_LOGS?.trim().toLowerCase() === "true";
const ALLOW_DEV_PERSIST_USAGE_LOGS =
  process.env.ALLOW_DEV_PERSIST_USAGE_LOGS?.trim().toLowerCase() === "true";
const USAGE_LOG_COLLECTION = "generation_usage_logs";

export type PersistedUsageLogStatus = "success" | "error" | "blocked";

export type PersistedUsageLogInput = {
  uid: string;
  messageLength?: number | null;
  hasImage: boolean;
  context?: string | null;
  tone?: string | null;
  continuePreference?: string | null;
  conversationBackgroundLength?: number | null;
  noReplyMode?: boolean | null;
  noReplyDurationValue?: number | null;
  noReplyDurationUnit?: string | null;
  lastOutgoingMessageLength?: number | null;
  action?: string | null;
  sourceReplyLength?: number | null;
  status: PersistedUsageLogStatus;
  consumption?: GenerationConsumption | null;
  intentLength?: number | null;
  replyCount?: number | null;
  schemaValid?: boolean | null;
  error?: string | null;
  modelSource?: GenerationModelSource | null;
};

export type PersistedUsageLogEntry = {
  id: string;
  createdAt: string;
  uid: string;
  messageLength: number | null;
  hasImage: boolean;
  context: string | null;
  tone: string | null;
  continuePreference: string | null;
  conversationBackgroundLength: number | null;
  noReplyMode: boolean | null;
  noReplyDurationValue: number | null;
  noReplyDurationUnit: string | null;
  lastOutgoingMessageLength: number | null;
  action: string | null;
  sourceReplyLength: number | null;
  status: PersistedUsageLogStatus;
  consumption: GenerationConsumption | null;
  intentLength: number | null;
  replyCount: number | null;
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
    messageLength: normalizeLength(input.messageLength),
    hasImage: input.hasImage === true,
    context: normalizeText(input.context ?? null, 80),
    tone: normalizeText(input.tone ?? null, 80),
    continuePreference: normalizeText(input.continuePreference ?? null, 24),
    conversationBackgroundLength: normalizeLength(input.conversationBackgroundLength),
    noReplyMode: normalizeBoolean(input.noReplyMode),
    noReplyDurationValue: normalizeInteger(input.noReplyDurationValue, 1, 999),
    noReplyDurationUnit: normalizeText(input.noReplyDurationUnit ?? null, 16),
    lastOutgoingMessageLength: normalizeLength(input.lastOutgoingMessageLength),
    action: normalizeText(input.action ?? null, 24),
    sourceReplyLength: normalizeLength(input.sourceReplyLength),
    status: normalizeStatus(input.status),
    consumption: normalizeConsumption(input.consumption),
    intentLength: normalizeLength(input.intentLength),
    replyCount: normalizeLength(input.replyCount),
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
    messageLength: normalizeLength(document.messageLength) ?? readLegacyTextLength(document.message),
    hasImage: document.hasImage === true,
    context: readString(document.context),
    tone: readString(document.tone),
    continuePreference: readString(document.continuePreference),
    conversationBackgroundLength:
      normalizeLength(document.conversationBackgroundLength) ??
      readLegacyTextLength(document.conversationBackground),
    noReplyMode: readBoolean(document.noReplyMode),
    noReplyDurationValue: normalizeInteger(document.noReplyDurationValue, 1, 999),
    noReplyDurationUnit: readString(document.noReplyDurationUnit),
    lastOutgoingMessageLength:
      normalizeLength(document.lastOutgoingMessageLength) ??
      readLegacyTextLength(document.lastOutgoingMessage),
    action: readString(document.action),
    sourceReplyLength:
      normalizeLength(document.sourceReplyLength) ?? readLegacyTextLength(document.sourceReply),
    status: normalizeStatus(document.status),
    consumption: normalizeConsumption(document.consumption),
    intentLength: normalizeLength(document.intentLength) ?? readLegacyTextLength(document.intent),
    replyCount: normalizeLength(document.replyCount) ?? readLegacyReplyCount(document.replies),
    schemaValid:
      readBoolean(document.schemaValid) ?? inferLegacySchemaValidity(document.intent, document.replies),
    error: readString(document.error),
    modelSource: normalizeModelSource(document.modelSource),
  };
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
