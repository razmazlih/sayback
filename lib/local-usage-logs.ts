import { isLocalAdminEnabled } from "@/lib/local-admin";

const MAX_LOCAL_USAGE_LOGS = 400;

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
  status: LocalUsageLogStatus;
  consumption: GenerationConsumption | null;
  intent: string | null;
  replies: [string, string, string] | null;
  error: string | null;
  modelSource: GenerationModelSource | null;
}

type StartLocalUsageLogInput = {
  uid: string;
  message?: string;
  imageBase64?: string;
  context?: string;
  tone?: string;
  continuePreference?: string | null;
  conversationBackground?: string;
  noReplyMode?: boolean;
  noReplyDurationValue?: number;
  noReplyDurationUnit?: string;
  lastOutgoingMessage?: string;
  action?: string;
  sourceReply?: string;
};

type CompleteLocalUsageLogInput = {
  status: "success" | "error";
  consumption?: GenerationConsumption | null;
  intent?: string | null;
  replies?: [string, string, string] | null;
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
    message: normalizeText(input.message, 3000),
    hasImage: Boolean(normalizeText(input.imageBase64, 20)),
    context: normalizeText(input.context, 80),
    tone: normalizeText(input.tone, 80),
    continuePreference: normalizeText(input.continuePreference ?? null, 24),
    conversationBackground: normalizeText(input.conversationBackground, 500),
    noReplyMode: normalizeBoolean(input.noReplyMode),
    noReplyDurationValue: normalizeInteger(input.noReplyDurationValue, 1, 999),
    noReplyDurationUnit: normalizeText(input.noReplyDurationUnit, 16),
    lastOutgoingMessage: normalizeText(input.lastOutgoingMessage, 240),
    action: normalizeText(input.action, 24),
    sourceReply: normalizeText(input.sourceReply, 3000),
    status: "pending",
    consumption: null,
    intent: null,
    replies: null,
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
  entry.intent = normalizeText(updates.intent ?? null, 500);
  entry.replies = normalizeReplies(updates.replies);
  entry.error = normalizeText(updates.error ?? null, 400);
  entry.modelSource = normalizeModelSource(updates.modelSource ?? null);
}

export function getLocalUsageLogs() {
  const state = getState();

  return state.entries.map((entry) => ({
    ...entry,
    replies: entry.replies
      ? [entry.replies[0], entry.replies[1], entry.replies[2]]
      : null,
  }));
}

function getState() {
  if (!globalThis.__saybackLocalUsageLogState) {
    globalThis.__saybackLocalUsageLogState = {
      nextSequence: 1,
      entries: [],
    };
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

function normalizeModelSource(value: string | null | undefined): GenerationModelSource | null {
  if (value === "api" || value === "local") {
    return value;
  }

  return null;
}

function normalizeReplies(value: [string, string, string] | null | undefined) {
  if (!Array.isArray(value) || value.length !== 3) {
    return null;
  }

  const normalized = value
    .map((reply) => normalizeText(reply, 500))
    .filter((reply): reply is string => typeof reply === "string");

  if (normalized.length !== 3) {
    return null;
  }

  return [normalized[0], normalized[1], normalized[2]] as [string, string, string];
}
