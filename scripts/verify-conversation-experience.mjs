import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
// Point SAYBACK_PLAYWRIGHT_MODULE at an existing Playwright index.mjs when
// running from a tool cache rather than a project development dependency.
const { chromium } = await import(process.env.SAYBACK_PLAYWRIGHT_MODULE ?? "playwright");

// This is a UI contract check, not a live Firebase/Stripe integration test.
// Start the app with dummy NEXT_PUBLIC_FIREBASE_* configuration. Every API and
// identity request is intercepted; all other external traffic is denied.
const baseUrl = process.env.SAYBACK_SMOKE_BASE_URL ?? "http://127.0.0.1:3100";
const origin = new URL(baseUrl).origin;
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(new URL(baseUrl).hostname), "Use a local app URL");
const outputDir = new URL("../output/playwright/", import.meta.url);
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const checks = [];
const replyTexts = ["בשמחה, מתאים לי לדבר בערב.", "כן, נדבר כשיהיה לך נוח.", "מעולה, באיזו שעה מתאים לך?"];
const incoming = "היי, מתאים לך שנדבר בערב?";

function billingFor(kind) {
  const billing = {
    freeLimit: 3, freeUsed: 0, freeRemaining: 3,
    dailyLimit: 1, dailyUsed: 0, dailyRemaining: 0,
    credits: 0, hasUnlimited: false, subscriptionStatus: null,
    stripeCustomerId: null, billingBypassEnabled: false,
    accountEmail: null, isRecoverableAccount: false,
    nextConsumptionSource: "initial_free", dailyResetAt: "2030-01-01T00:00:00.000Z", accessState: "free",
  };
  if (kind !== "initial_free") Object.assign(billing, { freeUsed: 3, freeRemaining: 0 });
  if (kind === "daily_free") Object.assign(billing, { dailyRemaining: 1, nextConsumptionSource: "daily_free" });
  if (kind === "credits") Object.assign(billing, { credits: 17, nextConsumptionSource: "credits", accessState: "credits" });
  if (kind === "monthly") Object.assign(billing, {
    hasUnlimited: true, subscriptionStatus: "active", nextConsumptionSource: "unlimited", accessState: "unlimited",
    stripeCustomerId: "cus_mock_only", accountEmail: "fixture@example.test", isRecoverableAccount: true,
  });
  if (kind === "blocked") Object.assign(billing, { dailyUsed: 1, nextConsumptionSource: "blocked", accessState: "blocked" });
  if (kind === "bypass") Object.assign(billing, { billingBypassEnabled: true, hasUnlimited: true, nextConsumptionSource: "unlimited", accessState: "unlimited" });
  return billing;
}

function token() {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode({
    sub: "sayback-ui-fixture", user_id: "sayback-ui-fixture", aud: "sayback-ui-test",
    iss: "https://securetoken.google.com/sayback-ui-test", iat: now, exp: now + 3600,
    auth_time: now, firebase: { sign_in_provider: "anonymous", identities: {} },
  })}.fixture`;
}

async function fixture(kind = "initial_free", width = 390, query = "", profiles = []) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce", serviceWorkers: "block" });
  context.setDefaultTimeout(15_000);
  const state = { billing: billingFor(kind), calls: [], identityCalls: 0, identityRequests: [], profiles: structuredClone(profiles), delayGenerationMs: 0, failGeneration: false, errors: [], unexpected: [] };
  await context.addInitScript(() => {
    window.__clipboardFail = false;
    window.__copiedText = null;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (value) => {
        if (window.__clipboardFail) throw new DOMException("Fixture clipboard denied", "NotAllowedError");
        window.__copiedText = value;
      } },
    });
  });
  const idToken = token();
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const fulfill = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.hostname === "identitytoolkit.googleapis.com") {
      state.identityCalls += 1;
      state.identityRequests.push({ path: url.pathname, payload: request.postDataJSON() });
      if (url.pathname.endsWith("accounts:sendOobCode")) return fulfill({ kind: "identitytoolkit#GetOobConfirmationCodeResponse", email: "fixture@example.test" });
      if (url.pathname.endsWith("accounts:lookup")) return fulfill({ users: [{ localId: "sayback-ui-fixture", providerUserInfo: [], createdAt: String(Date.now()), lastLoginAt: String(Date.now()) }] });
      return fulfill({ kind: "identitytoolkit#SignupNewUserResponse", idToken, refreshToken: "fixture-refresh", expiresIn: "3600", localId: "sayback-ui-fixture" });
    }
    if (url.hostname === "securetoken.googleapis.com") return fulfill({ access_token: idToken, id_token: idToken, refresh_token: "fixture-refresh", expires_in: "3600", user_id: "sayback-ui-fixture", token_type: "Bearer" });
    if (url.origin !== origin) return route.abort("blockedbyclient");
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const payload = request.postDataJSON();
    state.calls.push({ path: url.pathname, method: request.method(), payload, authorization: request.headers().authorization });
    if (url.pathname.startsWith("/api/conversations/")) {
      const profile = state.profiles.find((entry) => entry.id === url.pathname.split("/").at(-1));
      if (profile && request.method() === "PATCH") {
        Object.assign(profile, { label: payload.label, memoryNote: payload.memoryNote });
        return fulfill({ conversation: profile });
      }
      if (profile && request.method() === "DELETE") {
        state.profiles = state.profiles.filter((entry) => entry.id !== profile.id);
        return fulfill({ success: true });
      }
    }
    switch (url.pathname) {
      case "/api/billing/status": return fulfill({ billing: state.billing });
      case "/api/conversations": return fulfill({ conversations: state.profiles });
      case "/api/product-events":
      case "/api/identity/link":
      case "/api/my-voice": return fulfill({ ok: true });
      case "/api/billing/subscription": return fulfill({
        billing: state.billing,
        subscription: state.billing.subscriptionStatus === "active" ? {
          status: "active", cancelAtPeriodEnd: payload?.action === "cancel_next_charge",
          currentPeriodEnd: "2030-01-01T00:00:00.000Z", canCancel: payload?.action !== "cancel_next_charge", canResume: payload?.action === "cancel_next_charge",
        } : null,
      });
      case "/api/generate":
        if (state.delayGenerationMs) await new Promise((resolve) => setTimeout(resolve, state.delayGenerationMs));
        if (kind === "blocked") return fulfill({ error: "המכסה החינמית הסתיימה.", billing: state.billing }, 402);
        if (state.failGeneration) return fulfill({ error: "בדיקת כשל: לא הצלחנו לשפר את התשובה." }, 500);
        return fulfill({ intent: "רוצים לקבוע שיחה לערב.", replies: payload?.action ? replyTexts.map((text) => `ניסוח מעודכן: ${text}`) : replyTexts, billing: state.billing });
      case "/api/checkout": return fulfill({ error: "התשלום מושבת בבדיקת הממשק." }, 503);
      case "/api/checkout/session": return fulfill({ status: "pending", billing: state.billing });
      default:
        state.unexpected.push(`${request.method()} ${url.pathname}`);
        return fulfill({ error: "Unmocked API denied" }, 501);
    }
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => state.errors.push(error.message));
  await page.goto(`${baseUrl}${query}`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.documentElement.dir === "rtl");
  await page.locator("#incoming-message").waitFor();
  await page.waitForFunction(() => !document.body.innerText.includes("רגע, מחברים את החשבון"));
  assert.ok(state.identityCalls > 0, "Anonymous Firebase sign-in was mocked");
  assert.ok(state.calls.some((call) => call.path === "/api/billing/status" && call.authorization?.startsWith("Bearer ")), "Billing uses bearer auth");
  return { context, page, state };
}

function generations(state) { return state.calls.filter((call) => call.path === "/api/generate"); }
function generateButton(page) { return page.getByRole("button", { name: /(?:תנו לי|ליצור|קבלו|יוצרים|לייצר).*3/ }).first(); }
async function noOverflow(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, "No horizontal document overflow");
}
async function finish({ context, state }) {
  assert.deepEqual(state.unexpected, [], "No unmocked API calls");
  assert.deepEqual(state.errors, [], "No uncaught browser exceptions");
  await context.close();
}
async function screenshot(page, name) {
  await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, outputDir)), fullPage: true, style: "nextjs-portal { display: none !important; }" });
}

try {
  for (const width of [360, 390, 768, 1024, 1440]) {
    const app = await fixture("initial_free", width);
    await app.page.getByRole("heading", { name: /יש הודעה.*יש מה לענות/ }).waitFor();
    await noOverflow(app.page);
    await screenshot(app.page, `conversation-${width}-empty`);
    if (width === 390 || width === 1440) {
      await app.page.screenshot({
        path: fileURLToPath(new URL(width === 390 ? "conversation-mobile-preview.png" : "conversation-desktop-preview.png", outputDir)),
        fullPage: false, style: "nextjs-portal { display: none !important; }",
      });
    }
    await app.page.locator("#incoming-message").fill(incoming);
    await generateButton(app.page).click();
    await app.page.getByRole("button", { name: "העתק תשובה 3", exact: true }).waitFor();
    assert.equal(await app.page.getByRole("button", { name: /^העתק תשובה [123]$/ }).count(), 3);
    assert.equal(generations(app.state)[0].payload.message, incoming);
    await noOverflow(app.page);
    await screenshot(app.page, `conversation-${width}-results`);
    await finish(app);
    checks.push(`RTL, no overflow, generation and 3 replies at ${width}px`);
  }

  const app = await fixture("credits");
  const { page, state } = app;
  await page.locator("#incoming-message").fill(incoming);
  const accountTrigger = page.getByRole("button", { name: "החשבון שלי", exact: true });
  await accountTrigger.click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  assert.equal(await dialog.evaluate((element) => element.contains(document.activeElement)), true, "Dialog receives focus");
  for (let index = 0; index < 12; index += 1) await page.keyboard.press("Tab");
  assert.equal(await dialog.evaluate((element) => element.contains(document.activeElement)), true, "Keyboard focus remains in dialog");
  await screenshot(page, "conversation-account-credits");
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  assert.equal(await accountTrigger.evaluate((element) => element === document.activeElement), true, "Escape restores trigger focus");
  assert.equal(await page.locator("#incoming-message").inputValue(), incoming);
  checks.push("Account dialog focus, focus containment, Escape, preserved draft");

  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
  await page.locator('input[type="file"]').setInputFiles({ name: "fixture.png", mimeType: "image/png", buffer: png });
  await page.getByRole("img", { name: /תצוגה מקדימה/ }).waitFor();
  await page.getByRole("button", { name: "הסרת צילום", exact: true }).click();
  assert.equal(await page.getByRole("img", { name: /תצוגה מקדימה/ }).count(), 0);
  checks.push("Screenshot preview and removal");

  await generateButton(page).click();
  await page.getByRole("button", { name: "העתק תשובה 1", exact: true }).waitFor();
  // Return to writing, edit the draft, then refine the existing result. The
  // refinement must retain the context that produced that result.
  const writeNav = page.getByRole("button", { name: "עריכת ההודעה", exact: true }).first();
  await writeNav.click();
  await page.locator("#incoming-message").fill("זו הודעה אחרת שעוד לא נשלחה");
  await page.getByRole("button", { name: "התשובות", exact: true }).first().click();
  await page.getByRole("button", { name: "לשפר ניסוח" }).first().click();
  for (const [label, action] of [["עדין יותר", "softer"], ["חד יותר", "sharper"], ["ניסוח חדש", "retry"]]) {
    const before = generations(state).length;
    await Promise.all([
      page.waitForResponse((response) => response.url().endsWith("/api/generate")),
      page.getByRole("button", { name: label, exact: true }).first().click(),
    ]);
    assert.equal(generations(state).length, before + 1);
    const request = generations(state).at(-1).payload;
    assert.equal(request.action, action);
    assert.equal(request.message, incoming, "Refine retains original message despite edited composer");
    assert.ok(request.sourceReply);
  }
  state.failGeneration = true;
  await page.getByRole("button", { name: "עדין יותר", exact: true }).first().click();
  await page.getByText("בדיקת כשל: לא הצלחנו לשפר את התשובה.", { exact: true }).first().waitFor();
  assert.equal(await page.getByRole("button", { name: /^העתק תשובה [123]$/ }).count(), 3, "Failure preserves result cards");
  await page.evaluate(() => { window.__clipboardFail = true; });
  await page.getByRole("button", { name: "העתק תשובה 1", exact: true }).click();
  await page.getByLabel("העתקה ידנית של תשובה 1").waitFor();
  await screenshot(page, "conversation-copy-fallback");
  checks.push("Navigation preserves drafts; all refine actions retain result context; refine and clipboard failures visible");
  await finish(app);

  for (const kind of ["daily_free", "monthly", "blocked", "bypass"]) {
    const current = await fixture(kind);
    await current.page.getByRole("button", { name: "החשבון שלי", exact: true }).click();
    await current.page.getByRole("dialog").waitFor();
    if (kind === "monthly") await current.page.getByRole("button", { name: "לעצור את החיוב הבא", exact: true }).waitFor();
    await screenshot(current.page, `conversation-account-${kind}`);
    await current.page.keyboard.press("Escape");
    await current.page.locator("#incoming-message").fill(incoming);
    await generateButton(current.page).click();
    if (kind === "blocked") {
      await current.page.getByRole("dialog").waitFor();
      assert.equal(generations(current.state).length, 1, "Server access denial opens access choices");
      assert.equal(await current.page.getByRole("button", { name: /^העתק תשובה [123]$/ }).count(), 0, "Access denial creates no replies");
      await current.page.keyboard.press("Escape");
      await current.page.getByRole("dialog").waitFor({ state: "hidden" });
      await current.page.locator("#incoming-message").waitFor({ state: "visible" });
      assert.equal(await current.page.locator("#incoming-message").inputValue(), incoming, "Closing access dialog restores the draft after402");
    } else {
      await current.page.getByRole("button", { name: "העתק תשובה 3", exact: true }).waitFor();
    }
    await finish(current);
    checks.push(`${kind} access state`);
  }

  const sample = await fixture("initial_free", 1440);
  await sample.page.getByRole("button", { name: "שיחה אישית", exact: true }).click();
  assert.match(await sample.page.locator("#incoming-message").inputValue(), /נעלמתי קצת/);
  assert.equal(generations(sample.state).length, 0, "Selecting a sample does not submit it");
  await finish(sample);
  const deepLink = await fixture("initial_free", 390, "/?example=ex-check-in&tone=" + encodeURIComponent("ישיר"));
  assert.match(await deepLink.page.locator("#incoming-message").inputValue(), /המקום שלנו/);
  assert.equal(generations(deepLink.state).length, 0, "Deep link prefills without consuming a use");
  await finish(deepLink);
  checks.push("Sample and deep link prefill without automatic generation");

  const followUp = await fixture("monthly");
  await followUp.page.getByRole("button", { name: "לא ענו? פולו־אפ", exact: true }).click();
  await followUp.page.locator("#last-outgoing-message").fill("היי, רציתי לבדוק אם ההצעה מתאימה לך");
  assert.equal(await generateButton(followUp.page).isDisabled(), true, "Follow-up needs a duration and unit");
  await followUp.page.locator("#no-reply-duration-value").fill("2");
  await followUp.page.locator("#no-reply-duration-unit").selectOption("days");
  await generateButton(followUp.page).click();
  await followUp.page.getByRole("button", { name: "העתק תשובה 3", exact: true }).waitFor();
  const followUpPayload = generations(followUp.state)[0].payload;
  assert.equal(followUpPayload.noReplyMode, true);
  assert.equal(followUpPayload.noReplyDurationValue, 2);
  assert.equal(followUpPayload.noReplyDurationUnit, "days");
  assert.ok(followUpPayload.lastOutgoingMessage);
  await finish(followUp);
  checks.push("No-reply validation and complete follow-up payload");

  const overlapping = await fixture("blocked");
  overlapping.state.delayGenerationMs = 1500;
  await overlapping.page.locator("#incoming-message").fill(incoming);
  const deniedResponse = overlapping.page.waitForResponse((response) => response.url().endsWith("/api/generate"));
  await generateButton(overlapping.page).click();
  await overlapping.page.getByRole("button", { name: "החשבון שלי", exact: true }).click();
  await overlapping.page.locator("dialog[open]").waitFor();
  await deniedResponse;
  await overlapping.page.locator("#paywall-dialog").waitFor();
  assert.equal(await overlapping.page.locator("dialog[open]").count(), 0, "Async402 closes the native account dialog");
  assert.equal(await overlapping.page.getByRole("dialog").count(), 1, "Only the accessible paywall remains open");
  await overlapping.page.keyboard.press("Escape");
  await overlapping.page.locator("#incoming-message").waitFor({ state: "visible" });
  await finish(overlapping);
  checks.push("Async402 replaces account dialog with a single accessible paywall");

  const downgraded = await fixture("monthly", 390, "/?tone=" + encodeURIComponent("רשמי"));
  await downgraded.page.locator("#incoming-message").fill(incoming);
  await downgraded.page.getByRole("button", { name: /עוד דיוק/ }).click();
  await downgraded.page.locator("summary").filter({ hasText: "רקע שיחה נוסף" }).click();
  await downgraded.page.locator("#conversation-background").fill("רקע לדוגמה הזמין רק למנוי חודשי");
  await generateButton(downgraded.page).click();
  await downgraded.page.getByRole("button", { name: "העתק תשובה 3", exact: true }).waitFor();
  assert.equal(generations(downgraded.state)[0].payload.tone, "רשמי");
  assert.ok(generations(downgraded.state)[0].payload.conversationBackground);
  downgraded.state.billing = billingFor("credits");
  await downgraded.page.getByRole("button", { name: "החשבון שלי", exact: true }).click();
  await Promise.all([
    downgraded.page.waitForResponse((response) => response.url().endsWith("/api/billing/status")),
    downgraded.page.getByRole("button", { name: "רענון מצב חשבון", exact: true }).click(),
  ]);
  await downgraded.page.getByRole("dialog").getByText("השימוש הבא ירד מיתרת הקרדיטים.", { exact: true }).waitFor();
  await downgraded.page.keyboard.press("Escape");
  await downgraded.page.getByRole("button", { name: "לשפר ניסוח" }).first().click();
  downgraded.state.delayGenerationMs = 1500;
  const refinementResponse = downgraded.page.waitForResponse((response) => response.url().endsWith("/api/generate"));
  const [pendingRefinement] = await Promise.all([
    downgraded.page.waitForRequest((request) => request.url().endsWith("/api/generate")),
    downgraded.page.getByRole("button", { name: "עדין יותר", exact: true }).first().click(),
  ]);
  assert.equal(await downgraded.page.getByRole("button", { name: "הודעה חדשה", exact: true }).isDisabled(), true, "A pending refinement prevents clearing its result");
  const normalizedRequest = pendingRefinement.postDataJSON();
  assert.equal(normalizedRequest.message, incoming);
  assert.equal(normalizedRequest.tone, "זורם", "Refine downgrades a formerly premium tone");
  assert.ok(!normalizedRequest.conversationBackground, "Refine strips premium background after access changes");
  await refinementResponse;
  await downgraded.page.getByRole("button", { name: "עדין יותר", exact: true }).first().waitFor();
  await finish(downgraded);
  checks.push("Downgraded access normalizes saved request tone/background; in-flight refinement locks new-message action");

  const person = {
    id: "fixture-person", version: 2, label: "דנה לדוגמה", context: "לקוח", tone: "עדין",
    memoryNote: "מעדיפה תשובות קצרות", lastIntent: null, usageCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", lastUsedAt: "2026-01-01T00:00:00.000Z",
  };
  const saved = await fixture("credits", 390, "", [person]);
  await saved.page.getByRole("button", { name: person.label, exact: true }).click();
  assert.equal(await saved.page.getByRole("button", { name: person.label, exact: true }).getAttribute("aria-pressed"), "true");
  await saved.page.getByRole("button", { name: "ניהול", exact: true }).click();
  const peopleDialog = saved.page.getByRole("dialog", { name: "אנשים שמורים", exact: true });
  await peopleDialog.getByRole("button", { name: "עריכת פרטים", exact: true }).click();
  await peopleDialog.getByLabel(`שם חדש עבור ${person.label}`, { exact: true }).fill("דנה המעודכנת");
  await peopleDialog.getByRole("button", { name: "שמירה", exact: true }).click();
  await peopleDialog.getByText("דנה המעודכנת", { exact: true }).waitFor();
  await saved.page.keyboard.press("Escape");
  await saved.page.locator("#incoming-message").fill(incoming);
  await generateButton(saved.page).click();
  await saved.page.getByRole("button", { name: "העתק תשובה 3", exact: true }).waitFor();
  assert.equal(generations(saved.state)[0].payload.conversationId, person.id, "The selected saved person reaches generation");
  await saved.page.getByRole("button", { name: "החשבון שלי", exact: true }).click();
  await saved.page.getByLabel("שמירת גישה באימייל", { exact: true }).fill("fixture@example.test");
  await saved.page.getByRole("button", { name: "כבר שילמת? התחבר/י לשחזור גישה", exact: true }).click();
  await saved.page.getByText("שלחנו קישור התחברות. פתחו אותו כדי לשחזר את הקרדיטים או המנוי.", { exact: true }).waitFor();
  const recovery = saved.state.identityRequests.find((request) => request.path.endsWith("accounts:sendOobCode"));
  assert.equal(recovery?.payload.email, "fixture@example.test");
  assert.equal(recovery?.payload.requestType, "EMAIL_SIGNIN");
  await finish(saved);
  checks.push("Saved-person selection/rename/generation context and mocked email-recovery request");

  await writeFile(new URL("conversation-verification.json", outputDir), JSON.stringify({ mocked: true, baseUrl, checks }, null, 2));
  console.log(JSON.stringify({ ok: true, mocked: true, checks }, null, 2));
} finally {
  await browser.close();
}
