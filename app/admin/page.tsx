import { notFound } from "next/navigation";
import AdminDashboardClient from "@/app/admin/admin-dashboard-client";
import type { AdminUsageEntry } from "@/app/admin/types";
import { isLocalAdminEnabled } from "@/lib/local-admin";
import { getLocalUsageLogs } from "@/lib/local-usage-logs";
import { listPersistedUsageLogs } from "@/lib/persisted-usage-logs";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!isLocalAdminEnabled()) {
    notFound();
  }

  const [localLogs, persistedLogs] = await Promise.all([
    Promise.resolve(getLocalUsageLogs()),
    listPersistedUsageLogs(500),
  ]);
  const localRows = localLogs.map<AdminUsageEntry>((entry) => ({
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
  }));
  const productionRows = persistedLogs.map<AdminUsageEntry>((entry) => ({
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
  }));
  const rows = [...productionRows, ...localRows]
    .toSorted((left, right) => right.createdAtMs - left.createdAtMs);

  return (
    <main className="min-h-screen bg-background px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">
        <AdminDashboardClient rows={rows} />
      </div>
    </main>
  );
}

function toTimestamp(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function normalizeAction(value: string | null) {
  if (typeof value !== "string") {
    return "generate";
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : "generate";
}
