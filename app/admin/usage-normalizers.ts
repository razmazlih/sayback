import type { AdminUsageEntry } from "@/app/admin/types";
import type { getLocalUsageLogs } from "@/lib/local-usage-logs";
import type { PersistedUsageLogEntry } from "@/lib/persisted-usage-logs";

export function toTimestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

export function safeTimestamp(value: string) {
  return toTimestamp(value);
}

export function normalizeAction(value: string | null) {
  if (typeof value !== "string") {
    return "generate";
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : "generate";
}

export function normalizeUid(uid: string) {
  const normalized = uid.trim();
  return normalized.length > 0 ? normalized : "unknown";
}

type NormalizeUsageRowsInput = {
  localLogs: ReturnType<typeof getLocalUsageLogs>;
  persistedLogs: PersistedUsageLogEntry[];
};

export function normalizeLocalUsageEntry(
  entry: ReturnType<typeof getLocalUsageLogs>[number],
): AdminUsageEntry {
  return {
    id: `local_${entry.id}`,
    source: "local",
    createdAt: entry.createdAt,
    createdAtMs: toTimestamp(entry.createdAt),
    uid: entry.uid,
    action: normalizeAction(entry.action),
    context: entry.context,
    tone: entry.tone,
    continuePreference: entry.continuePreference,
    conversationBackground: entry.conversationBackground,
    noReplyMode: entry.noReplyMode,
    noReplyDurationValue: entry.noReplyDurationValue,
    noReplyDurationUnit: entry.noReplyDurationUnit,
    lastOutgoingMessage: entry.lastOutgoingMessage,
    status: entry.status,
    message: entry.message,
    replies: entry.replies ? [...entry.replies] : [],
    error: entry.error,
    hasImage: entry.hasImage,
    consumption: entry.consumption,
    intent: entry.intent,
    sourceReply: entry.sourceReply,
    durationMs: entry.durationMs,
    completedAt: entry.completedAt,
    modelSource: entry.modelSource,
  };
}

export function normalizePersistedUsageEntry(
  entry: PersistedUsageLogEntry,
): AdminUsageEntry {
  return {
    id: `production_${entry.id}`,
    source: "production",
    createdAt: entry.createdAt,
    createdAtMs: toTimestamp(entry.createdAt),
    uid: entry.uid,
    action: normalizeAction(entry.action),
    context: entry.context,
    tone: entry.tone,
    continuePreference: entry.continuePreference,
    conversationBackground: entry.conversationBackground,
    noReplyMode: entry.noReplyMode,
    noReplyDurationValue: entry.noReplyDurationValue,
    noReplyDurationUnit: entry.noReplyDurationUnit,
    lastOutgoingMessage: entry.lastOutgoingMessage,
    status: entry.status,
    message: entry.message,
    replies: entry.replies ? [...entry.replies] : [],
    error: entry.error,
    hasImage: entry.hasImage,
    consumption: entry.consumption,
    intent: entry.intent,
    sourceReply: entry.sourceReply,
    durationMs: null,
    completedAt: null,
    modelSource: entry.modelSource,
  };
}

export function normalizeUsageRows({
  localLogs,
  persistedLogs,
}: NormalizeUsageRowsInput): AdminUsageEntry[] {
  const localRows = localLogs.map(normalizeLocalUsageEntry);
  const productionRows = persistedLogs.map(normalizePersistedUsageEntry);

  return [...productionRows, ...localRows].toSorted(
    (left, right) => right.createdAtMs - left.createdAtMs,
  );
}
