export const MY_VOICE_VERSION = 1;
export const MY_VOICE_ACTIVATION_THRESHOLD = 3;
export const MY_VOICE_MAX_OBSERVATIONS = 10_000;

export const COPY_LENGTH_BUCKETS = ["short", "medium"] as const;
export const REFINE_SIGNAL_ACTIONS = ["softer", "sharper", "retry"] as const;

export type CopyLengthBucket = (typeof COPY_LENGTH_BUCKETS)[number];
export type RefineSignalAction = (typeof REFINE_SIGNAL_ACTIONS)[number];

export type MyVoiceCounters = {
  observations: number;
  copyObservations: number;
  shortCopyCount: number;
  mediumCopyCount: number;
  emojiCopyCount: number;
  noEmojiCopyCount: number;
  softerCount: number;
  sharperCount: number;
  retryCount: number;
};

export type MyVoiceProfile = MyVoiceCounters & {
  version: 1;
  createdAt: string;
  updatedAt: string;
};

export type MyVoiceSignal =
  | {
      type: "reply_copied";
      lengthBucket: CopyLengthBucket;
      hasEmoji: boolean;
    }
  | {
      type: "refine_used";
      action: RefineSignalAction;
    };

export type MyVoicePreferences = {
  active: boolean;
  observations: number;
  preferredLength: CopyLengthBucket | null;
  emojiPreference: "prefer" | "avoid" | null;
  toneBias: "softer" | "sharper" | null;
};
