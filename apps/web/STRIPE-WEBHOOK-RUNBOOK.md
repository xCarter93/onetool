# Stripe Connect Webhook Runbook

Operator playbook for the Stripe Connect webhook endpoint that powers the
embedded portal payment flow (Phase 14.2, Phase 14.2.1, Phase 15).

## Endpoint URL

- Production: `{NEXT_PUBLIC_CONVEX_URL}/stripe-webhook` — Convex `httpAction`
  defined in `packages/backend/convex/http.ts`.
- Test mode: same path on the matching test Convex deployment URL.

## Required Connect events

Subscribe in Stripe Dashboard → Developers → Webhooks → the Connect endpoint:

- `checkout.session.completed` — Phase 14.2 legacy `/pay/[token]` flow
- `payment_intent.payment_failed` — Phase 14.2
- `payment_intent.succeeded` — **NEW in Phase 15** — required for the
  embedded portal payment surface (`/portal/c/{cpid}/invoices/{invoiceId}`)
- `charge.refunded`
- `charge.dispute.created`
- `charge.dispute.updated`
- `charge.dispute.closed`
- `charge.refund.updated`
- `account.updated`
- `account.application.deauthorized`
- `payout.paid` — Phase 14.2.1
- `payout.failed` — Phase 14.2.1
- `capability.updated` — Phase 14.2.1
- `account.external_account.created` — Phase 14.2.1
- `account.external_account.updated` — Phase 14.2.1
- `checkout.session.expired` — optional but recommended

## Secrets (Convex dashboard → environment variables)

- `STRIPE_CONNECT_WEBHOOK_SECRET` — signing secret for the Connect endpoint.
- `STRIPE_SECRET_KEY` — restricted key. Required scopes (minimum):
  `payment_intents:write`, `charges:read`, `accounts:read`.
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — browser-exposed publishable key.
  Single canonical name across the codebase (matches the client schema in
  `apps/web/src/env.ts`).
- `STRIPE_APPLICATION_FEE_CENTS` — integer cents, `z.coerce.number()`
  validated in `apps/web/src/env.ts`.

## Pre-deploy Checklist (Phase 14.2 M-7 + Phase 15)

- [ ] `payment_intent.succeeded` is registered on the Connect webhook endpoint.
- [ ] `STRIPE_CONNECT_WEBHOOK_SECRET` is set in Convex production env.
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is set in Vercel project env
      (browser bundle).
- [ ] `STRIPE_APPLICATION_FEE_CENTS` is set and non-zero.
- [ ] Manual smoke test in test mode: load a portal invoice, click Pay,
      submit Visa `4242 4242 4242 4242`, confirm the rail flips to Paid
      within ~10s.
- [ ] Manual smoke test for 3DS: card `4000 0027 6000 3184`; confirm the
      redirect + return; rail flips.
- [ ] Apple Pay merchant-domain verification registered (Stripe Dashboard →
      Settings → Payment methods → Apple Pay → Add domain).

## Secret Rotation

1. Generate a new signing secret in Stripe Dashboard.
2. Update `STRIPE_CONNECT_WEBHOOK_SECRET` in Convex env **first**.
3. Roll Stripe to send the new secret.
4. Remove the old secret once Stripe is signing with the new one.

## Post-deploy Revalidation Migration (Phase 14.2 PLAN-05 reference)

One-shot script `packages/backend/convex/migrations/revalidatePayments.ts`
(read-only) lists payments with `pendingCheckoutSessionId` or
`pendingPaymentIntentId` set, verifies each is still alive on Stripe, and
reports stale entries for manual cleanup.

If the migration file does not yet exist, treat this section as future
work — do **not** block the runbook on the script existing today.

## On-call Playbook

| Symptom | Likely Cause | Diagnostic | Fix |
|---------|--------------|------------|-----|
| Portal Pay succeeded in browser but rail stays on Pay | `payment_intent.succeeded` not subscribed OR Convex env missing `STRIPE_CONNECT_WEBHOOK_SECRET` | Stripe Dashboard → Webhooks → endpoint → Events tab shows `payment_intent.succeeded` in retry state | Add the subscription OR fix the env secret |
| Webhook 5xx in retry loop | Signature mismatch OR `markPaidFromPaymentIntentWebhookInternal` gauntlet failing | Convex logs for the failing event id; check the gauntlet error code | Common cause: payment row edited after PI mint, breaking amount equality |
| Duplicate paid writes | `stripeWebhookEvents` dedupe failed | Should **not** happen — `startProcessingEvent` is atomic | Investigate Convex transaction logs |
| `PAYMENTS_NOT_ENABLED` surfacing in portal | `org.stripeChargesEnabled` is false | Convex Dashboard → organizations row for the org | Re-onboard the Connect account |
| Apple Pay button missing on portal | Apple Pay merchant domain not registered | Stripe Dashboard → Settings → Payment methods → Apple Pay → Verified domains | Add the portal domain |
| Legacy invoice client confused why no embedded payment | Decision A — legacy invoices are view-only in the portal | Detail page shows "Pay via your invoice email link" notice | Direct the client to the email link OR open `/pay/[token]` directly |
