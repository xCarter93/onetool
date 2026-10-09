# Competitor notes for the landing Compare table

Research behind `apps/web/src/app/components/marketing/sections/competitor-data.ts`. Vendor pages were read on 2026-08-16 unless a note says otherwise. Moved here from the never-imported `sections/competitor-notes.ts` so it stays out of the client bundle.

## OneTool

- Business price and the permanent Free plan: see `apps/web/src/lib/plan-pricing.ts` (`BUSINESS_MONTHLY_USD`, `BUSINESS_YEARLY_USD`).
- The price lives in `lib/plan-pricing.ts`. The Compare table is static on purpose; `sections/pricing.tsx` prefers live Clerk plan data and falls back to the same number. Confirm the live Clerk price before changing it.
- Client portal ships on every plan: apps/web routes `/portal/c/[clientPortalId]/{quotes,invoices}` with OTP verification, quote approval, e-signature and card payment.
- Seats (2026-08-23, Slice A packaging): Business includes 20 team members at one flat price, Free includes 5. Clerk-enforced, see `packages/backend/convex/lib/planMatrix.ts`. Clients and active projects are unlimited on both plans; extra seats are not sold.
- Offline mobile (2026-10-08): shipped in #377, merged to staging 2026-09-27. Per `packages/help-content/articles/mobile-app.ts` ("Working without signal"), routes, tasks, project and client edits, team chat, cash/check payments and signing a sent quote work offline and sync later; creating records, sending quotes and invoices, line items, uploads and route planning need a connection.
- Card payments run through Stripe Connect on the org's own Stripe account, so the org pays Stripe's rate directly (US standard online card is 2.9% + 30¢). OneTool adds a flat application fee of $1 per transaction on top. `packages/backend/convex/portal/invoicesActions.ts` sets `application_fee_amount` from `STRIPE_APPLICATION_FEE_CENTS`, read as 100 off the deployment on 2026-08-16. It is env-driven, so re-read it before changing the table. Both Jobber and Joby publish the bare Stripe rate with no markup, so this is the one row where we are the most expensive.

## Jobber

- Read verbatim on 2026-08-16, one team-size bucket at a time (monthly / billed-annually).
  - "Just me", each card marked "1 user": Core $49/$29, Connect $139/$99, Grow $199/$149. No Plus card.
  - "2-5 people", each "/Includes 5 users/": Connect $199/$149, Grow $299/$229, Plus $499/$399. No Core card.
  - "6-10 people", each "Includes 10 users": Connect $299/$229, Grow $399/$299, Plus $599/$449.
  - "11-15 people", each "Includes 15 users": Connect $399/$299, Grow $499/$399, Plus $699/$529.
  - "16 or more" replaces every price with "Let's chat" / Contact Sales and hides the billing toggle.
- Month-to-month figures are used here. Jobber's page loads on Monthly and its monthly cards read "No commitment". The annual column is genuinely cheaper, by bucket: Core $29; Connect $99 / $149 / $229 / $299; Grow $149 / $229 / $299 / $399; Plus $399 / $449 / $529. The section footnote discloses that.
- Jobber DOES still publish extra seats: the "?" beside "Includes N users" reads "A user is anyone who accesses your account at the office or in the field to view or manage the team's schedule. Add users for $29/mo each." We deliberately do NOT apply that $29 across buckets to synthesise a cheaper configuration (e.g. Core + 5 add-on seats for a crew of six). Jobber's page does not offer the lower-bucket plans to a larger crew, so the bucket price is what that crew is actually quoted, and quoting anything else would not be reproducible by a reader loading the page.
- Add-ons priced separately: Marketing Suite $99/mo, Receptionist $29/mo, Pipeline $49/mo, as read on /pricing/. NOTE a live self-contradiction in Jobber's own copy: /features/ prices Marketing Suite at $79/mo. Neither number is used in any table cell; if one is ever quoted, say which page it came from.
- Card-processing rate IS published, on https://www.getjobber.com/features/ under "Get Paid", not on /pricing/ (a direct browser read of the pricing page on 2026-08-16 found no rate on it at all). Verbatim: "Card payments … Rate: 2.9% + 30¢ / transaction" and "ACH bank payments … Rate: 1% / transaction", alongside "Online payments are included with your Jobber account with no additional monthly or set up fees—you only pay when you get paid." Jobber Payments is Stripe-powered (stripe.com/newsroom/news/jobber), so that is the plain Stripe rate with no visible markup. A help-centre snippet suggests card-PRESENT rates vary by plan (2.5% Grow / 2.7% Connect / 2.9% Core); the table quotes the published online-card headline rate.
- Customer portal is published as "Client Hub": getjobber.com/features/ describes customers entering card details "in client hub" to pay an invoice.
- Offline mobile work shipped 2026-03-18 (productupdates.getjobber.com/134787): job forms, visit details and notes, and time tracking save locally and sync when back online.

## Housecall Pro

- Re-verified 2026-08-16 and UNCHANGED. Monthly rates $79 / $189 / $329 are quoted here; annual is $59 / $149 / $299, and the page's own billing toggle defaults to Annual. Seat allowances 1 / 5 / 8 come from Housecall Pro's own machine-readable summary, https://www.housecallpro.com/llm-info/, which states "Basic - 1 user", "Essentials - includes 5 users", "MAX - includes 8 users" and dates itself "As of July 2026".
- "Additional users are available on the MAX plan". The per-additional-user price is not published, so crews above 8 are not computable and render an em dash.
- The pricing page now leads with a "Get the right plan" wizard and only reveals the plan cards after it; the card prices above are still in the page payload and match llm-info.
- Customer portal is published as "Customer Portal", with its own feature page (housecallpro.com/features/customer-portal/) and help-centre collection: customers view past and upcoming appointments, view and pay invoices, and message the business. It is not named in the pricing page's per-plan feature lists, so no tier gating is claimed.
- "Included in every Housecall Pro plan" band lists: live phone and chat support, card processing rates as low as 2.59%, free iOS/Android app, and OFFLINE VIEWING.
- Feature tiers on the pricing page: Essentials adds "Routes" (group and sequence jobs), "Checklist automations" and QuickBooks Online sync; MAX adds "Route optimization", open API and escalated phone support.

## Joby

- Read verbatim on 2026-08-16: "Flat monthly pricing with unlimited users on every plan. 14-day free trial." Starter $89/mo, Pro $129/mo, Grow $250/mo. No annual-billing option is published, so these ARE the cheapest published figures.
- Every tier says "Unlimited users" on the plan card and in the compare grid. Post-Slice-A this IS a real difference: OneTool Business includes 20 seats and Free 5, so Joby wins the seat row outright and we compete on price.
- "Customer self-serve portal" is checked on all three tiers in the compare grid, and joby-pay adds "A clean, branded payment page that loads on any phone — no Joby account required".
- Compare grid, read tier-by-tier: "Estimates & e-signatures", "Online card payments (Joby Pay / Stripe)", "CSV import (leads & clients)" and "Mobile app (iOS & Android)" are checked on all three tiers. "Workflow automations (visual)" is an em dash on Starter and checked on Pro and Grow.
- joby.io/products/joby-pay publishes the rate outright, verbatim: "Standard Stripe processing fees apply (2.9% + 30¢ for card, 0.8% for ACH capped at $5). There is no extra Joby fee on top — your seat price covers the platform. Enterprise customers can negotiate custom processing rates with Stripe." Charges run through the org's own Stripe Express account, the same Connect model as ours, so Joby beats us on this row. Separately, "Online card payments (Joby Pay / Stripe)" confirms Joby is on Stripe like us and Jobber, so the underlying cost is comparable and only the markup is unknown. Also, nothing about route planning or optimization appears; the closest published rows are "Service-area matching" and "Live location team tracking" ($5 per active worker/month add-on). No offline capability is claimed anywhere on the page.
- Support ladder is published as email support (Starter), priority support (Pro), dedicated success manager (Grow). No phone support for customers is published, which is notable for a vendor whose product IS a phone system.
- Communication usage is billed on top of every plan: calls from $0.006/min local inbound, $0.015/min outbound, SMS $0.008/segment, phone numbers $1/mo local. Our table quotes the plan fee only, which is Joby's best case.
