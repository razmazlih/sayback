import { AIRequestError, generateReplies } from "@/lib/ai";
import { requireAuthenticatedUser, UnauthorizedError } from "@/lib/auth";
import {
  consumeGenerationAccess,
  getBillingSnapshot,
  refundGenerationAccess,
} from "@/lib/billing";

export const runtime = "nodejs";

interface GenerateRequestBody {
  message?: string;
  imageBase64?: string;
  context?: string;
  tone?: string;
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
      return Response.json(
        {
          error: error.message,
        },
        {
          status: error.status,
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    return Response.json(
      {
        error: "Unable to verify Firebase token.",
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  try {
    const parsed = await request.json();

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return Response.json(
        {
          error: "Request body must be a JSON object.",
        },
        {
          status: 400,
        },
      );
    }

    body = parsed as GenerateRequestBody;
  } catch {
    return Response.json(
      {
        error: "Request body must be valid JSON.",
      },
      {
        status: 400,
      },
    );
  }

  try {
    if (!authenticatedUserUid) {
      throw new UnauthorizedError();
    }

    const access = await consumeGenerationAccess(authenticatedUserUid);

    if (!access.allowed) {
      return Response.json(
        {
          error: "No billing access is available for this account.",
          billing: access.snapshot,
        },
        {
          status: 402,
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    consumption = access.consumption;
    const result = await generateReplies(body);
    const billing = await getBillingSnapshot(authenticatedUserUid);

    return Response.json(
      {
        ...result,
        billing,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    if (authenticatedUserUid && consumption) {
      await refundGenerationAccess(authenticatedUserUid, consumption);
    }

    if (error instanceof UnauthorizedError) {
      return Response.json(
        {
          error: error.message,
        },
        {
          status: error.status,
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    if (error instanceof AIRequestError) {
      return Response.json(
        {
          error: error.message,
        },
        {
          status: error.status,
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    console.error("Unhandled generate route error", error);

    return Response.json(
      {
        error: "Unexpected server error.",
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
