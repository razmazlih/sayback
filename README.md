# SayBack

Next.js 16 (App Router) app for generating Hebrew reply suggestions, with Firebase auth and Stripe billing.

## Reply directions

The Hebrew RTL composer offers six direct controls above **ליצור לי 3 תשובות**:
tone, recipient context, goal, grammatical preferences, conversation continuation,
and extra background. Each opens the same inline editor, with no nested menus.
All 10 tones and 12 contexts remain available under their existing access rules.

- No direction choice is required; the default tone is **זורם**.
- Single-choice editors close immediately after selection and restore keyboard focus.
  Language and background editors stay open until **סיימתי** or a different field is selected.
- Active values remain visible, including both grammatical preferences. Each field
  has an explicit clear action; tone resets to **זורם**.
- **לשלוח הודעת המשך** opens follow-up mode, with its own goals and no conversation-continuation control.
  Elapsed time takes one tap: half an hour, 3 hours, a day, or 3 days.
  **זמן אחר** reveals the exact number and minutes/hours/days controls. No time is selected by default.
- Monthly features still require a monthly subscription; credits do not unlock them.
  Billing bypass keeps its existing free-options-only behavior.
- Editing directions never consumes a use. Only explicit generation/refinement does.
  Directions remain in page memory; saved-person defaults change only through the
  existing save flow. No automatic message or preference persistence was added.
- Changed grammatical preferences, previous outgoing context, or approved time/price
  details mark earlier results as out of date. Refining an existing result continues
  to use that result's original request.

The initial compact bar is designed for at most 120px height at 360px viewport width,
with touch targets of at least 44px. The tone/context editor fits within 320px.
Active values may expand the bar to stay readable.

Screenshots below use synthetic data and mocked services:

<img src="docs/screenshots/reply-directions-mobile.png" alt="Hebrew mobile composer with direct reply-direction controls" width="360" />

![Desktop composer and reply preview](docs/screenshots/reply-directions-desktop.png)

<img src="docs/screenshots/followup-mobile.png" alt="Hebrew follow-up composer with one-tap elapsed-time choices" width="360" />

## Requirements

- Node.js 20+
- npm 10+
- Firebase project (client + admin credentials)
- Stripe account (secret key, publishable key, webhook secret)
- OpenAI API key (optional, only for paid AI mode)

## Setup

1. Copy `.env.example` to `.env.local`.
2. Fill all required environment variables.

## Analytics

Lightweight client analytics are optional and fail-safe when not configured.

- `NEXT_PUBLIC_GA4_MEASUREMENT_ID` (or `NEXT_PUBLIC_GA_MEASUREMENT_ID`) enables GA4.
- `NEXT_PUBLIC_CLARITY_PROJECT_ID` enables Microsoft Clarity.
- `NEXT_PUBLIC_ANALYTICS_DEBUG=true` enables local console verification mode in development.

Privacy guardrails in this project:

- Analytics payloads avoid raw user message text.
- UTM parameters (`utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `utm_id`) are attached to client events when available.
- If analytics IDs are missing, tracking calls safely no-op (no runtime breakage).
- The compact composer uses `flow_version: direction_v3` with the existing
  page/input-to-generation timing fields. This identifies the UI version without
  adding message content or grammatical preferences to analytics.

## AI Modes

- Free mode (default): set `LOCAL_FREE_AI=true` and no OpenAI/ChatGPT calls are made.
- Paid mode (optional): set `LOCAL_FREE_AI=false` and provide `OPENAI_API_KEY`.

## Temporary Billing Bypass

To run unlimited generations and disable checkout/paywall UI:

- `BILLING_BYPASS=true` (server-side enforcement)
- `NEXT_PUBLIC_BILLING_BYPASS=true` (client-side UI hide)

Use both flags together.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

### Local Analytics Verification

1. Set `NEXT_PUBLIC_ANALYTICS_DEBUG=true` in `.env.local`.
2. Leave GA/Clarity IDs empty (or set them if you want to test live delivery).
3. Run `npm run dev` and trigger funnel actions in the UI.
4. Verify events in browser DevTools Console via `[analytics:debug]` logs.
5. Optional helper: run `window.__saybackAnalyticsDebug` in the console to inspect debug status and call `.track(...)` manually.

## Production Readiness Checks

```bash
npm run check
```

This runs lint, TypeScript checks, identity/conversation/personalization/deep-link/product-contract/generator-flow regression tests, and the production build.

## Deploy (Vercel)

Preview:

```bash
vercel deploy -y
```

Production:

```bash
vercel deploy --prod -y
```

For free AI on Vercel, set `LOCAL_FREE_AI=true` in your Vercel Environment Variables.

## Stripe Webhook

The app expects a webhook route at:

- `/api/stripe/webhook`

Configure Stripe to send at least:

- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`

## Coupons

Coupon redemption endpoint:

- `POST /api/billing/redeem` (authenticated, no-store)

Firestore collections used by coupon flow:

- `coupon_codes/{CODE}`: definition (`active`, `usesGranted`, optional `maxRedemptions`, optional `startsAt`/`expiresAt`, `redeemedCount`)
- `coupon_redemptions/{CODE__UID}`: idempotent redemption record per user and code

## Notes

- API routes are configured for `no-store` responses.
- Checkout return URLs prefer `SITE_URL`/`NEXT_PUBLIC_SITE_URL` when configured.
- Security headers are set in `next.config.ts`.


## Conversation experience UI verification

`node scripts/verify-conversation-experience.mjs` checks the public experience at
360, 390, 768, 1024 and 1440 pixels. It uses Playwright and a running local server
(default `http://127.0.0.1:3100`; override with `SAYBACK_SMOKE_BASE_URL`).
Use an installed Playwright module, or set `SAYBACK_PLAYWRIGHT_MODULE` to the
absolute path of an existing Playwright `index.mjs` with Chromium installed.
`SAYBACK_CHROMIUM_EXECUTABLE_PATH` can select an already installed Chromium binary.

Start the verification server with dummy Firebase configuration:

```sh
NEXT_PUBLIC_FIREBASE_API_KEY=fixture-key \
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=sayback-ui-test.firebaseapp.com \
NEXT_PUBLIC_FIREBASE_PROJECT_ID=sayback-ui-test \
NEXT_PUBLIC_FIREBASE_APP_ID=fixture-app \
BILLING_BYPASS=false NEXT_PUBLIC_BILLING_BYPASS=false \
NEXT_PUBLIC_GA4_MEASUREMENT_ID= NEXT_PUBLIC_GA_MEASUREMENT_ID= \
NEXT_PUBLIC_CLARITY_PROJECT_ID= npm run dev -- --hostname 127.0.0.1 --port 3100
```

The browser runner intercepts Firebase authentication and all application APIs,
blocks other external traffic, and uses synthetic data. It never validates live
Firebase writes, AI responses, Stripe charges, or webhook delivery. Screenshots
and a JSON report are saved in the ignored `output/playwright/` directory.
Restart the server without these dummy environment overrides for normal use.

Run the browser suite against that server:

```sh
SAYBACK_SMOKE_BASE_URL=http://127.0.0.1:3100 node scripts/verify-conversation-experience.mjs
```

The suite checks compact-control dimensions, all choices and resets, keyboard
focus/Escape, access restrictions, saved-person/deep-link defaults, follow-up mode,
request payloads, stale results, and the existing conversation/account flows.
`tests/generation-draft.test.mjs` also verifies semantic draft comparison,
including equivalent grammatical preferences and temporary context.

To refresh the README images after an intentional UI change, run the browser suite,
inspect the screenshots, then copy `output/playwright/direction-composer-mobile.png`
and `output/playwright/direction-workspace-desktop.png` to their corresponding
`docs/screenshots/reply-directions-*.png` files.
