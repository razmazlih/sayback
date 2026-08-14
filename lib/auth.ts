import { getAdminAuth } from "@/lib/firebase-admin";

export class UnauthorizedError extends Error {
  readonly status = 401;

  constructor(message = "צריך להתחבר כדי להמשיך.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export type AuthenticatedUser = {
  uid: string;
  email: string | null;
  isAnonymous: boolean;
};

export async function requireAuthenticatedUser(
  request: Request,
): Promise<AuthenticatedUser> {
  const authorizationHeader = request.headers.get("authorization");

  if (!authorizationHeader?.startsWith("Bearer ")) {
    throw new UnauthorizedError("צריך להתחבר כדי להמשיך.");
  }

  const idToken = authorizationHeader.slice("Bearer ".length).trim();

  if (!idToken) {
    throw new UnauthorizedError("צריך להתחבר כדי להמשיך.");
  }

  const adminAuth = await getAdminAuth();

  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const uid = readString(decodedToken.uid);

    if (!uid) {
      throw new UnauthorizedError("האימות נכשל. נסו להתחבר שוב.");
    }

    return {
      uid,
      email: readString(decodedToken.email),
      isAnonymous: readSignInProvider(decodedToken) === "anonymous",
    };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      throw error;
    }

    throw new UnauthorizedError("לא הצלחנו לאמת את ההתחברות. נסו שוב.");
  }
}

function readSignInProvider(decodedToken: Record<string, unknown>) {
  const firebase = decodedToken.firebase;

  if (!firebase || typeof firebase !== "object") {
    return null;
  }

  return readString((firebase as Record<string, unknown>).sign_in_provider);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
