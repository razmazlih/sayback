export type PersistedUsageTextFields = {
  messageText: null;
  conversationBackgroundText: null;
  lastOutgoingMessageText: null;
  sourceReplyText: null;
  intentText: null;
  repliesText: null;
};

/**
 * Persistent growth/usage data is metadata-only by contract. Parameters are
 * intentionally ignored so future callers cannot accidentally re-enable raw
 * content merely by passing it to the persistence layer.
 */
export function metadataOnlyUsageTextFields(_input?: unknown): PersistedUsageTextFields {
  void _input;
  return {
    messageText: null,
    conversationBackgroundText: null,
    lastOutgoingMessageText: null,
    sourceReplyText: null,
    intentText: null,
    repliesText: null,
  };
}
