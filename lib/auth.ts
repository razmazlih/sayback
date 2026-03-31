import { getAdminAuth } from "@/lib/firebase-admin";

export class UnauthorizedError extends Error {
  readonly status = 401;

  constructor(message = "Authentication is required.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export type AuthenticatedUser = {
  uid: string;
  email: string | null;
};

export async function requireAuthenticatedUser(
  request: Request,
): Promise<AuthenticatedUser> {
  const authorizationHeader = request.headers.get("authorization");

  if (!authorizationHeader?.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing Firebase bearer token.");
  }

  const idToken = authorizationHeader.slice("Bearer ".length).trim();

  if (!idToken) {
    throw new UnauthorizedError("Missing Firebase bearer token.");
  }

  const adminAuth = await getAdminAuth();

  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const uid = readString(decodedToken.uid);

    if (!uid) {
      throw new UnauthorizedError("Firebase token did not include a valid uid.");
    }

    return {
      uid,
      email: readString(decodedToken.email),
    };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      throw error;
    }

    throw new UnauthorizedError("Unable to verify Firebase token.");
  }
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
