# SayBack

**Turn an incoming message into three short, natural Hebrew replies.**

SayBack is a Hebrew-first, right-to-left web app for finding the right words in personal conversations, customer messages, and everyday negotiations. Paste a message, choose a tone, then copy or refine the reply that fits.

**[Try the live app](https://sayback.vercel.app)** · [Visual walkthrough](docs/walkthrough.md) · [Setup & operations](docs/development.md)

## See the workflow

<table>
  <tr>
    <th width="52%">1. Add the message and choose a tone</th>
    <th width="48%">2. Compare three replies and choose one</th>
  </tr>
  <tr>
    <td valign="top"><img src="docs/screenshots/02-style.jpg" alt="SayBack input: a built-in customer negotiation example, gentle tone, optional context, and the generate button." width="100%"></td>
    <td valign="top"><img src="docs/screenshots/03-replies.jpg" alt="Actual SayBack result: a short interpretation and three Hebrew reply cards, each with copy and refinement controls." width="100%"></td>
  </tr>
  <tr>
    <td>Example: “I saw the offer. If you take another 20% off, I'll close now.”</td>
    <td>Review the suggested wording before using it. SayBack does not send the reply for you.</td>
  </tr>
</table>

*Real screenshots from the live site, captured on November 6, 2026 using a built-in sample. No private conversations or account details are shown. The output is an actual completed generation, not a mockup.*

## What it does

- **Three suggestions per request:** a short interpretation of the incoming message plus exactly three Hebrew replies.
- **Tone and context controls:** gentle, direct, casual, funny, or flirty wording, with optional relationship, goal, and grammatical-gender preferences.
- **Refinement:** soften, sharpen, regenerate, or give a custom rewriting instruction.
- **Follow-ups:** draft a message when someone has not replied, using the last outgoing message and elapsed time.
- **Text or screenshot input:** image understanding is available through the configured OpenAI mode; local free mode is rule-based and does not read image contents.
- **Account and billing infrastructure:** Firebase authentication, Firestore-backed usage limits, Stripe checkout, subscriptions, and coupon redemption. Availability depends on deployment configuration and access level.

## Engineering highlights

| Area | Implementation |
| --- | --- |
| Frontend | Next.js 16.2.1 App Router, React 19.2.4, strict TypeScript, Tailwind CSS v4; Hebrew RTL interface |
| Generation | Server-side API with a schema-validated `intent` + exactly three `replies`; optional OpenAI Responses API or local rule-based mode |
| Access control | Firebase ID-token verification, Firestore-backed rate limits, usage accounting, and usage rollback when generation fails |
| Payments | Stripe Checkout Elements, checkout reconciliation, and idempotent webhook processing |
| Privacy | Message content is excluded from generation usage logs; analytics privacy filters and regression tests are included |
| Quality checks | ESLint, TypeScript, identity/conversation/personalization tests, generation and insights regressions, production build |

### Code map

- [`app/home-page-client.tsx`](app/home-page-client.tsx): generator state, input, results, refinement, and account UI.
- [`components/conversation-experience.tsx`](components/conversation-experience.tsx): shared Hebrew conversation interface.
- [`app/api/generate/route.ts`](app/api/generate/route.ts): authenticated generation request, access checks, and rollback.
- [`lib/ai.ts`](lib/ai.ts): input normalization, local/API mode selection, and output validation.
- [`lib/billing.ts`](lib/billing.ts) and [Stripe webhook](app/api/stripe/webhook/route.ts): entitlements and payment lifecycle.
- [`tests/`](tests) and [`scripts/`](scripts): regression suites and browser verification.

## Run locally

Requires Node.js 20+, npm 10+, and Firebase client/admin configuration. See [`.env.example`](.env.example) for the complete environment template.

```bash
npm install
cp .env.example .env.local
# Fill in the required Firebase credentials and environment settings.
npm run dev
```

Open http://localhost:3000. The example environment enables `LOCAL_FREE_AI=true`, which makes no OpenAI calls. To use the OpenAI mode, set `LOCAL_FREE_AI=false` and provide `OPENAI_API_KEY`. Stripe credentials are needed for checkout and webhook functionality.

```bash
npm run check
```

This runs lint, type checking, regression suites, and a production build. For the isolated multi-viewport browser checks, analytics verification, billing bypass flags, Stripe events, coupon collections, and Vercel commands, see the **[complete development guide](docs/development.md)**.

## Documentation

- [Visual walkthrough and screenshot provenance](docs/walkthrough.md)
- [Development, configuration, verification, and deployment](docs/development.md)
- [Visitor insights](docs/visitor-insights.md)
