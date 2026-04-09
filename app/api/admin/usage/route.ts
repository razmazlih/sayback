import { isLocalAdminRequest } from "@/lib/local-admin";
import { getLocalUsageLogs } from "@/lib/local-usage-logs";
import { listPersistedUsageLogs } from "@/lib/persisted-usage-logs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

export async function GET(request: Request) {
  if (!isLocalAdminRequest(request)) {
    return Response.json(
      {
        error: "לא נמצא.",
      },
      {
        status: 404,
        headers: NO_STORE_HEADERS,
      },
    );
  }

  const params = new URL(request.url).searchParams;
  const limit = parseLimit(params.get("limit"));

  try {
    const [localLogs, persistedLogs] = await Promise.all([
      Promise.resolve(getLocalUsageLogs()),
      listPersistedUsageLogs(limit),
    ]);

    return Response.json(
      {
        localLogs,
        persistedLogs,
      },
      {
        status: 200,
        headers: NO_STORE_HEADERS,
      },
    );
  } catch (error) {
    console.error("Failed to read admin usage logs", error);

    return Response.json(
      {
        error: "לא הצלחנו לטעון את יומן הפעילות כרגע.",
      },
      {
        status: 500,
        headers: NO_STORE_HEADERS,
      },
    );
  }
}

function parseLimit(value: string | null) {
  if (!value) {
    return 200;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 200;
  }

  return Math.max(1, Math.min(1000, Math.floor(parsed)));
}
