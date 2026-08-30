import {
  COPY_LENGTH_BUCKETS,
  REFINE_SIGNAL_ACTIONS,
  type CopyLengthBucket,
  type MyVoiceSignal,
  type RefineSignalAction,
} from "./my-voice-types";

export class MyVoiceValidationError extends Error {
  readonly status = 400;

  constructor(message = "אות ההעדפה לא תקין.") {
    super(message);
    this.name = "MyVoiceValidationError";
  }
}

export function parseCopySignal(value: unknown): MyVoiceSignal {
  const body = readObject(value);
  assertExactKeys(body, ["type", "lengthBucket", "hasEmoji"]);

  if (body.type !== "reply_copied") {
    throw new MyVoiceValidationError();
  }
  if (!isCopyLengthBucket(body.lengthBucket) || typeof body.hasEmoji !== "boolean") {
    throw new MyVoiceValidationError();
  }

  return {
    type: "reply_copied",
    lengthBucket: body.lengthBucket,
    hasEmoji: body.hasEmoji,
  };
}

export function isRefineSignalAction(value: unknown): value is RefineSignalAction {
  return typeof value === "string" && REFINE_SIGNAL_ACTIONS.some((action) => action === value);
}

function isCopyLengthBucket(value: unknown): value is CopyLengthBucket {
  return typeof value === "string" && COPY_LENGTH_BUCKETS.some((bucket) => bucket === value);
}

function readObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MyVoiceValidationError();
  }
  return value as Record<string, unknown>;
}

function assertExactKeys(body: Record<string, unknown>, allowedKeys: readonly string[]) {
  const allowed = new Set(allowedKeys);
  if (Object.keys(body).some((key) => !allowed.has(key))) {
    throw new MyVoiceValidationError("הבקשה כוללת שדות שלא ניתן לשמור.");
  }
}
