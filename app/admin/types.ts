export type AdminUsageSource = "production" | "local";
export type AdminUsageStatus = "success" | "error" | "blocked" | "pending";

export interface AdminUsageEntry {
  id: string;
  source: AdminUsageSource;
  createdAt: string;
  createdAtMs: number;
  uid: string;
  action: string;
  context: string | null;
  tone: string | null;
  continuePreference: string | null;
  conversationBackground: string | null;
  noReplyMode: boolean | null;
  noReplyDurationValue: number | null;
  noReplyDurationUnit: string | null;
  lastOutgoingMessage: string | null;
  status: AdminUsageStatus;
  message: string | null;
  replies: string[];
  error: string | null;
  hasImage: boolean;
  consumption: "initial_free" | "daily_free" | "credits" | "unlimited" | null;
  intent: string | null;
  sourceReply: string | null;
  durationMs: number | null;
  completedAt: string | null;
  modelSource: "api" | "local" | null;
}
