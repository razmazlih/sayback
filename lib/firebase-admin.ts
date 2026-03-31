import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore as getAdminFirestore, type Firestore } from "firebase-admin/firestore";

type FirebaseCredential = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

type AdminAuth = {
  verifyIdToken: (token: string) => Promise<Record<string, unknown>>;
};

type AdminFirestore = {
  collection: (path: string) => unknown;
  runTransaction: <T>(
    updateFunction: (transaction: {
      get: (ref: unknown) => Promise<{ exists: boolean; data: () => unknown }>;
      set: (ref: unknown, data: unknown, options?: unknown) => void;
      update: (ref: unknown, data: unknown) => void;
    }) => Promise<T>,
  ) => Promise<T>;
};

type FirebaseAdminCache = {
  app?: App;
  auth?: Auth;
  firestore?: Firestore;
};

const globalCache = globalThis as typeof globalThis & {
  __saybackFirebaseAdmin?: FirebaseAdminCache;
};

function getCache() {
  if (!globalCache.__saybackFirebaseAdmin) {
    globalCache.__saybackFirebaseAdmin = {};
  }

  return globalCache.__saybackFirebaseAdmin;
}

function readFirebaseCredential(): FirebaseCredential {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();

  if (serviceAccountJson) {
    const parsed = JSON.parse(serviceAccountJson) as Partial<FirebaseCredential>;

    if (
      typeof parsed.projectId === "string" &&
      typeof parsed.clientEmail === "string" &&
      typeof parsed.privateKey === "string"
    ) {
      return {
        projectId: parsed.projectId,
        clientEmail: parsed.clientEmail,
        privateKey: parsed.privateKey,
      };
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase Admin credentials are not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.",
    );
  }

  return {
    projectId,
    clientEmail,
    privateKey,
  };
}

export async function getFirebaseAdminApp() {
  const cache = getCache();

  if (cache.app) {
    return cache.app;
  }

  const existingApp = getApps()[0];

  if (existingApp) {
    cache.app = existingApp;
    return existingApp;
  }

  const credential = readFirebaseCredential();

  cache.app = initializeApp({
    credential: cert(credential),
    projectId: credential.projectId,
  });

  return cache.app;
}

export async function getAdminAuth(): Promise<AdminAuth> {
  const cache = getCache();

  if (cache.auth) {
    return cache.auth as AdminAuth;
  }

  cache.auth = getAuth(await getFirebaseAdminApp());
  return cache.auth as AdminAuth;
}

export async function getFirestore(): Promise<AdminFirestore> {
  const cache = getCache();

  if (cache.firestore) {
    return cache.firestore as AdminFirestore;
  }

  cache.firestore = getAdminFirestore(await getFirebaseAdminApp());
  return cache.firestore as AdminFirestore;
}
