# Stripe Connect Webhook Runbook

Phase 14.2 added a webhook spine for Stripe Connect events. This runbook covers
setup, secret rotation, the mandatory pre-deploy checklist, the read-only
revalidation migration, and an on-call playbook. Operator-only — Claude cannot
perform any of these steps.

## Pre-deploy Checklist (FINDINGS M-7 — MANDATORY before merging Wave 2)

`STRIPE_CONNECT_WEBHOOK_SECRET` is declared as a REQUIRED env var in
`apps/web/src/env.ts`. The build will fail closed in any environment where
it's not set. BEFORE merging the PR that ships Plan 03's webhook route:

- [ ] `vercel env ls production` shows `STRIPE_CONNECT_WEBHOOK_SECRET` set
- [ ] `vercel env ls preview` shows `STRIPE_CONNECT_WEBHOOK_SECRET` set
- [ ] `vercel env ls development` shows `STRIPE_CONNECT_WEBHOOK_SECRET` set
- [ ] `apps/web/.env.local` (your dev box) has `STRIPE_CONNECT_WEBHOOK_SECRET`
- [ ] `STRIPE_SECRET_KEY` is set in all three Vercel environments
- [ ] `STRIPE_APPLICATION_FEE_CENTS` is either set or you accept the default (100)

If any box is unchecked, do NOT merge — the deploy will fail with a zod env
validation error at startup. Use the "Initial Setup" section below to populate
the missing values first.

## Initial Setup (one-time per environment)

1. Stripe Dashboard → Developers → Webhooks → "Add an endpoint for connected accounts"
2. Endpoint URL:
   - Production: `https://app.onetool.biz/api/stripe-webhook`
   - Preview/staging: `https://<vercel-preview>.vercel.app/api/stripe-webhook`
   - Dev: use `stripe listen --forward-to localhost:3000/api/stripe-webhook`
3. Subscribe to these events (Core 5 — Phase 14.2 scope):
   - `checkout.session.completed`
   - `payment_intent.payment_failed`
   - `charge.refunded`
   - `charge.dispute.created`
   - `account.updated`
4. Copy the signing secret (`whsec_...`) shown in the Dashboard.
5. Set the env var:
   - Vercel production: `vercel env add STRIPE_CONNECT_WEBHOOK_SECRET production`
   - Vercel preview: `vercel env add STRIPE_CONNECT_WEBHOOK_SECRET preview`
   - Vercel development: `vercel env add STRIPE_CONNECT_WEBHOOK_SECRET development`
   - Local dev: add `STRIPE_CONNECT_WEBHOOK_SECRET=whsec_...` to `apps/web/.env.local`
6. Test mode and live mode each have separate secrets — use environment-specific values.

## Verification

1. Stripe Dashboard → Developers → Webhooks → select endpoint → "Send test event"
2. Pick `checkout.session.completed`.
3. Confirm 200 response in the Dashboard delivery log.
4. Confirm a row appears in the Convex `stripeWebhookEvents` table with
   `status="processed"` (Convex Dashboard → Data → stripeWebhookEvents).
5. Confirm no errors in Vercel function logs for `/api/stripe-webhook`.

## Secret Rotation

1. Stripe Dashboard → Developers → Webhooks → endpoint → "Roll secret".
2. Copy NEW secret immediately (Stripe shows it once).
3. Update Vercel env var:
   - `vercel env rm STRIPE_CONNECT_WEBHOOK_SECRET production`
   - `vercel env add STRIPE_CONNECT_WEBHOOK_SECRET production`
4. Redeploy: `vercel --prod`.
5. Stripe keeps the old secret valid for 24h to allow rollover. After
   rotation, run `stripe events resend <event_id>` from CLI to confirm the
   new secret works.
6. After 24h, old secret is invalidated automatically.

## Connect-Account Revalidation Migration (Phase 14.2 deploy)

After Wave 3 deploys, run ONCE per environment:

```bash
cd packages/backend
pnpm convex run migrations/revalidateStripeConnectAccounts:run
```

Output: `{ total, ok, mismatched, notFound }`. Investigate any non-zero
`mismatched` or `notFound` count manually — the script is read-only and will
NOT auto-remediate. Mismatch = org's stored email differs from Stripe-side
account email. NotFound = Stripe account no longer exists.

## On-Call: Webhook 5xx Spike

Phase 14.2's webhook route returns **500 on dispatch failure** (FINDINGS W-2
— Stripe will retry 5xx for ~3 days, which combined with the W-1 status-field
lifecycle means a transient failure recovers automatically when Stripe
replays). If you see real 5xx responses to Stripe in production:

1. Check Vercel function logs for `/api/stripe-webhook` route — filter on errors.
2. Common causes:
   - `STRIPE_CONNECT_WEBHOOK_SECRET` unset (env validation throws on startup) —
     Vercel env var was rotated but redeploy did not pick it up.
   - Convex backend down or aggregate write failure.
   - Type mismatch / amount mismatch in `markPaidFromWebhookInternal` —
     investigate the underlying `payments` row by `publicToken`.
3. Inspect the failed events: `stripeWebhookEvents` table where
   `status === "failed"` — the `failureReason` field carries the trimmed
   error message.
4. Fix root cause, redeploy. Stripe will retry buffered events on its own;
   the W-1 retry semantics will re-enter the type-switch on each replay until
   success.

## Forging Test Events (dev only)

For local testing without the Stripe Dashboard:

```bash
stripe listen --forward-to localhost:3000/api/stripe-webhook
stripe trigger checkout.session.completed
```

The `stripe listen` command prints the LOCAL signing secret — set it as
`STRIPE_CONNECT_WEBHOOK_SECRET` in `.env.local` for the dev session.
