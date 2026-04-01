<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# SayBack Agent Guide

## Agent policy
- For complex tasks, use the strongest available Codex model/agents and delegate substantial parallelizable analysis.

## Product scope (must stay true)
- SayBack is a Hebrew RTL Next.js App Router app.
- The core action is generation of **exactly 3 short, natural Hebrew replies** for an incoming message/screenshot.
- Generator output contract is always:
  - `intent`: one short sentence.
  - `replies`: exactly 3 reply strings.
- Supported refine actions are: `softer`, `sharper`, `retry`.

Source of truth: `lib/ai.ts`, `app/page.tsx`, `app/api/generate/route.ts`.

## Tech stack (actual repo)
- Next.js `16.2.1` + App Router (`package.json`)
- React `19.2.4` / `react-dom` `19.2.4` (`package.json`)
- TypeScript strict (`tsconfig.json`: `"strict": true`)
- Tailwind CSS v4 (`tailwindcss: ^4`, `@tailwindcss/postcss: ^4`)
- Firebase client SDK (`firebase`) + Firebase Admin SDK (`firebase-admin`)
- Stripe (`stripe`, `@stripe/react-stripe-js`, `@stripe/stripe-js`)

## Package manager and scripts (do not guess)
- Package manager: **npm** (`package-lock.json` present).
- Development:
  - `npm run dev` (Webpack)
  - `npm run dev:turbo` (Turbopack)
- Quality gates:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build`
  - `npm run check` (runs all three)

Source of truth: `package.json`.

## Repository layout
- `app/`
  - `page.tsx`: landing + generator form + example cards + results + billing/paywall + checkout UX.
  - `layout.tsx`: global metadata + `lang="he"` + `dir="rtl"`.
  - API routes:
    - `app/api/generate/route.ts`
    - `app/api/billing/status/route.ts`
    - `app/api/checkout/route.ts`
    - `app/api/checkout/session/route.ts`
    - `app/api/stripe/webhook/route.ts`
- `components/`
  - `checkout-payment-form.tsx`: Stripe Checkout Elements/PaymentElement UI.
- `lib/`
  - `ai.ts`: generation engine, OpenAI gating, local free mode, schema validation.
  - `billing.ts`: access consumption order, free/daily limits, credits/subscription, refunds, Stripe reconciliation.
  - `auth.ts`: Firebase ID token verification.
  - `firebase-client.ts`: anonymous client auth.
  - `firebase-admin.ts`: Admin app/auth/firestore wiring.
  - `rate-limit.ts`: Firestore-backed request limits.
  - `pricing.ts` + `stripe.ts`: plans, prices, Stripe session config.

## Core business rules

### Generation + format rules
- Never break output shape from `generateReplies` (`lib/ai.ts`):
  - `intent: string`
  - `replies: [string, string, string]`
- Preserve refine flow:
  - `action` + `sourceReply` accepted in generate payload.
  - Actions map to softer/sharper/retry behavior.
- `/api/generate` must keep rollback behavior:
  - If usage was consumed and generation fails, call `refundGenerationAccess(...)`.

Source of truth: `lib/ai.ts`, `app/api/generate/route.ts`.

### AI mode gating
- If `LOCAL_FREE_AI=true`: **never call OpenAI**. Use local reply generation only.
- If `LOCAL_FREE_AI=false`: use OpenAI Responses API (`https://api.openai.com/v1/responses`) with schema-validated JSON output.

Source of truth: `lib/ai.ts` (`FREE_AI_MODE_ENABLED`, `generateFreeReplies`, `fetch(OPENAI_URL, ...)`).

### Free and paid access
- Free plan:
  - First 3 uses free (`FREE_LIMIT = 3`).
  - After that: 1 free use per day (`DAILY_FREE_LIMIT = 1`).
- Paid plans:
  - `credits_50`: 50 uses for `9.90₪`.
  - `unlimited_monthly`: `24.90₪` subscription.
- Consumption order (must stay exact):
  - `unlimited` -> `credits` -> `initial_free` -> `daily_free` -> blocked.

Source of truth:
- `lib/billing.ts` (`consumeGenerationAccess`, `FREE_LIMIT`, `DAILY_FREE_LIMIT`)
- `lib/pricing.ts` (`CREDIT_PACK_PLAN_ID`, `CREDIT_PACK_USES`, `CREDIT_PACK_PRICE_AGOROT`)
- `lib/stripe.ts` (`checkoutPlans.unlimited_monthly` price `2490`)

### Checkout + webhook reconciliation
- Checkout uses Stripe Checkout Sessions with `ui_mode: "elements"`.
- Payment and subscription reconciliation must remain idempotent and webhook-safe.
- Preserve event lock/processed state handling for webhook events.

Source of truth:
- `app/api/checkout/route.ts` (`ui_mode: "elements"`)
- `app/api/checkout/session/route.ts` (`reconcilePaidCheckoutSession`)
- `app/api/stripe/webhook/route.ts`
- `lib/billing.ts` (`acquireStripeEventProcessing`, `markStripeEventProcessed`, `markStripeEventFailed`)

## API contracts (do not break)
- `POST /api/generate`
- `GET /api/billing/status`
- `POST /api/checkout`
- `GET /api/checkout/session`
- `POST /api/stripe/webhook`

Keep methods, paths, and top-level response intent stable for frontend compatibility.

## Firestore collections (in use)
- `billing/{uid}`
- `request_rate_limits/{id}`
- `stripe_events/{eventId}`
- `stripe_checkout_sessions/{sessionId}`

Source of truth: `lib/billing.ts`, `lib/rate-limit.ts`.

## Runtime and caching constraints
- All API routes above must stay:
  - `export const runtime = "nodejs"`
  - `export const dynamic = "force-dynamic"`
- Response headers for authenticated/private routes should include:
  - `Cache-Control: no-store`
  - `X-Content-Type-Options: nosniff`
  - `Vary: Authorization` (where auth-dependent)

Source of truth: files under `app/api/**/route.ts`.

## Security constraints
- Verify Firebase bearer ID token on server with Admin SDK (`requireAuthenticatedUser` / `verifyIdToken`).
- Keep anonymous Firebase client auth flow intact on client (`signInAnonymously` in `app/page.tsx`).
- Do not persist personal incoming messages in Firestore or other storage.
- Keep Hebrew-friendly client-facing error messages.

Source of truth: `lib/auth.ts`, `lib/firebase-admin.ts`, `lib/firebase-client.ts`, `app/page.tsx`.

## UI/UX constraints
- Full RTL is mandatory (`dir="rtl"`, Hebrew-first copy).
- Preserve mobile-first behavior and avoid regressions in small-screen flows.
- Keep existing product structure; avoid broad refactors unless explicitly requested.

Source of truth: `app/layout.tsx`, `app/page.tsx`, `app/globals.css`.

## Do-not-break checklist
- Do not change API paths/methods listed above.
- Do not change generation output format (`intent` + exactly 3 replies).
- Do not bypass `LOCAL_FREE_AI` gating.
- Do not change billing consumption order.
- Do not remove generation rollback via `refundGenerationAccess`.
- Do not break Stripe webhook idempotency/state reconciliation.
- Do not remove `runtime="nodejs"` + `dynamic="force-dynamic"` from API handlers.
- Do not break RTL/mobile UX.

## Change validation checklist (before finishing)
1. Run `npm run lint`.
2. Run `npm run typecheck`.
3. Run `npm run build`.
4. Smoke-check:
   - Anonymous auth is established.
   - `/api/billing/status` works with bearer token.
   - `/api/generate` returns `intent` + exactly 3 replies.
   - Refine actions (`softer`, `sharper`, `retry`) work.
   - Checkout and webhook flows still reconcile billing.
