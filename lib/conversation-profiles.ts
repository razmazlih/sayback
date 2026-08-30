import { FieldValue, type Firestore } from "firebase-admin/firestore";
import "server-only";
import { getFirestore } from "@/lib/firebase-admin";
import {
  type ContextOption,
  type ToneOption,
} from "@/lib/generator-options";
import {
  MAX_CONVERSATION_PROFILES,
  type ConversationProfile,
} from "@/lib/conversation-profile-types";
import {
  CONVERSATION_PROFILE_VERSION,
  parseStoredConversationProfile,
} from "@/lib/conversation-profile-parser";
import {
  ConversationProfileError,
  isConversationProfileId,
  normalizeConversationContext,
  normalizeConversationLabel,
  normalizeConversationLastIntent,
  normalizeConversationMemoryNote,
  normalizeConversationTone,
} from "@/lib/conversation-profile-validation";

export { ConversationProfileError } from "@/lib/conversation-profile-validation";

export { CONVERSATION_PROFILE_VERSION } from "@/lib/conversation-profile-parser";

export type ConversationProfileDefaults = {
  context: ContextOption | null;
  tone: ToneOption;
};

export type ConversationProfilePatch = Partial<ConversationProfileDefaults> & {
  label?: string;
  memoryNote?: string | null;
  markUsed?: boolean;
};

export async function listConversationProfiles(uid: string): Promise<ConversationProfile[]> {
  const firestore = (await getFirestore()) as unknown as Firestore;
  const snapshot = await profilesCollection(firestore, uid)
    .orderBy("lastUsedAt", "desc")
    .limit(MAX_CONVERSATION_PROFILES)
    .get();

  return snapshot.docs.flatMap((document) => {
    const profile = parseStoredConversationProfile(document.id, document.data());
    return profile ? [profile] : [];
  });
}

export async function createConversationProfile(
  uid: string,
  input: {
    label: unknown;
    context: unknown;
    tone: unknown;
    memoryNote?: unknown;
  },
): Promise<ConversationProfile> {
  const label = normalizeConversationLabel(input.label);
  const context = normalizeConversationContext(input.context);
  const tone = normalizeConversationTone(input.tone);
  const memoryNote = normalizeConversationMemoryNote(input.memoryNote);
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
      memoryNote,
      // Internal generation memory is never accepted from the client.
      lastIntent: null,
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
  const profile = parseStoredConversationProfile(created.id, created.data());

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

  if (patch.memoryNote !== undefined) {
    updates.memoryNote = normalizeConversationMemoryNote(patch.memoryNote);
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
  const profile = parseStoredConversationProfile(updated.id, updated.data());

  if (!profile) {
    throw new Error("Conversation profile was updated with an invalid shape.");
  }

  return profile;
}

export async function getConversationProfile(
  uid: string,
  id: string,
): Promise<ConversationProfile> {
  if (!isConversationProfileId(id)) {
    throw new ConversationProfileError("השיחה שבחרת לא תקינה.", 400);
  }

  const firestore = (await getFirestore()) as unknown as Firestore;
  const snapshot = await profilesCollection(firestore, uid).doc(id).get();
  const profile = snapshot.exists
    ? parseStoredConversationProfile(snapshot.id, snapshot.data())
    : null;

  if (!profile) {
    throw new ConversationProfileError("השיחה השמורה כבר לא קיימת.", 404);
  }
  return profile;
}

/**
 * Resolve optional saved context without making personalization a dependency
 * of core generation. Invalid ids remain request errors; missing, foreign,
 * deleted, malformed, or temporarily unavailable profiles safely become null.
 */
export async function getConversationProfileSafely(
  uid: string,
  id: string,
): Promise<ConversationProfile | null> {
  if (!isConversationProfileId(id)) {
    throw new ConversationProfileError("השיחה שבחרת לא תקינה.", 400);
  }

  try {
    return await getConversationProfile(uid, id);
  } catch (error) {
    if (error instanceof ConversationProfileError && error.status === 400) {
      throw error;
    }

    if (!(error instanceof ConversationProfileError && error.status === 404)) {
      console.error("Failed to load saved conversation. Continuing without saved context.", error);
    }
    return null;
  }
}

export async function updateConversationProfileAfterGeneration(
  uid: string,
  id: string,
  input: { lastIntent: unknown; context?: unknown; tone?: unknown },
): Promise<void> {
  if (!isConversationProfileId(id)) {
    throw new ConversationProfileError("השיחה שבחרת לא תקינה.", 400);
  }

  const lastIntent = normalizeConversationLastIntent(input.lastIntent);
  if (!lastIntent) {
    throw new ConversationProfileError("התקציר האחרון של השיחה אינו תקין.", 400);
  }

  const updates: Record<string, unknown> = {
    lastIntent,
    lastUsedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    usageCount: FieldValue.increment(1),
  };
  if (input.context !== undefined) {
    updates.context = normalizeConversationContext(input.context);
  }
  if (input.tone !== undefined) {
    updates.tone = normalizeConversationTone(input.tone);
  }

  const firestore = (await getFirestore()) as unknown as Firestore;
  const profileRef = profilesCollection(firestore, uid).doc(id);
  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(profileRef);
    if (!snapshot.exists) {
      throw new ConversationProfileError("השיחה השמורה כבר לא קיימת.", 404);
    }
    transaction.update(profileRef, updates);
  });
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

export async function clearConversationProfiles(uid: string): Promise<void> {
  const firestore = (await getFirestore()) as unknown as Firestore;
  const ownerRef = firestore.collection("conversation_profiles").doc(uid);

  // recursiveDelete removes the exact authenticated owner's document and all
  // nested items. Deleting only the parent would leave orphaned subcollection data.
  await firestore.recursiveDelete(ownerRef);
}

function profilesCollection(firestore: Firestore, uid: string) {
  return firestore.collection("conversation_profiles").doc(uid).collection("items");
}

function readNonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}
