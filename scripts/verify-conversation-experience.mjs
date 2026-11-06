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
const browser = await chromium.launch({ headless: true, executablePath: process.env.SAYBACK_CHROMIUM_EXECUTABLE_PATH });
const checks = [];
const measurements = {};
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
function directionTrigger(page, field) { return page.locator(`[data-direction-field="${field}"]`); }
function directionEditor(page) { return page.getByTestId("direction-editor"); }
async function openDirection(page, field) {
  await directionTrigger(page, field).click();
  await page.locator(`[data-testid="direction-editor"][data-field="${field}"]`).waitFor();
  assert.equal(await directionEditor(page).count(), 1, "Only one inline editor is open");
}
async function chooseDirection(page, field, value) {
  await openDirection(page, field);
  await directionEditor(page).locator(`[data-direction-option="${value}"]`).click();
  await directionEditor(page).waitFor({ state: "hidden" });
  assert.equal(await directionTrigger(page, field).evaluate((element) => element === document.activeElement), true, `${field} selection restores trigger focus`);
}
async function allTargetsLargeEnough(locator) {
  const sizes = await locator.evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return { label: element.textContent, width: rect.width, height: rect.height };
  }));
  assert.ok(sizes.length > 0);
  for (const size of sizes) assert.ok(size.width >= 44 && size.height >= 44, `44px tap target: ${JSON.stringify(size)}`);
}
async function directionSummariesVisible(page) {
  const clipped = await page.locator('[data-direction-field]').evaluateAll((elements) => elements.flatMap((element) => {
    const box = element.getBoundingClientRect();
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const failures = [];
    while (walker.nextNode()) {
      const text = walker.currentNode;
      if (!text.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(text);
      for (const rect of range.getClientRects()) {
        if (rect.width && (rect.left < box.left - 1 || rect.right > box.right + 1 || rect.top < box.top - 1 || rect.bottom > box.bottom + 1)) failures.push(text.textContent);
      }
      const style = getComputedStyle(text.parentElement);
      if (style.textOverflow === "ellipsis" || Number.parseInt(style.webkitLineClamp, 10) > 0) failures.push(text.textContent);
    }
    return failures;
  }));
  assert.deepEqual(clipped, [], "Selected summaries remain fully visible without truncation");
}
async function showComposer(page) { await page.getByRole("button", { name: "עריכת ההודעה", exact: true }).first().click(); }
async function showResults(page) { await page.getByRole("button", { name: "התשובות", exact: true }).first().click(); }
const staleNotice = (page) => page.getByText("ההודעה או ההעדפות השתנו. התשובות כאן עדיין שייכות לבקשה הקודמת; צרו תשובות חדשות כדי לעדכן.", { exact: true });

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
    if (width === 360 || width === 1440) {
      await app.page.locator(width === 360 ? "#compose-section" : ".sb-workspace").screenshot({
        path: fileURLToPath(new URL(width === 360 ? "direction-composer-mobile.png" : "direction-workspace-desktop.png", outputDir)),
        style: "nextjs-portal { display: none !important; }",
      });
    }
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

  const directions = await fixture("monthly", 360);
  const dp = directions.page;
  const bar = dp.getByTestId("reply-direction-controls");
  measurements.collapsedHeightAt360 = (await bar.boundingBox()).height;
  assert.ok(measurements.collapsedHeightAt360 <= 120, "Collapsed direction controls fit within 120px at 360px");
  assert.equal(await directionEditor(dp).count(), 0, "No editor opens on initial load");
  assert.equal(await dp.locator('[data-direction-field]').count(), 6);
  const triggerPositions = await dp.locator('[data-direction-field]').evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect(); return { field: element.dataset.directionField, y: Math.round(rect.y) };
  }));
  assert.deepEqual(triggerPositions.map((item) => item.field), ["tone", "context", "goal", "language", "continue", "background"]);
  assert.equal(new Set(triggerPositions.slice(0, 3).map((item) => item.y)).size, 1, "Primary controls share a row");
  assert.equal(new Set(triggerPositions.slice(3).map((item) => item.y)).size, 1, "Secondary controls share a row");
  assert.ok(triggerPositions[3].y > triggerPositions[0].y, "Secondary controls use the second row");
  await allTargetsLargeEnough(dp.locator('[data-direction-field]'));
  const tones = ["עדין", "ישיר", "זורם", "מצחיק", "פלרטטני", "אסרטיבי", "רגוע", "רשמי", "קליל", "ענייני"];
  const contexts = ["קראש", "אקס", "ידיד", "לקוח", "בוס", "יד2", "בן/בת זוג", "דייט", "קולגה", "משפחה", "שותף/ה לדירה", "שכנים"];
  for (const [field, options] of [["tone", tones], ["context", contexts]]) {
    await openDirection(dp, field);
    assert.deepEqual(await directionEditor(dp).locator('[data-direction-option]').evaluateAll((elements) => elements.map((element) => element.dataset.directionOption)), options, `All ${field} options appear immediately`);
    measurements[`${field}EditorHeightAt360`] = (await directionEditor(dp).boundingBox()).height;
    assert.ok(measurements[`${field}EditorHeightAt360`] <= 320, `${field} editor fits within 320px at 360px`);
    await allTargetsLargeEnough(directionEditor(dp).locator('[data-direction-option]'));
    await screenshot(dp, `direction-${field}-360`);
    await dp.keyboard.press("Escape");
    for (const option of options) {
      await chooseDirection(dp, field, option);
      assert.ok((await directionTrigger(dp, field).innerText()).includes(option), `${option} becomes the visible summary in two clicks`);
    }
  }
  await openDirection(dp, "goal");
  assert.deepEqual(await directionEditor(dp).locator('[data-direction-option]').evaluateAll((elements) => elements.map((element) => element.dataset.directionOption)), ["להמשיך שיחה", "לקבוע זמן", "לבקש הבהרה", "להציב גבול", "לסגור בנימוס", "להתמקח / לקדם סגירה"]);
  await dp.keyboard.press("Escape");
  await chooseDirection(dp, "goal", "להתמקח / לקדם סגירה");
  await chooseDirection(dp, "continue", "לא");
  await directionSummariesVisible(dp);
  await openDirection(dp, "language");
  await directionEditor(dp).getByRole("group", { name: "איך לנסח בשמך?", exact: true }).getByRole("button", { name: "לשון נקבה", exact: true }).click();
  await directionEditor(dp).getByRole("group", { name: "איך לפנות לצד השני?", exact: true }).getByRole("button", { name: "לשון זכר", exact: true }).click();
  assert.equal(await directionEditor(dp).getAttribute("data-field"), "language", "Language choices remain open");
  await openDirection(dp, "background");
  const background = "הודעה ראשונה אחרי הפסקה; חשוב לשמור על ניסוח קצר.";
  await dp.locator("#direction-conversation-background").fill(background);
  assert.equal(await directionEditor(dp).getAttribute("data-field"), "background", "Typing background leaves editor open");
  await openDirection(dp, "language");
  assert.equal(await directionEditor(dp).getByRole("group", { name: "איך לנסח בשמך?", exact: true }).getByRole("button", { name: "לשון נקבה", exact: true }).getAttribute("aria-pressed"), "true");
  await openDirection(dp, "background");
  assert.equal(await dp.locator("#direction-conversation-background").inputValue(), background, "Switching editors preserves background");
  await directionEditor(dp).getByRole("button", { name: "סיימתי ✓", exact: true }).click();
  assert.equal(await directionTrigger(dp, "background").evaluate((element) => element === document.activeElement), true, "Done restores focus");
  await openDirection(dp, "tone");
  await dp.keyboard.press("Escape");
  await directionEditor(dp).waitFor({ state: "hidden" });
  assert.equal(await directionTrigger(dp, "tone").evaluate((element) => element === document.activeElement), true, "Escape restores focus");
  assert.equal(generations(directions.state).length, 0, "Opening, switching, editing, selecting and closing never submit");
  await directionSummariesVisible(dp);
  await dp.locator("#incoming-message").fill("כמה זה עולה?");
  await dp.getByRole("button", { name: "יש לי פרטים", exact: true }).click();
  await dp.locator("#commitment-details").fill("250 ש״ח, בלי משלוח");
  await generateButton(dp).click();
  await dp.getByRole("button", { name: "העתק תשובה 3", exact: true }).waitFor();
  const directionPayload = generations(directions.state).at(-1).payload;
  assert.equal(directionPayload.tone, "ענייני");
  assert.equal(directionPayload.context, "שכנים");
  assert.equal(directionPayload.goal, "להתמקח / לקדם סגירה");
  assert.equal(directionPayload.continuePreference, "לא");
  assert.equal(directionPayload.conversationBackground, background);
  assert.deepEqual(directionPayload.languagePreferences, { speaker: "feminine", recipient: "masculine" });
  assert.equal(directionPayload.commitmentMode, "provided");
  assert.equal(directionPayload.commitmentDetails, "250 ש״ח, בלי משלוח");
  assert.equal(await staleNotice(dp).count(), 0, "A freshly generated result is not stale");
  await showComposer(dp);
  await openDirection(dp, "language");
  await directionEditor(dp).getByRole("group", { name: "איך לנסח בשמך?", exact: true }).getByRole("button", { name: "לשון זכר", exact: true }).click();
  await showResults(dp);
  await staleNotice(dp).waitFor();
  await showComposer(dp);
  if (await directionEditor(dp).count() === 0) await openDirection(dp, "language");
  await directionEditor(dp).getByRole("group", { name: "איך לנסח בשמך?", exact: true }).getByRole("button", { name: "לשון נקבה", exact: true }).click();
  await showResults(dp);
  assert.equal(await staleNotice(dp).count(), 0, "Restoring equal language values clears stale status");
  await showComposer(dp);
  await dp.locator("#commitment-details").fill("300 ש״ח, בלי משלוח");
  await showResults(dp);
  await staleNotice(dp).waitFor();
  await dp.getByRole("button", { name: "לשפר ניסוח" }).first().click();
  await dp.getByRole("button", { name: "עדין יותר", exact: true }).first().click();
  await dp.getByText(`ניסוח מעודכן: ${replyTexts[0]}`, { exact: true }).first().waitFor();
  const originalRefinement = generations(directions.state).at(-1).payload;
  assert.equal(originalRefinement.commitmentDetails, "250 ש״ח, בלי משלוח", "Refine uses original commitment despite changed draft");
  assert.deepEqual(originalRefinement.languagePreferences, directionPayload.languagePreferences);
  assert.equal(originalRefinement.conversationBackground, background);
  await dp.getByRole("button", { name: "אפשרויות נוספות לתשובה 1", exact: true }).click();
  await dp.getByRole("button", { name: "ענו לי", exact: true }).first().click();
  const continueDialog = dp.getByRole("dialog", { name: "ענו לך? ממשיכים מכאן", exact: true });
  await continueDialog.getByRole("textbox", { name: "מה שלחת בפועל?", exact: true }).fill("המחיר הוא 250 ש״ח, בלי משלוח");
  await continueDialog.getByRole("textbox", { name: "מה ענו לך?", exact: true }).fill("תודה על ההסבר, אחזור אליך");
  const countBeforeContinuation = generations(directions.state).length;
  await continueDialog.getByRole("button", { name: "להשתמש בהמשך הזה", exact: true }).click();
  assert.equal(generations(directions.state).length, countBeforeContinuation, "Conversation continuation does not auto-generate");
  await generateButton(dp).click();
  await dp.getByRole("button", { name: "העתק תשובה 3", exact: true }).waitFor();
  assert.equal(generations(directions.state).at(-1).payload.previousOutgoingMessage, "המחיר הוא 250 ש״ח, בלי משלוח");
  assert.equal(generations(directions.state).at(-1).payload.commitmentMode, undefined, "A new conversation turn clears prior commitment");
  await showComposer(dp);
  await dp.locator("summary").filter({ hasText: "בהמשך למה ששלחת" }).click();
  await dp.getByRole("button", { name: "להמשיך בלי ההקשר הקודם", exact: true }).click();
  await showResults(dp);
  await staleNotice(dp).waitFor();
  await dp.getByRole("button", { name: "לשפר ניסוח" }).first().click();
  await dp.getByRole("button", { name: "עדין יותר", exact: true }).first().click();
  await dp.getByText(`ניסוח מעודכן: ${replyTexts[0]}`, { exact: true }).first().waitFor();
  assert.equal(generations(directions.state).at(-1).payload.previousOutgoingMessage, "המחיר הוא 250 ש״ח, בלי משלוח", "Refining after removal retains original previous outgoing context");
  await showComposer(dp);
  for (const field of ["tone", "context", "goal", "continue", "language", "background"]) {
    await openDirection(dp, field);
    await directionEditor(dp).locator('[data-direction-clear]').click();
    if (field === "language" || field === "background") await directionEditor(dp).getByRole("button", { name: "סיימתי ✓", exact: true }).click();
    await directionEditor(dp).waitFor({ state: "hidden" });
  }
  await directionSummariesVisible(dp);
  const clearedBefore = generations(directions.state).length;
  await generateButton(dp).click();
  await dp.getByRole("button", { name: "העתק תשובה 3", exact: true }).waitFor();
  assert.equal(generations(directions.state).length, clearedBefore + 1);
  const cleared = generations(directions.state).at(-1).payload;
  assert.equal(cleared.tone, "זורם");
  assert.equal(cleared.previousOutgoingMessage, undefined, "New generation omits cleared previous outgoing context");
  for (const key of ["context", "goal", "continuePreference", "conversationBackground"]) assert.ok(cleared[key] == null, `${key} cleared`);
  assert.deepEqual(cleared.languagePreferences, { speaker: "neutral", recipient: "neutral" });
  await finish(directions);
  checks.push("Compact direction grid, all 10 tones/12 contexts in two clicks, 44px targets, focus, persistent fields, clears, payload, stale snapshots and continuation");

  for (const kind of ["initial_free", "credits", "bypass"]) {
    const access = await fixture(kind, 360);
    await openDirection(access.page, "tone");
    if (kind === "bypass") {
      assert.equal(await directionEditor(access.page).locator('[data-direction-option]').count(), 5, "Billing bypass preserves hidden extended choices");
      await openDirection(access.page, "context");
      assert.equal(await directionEditor(access.page).locator('[data-direction-option]').count(), 6);
      assert.equal(await directionTrigger(access.page, "background").count(), 0, "Billing bypass preserves hidden background");
    } else {
      await directionEditor(access.page).locator('[data-direction-option="רשמי"]').click();
      assert.equal(await directionEditor(access.page).getAttribute("data-field"), "tone", "Locked option keeps the editor open");
      assert.equal(await directionEditor(access.page).locator('[data-direction-option="רשמי"]').getAttribute("aria-pressed"), "false", "Locked tone is not selected");
      await directionEditor(access.page).getByRole("button", { name: /לפתוח.*חודשי/ }).waitFor();
      assert.equal(await access.page.getByRole("dialog").count(), 0, "A locked choice shows inline upgrade instead of forcing a dialog");
      await openDirection(access.page, "context");
      await directionEditor(access.page).locator('[data-direction-option="שכנים"]').click();
      assert.equal(await directionEditor(access.page).locator('[data-direction-option="שכנים"]').getAttribute("aria-pressed"), "false");
      await openDirection(access.page, "background");
      assert.equal(await access.page.locator("#direction-conversation-background").count(), 0, "Locked background cannot be edited");
      await directionEditor(access.page).getByRole("button", { name: /לפתוח.*חודשי/ }).waitFor();
    }
    assert.equal(generations(access.state).length, 0);
    assert.equal(access.state.calls.filter((call) => call.path === "/api/checkout").length, 0, "Inspecting access restrictions starts no purchase");
    await finish(access);
  }
  checks.push("Free and credits monthly locks remain inline; bypass retains existing hidden premium choices; no automatic usage or purchase");

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
  assert.ok((await directionTrigger(deepLink.page, "tone").innerText()).includes("ישיר"), "Deep-linked tone is visible in collapsed controls");
  assert.equal(generations(deepLink.state).length, 0, "Deep link prefills without consuming a use");
  await finish(deepLink);
  checks.push("Sample and deep link prefill without automatic generation");

  const followUp = await fixture("monthly");
  await followUp.page.getByRole("button", { name: "לא ענו? פולו־אפ", exact: true }).click();
  assert.equal(await directionTrigger(followUp.page, "continue").count(), 0, "No-reply mode omits continuation preference");
  await openDirection(followUp.page, "goal");
  assert.deepEqual(await directionEditor(followUp.page).locator('[data-direction-option]').evaluateAll((elements) => elements.map((element) => element.dataset.directionOption)), ["תזכורת עדינה", "בדיקת סטטוס", "שחרור מכבד"]);
  await directionEditor(followUp.page).locator('[data-direction-option="בדיקת סטטוס"]').click();
  await followUp.page.locator("#last-outgoing-message").fill("היי, רציתי לבדוק אם ההצעה מתאימה לך");
  assert.equal(await generateButton(followUp.page).isDisabled(), true, "Follow-up needs a duration and unit");
  await followUp.page.locator("#no-reply-duration-value").fill("2");
  await followUp.page.locator("#no-reply-duration-unit").selectOption("days");
  await generateButton(followUp.page).click();
  await followUp.page.getByRole("button", { name: "העתק תשובה 3", exact: true }).waitFor();
  const followUpPayload = generations(followUp.state)[0].payload;
  assert.equal(followUpPayload.noReplyMode, true);
  assert.equal(followUpPayload.goal, "בדיקת סטטוס");
  assert.equal(followUpPayload.continuePreference, null);
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
  await openDirection(downgraded.page, "background");
  await downgraded.page.locator("#direction-conversation-background").fill("רקע לדוגמה הזמין רק למנוי חודשי");
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
  assert.ok((await directionTrigger(saved.page, "tone").innerText()).includes(person.tone));
  assert.ok((await directionTrigger(saved.page, "context").innerText()).includes(person.context));
  assert.equal(generations(saved.state).length, 0, "Saved defaults do not auto-generate");
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

  await writeFile(new URL("conversation-verification.json", outputDir), JSON.stringify({ mocked: true, baseUrl, measurements, checks }, null, 2));
  console.log(JSON.stringify({ ok: true, mocked: true, measurements, checks }, null, 2));
} catch (error) {
  const failedPage = browser.contexts().at(-1)?.pages().at(-1);
  if (failedPage) {
    await screenshot(failedPage, "conversation-verification-failure");
    await writeFile(new URL("conversation-verification-failure.txt", outputDir), await failedPage.locator("body").ariaSnapshot());
  }
  throw error;
} finally {
  await browser.close();
}
