# SayBack

Next.js 16 (App Router) app for generating Hebrew reply suggestions with OpenAI, Firebase auth, and Stripe billing.

## Requirements

- Node.js 20+
- npm 10+
- Firebase project (client + admin credentials)
- Stripe account (secret key, publishable key, webhook secret)
- OpenAI API key

## Setup

1. Copy `.env.example` to `.env.local`.
2. Fill all required environment variables.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

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

## Stripe Webhook

The app expects a webhook route at:

- `/api/stripe/webhook`

Configure Stripe to send at least:

- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`

## Notes

- API routes are configured for `no-store` responses.
- Checkout return URLs prefer `SITE_URL`/`NEXT_PUBLIC_SITE_URL` when configured.
- Security headers are set in `next.config.ts`.
