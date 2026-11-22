<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Working on SayBack

Use npm. For complex work, delegate independent investigations to the strongest available agents and avoid duplicate scans. Start with the matching entry below. Use focused commits and keep the README and its screenshots current when documented behavior changes.

For routine source searches, use `rg -n 'pattern' app components lib tests scripts`.

| Task | Start here | Focused check |
| --- | --- | --- |
| Home, composer, results, account | `app/page.tsx` serves metadata and mounts `app/home-page-client.tsx`. Results and checkout UI live in `components/home-replies.tsx` and `components/home-billing.tsx`. | `npm run test:product-contract` |
| Generation and refinement | `app/api/generate/route.ts` handles authentication, validation and refunds. `lib/ai.ts` selects the generation engine. | `npm run test:generation` |
| Screenshot input | `lib/prepare-screenshot.ts` prepares uploads in the browser. Server-side interpretation starts in `lib/ai.ts`. | `scripts/verify-image-compression.mjs` |
| Billing and payments | `lib/entitlements.ts` selects access, `lib/billing.ts` accounts for it, `lib/pricing.ts` defines prices. See `app/api/checkout/` and `app/api/stripe/webhook/` for reconciliation. | `tests/generation-access.test.mjs` (usage) |
| Identity, saved people, writing style | `lib/auth.ts`, `lib/conversation-profiles.ts`, `lib/my-voice.ts` and the corresponding routes under `app/api/`. | `test:identity`, `test:conversations`, `test:my-voice` (npm scripts) |
| Admin and insights | `app/admin/`, `app/insights/`, [visitor insights](docs/visitor-insights.md). | `npm run test:insights` |
| Setup and verification | [Developer guide](docs/development.md). `package.json` lists scripts and versions. | `npm run check` |

## Contracts

- Preserve mobile-first Hebrew RTL, Hebrew errors, and the public API paths, methods and response shapes. Return one short `intent` and exactly three short, natural Hebrew `replies`. Refinement accepts `action` (`softer`, `sharper`, `retry`) and `sourceReply`.
- `LOCAL_FREE_AI=true` uses only local generation. OpenAI mode uses the Responses API with validated structured output.
- Consume access in this order. Unlimited → credits → initial free → daily free → blocked. Refund consumed access on generation failure. Preserve Stripe Checkout Elements, webhook event locking and idempotent reconciliation.
- Preserve anonymous Firebase sign-in and server-side bearer token verification. Keep personal incoming messages out of persistent storage. Keep Node.js and force-dynamic API handlers, private `no-store` responses, `nosniff` and auth-dependent `Vary: Authorization`.

## Validation

Run `npm run check` (lint, typecheck, tests, build). Smoke-check anonymous auth, bearer-authenticated billing status, generation and each refine action, plus checkout and webhook reconciliation. Record which checks used fixtures or live services.
