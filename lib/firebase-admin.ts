type FirebaseCredential = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

type FirebaseAdminCache = {
  app?: unknown;
  auth?: unknown;
  firestore?: unknown;
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

  const moduleName = "firebase-admin/app";
  const adminAppModule = (await import(moduleName)) as {
    cert: (credential: FirebaseCredential) => unknown;
    getApps: () => unknown[];
    initializeApp: (options: { credential: unknown; projectId: string }) => unknown;
  };

  const existingApp = adminAppModule.getApps()[0];

  if (existingApp) {
    cache.app = existingApp;
    return existingApp;
  }

  const credential = readFirebaseCredential();

  cache.app = adminAppModule.initializeApp({
    credential: adminAppModule.cert(credential),
    projectId: credential.projectId,
  });

  return cache.app;
}

export async function getAdminAuth() {
  const cache = getCache();

  if (cache.auth) {
    return cache.auth as {
      verifyIdToken: (token: string) => Promise<Record<string, unknown>>;
    };
  }

  const moduleName = "firebase-admin/auth";
  const authModule = (await import(moduleName)) as {
    getAuth: (app?: unknown) => unknown;
  };

  cache.auth = authModule.getAuth(await getFirebaseAdminApp());
  return cache.auth as {
    verifyIdToken: (token: string) => Promise<Record<string, unknown>>;
  };
}

export async function getFirestore() {
  const cache = getCache();

  if (cache.firestore) {
    return cache.firestore as {
      collection: (path: string) => unknown;
      runTransaction: <T>(
        updateFunction: (transaction: {
          get: (ref: unknown) => Promise<{ exists: boolean; data: () => unknown }>;
          set: (ref: unknown, data: unknown, options?: unknown) => void;
          update: (ref: unknown, data: unknown) => void;
        }) => Promise<T>,
      ) => Promise<T>;
    };
  }

  const moduleName = "firebase-admin/firestore";
  const firestoreModule = (await import(moduleName)) as {
    getFirestore: (app?: unknown) => unknown;
  };

  cache.firestore = firestoreModule.getFirestore(await getFirebaseAdminApp());
  return cache.firestore as {
    collection: (path: string) => unknown;
    runTransaction: <T>(
      updateFunction: (transaction: {
        get: (ref: unknown) => Promise<{ exists: boolean; data: () => unknown }>;
        set: (ref: unknown, data: unknown, options?: unknown) => void;
        update: (ref: unknown, data: unknown) => void;
      }) => Promise<T>,
    ) => Promise<T>;
  };
}
