import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [billing, pricing, stripe, generateRoute] = await Promise.all([
  readFile(new URL("../lib/billing.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/pricing.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/stripe.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/generate/route.ts", import.meta.url), "utf8"),
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
