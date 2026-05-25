import { isLocalAdminEnabled } from "@/lib/local-admin";

const MAX_LOCAL_USAGE_LOGS = 400;
const RAW_USAGE_LOG_FIELDS = [
  "message",
  "conversationBackground",
  "lastOutgoingMessage",
  "sourceReply",
  "intent",
  "replies",
] as const;

type LocalUsageLogState = {
  nextSequence: number;
  entries: LocalUsageLogEntry[];
};

export type GenerationConsumption = "initial_free" | "daily_free" | "credits" | "unlimited";
export type LocalUsageLogStatus = "pending" | "success" | "error";
export type GenerationModelSource = "api" | "local";

export interface LocalUsageLogEntry {
  id: string;
  createdAt: string;
  completedAt: string | null;
  durationMs: number | null;
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
  status: LocalUsageLogStatus;
  consumption: GenerationConsumption | null;
  intentLength: number | null;
  replyCount: number | null;
  schemaValid: boolean | null;
  error: string | null;
  modelSource: GenerationModelSource | null;
}

type StartLocalUsageLogInput = {
  uid: string;
  messageLength?: number | null;
  hasImage?: boolean;
  context?: string;
  tone?: string;
  continuePreference?: string | null;
  conversationBackgroundLength?: number | null;
  noReplyMode?: boolean;
  noReplyDurationValue?: number;
  noReplyDurationUnit?: string;
  lastOutgoingMessageLength?: number | null;
  action?: string;
  sourceReplyLength?: number | null;
};

type CompleteLocalUsageLogInput = {
  status: "success" | "error";
  consumption?: GenerationConsumption | null;
  intentLength?: number | null;
  replyCount?: number | null;
  schemaValid?: boolean | null;
  error?: string | null;
  modelSource?: GenerationModelSource | null;
};

declare global {
  var __saybackLocalUsageLogState: LocalUsageLogState | undefined;
}

export function startLocalUsageLog(input: StartLocalUsageLogInput) {
  if (!isLocalAdminEnabled()) {
    return null;
  }

  const state = getState();
  const createdAtDate = new Date();
  const id = `local_usage_${createdAtDate.getTime()}_${state.nextSequence++}`;
  const entry: LocalUsageLogEntry = {
    id,
    createdAt: createdAtDate.toISOString(),
    completedAt: null,
    durationMs: null,
    uid: normalizeText(input.uid, 200) ?? "unknown",
    messageLength: normalizeLength(input.messageLength),
    hasImage: input.hasImage === true,
    context: normalizeText(input.context, 80),
    tone: normalizeText(input.tone, 80),
    continuePreference: normalizeText(input.continuePreference ?? null, 24),
    conversationBackgroundLength: normalizeLength(input.conversationBackgroundLength),
    noReplyMode: normalizeBoolean(input.noReplyMode),
    noReplyDurationValue: normalizeInteger(input.noReplyDurationValue, 1, 999),
    noReplyDurationUnit: normalizeText(input.noReplyDurationUnit, 16),
    lastOutgoingMessageLength: normalizeLength(input.lastOutgoingMessageLength),
    action: normalizeText(input.action, 24),
    sourceReplyLength: normalizeLength(input.sourceReplyLength),
    status: "pending",
    consumption: null,
    intentLength: null,
    replyCount: null,
    schemaValid: null,
    error: null,
    modelSource: null,
  };

  state.entries.unshift(entry);

  if (state.entries.length > MAX_LOCAL_USAGE_LOGS) {
    state.entries.length = MAX_LOCAL_USAGE_LOGS;
  }

  return id;
}

export function completeLocalUsageLog(
  id: string | null,
  updates: CompleteLocalUsageLogInput,
) {
  if (!id || !isLocalAdminEnabled()) {
    return;
  }

  const state = getState();
  const entry = state.entries.find((current) => current.id === id);

  if (!entry) {
    return;
  }

  const completedAtDate = new Date();
  entry.completedAt = completedAtDate.toISOString();
  entry.durationMs = Math.max(
    0,
    completedAtDate.getTime() - new Date(entry.createdAt).getTime(),
  );
  entry.status = updates.status;
  entry.consumption = updates.consumption ?? null;
  entry.intentLength = normalizeLength(updates.intentLength);
  entry.replyCount = normalizeLength(updates.replyCount);
  entry.schemaValid = normalizeBoolean(updates.schemaValid);
  entry.error = normalizeText(updates.error ?? null, 400);
  entry.modelSource = normalizeModelSource(updates.modelSource ?? null);
}

export function clearLocalUsageLogConversationBackgroundLength(id: string | null) {
  if (!id || !isLocalAdminEnabled()) {
    return;
  }

  const entry = getState().entries.find((current) => current.id === id);

  if (entry) {
    entry.conversationBackgroundLength = null;
  }
}

export function getLocalUsageLogs() {
  const state = getState();

  return state.entries.map((entry) => ({ ...entry }));
}

function getState() {
  if (!globalThis.__saybackLocalUsageLogState) {
    globalThis.__saybackLocalUsageLogState = {
      nextSequence: 1,
      entries: [],
    };
  }

  for (const entry of globalThis.__saybackLocalUsageLogState.entries) {
    sanitizeStoredEntry(entry);
  }

  return globalThis.__saybackLocalUsageLogState;
}

function normalizeText(value: string | null | undefined, maxLength: number) {
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

function normalizeBoolean(value: boolean | null | undefined) {
  if (value === true || value === false) {
    return value;
  }

  return null;
}

function normalizeInteger(value: number | null | undefined, min: number, max: number) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return null;
  }

  if (value < min || value > max) {
    return null;
  }

  return value;
}

function normalizeLength(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return null;
  }

  return value;
}

function sanitizeStoredEntry(entry: LocalUsageLogEntry) {
  const record = entry as unknown as Record<string, unknown>;
  entry.messageLength = normalizeLength(entry.messageLength) ?? readLegacyTextLength(record.message);
  entry.conversationBackgroundLength =
    normalizeLength(entry.conversationBackgroundLength) ??
    readLegacyTextLength(record.conversationBackground);
  entry.lastOutgoingMessageLength =
    normalizeLength(entry.lastOutgoingMessageLength) ??
    readLegacyTextLength(record.lastOutgoingMessage);
  entry.sourceReplyLength =
    normalizeLength(entry.sourceReplyLength) ?? readLegacyTextLength(record.sourceReply);
  entry.intentLength = normalizeLength(entry.intentLength) ?? readLegacyTextLength(record.intent);
  entry.replyCount = normalizeLength(entry.replyCount) ?? readLegacyReplyCount(record.replies);
  entry.schemaValid =
    normalizeBoolean(entry.schemaValid) ?? inferLegacySchemaValidity(record.intent, record.replies);

  for (const field of RAW_USAGE_LOG_FIELDS) {
    delete record[field];
  }
}

function readLegacyTextLength(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text.length : null;
}

function readLegacyReplyCount(value: unknown) {
  return Array.isArray(value) ? value.length : null;
}

function inferLegacySchemaValidity(intent: unknown, replies: unknown) {
  const hasIntent = readLegacyTextLength(intent) !== null;

  if (!Array.isArray(replies)) {
    return null;
  }

  return (
    hasIntent &&
    replies.length === 3 &&
    replies.every((reply) => readLegacyTextLength(reply) !== null)
  );
}

function normalizeModelSource(value: string | null | undefined): GenerationModelSource | null {
  if (value === "api" || value === "local") {
    return value;
  }

  return null;
}
