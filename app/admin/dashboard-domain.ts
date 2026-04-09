import type { AdminUsageEntry } from "@/app/admin/types";
import { normalizeAction } from "@/app/admin/usage-normalizers";

export type NormalizedStatus = "success" | "blocked" | "pending" | "failed";
type EventTypeLabel = "הודעה חדשה" | "תיקון";

export type ActionInfo = {
  normalized: string;
  actionLabel: string;
  eventTypeLabel: EventTypeLabel;
  isRefine: boolean;
  className: string;
};

export const ALL_STATUS_VALUES: NormalizedStatus[] = ["success", "blocked", "pending", "failed"];

const ACTION_LABELS = {
  softer: "עדין יותר",
  sharper: "חד יותר",
  retry: "נסח מחדש",
  generate: "הודעה חדשה",
} as const;

const STATUS_LABELS: Record<NormalizedStatus, string> = {
  success: "הצליח",
  blocked: "נחסם",
  pending: "בתהליך",
  failed: "נכשל",
};

const STATUS_FILTER_LABELS: Record<NormalizedStatus, string> = {
  success: "הצלחות",
  blocked: "חסומים",
  pending: "בתהליך",
  failed: "נכשלו",
};

export function describeAction(value: string | null): ActionInfo {
  const normalized = normalizeAction(value);

  if (normalized === "softer") {
    return {
      normalized,
      actionLabel: ACTION_LABELS.softer,
      eventTypeLabel: "תיקון",
      isRefine: true,
      className: "bg-amber-100 text-amber-900",
    };
  }

  if (normalized === "sharper") {
    return {
      normalized,
      actionLabel: ACTION_LABELS.sharper,
      eventTypeLabel: "תיקון",
      isRefine: true,
      className: "bg-orange-100 text-orange-900",
    };
  }

  if (normalized === "retry") {
    return {
      normalized,
      actionLabel: ACTION_LABELS.retry,
      eventTypeLabel: "תיקון",
      isRefine: true,
      className: "bg-sky-100 text-sky-900",
    };
  }

  return {
    normalized,
    actionLabel: ACTION_LABELS.generate,
    eventTypeLabel: "הודעה חדשה",
    isRefine: false,
    className: "bg-black/[0.05] text-black/75",
  };
}

export function toActionLabel(value: string | null) {
  return describeAction(value).actionLabel;
}

export function toEventTypeLabel(value: string | null): EventTypeLabel {
  return describeAction(value).eventTypeLabel;
}

export function normalizeStatus(status: string): NormalizedStatus {
  const normalized = status.trim().toLowerCase();

  if (normalized === "success" || normalized === "ok" || normalized === "completed") {
    return "success";
  }

  if (normalized === "blocked") {
    return "blocked";
  }

  if (normalized === "pending" || normalized === "started" || normalized === "in_progress") {
    return "pending";
  }

  return "failed";
}

export function toStatusLabel(status: string) {
  return STATUS_LABELS[normalizeStatus(status)];
}

export function toStatusFilterLabel(status: NormalizedStatus) {
  return STATUS_FILTER_LABELS[status];
}

export function pickPrimaryRefineReply(replies: string[]) {
  for (const reply of replies) {
    if (typeof reply === "string" && reply.trim().length > 0) {
      return reply;
    }
  }

  return null;
}

export function toConsumptionLabel(consumption: AdminUsageEntry["consumption"]) {
  if (consumption === "unlimited") {
    return "מנוי";
  }

  if (consumption === "credits") {
    return "קרדיטים";
  }

  if (consumption === "initial_free") {
    return "חינם התחלתי";
  }

  if (consumption === "daily_free") {
    return "חינם יומי";
  }

  return "לא זמין";
}

export function toDurationUnitLabel(value: string) {
  if (value === "minutes") {
    return "דקות";
  }

  if (value === "hours") {
    return "שעות";
  }

  if (value === "days") {
    return "ימים";
  }

  return value;
}

export function toCompactMessagePreview(
  message: string | null,
  hasImage: boolean,
  noReplyMode: boolean | null,
  lastOutgoingMessage: string | null,
) {
  if (noReplyMode && typeof lastOutgoingMessage === "string" && lastOutgoingMessage.trim().length > 0) {
    return `לא ענו: ${lastOutgoingMessage.replace(/\s+/g, " ").trim()}`;
  }

  if (typeof message === "string" && message.trim().length > 0) {
    return message.replace(/\s+/g, " ").trim();
  }

  if (hasImage) {
    return "הודעה עם תמונה (ללא טקסט)";
  }

  return "ללא טקסט";
}

export function statusLabel(status: NormalizedStatus) {
  return STATUS_LABELS[status];
}
