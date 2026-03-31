import { AIRequestError, generateReplies } from "@/lib/ai";
import { requireAuthenticatedUser, UnauthorizedError } from "@/lib/auth";
import {
  consumeGenerationAccess,
  getBillingSnapshot,
  refundGenerationAccess,
} from "@/lib/billing";

export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
} as const;
const JSON_CONTENT_TYPE = "application/json";

interface GenerateRequestBody {
  message?: string;
  imageBase64?: string;
  context?: string;
  tone?: string;
  continuePreference?: string | null;
  refineInstruction?: string;
  action?: string;
  sourceReply?: string;
}

export async function POST(request: Request) {
  let body: GenerateRequestBody;
  let authenticatedUserUid: string | null = null;
  let consumption: "initial_free" | "daily_free" | "credits" | "unlimited" | null = null;

  try {
    const authenticatedUser = await requireAuthenticatedUser(request);
    authenticatedUserUid = authenticatedUser.uid;
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return noStoreJson(
        {
          error: error.message,
        },
        error.status,
      );
    }

    return noStoreJson(
      {
        error: "Unable to verify Firebase token.",
      },
      500,
    );
  }

  if (!hasJsonContentType(request)) {
    return noStoreJson(
      {
        error: "Content-Type must be application/json.",
      },
      415,
    );
  }

  try {
    const parsed = await request.json();

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return noStoreJson(
        {
          error: "Request body must be a JSON object.",
        },
        400,
      );
    }

    body = parsed as GenerateRequestBody;
  } catch {
    return noStoreJson(
      {
        error: "Request body must be valid JSON.",
      },
      400,
    );
  }

  try {
    if (!authenticatedUserUid) {
      throw new UnauthorizedError();
    }

    const access = await consumeGenerationAccess(authenticatedUserUid);

    if (!access.allowed) {
      return noStoreJson(
        {
          error: "No billing access is available for this account.",
          billing: access.snapshot,
        },
        402,
      );
    }

    consumption = access.consumption;
    const result = await generateReplies(body);
    const billing = await getBillingSnapshot(authenticatedUserUid);

    return noStoreJson(
      {
        ...result,
        billing,
      },
      200,
    );
  } catch (error) {
    if (authenticatedUserUid && consumption) {
      await refundGenerationAccess(authenticatedUserUid, consumption);
    }

    if (error instanceof UnauthorizedError) {
      return noStoreJson(
        {
          error: error.message,
        },
        error.status,
      );
    }

    if (error instanceof AIRequestError) {
      return noStoreJson(
        {
          error: error.message,
        },
        error.status,
      );
    }

    console.error("Unhandled generate route error", error);

    return noStoreJson(
      {
        error: "Unexpected server error.",
      },
      500,
    );
  }
}

function hasJsonContentType(request: Request) {
  const contentType = request.headers.get("content-type");
  return typeof contentType === "string" && contentType.toLowerCase().includes(JSON_CONTENT_TYPE);
}

function noStoreJson(body: Record<string, unknown>, status: number) {
  return Response.json(body, {
    status,
    headers: NO_STORE_HEADERS,
  });
}
