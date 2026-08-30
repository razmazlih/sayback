import "server-only";

import { createHash } from "node:crypto";
import { getFirestore } from "@/lib/firebase-admin";
import {
  ATTRIBUTION_VERSION,
  normalizeAttributionState,
  type AttributionState,
} from "@/lib/attribution";

export const CLIENT_PRODUCT_EVENT_NAMES = [
  "page_view_home",
  "generator_input_start",
  "reply_copy",
  "conversation_selected",
  "paywall_view",
] as const;
export type ClientProductEventName = (typeof CLIENT_PRODUCT_EVENT_NAMES)[number];
export const SERVER_PRODUCT_EVENT_NAMES = [
  "generation_success",
  "return_use",
  "conversation_profile_created",
  "refine_used",
  "checkout_started",
  "credits_purchase",
  "subscription_started",
  "subscription_renewed",
  "subscription_canceled",
] as const;
export type ServerProductEventName = (typeof SERVER_PRODUCT_EVENT_NAMES)[number];
export type ProductEventName = ClientProductEventName | ServerProductEventName;

export type ProductEventMetadata = Record<string, string | number | boolean | null>;

export type ProductEventEntry = {
  id: string;
  schemaVersion: 1;
  eventName: ProductEventName;
  source: "client" | "server";
  uid: string;
  visitorId: string | null;
  sessionId: string | null;
  dedupeKey: string;
  occurredAt: string;
  occurredAtMs: number;
  activeDateUtc: string;
  isReturning: boolean;
  metadata: ProductEventMetadata;
  attribution: AttributionState;
};

export type ClientProductEventRequest = {
  eventName: ClientProductEventName;
  dedupeKey: string;
  metadata: ProductEventMetadata;
  attribution: AttributionState | null;
};

type FirestoreSnapshot = { exists: boolean; data: () => unknown };
type FirestoreRef = { id?: string };
export type ProductEventsFirestore = {
  collection: (path: string) => {
    doc: (id: string) => FirestoreRef;
    orderBy?: (field: string, direction: "asc" | "desc") => {
      limit: (count: number) => { get: () => Promise<{ docs: Array<{ id: string; data: () => unknown }> }> };
    };
  };
  runTransaction: <T>(callback: (transaction: {
    get: (ref: FirestoreRef) => Promise<FirestoreSnapshot>;
    set: (ref: FirestoreRef, data: unknown, options?: unknown) => void;
  }) => Promise<T>) => Promise<T>;
};

const EVENT_NAME_SET = new Set<string>(CLIENT_PRODUCT_EVENT_NAMES);
const PRODUCT_EVENT_NAME_SET = new Set<string>([
  ...CLIENT_PRODUCT_EVENT_NAMES,
  ...SERVER_PRODUCT_EVENT_NAMES,
]);
const DEDUPE_KEY_PATTERN = /^[A-Za-z0-9:_-]{12,120}$/;
const MAX_METADATA_KEYS = 16;
const MAX_METADATA_STRING_LENGTH = 100;
const METADATA_KEYS: Record<ClientProductEventName, ReadonlySet<string>> = {
  page_view_home: new Set(["flow_version"]),
  generator_input_start: new Set(["source", "compose_mode", "flow_version"]),
  reply_copy: new Set(["index", "context", "tone", "has_saved_conversation", "has_personalization"]),
  conversation_selected: new Set([
    "compose_mode", "context", "tone", "profile_count", "locked_context", "locked_tone",
  ]),
  paywall_view: new Set(["used", "remaining", "daily_remaining", "access_state"]),
};

export class ProductEventValidationError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = "ProductEventValidationError";
  }
}

export function normalizeClientProductEventRequest(value: unknown): ClientProductEventRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProductEventValidationError("אירוע המדידה לא תקין.");
  }
  const body = value as Record<string, unknown>;
  if (typeof body.eventName !== "string" || !EVENT_NAME_SET.has(body.eventName)) {
    throw new ProductEventValidationError("סוג אירוע המדידה לא נתמך.");
  }
  const eventName = body.eventName as ClientProductEventName;
  if (typeof body.dedupeKey !== "string" || !DEDUPE_KEY_PATTERN.test(body.dedupeKey)) {
    throw new ProductEventValidationError("מזהה אירוע המדידה לא תקין.");
  }

  return {
    eventName,
    dedupeKey: body.dedupeKey,
    metadata: sanitizeEventMetadata(eventName, body.metadata),
    attribution: body.attribution == null ? null : normalizeAttributionState(body.attribution),
  };
}

export function sanitizeEventMetadata(
  eventName: ClientProductEventName,
  value: unknown,
): ProductEventMetadata {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new ProductEventValidationError("נתוני אירוע המדידה לא תקינים.");
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > MAX_METADATA_KEYS) {
    throw new ProductEventValidationError("אירוע המדידה כולל יותר מדי שדות.");
  }

  const allowed = METADATA_KEYS[eventName];
  const metadata: ProductEventMetadata = {};
  for (const [key, rawValue] of entries) {
    if (!allowed.has(key)) continue;
    if (rawValue === null || typeof rawValue === "boolean") metadata[key] = rawValue;
    else if (typeof rawValue === "number" && Number.isFinite(rawValue)) metadata[key] = rawValue;
    else if (typeof rawValue === "string") {
      metadata[key] = rawValue
        .replace(/[\u0000-\u001F\u007F]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, MAX_METADATA_STRING_LENGTH);
    }
  }
  return metadata;
}

export async function recordClientProductEvent(params: {
  uid: string;
  visitorId: string | null;
  sessionId: string | null;
  request: ClientProductEventRequest;
  now?: Date;
}) {
  const firestore = (await getFirestore()) as ProductEventsFirestore;
  return persistClientProductEvent(firestore, params);
}

/** Server events are emitted only after a verified product/billing action. */
export async function recordServerProductEvent(params: {
  uid: string;
  eventName: ServerProductEventName;
  dedupeKey: string;
  metadata?: ProductEventMetadata;
  now?: Date;
}) {
  const firestore = (await getFirestore()) as ProductEventsFirestore;
  const uid = params.uid.trim();
  if (!uid) return;
  const now = params.now ?? new Date();
  const occurredAt = now.toISOString();
  const activeDateUtc = occurredAt.slice(0, 10);
  const eventRef = firestore.collection("product_events").doc(
    buildProductEventDocumentId(uid, `server:${params.dedupeKey}`),
  );
  const attributionRef = firestore.collection("growth_attribution").doc(uid);
  const userRef = firestore.collection("growth_users").doc(uid);
  await firestore.runTransaction(async (transaction) => {
    const [eventSnapshot, attributionSnapshot, userSnapshot] = await Promise.all([
      transaction.get(eventRef), transaction.get(attributionRef), transaction.get(userRef),
    ]);
    if (eventSnapshot.exists) return;
    const storedAttribution = normalizeAttributionDocument(attributionSnapshot.data());
    const attribution = storedAttribution ?? mergeServerAttribution(null, null, occurredAt);
    const priorUser = (userSnapshot.data() ?? {}) as Record<string, unknown>;
    const priorActiveDate = readString(priorUser.lastActiveDateUtc);
    const isReturning = Boolean(priorActiveDate && priorActiveDate < activeDateUtc);
    const metadata = sanitizeServerEventMetadata(params.metadata ?? {});
    transaction.set(eventRef, {
      schemaVersion: 1,
      eventName: params.eventName,
      source: "server",
      uid,
      visitorId: null,
      sessionId: null,
      dedupeKey: params.dedupeKey,
      occurredAt,
      occurredAtMs: now.getTime(),
      activeDateUtc,
      isReturning,
      metadata,
      attribution,
    });
    transaction.set(userRef, {
      schemaVersion: 1, uid,
      firstSeenAt: readString(priorUser.firstSeenAt) ?? occurredAt,
      firstActiveDateUtc: readString(priorUser.firstActiveDateUtc) ?? activeDateUtc,
      lastSeenAt: occurredAt, lastActiveDateUtc: activeDateUtc,
      isReturning: priorUser.isReturning === true || isReturning,
      updatedAt: occurredAt,
    }, { merge: true });
  });
}

export async function persistClientProductEvent(
  firestore: ProductEventsFirestore,
  params: {
    uid: string;
    visitorId: string | null;
    sessionId: string | null;
    request: ClientProductEventRequest;
    now?: Date;
  },
): Promise<{ duplicate: boolean; isReturning: boolean }> {
  const uid = params.uid.trim();
  if (!uid) throw new ProductEventValidationError("זהות המשתמש חסרה.");
  const now = params.now ?? new Date();
  const occurredAt = now.toISOString();
  const activeDateUtc = occurredAt.slice(0, 10);
  const documentId = buildProductEventDocumentId(uid, params.request.dedupeKey);
  const eventRef = firestore.collection("product_events").doc(documentId);
  const attributionRef = firestore.collection("growth_attribution").doc(uid);
  const userRef = firestore.collection("growth_users").doc(uid);

  return firestore.runTransaction(async (transaction) => {
    const [eventSnapshot, attributionSnapshot, userSnapshot] = await Promise.all([
      transaction.get(eventRef), transaction.get(attributionRef), transaction.get(userRef),
    ]);
    if (eventSnapshot.exists) {
      const existing = (eventSnapshot.data() ?? {}) as { isReturning?: unknown };
      return { duplicate: true, isReturning: existing.isReturning === true };
    }

    const storedAttribution = normalizeAttributionDocument(attributionSnapshot.data());
    const attribution = mergeServerAttribution(storedAttribution, params.request.attribution, occurredAt);
    const priorUser = (userSnapshot.data() ?? {}) as Record<string, unknown>;
    const priorActiveDate = readString(priorUser.lastActiveDateUtc);
    const isReturning = Boolean(priorActiveDate && priorActiveDate < activeDateUtc);
    const event: Omit<ProductEventEntry, "id"> = {
      schemaVersion: 1,
      eventName: params.request.eventName,
      source: "client",
      uid,
      visitorId: normalizeIdentifier(params.visitorId),
      sessionId: normalizeIdentifier(params.sessionId),
      dedupeKey: params.request.dedupeKey,
      occurredAt,
      occurredAtMs: now.getTime(),
      activeDateUtc,
      isReturning,
      metadata: params.request.metadata,
      attribution,
    };

    transaction.set(eventRef, event);
    transaction.set(attributionRef, {
      schemaVersion: ATTRIBUTION_VERSION,
      uid,
      firstTouch: attribution.firstTouch,
      lastTouch: attribution.lastTouch,
      updatedAt: occurredAt,
      ...(attributionSnapshot.exists ? {} : { createdAt: occurredAt }),
    }, { merge: true });
    transaction.set(userRef, {
      schemaVersion: 1,
      uid,
      visitorId: normalizeIdentifier(params.visitorId),
      firstSeenAt: readString(priorUser.firstSeenAt) ?? occurredAt,
      firstActiveDateUtc: readString(priorUser.firstActiveDateUtc) ?? activeDateUtc,
      lastSeenAt: occurredAt,
      lastActiveDateUtc: activeDateUtc,
      isReturning: priorUser.isReturning === true || isReturning,
      updatedAt: occurredAt,
    }, { merge: true });
    return { duplicate: false, isReturning };
  });
}

export async function listProductEvents(limit = 500): Promise<{
  available: boolean;
  events: ProductEventEntry[];
}> {
  const safeLimit = Math.max(1, Math.min(1000, Math.floor(limit)));
  try {
    const firestore = (await getFirestore()) as ProductEventsFirestore;
    const orderBy = firestore.collection("product_events").orderBy;
    if (!orderBy) return { available: false, events: [] };
    const snapshot = await orderBy("occurredAtMs", "desc").limit(safeLimit).get();
    return {
      available: true,
      events: snapshot.docs.flatMap((doc) => {
        const normalized = normalizeProductEventEntry(doc.id, doc.data());
        return normalized ? [normalized] : [];
      }),
    };
  } catch (error) {
    console.error("Failed to list product events", error);
    return { available: false, events: [] };
  }
}

export function aggregateProductEvents(events: ProductEventEntry[]) {
  const counts = Object.fromEntries(CLIENT_PRODUCT_EVENT_NAMES.map((name) => [name, 0])) as Record<
    ClientProductEventName,
    number
  >;
  const returningUsers = new Set<string>();
  for (const event of events) {
    if (EVENT_NAME_SET.has(event.eventName)) {
      counts[event.eventName as ClientProductEventName] += 1;
    }
    if (event.isReturning) returningUsers.add(event.uid);
  }
  return {
    counts,
    returningUsers: returningUsers.size,
    availability: Object.fromEntries(
      CLIENT_PRODUCT_EVENT_NAMES.map((eventName) => [eventName, { instrumented: true, observed: counts[eventName] > 0 }]),
    ) as Record<ClientProductEventName, { instrumented: true; observed: boolean }>,
  };
}

export function buildProductEventDocumentId(uid: string, dedupeKey: string) {
  return `pe_${createHash("sha256").update(`${uid}\0${dedupeKey}`, "utf8").digest("hex")}`;
}

function mergeServerAttribution(
  stored: AttributionState | null,
  incoming: AttributionState | null,
  occurredAt: string,
): AttributionState {
  const direct = {
    version: ATTRIBUTION_VERSION,
    firstTouch: { acquisitionSource: "direct" as const, capturedAt: occurredAt },
    lastTouch: { acquisitionSource: "direct" as const, capturedAt: occurredAt },
  };
  if (!stored) return incoming ?? direct;
  if (!incoming) return stored;
  return { version: ATTRIBUTION_VERSION, firstTouch: stored.firstTouch, lastTouch: incoming.lastTouch };
}

function normalizeAttributionDocument(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return normalizeAttributionState({
    version: ATTRIBUTION_VERSION,
    firstTouch: record.firstTouch,
    lastTouch: record.lastTouch,
  });
}

function normalizeProductEventEntry(id: string, value: unknown): ProductEventEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (typeof data.eventName !== "string" || !PRODUCT_EVENT_NAME_SET.has(data.eventName)) return null;
  const attribution = normalizeAttributionState(data.attribution);
  const uid = readString(data.uid);
  const occurredAt = readString(data.occurredAt);
  const dedupeKey = readString(data.dedupeKey);
  if (!attribution || !uid || !occurredAt || !dedupeKey || typeof data.occurredAtMs !== "number") return null;
  return {
    id,
    schemaVersion: 1,
    eventName: data.eventName as ProductEventName,
    source: data.source === "server" ? "server" : "client",
    uid,
    visitorId: readString(data.visitorId),
    sessionId: readString(data.sessionId),
    dedupeKey,
    occurredAt,
    occurredAtMs: data.occurredAtMs,
    activeDateUtc: readString(data.activeDateUtc) ?? occurredAt.slice(0, 10),
    isReturning: data.isReturning === true,
    metadata: data.source === "server"
      ? sanitizeServerEventMetadata(data.metadata)
      : sanitizeEventMetadata(data.eventName as ClientProductEventName, data.metadata),
    attribution,
  };
}

function sanitizeServerEventMetadata(value: unknown): ProductEventMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const metadata: ProductEventMetadata = {};
  for (const [key, rawValue] of Object.entries(value as Record<string, unknown>).slice(0, MAX_METADATA_KEYS)) {
    if (!/^[a-z_]{1,40}$/.test(key)) continue;
    if (rawValue === null || typeof rawValue === "boolean") metadata[key] = rawValue;
    else if (typeof rawValue === "number" && Number.isFinite(rawValue)) metadata[key] = rawValue;
    else if (typeof rawValue === "string") metadata[key] = rawValue
      .replace(/[\u0000-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_METADATA_STRING_LENGTH);
  }
  return metadata;
}

function normalizeIdentifier(value: string | null) {
  return typeof value === "string" && /^[a-f0-9]{32}$/.test(value) ? value : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
