# Coding Conventions

**Analysis Date:** 2026-03-14

## Naming Patterns

**Files:**
- Source files: `camelCase.ts` or `camelCase.tsx` for components
- Test files: `[name].test.ts` or `[name].spec.ts`
- Example: `packages/backend/convex/clients.ts`, `apps/web/src/hooks/use-toast.tsx`
- Helper/utility files: `camelCase.ts` (e.g., `lib/auth.ts`, `lib/crud.ts`)
- Styled component exports: `StyledComponentName` (e.g., `StyledBadge` in `styled-badge.tsx`)

**Functions:**
- Regular functions: `camelCase`
- Async functions: `camelCase` (no special prefix, async keyword indicates async nature)
- Helper prefixes for auth: `getCurrentUser`, `getCurrentUserOrgId`, `userByExternalId`
- Query/mutation handlers in Convex: `camelCase` (e.g., `list`, `create`, `update`, `get`, `delete`)
- React hooks: `useCapitalizedName` (e.g., `useToast`, `useAnalyticsIdentity`, `useFeatureAccess`)
- Event emitters: `emitStatusChangeEvent`, `emitAction`
- Validators: `validate[Entity]Fields`, `validateParentAccess`

**Variables:**
- Constants: `SCREAMING_SNAKE_CASE` for truly immutable values (rarely used; most use camelCase const)
- Local variables: `camelCase`
- Type instances: `camelCase` (e.g., `const user`, `const orgId`)
- Error objects: `err` or `error`
- Generic type parameters: `T`, `U`, `V` or descriptive names like `TEntity`

**Types:**
- Interfaces: `PascalCase` (e.g., `ToastContextType`, `TestOrgSetup`, `AnalyticsUserProperties`)
- Type aliases: `PascalCase` (e.g., `InvoiceDocument`, `InvoiceId`)
- Union types: `PascalCase` (e.g., `NotificationType`)
- Generic types: `T`, `U`, or descriptive (e.g., `TEntity extends TableNames`)

**Database/Convex:**
- Table names: `camelCase` in schema but referred to as identifiers (e.g., `"clients"`, `"organizations"`)
- Field names: `camelCase` (e.g., `companyName`, `clerkOrganizationId`, `publicToken`)
- Index names: `by_field_name` format (e.g., `by_org`, `by_status`, `by_external_id`)

## Code Style

**Formatting:**
- Tool: ESLint + Next.js defaults
- Config: `apps/web/eslint.config.mjs` extends "next/core-web-vitals" and "next/typescript"
- Max warnings: 100 (set in web app lint config)
- No Prettier config found; uses ESLint defaults

**Linting:**
- Tool: ESLint 9 with flat config
- Key rules:
  - `@typescript-eslint/no-unused-vars`: warn
  - `@typescript-eslint/no-explicit-any`: warn
- Ignored paths: `node_modules/**`, `.next/**`, `**/*.test.ts`, `**/*.test.tsx`

**TypeScript:**
- Strict mode: enabled (`strict: true` in `packages/tsconfig/base.json`)
- Module resolution: "bundler"
- Target: ESNext for backend, ESNext for web
- Path aliases:
  - Web: `@/*` → `./src/*`
  - Backend: Standard convex imports via `@onetool/backend`

## Import Organization

**Order (observed pattern):**
1. Third-party imports (e.g., `react`, `convex`, `next/navigation`)
2. Internal type imports (e.g., `import type { ... }`)
3. Internal function/constant imports from `@onetool/backend` or `@/*`
4. Relative imports from local directories

**Path Aliases:**
- Web: `@/` resolves to `apps/web/src/`
  - `@/components/...` → UI and feature components
  - `@/lib/...` → Utilities and helpers
  - `@/hooks/...` → React hooks
  - `@/types/...` → TypeScript types
  - `@/app/...` → Next.js pages and layouts
- Backend API imports: `import { api } from "@onetool/backend/convex/_generated/api"`
- Email exports: `import { emailMessages } from "@onetool/backend"`

## Error Handling

**Patterns:**
- Throw `Error` with descriptive message: `throw new Error("User not authenticated")`
- Auth errors: `throw new Error("User not authenticated")` or specific auth message
- Validation errors: `throw new Error("Entity name: descriptive message")`
  - Example: `throw new Error("Payment amount must be positive")`
  - Example: `throw new Error("Sort order cannot be negative")`
- Not found errors: `throw new Error("[Entity] not found")`
  - Example: `throw new Error("Client not found")`
  - Example: `throw new Error("Invoice not found")`
- Access denied: `throw new Error("[Entity] does not belong to your organization")`
- Missing org context: `throw new Error("No active organization found in user session")`

**Error handling in components:**
- Use `try-catch` blocks with error logging to console: `console.error("[Context]:", err)`
- Pass error messages to toast: `toast.error("Title", err instanceof Error ? err.message : "Failed")`
- User-facing messages in catch blocks use toast notifications

**Error logging:**
- Console logging for development: `console.error("Context:", data)`
- Error logger at `apps/web/src/lib/error-logger.ts` for centralized handling

## Logging

**Framework:** Console (no dedicated logging library)

**Patterns:**
- Debug: `console.error("[Feature]:", data)` for error context
- Warnings: `console.warn("Warning message")` (seen in `test.setup.ts`)
- Info: Generally not logged; handled by PostHog for analytics

**Analytics logging:**
- PostHog for all business events
- Use `trackEvent(eventName, properties)` for custom tracking
- User identification: `identifyUser(userId, properties)` after sign-in
- Conversion tracking: `trackConversion(type, properties)`

## Comments

**When to Comment:**
- Function purpose: Document in comments above function
- Complex business logic: Explain the "why" not the "what"
- Entity-specific behavior: Document limitations and patterns

**JSDoc/TSDoc:**
- Used extensively in shared utilities and test helpers
- Format:
  ```typescript
  /**
   * Brief description
   *
   * Longer explanation if needed
   *
   * @param param - Description
   * @returns Description
   * @example
   * ```typescript
   * const result = functionName(args);
   * ```
   */
  ```
- Examples: `packages/backend/convex/lib/crud.ts`, `packages/backend/convex/test.helpers.ts`

**Comment sections:**
- Mark major sections with: `// ============================================================================`
- Example: `// ============================================================================` (80 chars wide)
- Used in large files to separate concerns (auth helpers, CRUD operations, local helpers)

## Function Design

**Size:**
- Prefer functions under 50 lines for readability
- Extract helpers for reusable logic
- Test helpers are exceptions and can be longer

**Parameters:**
- Use object parameters for functions with 2+ arguments
  - Example: `{ userName?: string, userEmail?: string, orgName?: string }`
- Include optional flag in overrides: `overrides: { ... } = {}`
- Provide sensible defaults

**Return Values:**
- Use union types for conditional returns: `Promise<T | null>` vs `Promise<T>` (throws)
- Functions throwing errors use Promise<T> (no null)
- Functions returning null use `Promise<T | null>` and check for null before use

**Async Functions:**
- Prefix with `async` keyword (not `Async` suffix)
- Return `Promise<T>` in type annotations
- Use `await` for sequential operations

## Module Design

**Exports:**
- Default exports: Used for single main export (rare)
- Named exports: Preferred for utilities and helpers
- Example: `export async function getCurrentUserOrgId(...)`
- Example: `export function cn(...inputs)`

**Barrel Files:**
- Used in components directories (index files exposing multiple components)
- Not commonly used in backend/lib directories

**Shared Utilities:**
- Backend shared utilities: `packages/backend/convex/lib/`
  - `auth.ts` - Authentication and org context
  - `crud.ts` - Entity access helpers
  - `queries.ts` - Query patterns
  - `activities.ts` - Activity logging
  - `shared.ts` - Pure utilities and validation
  - `webhooks.ts` - Webhook verification
- Web utilities: `apps/web/src/lib/`
  - `utils.ts` - Simple cn() utility for tailwind
  - `analytics.ts` - PostHog integration
  - `stripe.ts` - Stripe helpers
  - `error-logger.ts` - Error handling

## Code Organization Patterns

**Entity-specific files (Convex):**
- Pattern: `[entity].ts`, `[entity].test.ts`
- Structure in file:
  1. Imports
  2. Local helper functions (entity-specific)
  3. Shared utility wrappers (optional)
  4. Public query/mutation handlers
  5. Internal mutations/queries
- Shared logic: Imported from `lib/` directory
- Example: `packages/backend/convex/clients.ts` (100+ lines)

**Component files (React):**
- Use client: `"use client"` directive for interactive components
- Interfaces: Define above component
- Component: PascalCase function, named export
- Props: Define as inline interface or type
- Example: `apps/web/src/components/ui/styled/styled-badge.tsx`

**Test structure:**
- Collocated with source: `[entity].test.ts` next to `[entity].ts`
- Setup: Use `setupConvexTest()` and `createTestIdentity()`
- Helpers: Use `test.helpers.ts` for common setup

---

*Convention analysis: 2026-03-14*
