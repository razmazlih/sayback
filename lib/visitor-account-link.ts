import { createHash } from "node:crypto";

export type VisitorAccountLink = {
  id: string;
  document: { visitorId: string; userId: string; linkedAt: string; linkedAtMs: number };
};

export function createVisitorAccountLink(visitorId: string, userId: string, now = new Date()): VisitorAccountLink {
  const normalizedUserId = userId.trim();

  if (!normalizedUserId) {
    throw new Error("A user identifier is required.");
  }

  return {
    id: createHash("sha256").update(`${visitorId}:${normalizedUserId}`, "utf8").digest("hex"),
    document: {
      visitorId,
      userId: normalizedUserId,
      linkedAt: now.toISOString(),
      linkedAtMs: now.getTime(),
    },
  };
}
