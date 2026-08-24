import { FieldValue, type Firestore, type Timestamp } from "firebase-admin/firestore";
import { getFirestore } from "@/lib/firebase-admin";
import {
  type ContextOption,
  type ToneOption,
} from "@/lib/generator-options";
import {
  MAX_CONVERSATION_LABEL_LENGTH,
  MAX_CONVERSATION_PROFILES,
  type ConversationProfile,
} from "@/lib/conversation-profile-types";
import {
  ConversationProfileError,
  isConversationProfileId,
  normalizeConversationContext,
  normalizeConversationLabel,
  normalizeConversationTone,
} from "@/lib/conversation-profile-validation";

export { ConversationProfileError } from "@/lib/conversation-profile-validation";

export const CONVERSATION_PROFILE_VERSION = 1;

export type ConversationProfileDefaults = {
  context: ContextOption | null;
  tone: ToneOption;
};

export type ConversationProfilePatch = Partial<ConversationProfileDefaults> & {
  label?: string;
  markUsed?: boolean;
};

type StoredConversationProfile = {
  version?: unknown;
  label?: unknown;
  context?: unknown;
  tone?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  lastUsedAt?: unknown;
  usageCount?: unknown;
};

export async function listConversationProfiles(uid: string): Promise<ConversationProfile[]> {
  const firestore = (await getFirestore()) as unknown as Firestore;
  const snapshot = await profilesCollection(firestore, uid)
    .orderBy("lastUsedAt", "desc")
    .limit(MAX_CONVERSATION_PROFILES)
    .get();

  return snapshot.docs.flatMap((document) => {
    const profile = parseStoredProfile(document.id, document.data());
    return profile ? [profile] : [];
  });
}

export async function createConversationProfile(
  uid: string,
  input: { label: unknown; context: unknown; tone: unknown },
): Promise<ConversationProfile> {
  const label = normalizeConversationLabel(input.label);
  const context = normalizeConversationContext(input.context);
  const tone = normalizeConversationTone(input.tone);
  const firestore = (await getFirestore()) as unknown as Firestore;
  const ownerRef = firestore.collection("conversation_profiles").doc(uid);
  const profileRef = ownerRef.collection("items").doc();

  await firestore.runTransaction(async (transaction) => {
    const ownerSnapshot = await transaction.get(ownerRef);
    const storedCount = readNonNegativeInteger(ownerSnapshot.data()?.profileCount);

    if (storedCount >= MAX_CONVERSATION_PROFILES) {
      throw new ConversationProfileError(
        `אפשר לשמור עד ${MAX_CONVERSATION_PROFILES} שיחות. מחקו שיחה ישנה כדי לשמור חדשה.`,
        409,
      );
    }

    const now = FieldValue.serverTimestamp();
    transaction.set(profileRef, {
      version: CONVERSATION_PROFILE_VERSION,
      label,
      context,
      tone,
      createdAt: now,
      updatedAt: now,
      lastUsedAt: now,
      usageCount: 0,
    });
    transaction.set(
      ownerRef,
      {
        version: CONVERSATION_PROFILE_VERSION,
        profileCount: storedCount + 1,
        updatedAt: now,
      },
      { merge: true },
    );
  });

  const created = await profileRef.get();
  const profile = parseStoredProfile(created.id, created.data());

  if (!profile) {
    throw new Error("Conversation profile was created with an invalid shape.");
  }

  return profile;
}

export async function updateConversationProfile(
  uid: string,
  id: string,
  patch: ConversationProfilePatch,
): Promise<ConversationProfile> {
  if (!isConversationProfileId(id)) {
    throw new ConversationProfileError("השיחה שבחרת לא תקינה.", 400);
  }

  const firestore = (await getFirestore()) as unknown as Firestore;
  const profileRef = profilesCollection(firestore, uid).doc(id);
  const updates: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (patch.label !== undefined) {
    updates.label = normalizeConversationLabel(patch.label);
  }

  if (patch.context !== undefined) {
    updates.context = normalizeConversationContext(patch.context);
  }

  if (patch.tone !== undefined) {
    updates.tone = normalizeConversationTone(patch.tone);
  }

  if (patch.markUsed === true) {
    updates.lastUsedAt = FieldValue.serverTimestamp();
    updates.usageCount = FieldValue.increment(1);
  }

  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(profileRef);

    if (!snapshot.exists) {
      throw new ConversationProfileError("השיחה השמורה כבר לא קיימת.", 404);
    }

    transaction.update(profileRef, updates);
  });

  const updated = await profileRef.get();
  const profile = parseStoredProfile(updated.id, updated.data());

  if (!profile) {
    throw new Error("Conversation profile was updated with an invalid shape.");
  }

  return profile;
}

export async function deleteConversationProfile(uid: string, id: string): Promise<void> {
  if (!isConversationProfileId(id)) {
    throw new ConversationProfileError("השיחה שבחרת לא תקינה.", 400);
  }

  const firestore = (await getFirestore()) as unknown as Firestore;
  const ownerRef = firestore.collection("conversation_profiles").doc(uid);
  const profileRef = ownerRef.collection("items").doc(id);

  await firestore.runTransaction(async (transaction) => {
    const [ownerSnapshot, profileSnapshot] = await Promise.all([
      transaction.get(ownerRef),
      transaction.get(profileRef),
    ]);

    if (!profileSnapshot.exists) {
      throw new ConversationProfileError("השיחה השמורה כבר לא קיימת.", 404);
    }

    transaction.delete(profileRef);
    transaction.set(
      ownerRef,
      {
        version: CONVERSATION_PROFILE_VERSION,
        profileCount: Math.max(readNonNegativeInteger(ownerSnapshot.data()?.profileCount) - 1, 0),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });
}

function profilesCollection(firestore: Firestore, uid: string) {
  return firestore.collection("conversation_profiles").doc(uid).collection("items");
}

function parseStoredProfile(id: string, value: unknown): ConversationProfile | null {
  if (!isConversationProfileId(id) || !value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const stored = value as StoredConversationProfile;
  const label = typeof stored.label === "string" ? stored.label.trim() : "";
  const context = stored.context === null ? null : stored.context;

  if (
    stored.version !== CONVERSATION_PROFILE_VERSION ||
    label.length < 1 ||
    label.length > MAX_CONVERSATION_LABEL_LENGTH ||
    (context !== null && !safeContext(context)) ||
    !safeTone(stored.tone)
  ) {
    return null;
  }

  const createdAt = timestampToIso(stored.createdAt);
  const updatedAt = timestampToIso(stored.updatedAt);
  const lastUsedAt = timestampToIso(stored.lastUsedAt);

  if (!createdAt || !updatedAt || !lastUsedAt) {
    return null;
  }

  return {
    id,
    version: CONVERSATION_PROFILE_VERSION,
    label,
    context: context as ContextOption | null,
    tone: stored.tone,
    createdAt,
    updatedAt,
    lastUsedAt,
    usageCount: readNonNegativeInteger(stored.usageCount),
  };
}

function safeContext(value: unknown): value is ContextOption {
  try {
    return normalizeConversationContext(value) !== null;
  } catch {
    return false;
  }
}

function safeTone(value: unknown): value is ToneOption {
  try {
    normalizeConversationTone(value);
    return true;
  } catch {
    return false;
  }
}

function timestampToIso(value: unknown) {
  if (!value || typeof value !== "object" || !("toDate" in value)) {
    return null;
  }

  try {
    const date = (value as Timestamp).toDate();
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  } catch {
    return null;
  }
}

function readNonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}
