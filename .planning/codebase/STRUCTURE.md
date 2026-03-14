# Codebase Structure

**Analysis Date:** 2026-03-14

## Directory Layout

```
nextjs-onetool/
├── apps/
│   ├── web/                    # Next.js web application (@onetool/web)
│   │   ├── src/
│   │   │   ├── app/            # App Router pages and API routes
│   │   │   ├── components/     # React components organized by type
│   │   │   ├── hooks/          # Custom React hooks
│   │   │   ├── lib/            # Utilities and helpers
│   │   │   ├── types/          # TypeScript type definitions
│   │   │   ├── providers/      # Context providers
│   │   │   ├── emails/         # Email templates
│   │   │   ├── mastra/         # AI agents and tools
│   │   │   └── middleware.ts   # Clerk auth middleware
│   │   ├── public/             # Static assets
│   │   └── package.json
│   └── mobile/                 # React Native mobile app (@onetool/mobile)
│       └── (Expo structure)
├── packages/
│   ├── backend/                # Convex backend (@onetool/backend)
│   │   ├── convex/
│   │   │   ├── *.ts            # Entity files and domain logic
│   │   │   ├── lib/            # Shared backend utilities
│   │   │   ├── migrations/     # Data migrations
│   │   │   ├── _generated/     # Auto-generated Convex types
│   │   │   ├── schema.ts       # Database schema
│   │   │   ├── http.ts         # Webhook handlers
│   │   │   ├── convex.config.ts # Convex configuration
│   │   │   └── crons.ts        # Scheduled jobs
│   │   └── package.json
│   └── tsconfig/               # Shared TypeScript configurations
├── CLAUDE.md                   # Project guidance for Claude
└── package.json                # Root monorepo configuration
```

## Directory Purposes

**apps/web/src/app/:**
- Purpose: Next.js App Router pages, layouts, and API routes
- Contains: Page components (page.tsx), layout wrappers (layout.tsx), dynamic route handlers
- Structure:
  - `(auth)/`: Public authentication pages (sign-in, sign-up)
  - `(legal)/`: Public legal pages (privacy, terms, data security)
  - `(workspace)/`: Protected authenticated workspace routes
  - `pay/`: Public invoice payment pages
  - `api/`: API route handlers for webhooks and integrations
  - `communities/`: Public community showcase pages

**apps/web/src/components/:**
- Purpose: Reusable React components organized by domain
- Contains: UI components, page-specific components, layout components
- Structure:
  - `ui/`: Base shadcn/ui components (Button, Input, Dialog, etc.)
  - `layout/`: Navigation, sidebar, header components
  - `shared/`: Generic reusable components (DynamicTitle, modals)
  - `filters/`: Data filtering components
  - `data-grid/`: Data table and grid components
  - `auth/`: Authentication-related components
  - `stripe/`: Stripe integration components
  - `tiptap/`: Rich text editor components
  - `tours/`: User onboarding tours
  - `kibo-ui/`: Custom UI library components
  - `website/`: Landing page and marketing components

**apps/web/src/hooks/:**
- Purpose: Custom React hooks for stateful logic
- Contains: Hooks for authentication, analytics, feature access, toast notifications, modals
- Key hooks:
  - `use-analytics-identity.ts`: Sync Clerk user to PostHog
  - `use-feature-access.ts`: Check feature availability based on plan
  - `use-role-access.ts`: Check if user is admin
  - `use-toast.tsx`: Toast notification context
  - `use-confirm-dialog.tsx`: Confirmation dialog pattern
  - `use-media-query.ts`: Responsive design helpers

**apps/web/src/lib/:**
- Purpose: Frontend utility functions and helpers
- Contains: Analytics tracking, calendar utilities, chart colors, notifications, plan limits
- Key files:
  - `analytics.ts`: PostHog tracking functions
  - `analytics-events.ts`: Type-safe event definitions
  - `calendar-utils.ts`: Date/time utilities for calendar views
  - `plan-limits.ts`: Feature availability based on subscription
  - `notification-utils.ts`: Toast and notification helpers
  - `stripe.ts`: Stripe client initialization
  - `convexClient.ts`: Convex client instance

**apps/web/src/providers/:**
- Purpose: Context providers that wrap the entire app
- Contains: Authentication, Convex, analytics, and theme setup
- Key files:
  - `ConvexClientProvider.tsx`: Convex React client with Clerk auth
  - `ClerkProviderWithTheme.tsx`: Clerk with dark mode support
  - `PostHogProvider.tsx`: PostHog analytics initialization
  - `ThemeProvider.tsx`: Dark/light theme context

**apps/web/src/types/:**
- Purpose: Shared TypeScript type definitions
- Contains: Domain models, API response types, form schemas

**apps/web/src/emails/:**
- Purpose: Email templates using @react-email/components
- Contains: Quote, invoice, and notification email templates
- Pattern: Components that render HTML emails sent via Resend

**apps/web/src/mastra/:**
- Purpose: AI agent definitions and tools
- Contains: CSV import agent, report generation agent
- Files:
  - `agents/csvImportAgent.ts`: Parses CSV and maps columns
  - `agents/reportAgent.ts`: Generates business reports
  - `tools/`: Functions that agents can call (Convex queries)

**packages/backend/convex/:**
- Purpose: All backend business logic and database operations
- Pattern: Each domain has dedicated entity file (clients.ts, projects.ts, etc.)

**Entity Files (Domain Operations):**
- `clients.ts`: Client CRUD, archiving, searching
- `projects.ts`: Project lifecycle, status transitions
- `quotes.ts`: Quote creation, approval, conversion to invoice
- `quoteLineItems.ts`: Line items within quotes
- `invoices.ts`: Invoice creation, PDF generation, status tracking
- `invoiceLineItems.ts`: Line items within invoices
- `payments.ts`: Invoice payment splitting and status tracking
- `tasks.ts`: Task scheduling with calendar integration
- `activities.ts`: Activity feed and audit trail
- `notifications.ts`: In-app notifications
- `organizations.ts`: Org metadata, settings, members
- `users.ts`: User sync from Clerk
- `organizationDocuments.ts`, `clientDocuments.ts`, `projectDocuments.ts`: File uploads
- `emailMessages.ts`: Email tracking and threading
- `reports.ts`, `reportData.ts`: Analytics and reporting
- `automations.ts`: Workflow automation definitions
- `automationExecutor.ts`: Executes automation workflows
- `eventBus.ts`: Event publishing and processing for automations
- `calendar.ts`: Calendar data for task views
- `favorites.ts`: User favorites/bookmarks
- `communityPages.ts`: Community showcase features
- `serviceStatus.ts`, `serviceStatusActions.ts`: Service status tracking

**Special Files:**
- `schema.ts`: Convex database schema defining all tables and indexes
- `http.ts`: HTTP webhook handlers (Clerk, BoldSign, Stripe, Resend)
- `convex.config.ts`: Convex configuration, aggregates, and migrations
- `crons.ts`: Scheduled jobs via Convex crons
- `auth.config.ts`: Clerk authentication configuration
- `test.setup.ts`, `test.helpers.ts`: Testing utilities

**packages/backend/convex/lib/:**
- Purpose: Reusable utilities shared across entity files
- `auth.ts`: User and organization context from Clerk
- `crud.ts`: Common CRUD patterns (validation, filtering, updates)
- `queries.ts`: Query helpers (org scoping, date ranges, empty results)
- `lineItems.ts`: Shared logic for quote and invoice items
- `shared.ts`: Pure utilities (tokens, validation, dates, business calculations)
- `webhooks.ts`: Webhook verification and response formatting
- `activities.ts`: Activity logging helpers
- `permissions.ts`: Plan limit enforcement
- `organization.ts`: Organization data helpers
- `aggregates.ts`: Dashboard aggregate initialization
- `changeTracking.ts`: Change detection for audit trails
- `memberships.ts`: Organization membership helpers
- `storage.ts`: File storage operations
- `stripe.ts`: Stripe API helpers

**packages/backend/convex/migrations/:**
- Purpose: Data transformations and schema updates
- Files:
  - `initializeQuoteCounters.ts`: Set up sequential numbering
  - `populateAggregates.ts`: Initialize dashboard aggregates
  - `geocodeAddresses.ts`: Add location data to addresses
  - `fixInvoiceTotals.ts`: Fix invoice amount calculations
  - `addReceivingAddresses.ts`: Set up email receiving
  - `seedServiceStatus.ts`: Initialize service status data

**packages/backend/convex/_generated/:**
- Purpose: Auto-generated Convex types and API definitions
- Files:
  - `api.d.ts`: Type-safe function signatures
  - `dataModel.d.ts`: Database schema types
  - `server.d.ts`: Server runtime types
- Note: Never edit manually; regenerated via `pnpm generate`

**apps/web/src/app/(workspace)/:**
- Purpose: Protected workspace routes (authenticated pages)
- Structure by feature area:
  - `/clients`: Client list, detail, new client
  - `/projects`: Project list, detail, new project
  - `/quotes`: Quote list, detail, new quote
  - `/invoices`: Invoice list, detail with payment setup
  - `/tasks`: Task calendar and list views
  - `/reports`: Analytics and reporting
  - `/organization`: Org profile, members, settings
  - `/subscription`: Billing and plan management
  - `/automations`: Workflow automation builder
  - `/community`: Community feature pages

**apps/web/src/app/api/:**
- Purpose: API route handlers for next-server operations
- Organized by concern:
  - `stripe/`: Stripe webhook handlers
  - `stripe-webhook/`: Platform webhook handlers
  - `stripe-connect/`: Stripe Connect account setup
  - `pay/`: Payment processing for public invoice links
  - `mastra/`: AI agent execution endpoints
  - `analyze-csv`: CSV import analysis
  - `admin/`: Admin operations (user/org management)
  - `communities/`: Community API endpoints

## Key File Locations

**Entry Points:**
- `apps/web/src/app/layout.tsx`: Root app wrapper with all providers
- `apps/web/src/app/(workspace)/layout.tsx`: Workspace layout with sidebar
- `apps/web/src/middleware.ts`: Request authentication and routing
- `packages/backend/convex/http.ts`: Webhook receiver for external services

**Configuration:**
- `apps/web/package.json`: Web app dependencies and scripts
- `packages/backend/package.json`: Convex backend dependencies
- `apps/web/src/env.ts`: Environment variable validation
- `packages/backend/convex/convex.config.ts`: Convex setup, aggregates
- `packages/backend/convex/auth.config.ts`: Clerk integration

**Core Logic:**
- `packages/backend/convex/clients.ts`: Client operations
- `packages/backend/convex/invoices.ts`: Invoice operations
- `packages/backend/convex/quotes.ts`: Quote operations
- `packages/backend/convex/payments.ts`: Payment splitting and status
- `packages/backend/convex/projects.ts`: Project operations
- `packages/backend/convex/tasks.ts`: Task operations
- `packages/backend/convex/automations.ts`: Workflow definitions
- `packages/backend/convex/eventBus.ts`: Event-driven architecture

**Testing:**
- `packages/backend/convex/*.test.ts`: Test files co-located with implementation
- `packages/backend/convex/test.setup.ts`: Test environment setup
- `packages/backend/convex/test.helpers.ts`: Test utilities and fixtures

## Naming Conventions

**Files:**
- Entity files: singular + lowercase (clients.ts, invoices.ts)
- Test files: `{entity}.test.ts`
- Components: PascalCase (ClientCard.tsx, PaymentModal.tsx)
- Utilities: kebab-case (use-toast.ts, payment-utils.ts)
- Types: singular (client.ts, invoice.ts)

**Directories:**
- Route directories: kebab-case and parentheses for grouping ((auth), (workspace))
- Dynamic routes: `[id]` or `[slug]` format
- Feature folders: lowercase plural (clients, invoices, projects)
- Utility folders: lowercase (lib, hooks, utils)

**Functions:**
- Convex handlers: lowercase (query, mutation, action, httpAction)
- React components: PascalCase
- Utility functions: camelCase
- Helper exports: camelCase with descriptive names (getClientWithValidation, validateOrgAccess)

**Variables:**
- Constants: UPPER_SNAKE_CASE for environment and config values
- State: camelCase
- IDs: suffixed with "Id" (clientId, orgId, userId)

**Database Tables & Fields:**
- Table names: camelCase singular (client, organization, workflowAutomation)
- Field names: camelCase (companyName, clerkOrganizationId, lastSignedInDate)
- Foreign keys: {table}Id format (orgId, userId, clientId)
- Status fields: status (never "state" or "state")
- Timestamps: camelCase with direction (createdAt, updatedAt, completedAt, expiresAt)

## Where to Add New Code

**New Feature (e.g., "Add expense tracking"):**
- Backend implementation: `packages/backend/convex/expenses.ts` (mutations, queries, actions)
- Backend utilities: Add helpers to `packages/backend/convex/lib/` if pattern repeats
- Frontend pages: `apps/web/src/app/(workspace)/expenses/`
- Frontend components: `apps/web/src/components/expenses/` (ExpenseCard.tsx, ExpenseForm.tsx)
- Tests: `packages/backend/convex/expenses.test.ts`

**New Component/Module:**
- If app-wide: `apps/web/src/components/shared/`
- If feature-specific: `apps/web/src/app/(workspace)/{feature}/components/`
- If utility: `apps/web/src/components/kibo-ui/` or `apps/web/src/components/ui/`

**Utilities:**
- Shared backend: `packages/backend/convex/lib/` (follows CRUD, queries, shared patterns)
- Shared frontend: `apps/web/src/lib/` (analytics, calendar-utils, plan-limits)
- Component utilities: Co-located in component directory

**Database Changes:**
- Schema: Edit `packages/backend/convex/schema.ts`
- Migrations: Create file in `packages/backend/convex/migrations/` with migration logic
- Run migrations: Configure in `packages/backend/convex/convex.config.ts`

**Webhooks:**
- Entry point: `packages/backend/convex/http.ts`
- Handler logic: Entity file (e.g., stripe event → `stripePaymentActions.ts`)
- Verification: Use helpers from `packages/backend/convex/lib/webhooks.ts`

**Email Templates:**
- Location: `apps/web/src/emails/{EntityName}Email.tsx`
- Pattern: React component using @react-email/components
- Sending: Resend action in backend (e.g., `resend.ts`)

**API Routes:**
- Location: `apps/web/src/app/api/{feature}/route.ts`
- Pattern: Next.js route handler (GET, POST, etc.)
- Use for: External integration proxies, payment processing, admin operations

## Special Directories

**apps/web/.next/:**
- Purpose: Next.js build output
- Generated: Yes (automatically during `pnpm build`)
- Committed: No (in .gitignore)

**packages/backend/convex/_generated/:**
- Purpose: Auto-generated Convex type definitions
- Generated: Yes (during `pnpm dev` or `pnpm generate`)
- Committed: Yes (type safety requirement)
- Note: Never edit manually

**node_modules/, .pnpm-store/:**
- Purpose: Dependency management
- Generated: Yes
- Committed: No

**.planning/codebase/:**
- Purpose: GSD planning documents (ARCHITECTURE.md, STRUCTURE.md, etc.)
- Generated: By GSD mappers
- Committed: Yes (guide for future Claude instances)

**packages/backend/convex/migrations/:**
- Purpose: Data transformations executed on Convex deployment
- Contains: One-time migration scripts
- Pattern: Export async function that operates on ctx
- Execution: Specified in `convex.config.ts`

---

*Structure analysis: 2026-03-14*
