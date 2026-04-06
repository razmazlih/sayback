# SayBack

Next.js 16 (App Router) app for generating Hebrew reply suggestions, with Firebase auth and Stripe billing.

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

This runs:

- `lint`
- `typecheck`
- `build`

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
