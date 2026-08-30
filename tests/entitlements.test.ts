import assert from "node:assert/strict";
import test from "node:test";
import { selectGenerationEntitlement } from "../lib/entitlements.js";

const base = {
  hasUnlimited: false,
  credits: 0,
  freeUsed: 3,
  freeLimit: 3,
  dailyUsed: 1,
  dailyLimit: 1,
};

test("entitlement order stays unlimited then credits then initial free then daily free", () => {
  assert.equal(
    selectGenerationEntitlement({ ...base, hasUnlimited: true, credits: 50, freeUsed: 0 }),
    "unlimited",
  );
  assert.equal(
    selectGenerationEntitlement({ ...base, credits: 2, freeUsed: 0, dailyUsed: 0 }),
    "credits",
  );
  assert.equal(
    selectGenerationEntitlement({ ...base, freeUsed: 2, dailyUsed: 0 }),
    "initial_free",
  );
  assert.equal(
    selectGenerationEntitlement({ ...base, dailyUsed: 0 }),
    "daily_free",
  );
  assert.equal(selectGenerationEntitlement(base), "blocked");
});

test("free and daily limits are explicit boundaries", () => {
  assert.equal(
    selectGenerationEntitlement({ ...base, freeUsed: 2 }),
    "initial_free",
  );
  assert.equal(
    selectGenerationEntitlement({ ...base, dailyUsed: 0 }),
    "daily_free",
  );
});
