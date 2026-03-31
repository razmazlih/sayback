import { initializeApp, type FirebaseApp, getApps } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

class FirebaseClientConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FirebaseClientConfigError";
  }
}

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim(),
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim(),
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim(),
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim(),
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

export function isFirebaseClientConfigured() {
  return Object.values(config).every((value) => Boolean(value));
}

export function getFirebaseClientAuth() {
  if (auth) {
    return auth;
  }

  if (!isFirebaseClientConfigured()) {
    throw new FirebaseClientConfigError(
      "Firebase client configuration is incomplete. Set NEXT_PUBLIC_FIREBASE_* variables.",
    );
  }

  app =
    app ??
    (getApps().length > 0
      ? getApps()[0]!
      : initializeApp({
          apiKey: config.apiKey,
          authDomain: config.authDomain,
          projectId: config.projectId,
          appId: config.appId,
        }));

  auth = getAuth(app);
  return auth;
}

export { FirebaseClientConfigError };
