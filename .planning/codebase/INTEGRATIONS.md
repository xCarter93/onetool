# External Integrations

**Analysis Date:** 2026-03-14

## APIs & External Services

**Authentication & User Management:**
- Clerk - User and organization identity platform
  - SDK: `@clerk/nextjs` (6.34.1), `@clerk/backend` (2.19.1), `@clerk/clerk-expo` (2.12.0)
  - Auth methods: Email, OAuth, Apple authentication (Expo)
  - Webhooks: Clerk user and billing webhooks (Svix-based)
  - Environment vars: `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `CLERK_ISSUER_DOMAIN`
  - Webhook secrets: `CLERK_USER_WEBHOOK_SECRET`, `CLERK_BILLING_WEBHOOK_SECRET`

**Payment Processing:**
- Stripe - Payment processing and Stripe Connect
  - SDK: `stripe` (20.0.0), `@stripe/react-connect-js` (3.3.31), `@stripe/connect-js` (3.3.31)
  - Client-side: Stripe Checkout for invoice payments
  - Server-side: Payment intent creation and platform fee configuration
  - Stripe Connect: Organizations connect their Stripe accounts for direct payment routing
  - Environment vars: `STRIPE_SECRET_KEY`, `STRIPE_APPLICATION_FEE_CENTS` (platform fee per payment)
  - Routes: `/api/pay/checkout`, `/api/stripe-connect/*` (account linking, status, account session)
  - Feature: Multi-payment installments with individual Checkout sessions per payment
  - Payment tracking: `stripeSessionId`, `stripePaymentIntentId` stored in database

**E-Signatures:**
- BoldSign - Digital signature and document signing
  - SDK: `boldsign` (2.0.1)
  - Usage: Quote approval workflow
  - Webhook: Document signing events via BoldSign webhook
  - Environment vars: `BOLDSIGN_API_KEY`, `BOLDSIGN_WEBHOOK_SECRET`
  - Integration point: `packages/backend/convex/http.ts` - BoldSign webhook handler

**Email Delivery:**
- Resend - Email service provider
  - SDK: `resend` (6.5.2), `@convex-dev/resend` (0.2.0)
  - Templates: React Email components in `apps/web/src/emails/`
  - Convex integration: Email sent from Convex actions
  - Webhook: Email event tracking (opens, clicks, bounces)
  - Environment vars: `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`
  - Webhook handler: `packages/backend/convex/http.ts` - Resend webhook endpoint
  - Usage: Transactional emails, demo scheduling, organization communications

**AI & Language Models:**
- OpenAI - Language model API
  - SDK: `@ai-sdk/openai` (3.0.0), `ai` (6.0.0)
  - Usage: Mastra agents for CSV import and report generation
  - Environment vars: `OPENAI_API_KEY`
  - Agents: `apps/web/src/mastra/csvImportAgent.ts`, `reportAgent.ts`

**Mastra AI Framework:**
- Mastra - AI agent orchestration
  - SDK: `@mastra/core` (1.0.0-beta.21), `@mastra/ai-sdk` (1.0.0-beta.14)
  - Purpose: CSV import parsing, report generation
  - Agents location: `apps/web/src/mastra/`
  - Tools: Custom tools in `apps/web/src/mastra/tools/`
  - Routes: `/api/analyze-csv`, `/api/mastra/report`

**Product Analytics:**
- PostHog - Product analytics and feature tracking
  - SDK: `posthog-js` (1.306.1)
  - Provider: `apps/web/src/providers/PostHogProvider.tsx`
  - Identification: Users identified after Clerk sign-in via `useAnalyticsIdentity()` hook
  - Events tracked: Client actions, project changes, quote/invoice operations, feature usage
  - Group analytics: Organizations tracked as groups for B2B segmentation
  - Environment vars: `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`
  - Auto-capture: Click, change, submit events enabled
  - Performance: Web vitals and JavaScript error tracking enabled

**Maps & Location Services:**
- MapBox - Map rendering and location search
  - SDK: `maplibre-gl` (5.15.0), `@mapbox/search-js-react` (1.5.1)
  - Usage: Location features in mobile and web apps
  - Environment vars: `MAPBOX_API_KEY`, `NEXT_PUBLIC_MAPBOX_API_KEY`

**Image Services:**
- Unsplash - Stock image API for placeholder images
  - Environment vars: `UNSPLASH_ACCESS_KEY`, `UNSPLASH_SECRET_KEY`, `UNSPLASH_APP_ID`
  - Usage: Placeholder images in app UI

**Webhook Platform:**
- Svix - Webhook verification and routing
  - SDK: `svix` (1.76.1)
  - Purpose: Webhook signature verification for Clerk, Resend, and BoldSign events
  - Usage: `packages/backend/convex/lib/webhooks.ts` - `verifySvixWebhook()` helper
  - Supported: Clerk user/org/billing webhooks, Resend email events

## Data Storage

**Primary Database:**
- Convex - Real-time serverless database
  - Version: 1.30.0
  - Type: Document database (similar to MongoDB)
  - Functions: Queries, mutations, and actions in `packages/backend/convex/`
  - Schema: Defined in `packages/backend/convex/schema.ts`
  - Tables: users, organizations, organizationMemberships, clients, projects, quotes, invoices, payments, tasks, emailMessages, notifications, activities, workflowAutomations, domainEvents, workflowExecutions
  - Client: React hooks (`useQuery`, `useMutation`) from `convex/react`
  - Mobile: Same Convex client used in React Native app
  - Real-time: All queries are reactive and auto-update on data changes

**File Storage:**
- Local filesystem - PDF generation and temporary files
- Provider-managed: Convex handles document storage
- External: Quote/invoice PDFs generated via @react-pdf/renderer and served as URLs

**Caching:**
- In-memory: React Query caching (built into Convex hooks)
- Browser: localStorage + cookies via PostHog persistence
- Rate limiting: @convex-dev/rate-limiter for API protection

## Authentication & Identity

**Primary Auth Provider:**
- Clerk - Multi-tenant authentication and organization management
  - Organization sync: Organizations created in Clerk, synced to Convex via webhook
  - User sync: Users created in Clerk, synced to Convex via webhook
  - Membership sync: OrganizationMembership created via webhook
  - Role management: Admin/member roles enforced in Clerk and Convex
  - Implementation: Middleware in `apps/web/src/middleware.ts` for protected routes
  - Mobile: Apple authentication + email via `expo-auth-session`

**Authorization:**
- Role-based access control (RBAC) in Convex
- Helper function: `getOrgFromAuthOrThrow()` in `packages/backend/convex/lib/auth.ts`
- Admin-only routes: `/home` dashboard, organization settings
- Member routes: `/projects`, `/tasks`, `/invoices` (assigned items only)
- Plan limits: Free tier limits checked in mutations (10 clients, 3 projects per client, 5 e-signatures/month)

## Monitoring & Observability

**Error Tracking:**
- PostHog - JavaScript error tracking (capture_exceptions: true)
- Sentry - Not currently integrated

**Logs:**
- Console logging: Development and production logs via `console.error()`, `console.log()`
- Convex function logs: Available in Convex dashboard
- Webhook logging: Custom logging in `packages/backend/convex/lib/webhooks.ts`

## CI/CD & Deployment

**Hosting:**
- Web: Vercel (Next.js platform)
- Backend: Convex (serverless functions)
- Mobile: iOS via Expo Application Services (EAS)

**CI Pipeline:**
- Turbo - Build caching and orchestration
- GitHub Actions - Assumed (not explicitly configured in codebase)
- Environment variables configured via Turbo `turbo.json` with required vars list

**Build Environment:**
- Development: Turbopack for fast builds
- Production: Standard Next.js build
- Mobile: EAS build service for iOS

## Environment Configuration

**Required Environment Variables:**

**Clerk (Authentication):**
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Public key for Clerk
- `NEXT_PUBLIC_CLERK_FRONTEND_API_URL` - Clerk frontend API URL
- `CLERK_SECRET_KEY` - Server-side Clerk API key
- `CLERK_ISSUER_DOMAIN` - Clerk issuer domain for OIDC
- `CLERK_USER_WEBHOOK_SECRET` - Webhook signature secret for user events
- `CLERK_BILLING_WEBHOOK_SECRET` - Webhook signature secret for billing events

**Convex (Backend):**
- `NEXT_PUBLIC_CONVEX_URL` - Convex instance URL
- `CONVEX_DEPLOY_KEY` - For production deployments

**Stripe (Payments):**
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` - Client-side Stripe key
- `STRIPE_SECRET_KEY` - Server-side Stripe API key
- `STRIPE_APPLICATION_FEE_CENTS` - Platform fee per payment (defaults to 100 cents = $1)

**BoldSign (E-Signatures):**
- `BOLDSIGN_API_KEY` - API key for BoldSign
- `BOLDSIGN_WEBHOOK_SECRET` - Webhook signature secret

**Resend (Email):**
- `RESEND_API_KEY` - API key for Resend
- `RESEND_WEBHOOK_SECRET` - Webhook signature secret

**OpenAI (AI Agents):**
- `OPENAI_API_KEY` - API key for OpenAI

**PostHog (Analytics):**
- `NEXT_PUBLIC_POSTHOG_KEY` - PostHog project API key
- `NEXT_PUBLIC_POSTHOG_HOST` - PostHog instance host URL

**MapBox (Maps):**
- `MAPBOX_API_KEY` - Server-side MapBox API key
- `NEXT_PUBLIC_MAPBOX_API_KEY` - Client-side MapBox API key

**Unsplash (Images):**
- `UNSPLASH_ACCESS_KEY` - Unsplash API access key
- `UNSPLASH_SECRET_KEY` - Unsplash API secret key
- `UNSPLASH_APP_ID` - Unsplash app ID

**Secrets Location:**
- Local development: `.env.local` file (git-ignored)
- Staging: GitHub environment secrets
- Production: Vercel environment variables + Convex secrets

## Webhooks & Callbacks

**Incoming Webhooks:**

**Clerk Webhooks:**
- Endpoint: `/api/clerk-users-webhook` (Convex HTTP action)
- Events: user.created, user.updated, user.deleted, session.created, organization.created, organization.updated, organization.deleted, organizationMembership.created, organizationMembership.deleted
- Handler: `packages/backend/convex/http.ts` - Clerk webhook handler with robust error handling
- Verification: Svix signature verification

**BoldSign Webhooks:**
- Endpoint: `/api/boldsign-webhook` (Convex HTTP action)
- Events: Document signing completion, signing events
- Handler: `packages/backend/convex/http.ts` - BoldSign webhook handler
- Verification: Custom BoldSign signature verification
- Update: Quote status → "Approved" when signed

**Resend Webhooks:**
- Endpoint: `/api/resend-webhook` (Convex HTTP action)
- Events: Email delivery, opens, clicks, bounces
- Handler: `packages/backend/convex/http.ts` - Resend webhook handler
- Verification: Svix signature verification
- Usage: Email tracking and status updates

**Stripe Webhooks:**
- Endpoint: `/api/stripe-webhook` (Convex HTTP action)
- Events: charge.succeeded, checkout.session.completed, payment_intent.succeeded
- Handler: `packages/backend/convex/http.ts` - Stripe webhook handler
- Update: Payment status and invoice completion
- Verification: Stripe signature verification

**Outgoing Webhooks:**
- None detected in codebase (webhooks are primarily incoming for event sync)

## Third-Party API Calls

**Direct API Calls (Non-Webhook):**

**Stripe API:**
- Create checkout session for payments
- Create payment intent with platform fee
- Query account status for Stripe Connect setup
- Create account links for account onboarding
- Location: `packages/backend/convex/` and `apps/web/src/app/api/stripe-connect/`

**BoldSign API:**
- Create signature request from quote PDF
- Query document signing status
- Location: Quote creation and approval workflows

**Clerk Admin API:**
- Query user metadata
- Update organization metadata (billing info, logo)
- Location: `packages/backend/convex/` and admin routes

**OpenAI API:**
- CSV analysis and field mapping
- Report generation from analytics data
- Location: Mastra agents in `apps/web/src/mastra/`

**Resend API:**
- Send email from templates
- Track email delivery
- Location: Convex actions and `apps/web/src/app/api/schedule-demo`

**MapBox API:**
- Search locations and autocomplete
- Render maps in application
- Location: Mobile and web map components

---

*Integration audit: 2026-03-14*
