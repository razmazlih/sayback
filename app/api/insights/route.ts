import { InsightsAccessError, loadVisitorInsights, requireInsightsViewer } from "@/lib/visitor-insights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  Vary: "Authorization",
};

export async function GET(request: Request) {
  try {
    await requireInsightsViewer(request);
    const days = new URL(request.url).searchParams.get("days") ?? "7";
    if (days !== "7" && days !== "30") {
      return json({ available: false, code: "INSIGHTS_INVALID_RANGE", error: "אפשר לבחור טווח של 7 או 30 ימים." }, 400);
    }
    return json(await loadVisitorInsights(days === "7" ? 7 : 30), 200);
  } catch (error) {
    if (error instanceof InsightsAccessError) {
      return json({ available: false, code: error.code, error: error.message }, error.status);
    }
    // Never echo database errors, credentials, or request identifiers to clients.
    console.error("Visitor insights unavailable");
    return json({ available: false, code: "INSIGHTS_UNAVAILABLE", error: "נתוני האתר לא זמינים כרגע. נסו שוב בהמשך." }, 503);
  }
}

function json(body: unknown, status: number) {
  return Response.json(body, { status, headers: HEADERS });
}
