import type { ContextOption, ToneOption } from "./generator-options";

export const MAX_CONVERSATION_PROFILES = 20;
export const MAX_CONVERSATION_LABEL_LENGTH = 32;

export type ConversationProfile = {
  id: string;
  version: 1;
  label: string;
  context: ContextOption | null;
  tone: ToneOption;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string;
  usageCount: number;
};
