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
  message?: string | null;
  hasImage: boolean;
  context?: string | null;
  tone?: string | null;
  continuePreference?: string | null;
  conversationBackground?: string | null;
  noReplyMode?: boolean | null;
  noReplyDurationValue?: number | null;
  noReplyDurationUnit?: string | null;
  lastOutgoingMessage?: string | null;
  action?: string | null;
  sourceReply?: string | null;
  status: PersistedUsageLogStatus;
  consumption?: GenerationConsumption | null;
  intent?: string | null;
  replies?: [string, string, string] | null;
  error?: string | null;
  modelSource?: GenerationModelSource | null;
};

export type PersistedUsageLogEntry = {
  id: string;
  createdAt: string;
  uid: string;
  message: string | null;
  hasImage: boolean;
  context: string | null;
  tone: string | null;
  continuePreference: string | null;
  conversationBackground: string | null;
  noReplyMode: boolean | null;
  noReplyDurationValue: number | null;
  noReplyDurationUnit: string | null;
  lastOutgoingMessage: string | null;
  action: string | null;
  sourceReply: string | null;
  status: PersistedUsageLogStatus;
  consumption: GenerationConsumption | null;
  intent: string | null;
  replies: [string, string, string] | null;
  error: string | null;
  modelSource: GenerationModelSource | null;
};

type PersistedUsageLogDocument = Omit<PersistedUsageLogEntry, "id"> & {
  createdAtMs: number;
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
    message: normalizeText(input.message ?? null, 3000),
    hasImage: input.hasImage === true,
    context: normalizeText(input.context ?? null, 80),
    tone: normalizeText(input.tone ?? null, 80),
    continuePreference: normalizeText(input.continuePreference ?? null, 24),
    conversationBackground: normalizeText(input.conversationBackground ?? null, 500),
    noReplyMode: normalizeBoolean(input.noReplyMode),
    noReplyDurationValue: normalizeInteger(input.noReplyDurationValue, 1, 999),
    noReplyDurationUnit: normalizeText(input.noReplyDurationUnit ?? null, 16),
    lastOutgoingMessage: normalizeText(input.lastOutgoingMessage ?? null, 240),
    action: normalizeText(input.action ?? null, 24),
    sourceReply: normalizeText(input.sourceReply ?? null, 3000),
    status: normalizeStatus(input.status),
    consumption: normalizeConsumption(input.consumption),
    intent: normalizeText(input.intent ?? null, 500),
    replies: normalizeReplies(input.replies),
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
  const document = (data ?? {}) as Partial<PersistedUsageLogDocument>;
  const createdAt = readString(document.createdAt);
  const createdAtMs = readNumber(document.createdAtMs);

  if (!createdAt && createdAtMs === null) {
    return null;
  }

  return {
    id,
    createdAt: createdAt ?? new Date(createdAtMs ?? Date.now()).toISOString(),
    uid: readString(document.uid) ?? "unknown",
    message: readString(document.message),
    hasImage: document.hasImage === true,
    context: readString(document.context),
    tone: readString(document.tone),
    continuePreference: readString(document.continuePreference),
    conversationBackground: readString(document.conversationBackground),
    noReplyMode: readBoolean(document.noReplyMode),
    noReplyDurationValue: normalizeInteger(document.noReplyDurationValue, 1, 999),
    noReplyDurationUnit: readString(document.noReplyDurationUnit),
    lastOutgoingMessage: readString(document.lastOutgoingMessage),
    action: readString(document.action),
    sourceReply: readString(document.sourceReply),
    status: normalizeStatus(document.status),
    consumption: normalizeConsumption(document.consumption),
    intent: readString(document.intent),
    replies: normalizeReplies(document.replies),
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

function normalizeReplies(value: unknown): [string, string, string] | null {
  if (!Array.isArray(value) || value.length !== 3) {
    return null;
  }

  const replies = value
    .map((item) => readString(item))
    .filter((item): item is string => Boolean(item));

  if (replies.length !== 3) {
    return null;
  }

  return [replies[0], replies[1], replies[2]];
}
