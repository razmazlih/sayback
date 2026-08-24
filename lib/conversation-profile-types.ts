import type { ContextOption, ToneOption } from "./generator-options";

export const MAX_CONVERSATION_PROFILES = 20;
export const MAX_CONVERSATION_LABEL_LENGTH = 32;
export const MAX_CONVERSATION_MEMORY_NOTE_LENGTH = 300;
export const MAX_CONVERSATION_LAST_INTENT_LENGTH = 220;

export type ConversationProfile = {
  id: string;
  version: 1;
  label: string;
  context: ContextOption | null;
  tone: ToneOption;
  memoryNote: string | null;
  lastIntent: string | null;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string;
  usageCount: number;
};
