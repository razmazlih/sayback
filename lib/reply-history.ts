/** One previous AI variant per card; kept only in the current page's state. */
export type ReplyRevision = Readonly<{ before: string; after: string }>;
export type ReplyHistory = readonly [
  ReplyRevision | null,
  ReplyRevision | null,
  ReplyRevision | null,
];

export function createReplyHistory(): ReplyHistory {
  return [null, null, null];
}

function isReplyIndex(index: number): index is 0 | 1 | 2 {
  return Number.isInteger(index) && index >= 0 && index < 3;
}

/**
 * Record only a successfully applied AI refinement. The caller must also check
 * its request lease: equal text alone cannot establish ownership of a request.
 * currentReply prevents an earlier refinement from taking over an edited card.
 */
export function recordReplyRefinement(
  history: ReplyHistory,
  index: number,
  before: string,
  after: string,
  currentReply: string = before,
): ReplyHistory {
  if (
    !isReplyIndex(index) ||
    currentReply !== before ||
    !before.trim() ||
    !after.trim() ||
    before === after
  ) {
    return history;
  }

  const next: [ReplyRevision | null, ReplyRevision | null, ReplyRevision | null] = [...history];
  next[index] = { before, after };
  return next;
}

/** Hide a comparison once the card no longer contains that AI result. */
export function getPreviousReply(
  history: ReplyHistory,
  index: number,
  currentReply: string,
): string | null {
  if (!isReplyIndex(index)) return null;
  const revision = history[index];
  return revision?.after === currentReply ? revision.before : null;
}

/** Manual edits and restoring the previous variant are not new AI refinements. */
export function clearReplyRevision(history: ReplyHistory, index: number): ReplyHistory {
  if (!isReplyIndex(index) || history[index] === null) return history;
  const next: [ReplyRevision | null, ReplyRevision | null, ReplyRevision | null] = [...history];
  next[index] = null;
  return next;
}
