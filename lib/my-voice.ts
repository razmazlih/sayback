import "server-only";

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { getFirestore } from "@/lib/firebase-admin";
import {
  applyMyVoiceSignal,
  deriveMyVoicePreferences,
  emptyMyVoiceCounters,
  sanitizeMyVoiceCounters,
} from "@/lib/my-voice-logic";
import {
  MY_VOICE_VERSION,
  type MyVoiceCounters,
  type MyVoicePreferences,
  type MyVoiceProfile,
  type MyVoiceSignal,
  type RefineSignalAction,
} from "@/lib/my-voice-types";
import { isRefineSignalAction } from "@/lib/my-voice-validation";

export async function recordMyVoiceSignal(uid: string, signal: MyVoiceSignal): Promise<MyVoiceProfile> {
  const firestore = (await getFirestore()) as unknown as Firestore;
  const ref = firestore.collection("my_voice").doc(uid);

  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.exists
      ? readStoredCounters(snapshot.data())
      : emptyMyVoiceCounters();
    const next = applyMyVoiceSignal(current, signal);
    const now = FieldValue.serverTimestamp();

    transaction.set(ref, {
      version: MY_VOICE_VERSION,
      ...next,
      createdAt: snapshot.exists ? snapshot.data()?.createdAt ?? now : now,
      updatedAt: now,
    });
  });

  const saved = await ref.get();
  const profile = parseMyVoiceProfile(saved.data());
  if (!profile) {
    throw new Error("My Voice profile was saved with an invalid shape.");
  }
  return profile;
}

export async function recordSuccessfulRefineSignal(
  uid: string,
  action: unknown,
): Promise<void> {
  if (!isRefineSignalAction(action)) {
    return;
  }

  await recordMyVoiceSignal(uid, { type: "refine_used", action });
}

export async function loadMyVoicePreferences(uid: string): Promise<MyVoicePreferences | null> {
  const firestore = (await getFirestore()) as unknown as Firestore;
  const snapshot = await firestore.collection("my_voice").doc(uid).get();
  if (!snapshot.exists) {
    return null;
  }

  const profile = parseMyVoiceProfile(snapshot.data());
  return profile ? deriveMyVoicePreferences(profile) : null;
}

export async function loadMyVoicePreferencesSafely(
  uid: string,
): Promise<MyVoicePreferences | null> {
  try {
    return await loadMyVoicePreferences(uid);
  } catch (error) {
    console.error("Failed to load My Voice preferences. Continuing without personalization.", error);
    return null;
  }
}

export async function deleteMyVoiceProfile(uid: string): Promise<void> {
  const firestore = (await getFirestore()) as unknown as Firestore;
  await firestore.collection("my_voice").doc(uid).delete();
}

export function parseMyVoiceProfile(value: unknown): MyVoiceProfile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const stored = value as Record<string, unknown>;
  if (stored.version !== MY_VOICE_VERSION) {
    return null;
  }

  const createdAt = timestampToIso(stored.createdAt);
  const updatedAt = timestampToIso(stored.updatedAt);
  if (!createdAt || !updatedAt) {
    return null;
  }

  return {
    version: MY_VOICE_VERSION,
    ...readStoredCounters(stored),
    createdAt,
    updatedAt,
  };
}

function readStoredCounters(value: unknown): MyVoiceCounters {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return emptyMyVoiceCounters();
  }
  return sanitizeMyVoiceCounters(value as Partial<MyVoiceCounters>);
}

function timestampToIso(value: unknown) {
  if (!value || typeof value !== "object" || !("toDate" in value)) {
    return null;
  }
  try {
    const date = (value as { toDate: () => Date }).toDate();
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  } catch {
    return null;
  }
}

export type { RefineSignalAction };
