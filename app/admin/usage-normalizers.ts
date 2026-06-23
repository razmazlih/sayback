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
    context: formatTextMetadata(entry.context, null, "הקשר"),
    tone: entry.tone,
    continuePreference: entry.continuePreference,
    messageLength: entry.messageLength,
    conversationBackgroundLength: entry.conversationBackgroundLength,
    lastOutgoingMessageLength: entry.lastOutgoingMessageLength,
    sourceReplyLength: entry.sourceReplyLength,
    intentLength: entry.intentLength,
    replyCount: entry.replyCount,
    schemaValid: entry.schemaValid,
    conversationBackground: formatTextMetadata(
      entry.conversationBackgroundText,
      entry.conversationBackgroundLength,
      "רקע",
    ),
    noReplyMode: entry.noReplyMode,
    noReplyDurationValue: entry.noReplyDurationValue,
    noReplyDurationUnit: entry.noReplyDurationUnit,
    lastOutgoingMessage: formatTextMetadata(
      entry.lastOutgoingMessageText,
      entry.lastOutgoingMessageLength,
      "הודעה אחרונה",
    ),
    status: entry.status,
    message: formatTextMetadata(entry.messageText, entry.messageLength, "הודעה"),
    replies: formatReplyMetadata(entry.repliesText, entry.replyCount, entry.schemaValid),
    error: entry.error,
    hasImage: entry.hasImage,
    consumption: entry.consumption,
    intent: formatTextMetadata(entry.intentText, entry.intentLength, "intent"),
    sourceReply: formatTextMetadata(entry.sourceReplyText, entry.sourceReplyLength, "תשובת מקור"),
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
    context: formatTextMetadata(entry.context, null, "הקשר"),
    tone: entry.tone,
    continuePreference: entry.continuePreference,
    messageLength: entry.messageLength,
    conversationBackgroundLength: entry.conversationBackgroundLength,
    lastOutgoingMessageLength: entry.lastOutgoingMessageLength,
    sourceReplyLength: entry.sourceReplyLength,
    intentLength: entry.intentLength,
    replyCount: entry.replyCount,
    schemaValid: entry.schemaValid,
    conversationBackground: formatTextMetadata(entry.conversationBackground, entry.conversationBackgroundLength, "רקע"),
    noReplyMode: entry.noReplyMode,
    noReplyDurationValue: entry.noReplyDurationValue,
    noReplyDurationUnit: entry.noReplyDurationUnit,
    lastOutgoingMessage: formatTextMetadata(entry.lastOutgoingMessage, entry.lastOutgoingMessageLength, "הודעה אחרונה"),
    status: entry.status,
    message: formatTextMetadata(null, entry.messageLength, "הודעה"),
    replies: formatReplyMetadata(null, entry.replyCount, entry.schemaValid),
    error: entry.error,
    hasImage: entry.hasImage,
    consumption: entry.consumption,
    intent: formatTextMetadata(null, entry.intentLength, "intent"),
    sourceReply: formatTextMetadata(entry.sourceReply, entry.sourceReplyLength, "תשובת מקור"),
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

function formatLengthMetadata(length: number | null, label: string) {
  return typeof length === "number" ? `${label}: ${length} תווים (תוכן לא נשמר)` : null;
}

function formatTextMetadata(
  value: string | null,
  length: number | null,
  label: string,
) {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  return formatLengthMetadata(length, label);
}

function formatReplyMetadata(
  replies: string[] | null,
  replyCount: number | null,
  schemaValid: boolean | null,
) {
  if (Array.isArray(replies) && replies.length > 0) {
    return replies;
  }

  if (typeof replyCount !== "number" || replyCount <= 0) {
    return [];
  }

  return Array.from({ length: replyCount }, (_, index) => {
    if (schemaValid === false) {
      return "";
    }

    return `תשובה ${index + 1}: תוכן לא נשמר`;
  });
}
