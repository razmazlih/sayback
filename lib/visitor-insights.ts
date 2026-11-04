import "server-only";

import type { Auth } from "firebase-admin/auth";
import { getAdminAuth, getFirestore } from "@/lib/firebase-admin";
import { CLIENT_PRODUCT_EVENT_NAMES, SERVER_PRODUCT_EVENT_NAMES } from "@/lib/product-events";

export const INSIGHTS_EVENT_LIMIT = 1000;
const SOURCES = ["instagram", "tiktok", "facebook", "google", "direct_or_unknown", "other_campaign"] as const;
const CLIENT_EVENTS = new Set<string>(CLIENT_PRODUCT_EVENT_NAMES);
const SERVER_EVENTS = new Set<string>(SERVER_PRODUCT_EVENT_NAMES);
export type InsightSource = (typeof SOURCES)[number];
export type InsightsDays = 7 | 30;
export type VisitorInsights = {
  available: true;
  generatedAt: string;
  period: { days: InsightsDays; start: string; end: string; timeZone: "UTC" };
  sample: { limit: number; scannedEvents: number; includedEvents: number; truncated: boolean };
  totals: {
    pageViews: number; visitors: number; generations: number; generatingUsers: number;
    copies: number; copyingUsers: number; returningUsers: number;
  };
  daily: Array<{ date: string; pageViews: number; visitors: number; generations: number; copies: number }>;
  sources: Array<{ source: InsightSource; pageViews: number; visitors: number }>;
};

export class InsightsAccessError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "InsightsAccessError";
  }
}

/** A separate, empty-by-default audience; ordinary authenticated users are not admins. */
export async function requireInsightsViewer(request: Request): Promise<void> {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const unauthenticated = () => new InsightsAccessError(401, "INSIGHTS_UNAUTHENTICATED", "צריך להתחבר לחשבון מאושר כדי לצפות בנתונים.");
  if (!token) throw unauthenticated();
  const viewers = new Set((process.env.ANALYTICS_VIEWER_UIDS ?? "").split(",").map((uid) => uid.trim()).filter(Boolean));
  if (viewers.size === 0) {
    throw new InsightsAccessError(403, "INSIGHTS_NOT_CONFIGURED", "הגישה לנתוני האתר עדיין לא הוגדרה.");
  }

  const auth = await getAdminAuth() as Pick<Auth, "verifyIdToken">;
  let decoded;
  try {
    // Revocation checking also rejects disabled accounts.
    decoded = await auth.verifyIdToken(token, true);
  } catch {
    throw unauthenticated();
  }
  if (!decoded.uid || !decoded.firebase?.sign_in_provider || decoded.firebase.sign_in_provider === "anonymous") {
    throw unauthenticated();
  }
  if (!viewers.has(decoded.uid)) {
    throw new InsightsAccessError(403, "INSIGHTS_FORBIDDEN", "החשבון הזה אינו מורשה לצפות בנתוני האתר.");
  }
}

export function insightsPeriod(days: InsightsDays, now = new Date()) {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - days + 1);
  return { days, start: start.toISOString(), end: now.toISOString(), timeZone: "UTC" as const };
}

type Query = {
  where(field: string, operator: ">=" | "<=", value: number): Query;
  orderBy(field: string, direction: "desc"): Query;
  select(...fields: string[]): Query;
  limit(count: number): Query;
  get(): Promise<{ docs: Array<{ data(): unknown }> }>;
};

/** One bounded read, no raw events or identifiers leave this server module. */
export async function loadVisitorInsights(days: InsightsDays, now = new Date()): Promise<VisitorInsights> {
  const period = insightsPeriod(days, now);
  const firestore = await getFirestore() as unknown as { collection(path: string): Query };
  const snapshot = await firestore.collection("product_events")
    .where("occurredAtMs", ">=", Date.parse(period.start))
    .where("occurredAtMs", "<=", Date.parse(period.end))
    .orderBy("occurredAtMs", "desc")
    .select("eventName", "source", "uid", "visitorId", "occurredAtMs", "isReturning", "attribution.firstTouch")
    .limit(INSIGHTS_EVENT_LIMIT + 1)
    .get();
  return aggregateVisitorInsights(snapshot.docs.slice(0, INSIGHTS_EVENT_LIMIT).map((doc) => doc.data()), {
    days, now, truncated: snapshot.docs.length > INSIGHTS_EVENT_LIMIT,
  });
}

export function aggregateVisitorInsights(
  records: unknown[],
  options: { days: InsightsDays; now: Date; truncated?: boolean },
): VisitorInsights {
  const period = insightsPeriod(options.days, options.now);
  const start = Date.parse(period.start);
  const end = Date.parse(period.end);
  const visitors = new Set<string>();
  const generatingUsers = new Set<string>();
  const copyingUsers = new Set<string>();
  const returningUsers = new Set<string>();
  const daily = Array.from({ length: options.days }, (_, index) => ({
    date: new Date(start + index * 86_400_000).toISOString().slice(0, 10),
    pageViews: 0, visitors: new Set<string>(), generations: 0, copies: 0,
  }));
  const sources = SOURCES.map((source) => ({ source, pageViews: 0, visitors: new Set<string>() }));
  let pageViews = 0;
  let generations = 0;
  let copies = 0;
  let includedEvents = 0;

  for (const raw of records.slice(0, INSIGHTS_EVENT_LIMIT)) {
    const event = record(raw);
    if (!event || typeof event.uid !== "string" || !event.uid.trim() ||
      typeof event.occurredAtMs !== "number" || !Number.isFinite(event.occurredAtMs) ||
      event.occurredAtMs < start || event.occurredAtMs > end ||
      typeof event.eventName !== "string" ||
      !(event.source === "client" && CLIENT_EVENTS.has(event.eventName) ||
        event.source === "server" && SERVER_EVENTS.has(event.eventName))) continue;
    const day = daily[Math.floor((event.occurredAtMs - start) / 86_400_000)];
    if (!day) continue;
    includedEvents += 1;
    if (event.isReturning === true) returningUsers.add(event.uid);
    if (event.eventName === "page_view_home" && event.source === "client") {
      const visitor = typeof event.visitorId === "string" && /^[a-f0-9]{32}$/.test(event.visitorId)
        ? `visitor:${event.visitorId}` : `uid:${event.uid}`;
      visitors.add(visitor);
      day.visitors.add(visitor);
      pageViews += 1;
      day.pageViews += 1;
      const source = sources.find((item) => item.source === sourceBucket(event.attribution))!;
      source.pageViews += 1;
      source.visitors.add(visitor);
    }
    if (event.eventName === "generation_success" && event.source === "server") {
      generations += 1;
      day.generations += 1;
      generatingUsers.add(event.uid);
    }
    if (event.eventName === "reply_copy" && event.source === "client") {
      copies += 1;
      day.copies += 1;
      copyingUsers.add(event.uid);
    }
  }
  return {
    available: true, generatedAt: options.now.toISOString(), period,
    sample: { limit: INSIGHTS_EVENT_LIMIT, scannedEvents: Math.min(records.length, INSIGHTS_EVENT_LIMIT), includedEvents,
      truncated: options.truncated === true || records.length > INSIGHTS_EVENT_LIMIT },
    totals: { pageViews, visitors: visitors.size, generations, generatingUsers: generatingUsers.size,
      copies, copyingUsers: copyingUsers.size, returningUsers: returningUsers.size },
    daily: daily.map((day) => ({ ...day, visitors: day.visitors.size })),
    sources: sources.map((source) => ({ ...source, visitors: source.visitors.size })),
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function sourceBucket(attribution: unknown): InsightSource {
  const touch = record(record(attribution)?.firstTouch);
  const source = typeof touch?.utm_source === "string" ? touch.utm_source.trim().toLowerCase() : "";
  if (["instagram", "ig", "instagram.com"].includes(source)) return "instagram";
  if (["tiktok", "tik_tok", "tiktok.com"].includes(source)) return "tiktok";
  if (["facebook", "fb", "facebook.com"].includes(source)) return "facebook";
  if (["google", "google.com"].includes(source)) return "google";
  return touch?.acquisitionSource === "campaign" || source ? "other_campaign" : "direct_or_unknown";
}
