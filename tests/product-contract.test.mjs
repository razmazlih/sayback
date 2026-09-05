import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [billing, pricing, stripe, generateRoute] = await Promise.all([
  readFile(new URL("../lib/billing.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/pricing.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/stripe.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/generate/route.ts", import.meta.url), "utf8"),
]);
const [profiles, relationshipMemory, productEvents, conversationUi, homeUi] = await Promise.all([
  readFile(new URL("../lib/conversation-profiles.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/relationship-memory.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/product-events.ts", import.meta.url), "utf8"),
  readFile(new URL("../components/conversation-memory.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/home-page-client.tsx", import.meta.url), "utf8"),
]);

test("current billing economics remain unchanged", () => {
  assert.match(billing, /export const FREE_LIMIT = 3;/);
  assert.match(billing, /export const DAILY_FREE_LIMIT = 1;/);
  assert.match(billing, /const BUILT_IN_COUPON_CODE = "LOVE26";/);
  assert.match(billing, /const BUILT_IN_COUPON_USES = 5;/);
  assert.match(pricing, /export const CREDIT_PACK_USES = 50;/);
  assert.match(pricing, /export const CREDIT_PACK_PRICE_AGOROT = 990;/);
  assert.match(pricing, /export const UNLIMITED_MONTHLY_PRICE_AGOROT = 2490;/);
});

test("Stripe checkout and generation rollback contracts remain protected", () => {
  assert.match(stripe, /const STRIPE_API_VERSION:[^=]+ = "2026-03-25\.dahlia";/);
  assert.match(generateRoute, /await refundGenerationAccess\(authenticatedUserUid, consumption\)/);
  assert.match(generateRoute, /export const runtime = "nodejs";/);
  assert.match(generateRoute, /export const dynamic = "force-dynamic";/);
});

test("relationship memory remains bounded, private, best-effort, and does not run on refine", () => {
  assert.match(relationshipMemory, /MAX_TOPIC_CANDIDATES = 12/);
  assert.match(relationshipMemory, /MAX_SELECTED_TOPICS = 2/);
  assert.match(generateRoute, /isNewConversationTurn\(body\)/);
  assert.match(generateRoute, /generating without historical context/);
  assert.match(generateRoute, /Failed to update saved conversation memory/);
  assert.match(profiles, /never the message or model output/);
  assert.doesNotMatch(profiles, /messageText|imageBase64|sourceReply/);
});

test("relationship analytics and UI expose no personal content or memory marketing banner", () => {
  const ui = conversationUi + homeUi;
  assert.match(productEvents, /relationship_memory_used/);
  assert.match(productEvents, /same_person_repeat_generation/);
  assert.doesNotMatch(generateRoute, /metadata:\s*\{[^}]*summary/s);
  assert.doesNotMatch(generateRoute, /metadata:\s*\{[^}]*message/s);
  assert.doesNotMatch(ui, /SayBack זוכר את ההקשר/);
  assert.match(ui, /ממשיכים עם/);
  assert.match(ui, /מה SayBack יודע/);
});
