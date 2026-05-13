# Stripe Connect Webhook Runbook

Phase 14.2 added a webhook spine for Stripe Connect events. The endpoint is
hosted as a Convex `httpAction` in `packages/backend/convex/http.ts` (same
pattern as the Clerk, BoldSign, and Resend webhooks) — **not** as a Next.js
route. This runbook covers setup, secret rotation, the mandatory pre-deploy
checklist, the read-only revalidation migration, and an on-call playbook.
Operator-only — Claude cannot perform any of these steps.

## Pre-deploy Checklist (FINDINGS M-7 — MANDATORY before merging Wave 2)

`STRIPE_CONNECT_WEBHOOK_SECRET` is read directly from `process.env` inside the
Convex `httpAction`. If the secret is unset the route fails closed with a
500 (`"Webhook verification not configured"`) and Stripe will continue
retrying — visible immediately in the Convex Dashboard logs. Set the secret
in EVERY Convex deployment BEFORE pointing the Stripe Dashboard endpoint at
that deployment:

- [ ] `npx convex env list --prod` shows `STRIPE_CONNECT_WEBHOOK_SECRET` set
- [ ] `npx convex env list` (dev deployment) shows `STRIPE_CONNECT_WEBHOOK_SECRET` set
- [ ] `STRIPE_SECRET_KEY` is set in every Convex deployment (`npx convex env list ...`)
- [ ] `STRIPE_APPLICATION_FEE_CENTS` is either set or you accept the default (100)
- [ ] Stripe Dashboard endpoint URL points at `https://<deploy>.convex.site/stripe-webhook` for the matching deployment (production endpoint → prod deployment URL, etc.)

If any box is unchecked, do NOT enable the endpoint in Stripe — the deploy will
return 500 to Stripe on every event and the events will pile up in Stripe's
retry queue. Use the "Initial Setup" section below to populate the missing
values first.

## Initial Setup (one-time per environment)

1. Identify the Convex deployment URL for the environment:
   ```bash
   # production
   npx convex deployments  # → look for the `prod` row's deployment URL
   # development
   cat packages/backend/.env.local | grep CONVEX_URL
   ```
   The webhook URL is that origin with `/stripe-webhook` appended (the
   Convex HTTP origin uses `*.convex.site`, NOT the `*.convex.cloud` API origin).
2. Stripe Dashboard → Developers → Webhooks → "Add an endpoint for connected accounts"
3. Endpoint URL:
   - Production: `https://<prod-deploy-id>.convex.site/stripe-webhook`
   - Staging / preview: `https://<staging-deploy-id>.convex.site/stripe-webhook`
   - Dev: use `stripe listen --forward-to https://<dev-deploy-id>.convex.site/stripe-webhook`
     (or proxy through your local `convex dev`'s exposed HTTP origin)
4. Subscribe to these events (Core 5 — Phase 14.2 scope):
   - `checkout.session.completed`
   - `payment_intent.payment_failed`
   - `charge.refunded`
   - `charge.dispute.created`
   - `account.updated`
5. Copy the signing secret (`whsec_...`) shown in the Dashboard.
6. Set the env var ON THE MATCHING CONVEX DEPLOYMENT:
   - Production:
     ```bash
     npx convex env set STRIPE_CONNECT_WEBHOOK_SECRET whsec_xxx --prod
     ```
   - Development / preview:
     ```bash
     npx convex env set STRIPE_CONNECT_WEBHOOK_SECRET whsec_xxx
     ```
7. Test mode and live mode each have separate Stripe Dashboard secrets — use
   environment-specific values. Set them on the corresponding Convex
   deployment.

> **Why Convex and not Next.js?** All other webhooks in this project (Clerk,
> BoldSign, Resend) are registered in `packages/backend/convex/http.ts`. Hosting
> Stripe there lets the handler call `internal.*` functions directly (instead
> of forcing them public to be reachable via `convex/nextjs`), and the
> endpoint URL is decoupled from the Vercel domain so swapping Next.js
> deployments doesn't require updating the Stripe Dashboard.

## Verification

1. Stripe Dashboard → Developers → Webhooks → select endpoint → "Send test event"
2. Pick `account.updated` (cheapest because no payment row is required).
3. Confirm 200 response in the Dashboard delivery log.
4. Confirm a row appears in the Convex `stripeWebhookEvents` table with
   `status="processed"` (Convex Dashboard → Data → stripeWebhookEvents).
5. Confirm no errors in Convex Dashboard → Logs filtered to the
   `/stripe-webhook` route.

## Secret Rotation

1. Stripe Dashboard → Developers → Webhooks → endpoint → "Roll secret".
2. Copy the NEW secret immediately (Stripe shows it once).
3. Update Convex env var (the command replaces the existing value):
   ```bash
   npx convex env set STRIPE_CONNECT_WEBHOOK_SECRET whsec_NEW --prod
   ```
4. Stripe keeps the old secret valid for 24h to allow rollover, so this is a
   zero-downtime swap — no redeploy required because the httpAction reads
   `process.env` on every invocation.
5. After rotation, click "Send test event" in the Stripe Dashboard to confirm
   the new secret verifies.
6. After 24h Stripe automatically invalidates the old secret.

## Connect-Account Revalidation Migration (Phase 14.2 deploy)

After Wave 3 deploys, run ONCE per environment:

```bash
cd packages/backend
npx convex run migrations/revalidateStripeConnectAccounts:run --prod
```

Output: `{ total, ok, mismatched, notFound }`. Investigate any non-zero
`mismatched` or `notFound` count manually — the script is read-only and will
NOT auto-remediate. Mismatch = org's stored email differs from Stripe-side
account email. NotFound = Stripe account no longer exists.

## On-Call: Webhook 5xx Spike

The Convex httpAction returns **500 on dispatch failure** (FINDINGS W-2 —
Stripe will retry 5xx for ~3 days, which combined with the W-1 status-field
lifecycle means a transient failure recovers automatically when Stripe
replays). If you see real 5xx responses to Stripe in production:

1. Convex Dashboard → Logs → filter on `/stripe-webhook` route — look for
   error lines (`Stripe webhook verification failed: ...` /
   `Stripe webhook error: ...`).
2. Common causes:
   - `STRIPE_CONNECT_WEBHOOK_SECRET` unset on the Convex deployment — the
     httpAction logs `"STRIPE_CONNECT_WEBHOOK_SECRET not configured"` and
     returns 500. Fix with `npx convex env set ... --prod`. No redeploy
     required.
   - Convex backend error in a downstream mutation — find the underlying
     payments row by `publicToken`.
   - Schema/amount mismatch in `markPaidFromWebhookInternal` — investigate the
     payment row; the type-switch will re-run on Stripe replay once the
     mismatch is fixed.
3. Inspect failed events: `stripeWebhookEvents` table where
   `status === "failed"` — the `failureReason` field carries the trimmed
   error message and `attemptCount` shows how many replays have happened.
4. Fix root cause. No redeploy needed — `process.env` is read live; the
   handleEvent code is hot-reloaded on the next `npx convex deploy`. Stripe
   will retry buffered events on its own; the W-1 retry semantics re-enter
   the type-switch on each replay until success.

## Forging Test Events (dev only)

For local testing without the Stripe Dashboard:

```bash
# Forward live test-mode events at your dev Convex deployment.
stripe listen --forward-to https://<dev-deploy-id>.convex.site/stripe-webhook

# In a second terminal, trigger an event.
stripe trigger checkout.session.completed
```

The `stripe listen` command prints the LOCAL signing secret — set it as the
Convex env var for your dev deployment:

```bash
npx convex env set STRIPE_CONNECT_WEBHOOK_SECRET whsec_LOCAL
```

(No `.env.local` step required — the Convex runtime reads from its own env
store, not from `apps/web/.env.local`.)

## Migration from the Next.js route (historical, 2026-05-13)

Phase 14.2 originally landed the webhook as a Next.js route at
`apps/web/src/app/api/stripe-webhook/route.ts`, which forced
`stripeWebhookActions.handleEvent` to be a PUBLIC action (the V-1 pivot —
`convex/nextjs` can't reach `internal.*`). On 2026-05-13 the endpoint was
migrated to Convex `httpAction` to match the Clerk/BoldSign/Resend pattern.
If you're upgrading an older deployment:

1. In the Stripe Dashboard, update the endpoint URL from
   `https://<vercel-host>/api/stripe-webhook` to
   `https://<convex-deploy>.convex.site/stripe-webhook`.
2. Move `STRIPE_CONNECT_WEBHOOK_SECRET` from Vercel env to Convex env:
   ```bash
   # Remove from Vercel (optional — env is no longer referenced)
   vercel env rm STRIPE_CONNECT_WEBHOOK_SECRET production
   vercel env rm STRIPE_CONNECT_WEBHOOK_SECRET preview
   vercel env rm STRIPE_CONNECT_WEBHOOK_SECRET development

   # Add to Convex
   npx convex env set STRIPE_CONNECT_WEBHOOK_SECRET whsec_xxx --prod
   npx convex env set STRIPE_CONNECT_WEBHOOK_SECRET whsec_xxx
   ```
3. Deploy the backend (`cd packages/backend && pnpm deploy`) so the new
   `/stripe-webhook` route appears in the Convex deployment.
4. Send a "Send test event" from the Stripe Dashboard to confirm the new URL
   responds 200.
