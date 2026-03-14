# Testing Patterns

**Analysis Date:** 2026-03-14

## Test Framework

**Runner:**
- Vitest 4.0.16
- Config: `packages/backend/vitest.config.ts` and `apps/web/vitest.config.ts`
- Environment: `edge-runtime` (for Convex backend compatibility)

**Assertion Library:**
- Vitest built-in assertions (via `expect`)
- Standard matchers: `toBeDefined()`, `toThrowError()`, `toMatchObject()`, `toHaveLength()`

**Run Commands:**
```bash
pnpm test                # Watch mode
pnpm test:once          # Single run
pnpm test:debug         # Run with debugger
pnpm test:coverage      # Generate coverage report
pnpm test:ui            # Vitest UI (backend only)
```

## Test File Organization

**Location:**
- Backend: Colocated with source files in `packages/backend/convex/`
  - Pattern: `[entity].test.ts` next to `[entity].ts`
  - Test files included via glob: `packages/backend/convex/**/*.test.ts`
- Web: In `apps/web/src/` alongside source
  - Pattern: `[name].test.ts` or `[name].spec.ts`
  - Currently has very few tests; focus is on backend

**Naming:**
- Backend: `clients.test.ts`, `quotes.test.ts`, `payments.test.ts`, etc.
- Web: `[feature].test.ts` or `[feature].spec.ts`

**Structure:**
```
packages/backend/
├── convex/
│   ├── clients.ts              # Source
│   ├── clients.test.ts         # Tests
│   ├── lib/
│   │   ├── auth.ts
│   │   └── auth.test.ts
│   ├── test.setup.ts           # Global setup
│   └── test.helpers.ts         # Helper utilities
```

## Test Structure

**Suite Organization:**

```typescript
describe("Clients", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(() => {
    t = setupConvexTest();
  });

  describe("create", () => {
    it("should create a client with valid data", async () => {
      // Test body
    });
  });
});
```

**Patterns:**

*Setup (beforeEach):*
```typescript
beforeEach(() => {
  t = setupConvexTest();
});
```
- Creates fresh test instance
- Must be called before each test
- Registers aggregate components

*Test data creation (in t.run):*
```typescript
const { orgId, clientId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
  const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
  const clientId = await createTestClient(ctx, orgId);
  return { orgId, clientId, clerkUserId, clerkOrgId };
});
```
- Use `t.run()` for setup within test database context
- Use test helpers from `test.helpers.ts`
- Return data needed for test execution

*Identity and execution:*
```typescript
const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
const clientId = await asUser.mutation(api.clients.create, { ... });
const client = await asUser.query(api.clients.get, { id: clientId });
```
- Use `t.withIdentity()` to set authenticated context
- Execute queries/mutations as authenticated user
- Chain mutations and queries as needed

*Assertions:*
```typescript
expect(clientId).toBeDefined();
expect(client).toMatchObject({ companyName: "...", status: "..." });
expect(results).toHaveLength(3);
expect(results.every((r) => r.success)).toBe(true);
```
- Use specific matchers for clarity
- Test both presence and properties
- Validate collections with length and content checks

*Error testing:*
```typescript
await expect(
  asUser.mutation(api.payments.create, {
    invoiceId,
    paymentAmount: 0,
    dueDate,
    sortOrder: 0,
  })
).rejects.toThrowError("Payment amount must be positive");
```
- Use `rejects.toThrowError()` for error assertions
- Match exact error message when behavior is critical
- Test validation and business logic errors

## Mocking

**Framework:** convex-test
- Provides in-memory database for testing
- No external mocking needed for most tests
- Environment: `edge-runtime` with `@convex-dev/aggregate` inlined

**Patterns:**

*Database mocking (automatic):*
- `t.run()` creates isolated database context
- All inserts/updates happen in test database
- No real API calls made

*Identity mocking:*
```typescript
const asUser = t.withIdentity(createTestIdentity("user_123", "org_123"));
```
- `createTestIdentity()` creates test Clerk identity
- Mocks authentication without real Clerk calls
- Org isolation enforced automatically

**What to Mock:**
- Use test database for all data operations
- Use test identities for auth context
- No mocking of business logic; test the actual functions

**What NOT to Mock:**
- Database queries (use real convex-test database)
- Convex function handlers (test through API)
- Validation logic (test with real validators)
- Business calculations (test with actual values)

## Fixtures and Factories

**Test Data:**

```typescript
/**
 * Creates a standard test organization with an admin user
 * Returns the user ID, org ID, and Clerk IDs for use in withIdentity()
 */
export async function createTestOrg(
  ctx: { db: MutationCtx["db"] },
  overrides: {
    userName?: string;
    userEmail?: string;
    orgName?: string;
    clerkUserId?: string;
    clerkOrgId?: string;
  } = {}
): Promise<TestOrgSetup> {
  // Implementation with sensible defaults
}
```

**Location:**
- `packages/backend/convex/test.helpers.ts` - Main test helpers
- Provides: `createTestOrg`, `createTestClient`, `createTestProject`, `createTestTask`, `createTestInvoice`, etc.
- Each helper accepts `overrides` object for customization
- Returns IDs and Clerk identifiers needed for test execution

**Helper Functions:**
- `createTestOrg()` - Basic org with admin user
- `addMemberToOrg()` - Add member to existing org
- `createTestClient()` - Create client in org
- `createTestProject()` - Create project for client
- `createTestTask()` - Create task
- `createTestInvoice()` - Create invoice with configurable total
- `createTestIdentity()` - Create mock Clerk identity
- Default values provided for all optional fields

## Coverage

**Requirements:** No enforced minimum

**View Coverage:**
```bash
pnpm test:coverage          # Generate coverage report
# Outputs: text, json, html formats
```

**Configuration:**
- Provider: v8 (built-in)
- Reporters: text, json, html
- Excluded from coverage: test files, `_generated/` directories, `test.setup.ts`
- Backend: `packages/backend/vitest.config.ts` lines 13-22
- Web: `apps/web/vitest.config.ts` lines 11-16

## Test Types

**Unit Tests:**
- Scope: Individual Convex function (mutation, query, or action)
- Approach: Test with mock data in isolated database
- Setup: Use test helpers to create minimal data
- Example: `packages/backend/convex/clients.test.ts` - Tests client CRUD operations

**Integration Tests:**
- Scope: Multi-step flows involving multiple functions
- Approach: Chain mutations and queries in single test
- Setup: Create full data graph (org → client → project → invoice)
- Example: Testing payment split validation across multiple functions

**E2E Tests:**
- Framework: Not used in current codebase
- Web app has no E2E tests at this time
- Focus is on backend Convex function testing

## Common Patterns

**Async Testing:**
```typescript
it("should create a client with valid data", async () => {
  const { orgId, clientId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
    // Setup
    const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
    const clientId = await createTestClient(ctx, orgId);
    return { orgId, clientId, clerkUserId, clerkOrgId };
  });

  const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
  const result = await asUser.mutation(api.clients.create, { ... });
  expect(result).toBeDefined();
});
```

**Error Testing:**
```typescript
it("should reject payment with zero amount", async () => {
  // ... setup ...

  await expect(
    asUser.mutation(api.payments.create, {
      invoiceId,
      paymentAmount: 0,
      dueDate,
      sortOrder: 0,
    })
  ).rejects.toThrowError("Payment amount must be positive");
});
```

**Multi-step Flows:**
```typescript
it("should create invoice from quote and generate default payment", async () => {
  // Create org, client, quote
  const { orgId, quoteId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
    const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
    const clientId = await createTestClient(ctx, orgId);
    const quoteId = await createTestQuote(ctx, orgId, clientId, { total: 1000 });
    return { orgId, quoteId, clerkUserId, clerkOrgId };
  });

  const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

  // Step 1: Create invoice from quote
  const invoiceId = await asUser.mutation(api.invoices.createFromQuote, {
    quoteId,
  });

  // Step 2: Verify default payment created
  const payments = await asUser.query(api.payments.listByInvoice, { invoiceId });
  expect(payments).toHaveLength(1);
  expect(payments[0].paymentAmount).toBe(1000);
});
```

**State Verification:**
```typescript
it("should update invoice status when payment is marked paid", async () => {
  // Setup...
  const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

  // Initial state
  let invoice = await asUser.query(api.invoices.get, { id: invoiceId });
  expect(invoice?.status).toBe("sent");

  // Action
  await asUser.mutation(api.payments.markPaidByPublicToken, {
    publicToken: paymentToken,
    stripeSessionId: "session_123",
    stripePaymentIntentId: "pi_123",
  });

  // Verify state change
  invoice = await asUser.query(api.invoices.get, { id: invoiceId });
  expect(invoice?.status).toBe("paid");
});
```

## Test Coverage Focus

**Well-tested areas:**
- `packages/backend/convex/clients.test.ts` - 15 tests
- `packages/backend/convex/projects.test.ts` - 16 tests
- `packages/backend/convex/tasks.test.ts` - 17 tests
- `packages/backend/convex/payments.test.ts` - 39 tests (comprehensive)
- `packages/backend/convex/quotes.test.ts` - 7 tests
- `packages/backend/convex/invoices.test.ts` - 12 tests
- `packages/backend/convex/auth.test.ts` - 15 tests (lib helpers)
- `packages/backend/convex/users.test.ts` - User sync tests
- `packages/backend/convex/notifications.test.ts` - Notification system
- `packages/backend/convex/automations.test.ts` - Workflow automation
- `packages/backend/convex/eventBus.test.ts` - Event system

**Test execution:**
```bash
# Run from monorepo root
pnpm test                    # Watch mode for all tests
pnpm test:once              # Single run all tests
pnpm test:coverage          # Coverage for both backend and web

# Run from specific package
cd packages/backend
pnpm test                    # Backend tests only
pnpm test:once              # Single run backend tests
pnpm test:coverage          # Backend coverage only
```

## Important Notes

1. **Convex Strong Typing**: Tests inherit type safety from Convex; invalid arguments caught at compile time

2. **Organization Isolation**: All tests enforce data isolation by org
   - Test fails if accessing data across org boundaries
   - `createTestOrg()` sets up proper org context

3. **Aggregate Components**: Tests use `@convex-dev/aggregate` for dashboard stats
   - Setup in `test.setup.ts` registers aggregate components
   - Tests can create data that triggers aggregate updates
   - Warning logged if aggregate modules not found

4. **Database Context**: `t.run()` creates new database context per setup
   - All inserts/queries within `t.run()` share same context
   - Data created in setup is committed to test database
   - Mutations and queries after `t.run()` see all setup data

5. **Identity Handling**: `createTestIdentity()` expects Clerk IDs
   - Format: `user_123`, `org_123` (not real UUIDs)
   - Must match IDs used in `createTestOrg()`
   - Auth context enforced for all function calls

---

*Testing analysis: 2026-03-14*
