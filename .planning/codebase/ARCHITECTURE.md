# Architecture

**Analysis Date:** 2026-03-14

## Pattern Overview

**Overall:** Multi-tenant, event-driven full-stack architecture with strict data isolation by organization

**Key Characteristics:**
- **Client-Driven Real-Time Sync**: Convex backend with real-time reactive queries and mutations flowing to Next.js frontend and React Native mobile
- **Multi-Tenant with Organization Boundaries**: All data scoped to `orgId` with Clerk as identity provider and organization manager
- **Decoupled Event-Driven Workflows**: Status change events trigger automated workflows without tight coupling
- **Role-Based Access Control**: Admin/member roles enforced at middleware and backend function levels
- **Hybrid Identity Model**: Clerk handles users and organizations; Convex maintains business data with references to Clerk IDs

## Layers

**Presentation (Frontend):**
- Purpose: User interfaces for web (Next.js) and mobile (React Native)
- Location: `apps/web/src/app/`, `apps/web/src/components/`, `apps/mobile/`
- Contains: Page routes, UI components, hooks, layouts
- Depends on: Convex React hooks, Clerk authentication, PostHog analytics
- Used by: End users

**API & Business Logic (Backend):**
- Purpose: All business operations, external integrations, webhooks
- Location: `packages/backend/convex/*.ts` (main entity files), `packages/backend/convex/lib/` (utilities)
- Contains: Query/mutation/action/httpAction handlers organized by domain (clients.ts, projects.ts, invoices.ts, etc.)
- Depends on: Convex framework, external APIs (Stripe, BoldSign, Resend, OpenAI), Clerk
- Used by: Web app, mobile app, webhooks from external services

**Data & Events (Persistence):**
- Purpose: Data persistence and event sourcing for automations
- Location: `packages/backend/convex/schema.ts` (tables), `eventBus.ts` (event publishing)
- Contains: Database schema with 40+ tables, domain event store, event processing
- Depends on: Convex storage
- Used by: All backend functions

**Utilities & Shared Libraries:**
- Purpose: Cross-cutting patterns and helpers
- Location: `packages/backend/convex/lib/` (backend utilities), `apps/web/src/lib/` (frontend utilities)
- Contains: Authentication helpers, CRUD patterns, webhook verification, activity logging, analytics
- Depends on: Entity-specific logic
- Used by: All layers

## Data Flow

**Query Flow (Read Operations):**

1. Frontend calls `useQuery(api.clients.list)` via Convex React hook
2. Convex queries backend function in `packages/backend/convex/clients.ts`
3. Function calls `getCurrentUserOrgId()` from `lib/auth.ts` to get organization context
4. Query filters by `orgId` using indexed database table
5. Convex automatically syncs results reactively to frontend
6. Frontend component re-renders on data change

**Mutation Flow (Write Operations):**

1. Frontend calls `useMutation(api.clients.create)` with arguments
2. Convex executes mutation in `packages/backend/convex/clients.ts`
3. Mutation validates organization access via `validateOrgAccess()`
4. Validates business rules (e.g., plan limits via `lib/permissions.ts`)
5. Performs database operation
6. If status changed, emits status change event via `emitStatusChangeEvent()` to event bus
7. Logs activity via `ActivityHelpers.logActivity()`
8. Updates aggregates if applicable (dashboard stats)
9. Returns result to frontend reactively

**Event Flow (Automation):**

1. Entity mutation detects status change (e.g., client status → active)
2. Emits `ENTITY_STATUS_CHANGED` event to event bus via `emitStatusChangeEvent()`
3. Event processor queries matching automations via `automationExecutor.ts`
4. For each matching automation, executes workflow nodes (conditions → actions)
5. Actions may trigger more mutations, which emit more events (cascading)
6. Recursion depth limits prevent infinite loops
7. Event execution logged in `workflowExecutions` table

**Webhook Flow (External Events):**

1. External service (Clerk, BoldSign, Stripe, Resend) sends webhook to `packages/backend/convex/http.ts`
2. Webhook handler verifies signature via `lib/webhooks.ts`
3. Processes event and updates database
4. May emit internal events to event bus
5. Returns success response

**State Management:**

**Frontend:**
- Clerk handles user authentication state via `useAuth()` hook
- Convex React provides reactive query state via `useQuery()` and mutation state via `useMutation()`
- UI state (modals, forms, filters) in React component state
- Global analytics state via PostHog
- Theme state via `next-themes`

**Backend:**
- All entity state persisted in Convex database
- Event state in `domainEvents` table (for sourcing and audit trail)
- Organization context derived from Clerk JWT token in `ctx.auth.getUserIdentity()`

## Key Abstractions

**Entity Files (Domain Models):**
- Purpose: Encapsulate all operations for a business entity
- Examples: `clients.ts`, `projects.ts`, `invoices.ts`, `quotes.ts`, `tasks.ts`, `payments.ts`
- Pattern: Each file exports `query`, `mutation`, `action`, and `internalMutation` functions
- Responsibility: CRUD operations, status transitions, validation, event emission

**Library Utilities (Reusable Patterns):**
- Purpose: Reduce duplication and ensure consistency across entity files
- Examples:
  - `lib/auth.ts`: User authentication and organization context
  - `lib/crud.ts`: Common patterns for entity validation and filtering
  - `lib/queries.ts`: Query helpers for org scoping and date ranges
  - `lib/lineItems.ts`: Shared logic for quote and invoice line items
  - `lib/shared.ts`: Utilities for tokens, validation, dates, business logic
  - `lib/webhooks.ts`: Webhook verification and response helpers
  - `lib/activities.ts`: Activity feed logging helpers
  - `lib/permissions.ts`: Plan limit checking
  - `lib/aggregates.ts`: Dashboard aggregate initialization

**Layout Components (UI Hierarchy):**
- Purpose: Provide structure and consistency to page layouts
- Examples:
  - `apps/web/src/app/layout.tsx`: Root layout with providers (Clerk, Convex, PostHog, Theme)
  - `apps/web/src/app/(workspace)/layout.tsx`: Workspace layout with sidebar navigation
  - `apps/web/src/components/layout/sidebar-with-header.tsx`: Main navigation container

**Providers (Context Setup):**
- Purpose: Initialize global context and state management
- Examples:
  - `ConvexProviderWithClerk`: Bridges Clerk authentication with Convex backend
  - `PostHogProvider`: Initializes analytics tracking
  - `ClerkProviderWithTheme`: Extends Clerk provider with theme context
  - `ThemeProvider`: Manages dark/light mode via `next-themes`

**Hooks (React Patterns):**
- Purpose: Encapsulate reusable stateful logic and side effects
- Examples:
  - `useAnalyticsIdentity()`: Syncs Clerk user data to PostHog
  - `useConfirmDialog()`: Modal confirmation pattern
  - `useToast()`: Toast notification system
  - `useFeatureAccess()`: Feature flag and plan limit checking
  - `useRoleAccess()`: Admin/member role-based visibility

**Middleware (Request Filtering):**
- Purpose: Enforce authentication and authorization before routes load
- Location: `apps/web/src/middleware.ts`
- Pattern: Uses Clerk middleware to check `userId`, `orgId`, and `orgRole`
- Behavior:
  - Redirects unauthenticated users to sign-in
  - Redirects users without org to org setup
  - Redirects non-admins from `/home` to `/projects`
  - Routes admins to `/home`, members to `/projects`

## Entry Points

**Web App Root:**
- Location: `apps/web/src/app/layout.tsx`
- Triggers: Browser loads any URL on the domain
- Responsibilities:
  - Mount all providers (Clerk, Convex, PostHog, Theme)
  - Initialize global styles and fonts
  - Wrap all pages

**Workspace Layout:**
- Location: `apps/web/src/app/(workspace)/layout.tsx`
- Triggers: User accesses any `/workspace/*` or authenticated route
- Responsibilities:
  - Render sidebar navigation
  - Sync user identity to PostHog
  - Apply workspace-specific styling
  - Show admin FAB if user is admin

**Clerk Webhook (User/Org Sync):**
- Location: `packages/backend/convex/http.ts` route `/clerk-users-webhook`
- Triggers: Clerk sends event (user.created, organization.updated, etc.)
- Responsibilities:
  - Sync Clerk users and organizations to Convex
  - Update user metadata and subscription status
  - Create/remove organization memberships

**BoldSign Webhook (E-Signature):**
- Location: `packages/backend/convex/http.ts` route `/boldsign-webhook`
- Triggers: BoldSign sends signature status update
- Responsibilities:
  - Update quote approval status
  - Store signed PDF
  - Emit quote signed event

**Stripe Webhook (Payments):**
- Location: `apps/web/src/app/api/stripe-webhook/` and Convex `stripePaymentActions.ts`
- Triggers: Stripe sends charge.succeeded, charge.failed events
- Responsibilities:
  - Update invoice payment status
  - Process refunds
  - Emit payment completed event

**Resend Webhook (Email):**
- Location: `packages/backend/convex/http.ts` route `/resend-webhook`
- Triggers: Resend sends email.opened, email.bounced events
- Responsibilities:
  - Track email engagement
  - Update message status
  - Handle bounces

## Error Handling

**Strategy:** Fail-fast with detailed logging, allow graceful degradation where appropriate

**Patterns:**

**Backend Functions:**
- Throw errors with descriptive messages for validation failures
- Log errors with context (orgId, entityId, function name)
- Return null for optional queries when not found
- Throw for required resources that don't exist
- Webhook handlers return error status codes with JSON bodies

**Frontend:**
- Catch mutation errors and display toast notifications via `useToast()`
- Log errors to Sentry (environment variable configured)
- Show user-friendly error messages, log technical details
- Redirect on authentication/authorization errors

**Event Processing:**
- Events have retry logic: up to 3 attempts with 5-second delays
- Failed events logged with full context for debugging
- Event status tracked in `domainEvents` table

## Cross-Cutting Concerns

**Logging:**
- **Backend**: Console logs on backend functions with `console.log()`, `console.error()`
- **Frontend**: Sentry integration for error tracking, PostHog for analytics
- **Activity Feed**: `ActivityHelpers.logActivity()` logs user actions for audit trail

**Validation:**
- **Organization Scoping**: Every function validates user's organization via `getCurrentUserOrgId()`
- **Plan Limits**: Mutations check subscription tier and usage quotas via `lib/permissions.ts`
- **Input Validation**: Convex `v` validators enforce schema at API boundary
- **Business Rules**: Entity-specific validators (e.g., payment total must equal invoice total)

**Authentication:**
- **Frontend**: Clerk middleware redirects unauthenticated users
- **Backend**: Clerk JWT token in `ctx.auth.getUserIdentity()` provides user and org context
- **Webhooks**: Signature verification via `verifySvixWebhook()` or `verifyBoldSignWebhook()`

**Authorization:**
- **Role-Based**: Admin vs member roles control access to `/home` and settings
- **Tenant Isolation**: All queries filter by `orgId`, preventing cross-org data access
- **Cascading Access**: Access to nested entities (line items) validated through parent (invoice)

---

*Architecture analysis: 2026-03-14*
