import { getFirestore } from "@/lib/firebase-admin";
import { createVisitorAccountLink } from "@/lib/visitor-account-link";
import { isValidVisitorIdentifier } from "@/lib/visitor-identity";

const VISITOR_ACCOUNT_LINKS_COLLECTION = "visitor_account_links";

type LinkFirestore = {
  collection: (path: string) => { doc: (id: string) => unknown };
  runTransaction: <T>(
    updateFunction: (transaction: {
      get: (ref: unknown) => Promise<{ exists: boolean }>;
      set: (ref: unknown, data: unknown) => void;
    }) => Promise<T>,
  ) => Promise<T>;
};

export async function linkVisitorToUser(visitorId: string, userId: string) {
  const normalizedUserId = userId.trim();

  if (!isValidVisitorIdentifier(visitorId) || !normalizedUserId) {
    throw new Error("A valid visitor and user identifier are required.");
  }

  const link = createVisitorAccountLink(visitorId, normalizedUserId);
  const firestore = (await getFirestore()) as LinkFirestore;
  const ref = firestore.collection(VISITOR_ACCOUNT_LINKS_COLLECTION).doc(link.id);

  return firestore.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);

    if (existing.exists) {
      return false;
    }

    transaction.set(ref, link.document);
    return true;
  });
}
