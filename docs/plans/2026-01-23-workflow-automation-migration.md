# Workflow Automation Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate workflow automation feature from `workflow-automation` branch to current `staging` branch, adapting to the new monorepo structure.

**Architecture:** Event-driven automation system with triggers, conditions, and actions. Uses Convex event bus for decoupled event processing. Automations execute when entities (clients, projects, quotes, invoices, tasks) change status.

**Tech Stack:** Convex (backend), React (frontend), Next.js App Router, shadcn/ui components

---

## Migration Status

**Last Updated:** 2026-01-23

### Completed Tasks (9/14)
✅ Task 1: Add Schema Definitions
✅ Task 2: Create Event Bus Module
✅ Task 3: Create Automation Executor Module
✅ Task 4: Create Automations CRUD Module
✅ Task 5: Integrate Event Emitters into Entity Mutations
✅ Task 6: Create Frontend Automations List Page
✅ Task 7: Create Frontend Automation Editor Page
✅ Task 8: Create UI Components for Workflow Builder
✅ Task 9: Add Navigation Link to Automations

### Pending Tasks (5/14)
⏳ Task 10: Write Backend Tests for Automations - **NOT STARTED**
⏳ Task 11: Update Feature Access Hook
⏳ Task 12: Add Premium Plan Check to Billing
⏳ Task 13: Documentation Update
⏳ Task 14: Manual Testing Checklist

### Known Issues
- **Async Event Emission Test Failures**: Event emission in entity mutations causes "Write outside of transaction" errors in tests due to `ctx.scheduler.runAfter()` in `emitStatusChangeEvent()`. Tests skipped with `it.skip()` in:
  - `packages/backend/convex/clients.test.ts` (multiple tests)
  - `packages/backend/convex/projects.test.ts` (multiple tests)
  - Resolution deferred to Task 10 test suite creation

### Important Deviations from Plan

**Schema Additions (Task 1):**
- Added missing `workflowExecutions` table (discovered in Task 3)
- Added `lastTriggeredAt` and `triggerCount` fields to `workflowAutomations`

**Event Bus Module (Task 2):**
- Fixed schema compatibility issues:
  - Changed "processed" status → "completed"
  - Changed `error` field → `errorMessage`
  - Removed `lastAttemptAt` field references
  - Fixed index queries to use `by_org_status` instead of non-existent `by_status`

**Automations CRUD Module (Task 4):**
- **CRITICAL**: Plan specified incorrect auth function names (`getUserOrThrow`, `getOrgFromAuthOrThrow`)
- **ACTUAL**: Code uses correct functions: `getCurrentUserOrThrow`, `getCurrentUserOrgId`
- Enhanced node validation: prevents nodes from having both `condition` AND `action`

**Event Emitters Integration (Task 5):**
- Successfully integrated into all 5 entity files (clients, projects, quotes, invoices, tasks)
- Fixed TypeScript error in `projects.ts` with type cast for event emission
- Skipped failing tests per user request (see Known Issues)

**UI Components (Task 8):**
- Fixed TypeScript error in `automation-condition-editor.tsx` (changed `&&` to ternary operator)

**Navigation Link (Task 9):**
- **CRITICAL**: Plan specified wrong file (`apps/web/src/app/(workspace)/layout.tsx`)
- **ACTUAL**: Correct file is `apps/web/src/components/layout/app-sidebar.tsx`

### Files Created/Modified

**Backend (10 files):**
- ✅ `packages/backend/convex/schema.ts` (modified - added 3 tables)
- ✅ `packages/backend/convex/eventBus.ts` (created - 396 lines)
- ✅ `packages/backend/convex/automationExecutor.ts` (created - 899 lines)
- ✅ `packages/backend/convex/automations.ts` (created - 405 lines)
- ✅ `packages/backend/convex/clients.ts` (modified - added event emission)
- ✅ `packages/backend/convex/projects.ts` (modified - added event emission)
- ✅ `packages/backend/convex/quotes.ts` (modified - added event emission)
- ✅ `packages/backend/convex/invoices.ts` (modified - added event emission)
- ✅ `packages/backend/convex/tasks.ts` (modified - added event emission)
- ⏳ `packages/backend/convex/automations.test.ts` (NOT CREATED)
- ⏳ `packages/backend/convex/eventBus.test.ts` (NOT CREATED)

**Frontend (12 files):**
- ✅ `apps/web/src/app/(workspace)/automations/page.tsx` (created - 442 lines)
- ✅ `apps/web/src/app/(workspace)/automations/editor/page.tsx` (created - 463 lines)
- ✅ `apps/web/src/app/(workspace)/automations/components/trigger-node.tsx` (created - 240 lines)
- ✅ `apps/web/src/app/(workspace)/automations/components/automation-trigger-config.tsx` (created - 207 lines)
- ✅ `apps/web/src/app/(workspace)/automations/components/workflow-node.tsx` (created - 475 lines)
- ✅ `apps/web/src/app/(workspace)/automations/components/automation-condition-editor.tsx` (created - 173 lines)
- ✅ `apps/web/src/app/(workspace)/automations/components/automation-action-editor.tsx` (created - 141 lines)
- ✅ `apps/web/src/app/(workspace)/automations/components/automation-node-card.tsx` (created - 115 lines)
- ✅ `apps/web/src/app/(workspace)/automations/components/add-node-button.tsx` (created - 74 lines)
- ✅ `apps/web/src/app/(workspace)/automations/components/add-step-button.tsx` (created - 76 lines)
- ✅ `apps/web/src/app/(workspace)/automations/components/workflow-canvas.tsx` (created - 33 lines)
- ✅ `apps/web/src/app/(workspace)/automations/components/dot-background.tsx` (created - 60 lines)
- ✅ `apps/web/src/components/layout/app-sidebar.tsx` (modified - added Automations link)
- ⏳ `apps/web/src/hooks/use-feature-access.ts` (NOT CREATED)

**Documentation:**
- ⏳ `CLAUDE.md` (NOT UPDATED)

### Next Steps for Resumption

1. **Start with Task 10**: Create test files for automations and event bus
   - May need to address async event emission issues
   - Follow existing test patterns in `*.test.ts` files

2. **Task 11**: Create or update feature access hook for premium features

3. **Task 12**: Verify subscription data is available in organizations query

4. **Task 13**: Add workflow automation section to CLAUDE.md

5. **Task 14**: Manual testing checklist execution

---

## Context

The `workflow-automation` branch contains a complete automation feature built on the old directory structure (`convex/` at root). The current `staging` branch uses a monorepo structure (`packages/backend/convex/`). This plan migrates:

**Backend (Convex):**
- `automations.ts` - CRUD operations for workflow definitions
- `automationExecutor.ts` - Execution engine with event subscription
- `eventBus.ts` - Event-driven architecture implementation
- Schema additions: `workflowAutomations`, `domainEvents` tables

**Frontend (React/Next.js):**
- `/automations` page - List view with create/edit/delete
- `/automations/editor` page - Visual workflow builder
- Multiple UI components for node editing

---

## Task 1: Add Schema Definitions ✅ COMPLETED

**Files:**
- Modify: `packages/backend/convex/schema.ts`

**Step 1: Add domain events table to schema**

Add after the existing tables (around line 500, before the export):

```typescript
	// Domain Events - Event-driven architecture event store
	domainEvents: defineTable({
		orgId: v.id("organizations"),
		// Event metadata
		eventType: v.string(), // e.g., "entity.status_changed", "automation.triggered"
		eventSource: v.string(), // e.g., "quotes.update", "projects.update"
		// Event payload
		payload: v.object({
			entityType: v.union(
				v.literal("client"),
				v.literal("project"),
				v.literal("quote"),
				v.literal("invoice"),
				v.literal("task")
			),
			entityId: v.string(),
			field: v.optional(v.string()),
			oldValue: v.optional(v.any()),
			newValue: v.optional(v.any()),
			metadata: v.optional(v.any()), // Additional context
		}),
		// Processing state
		status: v.union(
			v.literal("pending"),
			v.literal("processing"),
			v.literal("completed"),
			v.literal("failed")
		),
		processedAt: v.optional(v.number()),
		failedAt: v.optional(v.number()),
		errorMessage: v.optional(v.string()),
		attemptCount: v.number(),
		// Event tracing
		correlationId: v.optional(v.string()), // Groups related events
		causationId: v.optional(v.string()), // Points to triggering event
		// Timestamps
		createdAt: v.number(),
	})
		.index("by_org", ["orgId"])
		.index("by_org_status", ["orgId", "status"])
		.index("by_type_status", ["eventType", "status"])
		.index("by_correlation", ["correlationId"]),
```

**Step 2: Add workflow automations table to schema**

Add immediately after domainEvents table:

```typescript
	// Workflow Automations - main automation definition
	workflowAutomations: defineTable({
		orgId: v.id("organizations"),
		name: v.string(),
		description: v.optional(v.string()),
		isActive: v.boolean(),

		// Trigger definition
		trigger: v.object({
			objectType: v.union(
				v.literal("client"),
				v.literal("project"),
				v.literal("quote"),
				v.literal("invoice"),
				v.literal("task")
			),
			fromStatus: v.optional(v.string()), // Optional: specific "from" status
			toStatus: v.string(), // Required: target status
		}),

		// Workflow nodes (linear with conditional branches)
		nodes: v.array(
			v.object({
				id: v.string(),
				type: v.union(v.literal("condition"), v.literal("action")),
				// Condition node fields
				condition: v.optional(
					v.object({
						field: v.string(), // e.g., "priorityLevel", "projectType"
						operator: v.union(
							v.literal("equals"),
							v.literal("not_equals"),
							v.literal("contains"),
							v.literal("exists")
						),
						value: v.any(),
					})
				),
				// Action node fields
				action: v.optional(
					v.object({
						targetType: v.union(
							v.literal("self"),
							v.literal("project"),
							v.literal("client"),
							v.literal("quote"),
							v.literal("invoice")
						),
						actionType: v.literal("update_status"),
						newStatus: v.string(),
					})
				),
				// Flow control
				nextNodeId: v.optional(v.string()),
				elseNodeId: v.optional(v.string()), // For condition nodes
			})
		),

		// Metadata
		createdBy: v.id("users"),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_org", ["orgId"])
		.index("by_org_active", ["orgId", "isActive"])
		.index("by_trigger_type", ["trigger.objectType", "isActive"]),
```

**Step 3: Run Convex to apply schema changes**

Run: `cd packages/backend && pnpm dev`
Expected: Convex dashboard shows new tables `domainEvents` and `workflowAutomations`

**Step 4: Commit schema changes**

```bash
git add packages/backend/convex/schema.ts
git commit -m "feat(backend): add workflow automation schema

Add domainEvents and workflowAutomations tables for event-driven
automation system. Supports triggers, conditions, and actions on
entity status changes."
```

---

## Task 2: Create Event Bus Module ✅ COMPLETED

> **Note:** Schema compatibility fixes applied - see Migration Status section for details.

**Files:**
- Create: `packages/backend/convex/eventBus.ts`

**Step 1: Copy event bus from workflow-automation branch**

Run:
```bash
git show workflow-automation:convex/eventBus.ts > packages/backend/convex/eventBus.ts
```

**Step 2: Verify imports match new structure**

The file already uses correct imports from `./_generated/server`, `./_generated/dataModel`, and `./_generated/api`. No changes needed.

**Step 3: Test event bus compiles**

Run: `cd packages/backend && pnpm dev`
Expected: No TypeScript errors, Convex functions register successfully

**Step 4: Commit event bus**

```bash
git add packages/backend/convex/eventBus.ts
git commit -m "feat(backend): add event bus for event-driven architecture

Implements event publishing, processing, and subscription system.
Supports event sourcing, retries, and correlation tracking."
```

---

## Task 3: Create Automation Executor Module ✅ COMPLETED

> **Note:** Additional schema elements added (workflowExecutions table) - see Migration Status.

**Files:**
- Create: `packages/backend/convex/automationExecutor.ts`

**Step 1: Copy automation executor from workflow-automation branch**

Run:
```bash
git show workflow-automation:convex/automationExecutor.ts > packages/backend/convex/automationExecutor.ts
```

**Step 2: Update imports for aggregate helpers**

Find line (around line 9):
```typescript
import { AggregateHelpers } from "./lib/aggregates";
```

Replace with:
```typescript
import { initializeAggregates } from "./lib/aggregates";
```

**Step 3: Update aggregate initialization calls**

Find all instances of `AggregateHelpers.initializeForOrganization` (should be around 2-3 places).

Replace with:
```typescript
await initializeAggregates(ctx, orgId);
```

**Step 4: Test automation executor compiles**

Run: `cd packages/backend && pnpm dev`
Expected: No TypeScript errors, internal functions register

**Step 5: Commit automation executor**

```bash
git add packages/backend/convex/automationExecutor.ts
git commit -m "feat(backend): add automation execution engine

Implements workflow execution with:
- Event-driven trigger matching
- Condition evaluation
- Action execution
- Cascading automation support with recursion limits
- Rate limiting for safety"
```

---

## Task 4: Create Automations CRUD Module ✅ COMPLETED

> **IMPORTANT:** Ignore Steps 2-5 - they reference incorrect auth function names. Actual implementation uses `getCurrentUserOrThrow` and `getCurrentUserOrgId`.

**Files:**
- Create: `packages/backend/convex/automations.ts`

**Step 1: Copy automations module from workflow-automation branch**

Run:
```bash
git show workflow-automation:convex/automations.ts > packages/backend/convex/automations.ts
```

**Step 2: Update auth import paths**

Find line (around line 4):
```typescript
import { getCurrentUserOrgId, getCurrentUserOrThrow } from "./lib/auth";
```

Replace with:
```typescript
import { getUserOrThrow, getOrgFromAuthOrThrow } from "./lib/auth";
```

**Step 3: Update helper function to use new auth pattern**

Find function `getAutomationWithOrgValidation` (around line 70):

Replace:
```typescript
const userOrgId = await getCurrentUserOrgId(ctx);
```

With:
```typescript
const user = await getUserOrThrow(ctx);
const org = await getOrgFromAuthOrThrow(ctx, user);
const userOrgId = org.organizationId;
```

**Step 4: Update createAutomationWithOrg function**

Find function `createAutomationWithOrg` (around line 95):

Replace:
```typescript
const userOrgId = await getCurrentUserOrgId(ctx);
const user = await getCurrentUserOrThrow(ctx);
```

With:
```typescript
const user = await getUserOrThrow(ctx);
const org = await getOrgFromAuthOrThrow(ctx, user);
const userOrgId = org.organizationId;
```

**Step 5: Update list query**

Find the `list` query handler (around line 120):

Replace:
```typescript
const userOrgId = await getCurrentUserOrgId(ctx);
if (!userOrgId) {
	return [];
}
```

With:
```typescript
const user = await getUserOrThrow(ctx);
const org = await getOrgFromAuthOrThrow(ctx, user);
```

And change the query to use `org.organizationId`:
```typescript
return await ctx.db
	.query("workflowAutomations")
	.withIndex("by_org", (q) => q.eq("orgId", org.organizationId))
	.collect();
```

**Step 6: Test automations module compiles**

Run: `cd packages/backend && pnpm dev`
Expected: No TypeScript errors, query/mutation functions register

**Step 7: Commit automations module**

```bash
git add packages/backend/convex/automations.ts
git commit -m "feat(backend): add automation CRUD operations

Implements create, read, update, delete, and list operations for
workflow automations with organization isolation and validation."
```

---

## Task 5: Integrate Event Emitters into Entity Mutations ✅ COMPLETED

> **Note:** Tests skipped due to async event emission issues. See Known Issues in Migration Status.

**Files:**
- Modify: `packages/backend/convex/clients.ts`
- Modify: `packages/backend/convex/projects.ts`
- Modify: `packages/backend/convex/quotes.ts`
- Modify: `packages/backend/convex/invoices.ts`
- Modify: `packages/backend/convex/tasks.ts`

**Step 1: Add event bus import to clients.ts**

At top of `packages/backend/convex/clients.ts`, add:

```typescript
import { emitStatusChangeEvent } from "./eventBus";
```

**Step 2: Add event emission to clients.update mutation**

Find the `update` mutation in `clients.ts` (around line 200).

After line that fetches the existing client:
```typescript
const existingClient = await getEntityOrThrow(ctx, "clients", args.id, "Client");
```

Add status tracking:
```typescript
const oldStatus = existingClient.status;
```

After the `ctx.db.patch()` call and before the return:
```typescript
// Emit status change event if status changed
if (args.status && args.status !== oldStatus) {
	await emitStatusChangeEvent(
		ctx,
		org.organizationId,
		"client",
		args.id,
		oldStatus,
		args.status,
		"clients.update"
	);
}
```

**Step 3: Repeat for projects.ts**

Add import, track `oldStatus`, emit event in `update` mutation.

**Step 4: Repeat for quotes.ts**

Add import, track `oldStatus`, emit event in `update` mutation.

**Step 5: Repeat for invoices.ts**

Add import, track `oldStatus`, emit event in `update` mutation.

**Step 6: Repeat for tasks.ts**

Add import, track `oldStatus`, emit event in `update` mutation.

**Step 7: Test backend compiles**

Run: `cd packages/backend && pnpm dev`
Expected: No errors, all mutations register successfully

**Step 8: Commit event integration**

```bash
git add packages/backend/convex/clients.ts packages/backend/convex/projects.ts packages/backend/convex/quotes.ts packages/backend/convex/invoices.ts packages/backend/convex/tasks.ts
git commit -m "feat(backend): integrate event emissions in entity updates

Emit status change events when clients, projects, quotes, invoices,
or tasks change status. Enables event-driven automation triggers."
```

---

## Task 6: Create Frontend Automations List Page ✅ COMPLETED

**Files:**
- Create: `apps/web/src/app/(workspace)/automations/page.tsx`

**Step 1: Create automations directory**

Run:
```bash
mkdir -p apps/web/src/app/\(workspace\)/automations
```

**Step 2: Copy page from workflow-automation branch**

Run:
```bash
git show workflow-automation:src/app/\(workspace\)/automations/page.tsx > apps/web/src/app/\(workspace\)/automations/page.tsx
```

**Step 3: Update Convex import path**

Find line (around line 4):
```typescript
import { api } from "../../../../convex/_generated/api";
```

Replace with:
```typescript
import { api } from "@onetool/backend/convex/_generated/api";
```

Find line (around line 33):
```typescript
import type { Id } from "../../../../convex/_generated/dataModel";
```

Replace with:
```typescript
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
```

**Step 4: Test page compiles**

Run: `cd apps/web && pnpm build`
Expected: No TypeScript errors

**Step 5: Commit automations list page**

```bash
git add apps/web/src/app/\(workspace\)/automations/page.tsx
git commit -m "feat(web): add automations list page

Displays workflow automations with create, edit, delete, and
toggle active/inactive functionality. Includes premium feature gate."
```

---

## Task 7: Create Frontend Automation Editor Page ✅ COMPLETED

**Files:**
- Create: `apps/web/src/app/(workspace)/automations/editor/page.tsx`

**Step 1: Create editor directory**

Run:
```bash
mkdir -p apps/web/src/app/\(workspace\)/automations/editor
```

**Step 2: Copy editor page from workflow-automation branch**

Run:
```bash
git show workflow-automation:src/app/\(workspace\)/automations/editor/page.tsx > apps/web/src/app/\(workspace\)/automations/editor/page.tsx
```

**Step 3: Update Convex imports**

Replace:
```typescript
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
```

With:
```typescript
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
```

**Step 4: Test editor page compiles**

Run: `cd apps/web && pnpm build`
Expected: No TypeScript errors

**Step 5: Commit automation editor**

```bash
git add apps/web/src/app/\(workspace\)/automations/editor/page.tsx
git commit -m "feat(web): add visual automation editor

Provides drag-and-drop workflow builder for creating automation
triggers, conditions, and actions."
```

---

## Task 8: Create UI Components for Workflow Builder ✅ COMPLETED

> **Note:** Fixed TypeScript error in `automation-condition-editor.tsx` (ternary operator).

**Files:**
- Create: `apps/web/src/app/(workspace)/automations/components/*.tsx` (8 files)

**Step 1: Create components directory**

Run:
```bash
mkdir -p apps/web/src/app/\(workspace\)/automations/components
```

**Step 2: Copy all component files**

Run:
```bash
for file in add-node-button.tsx add-step-button.tsx automation-action-editor.tsx automation-condition-editor.tsx automation-node-card.tsx automation-trigger-config.tsx dot-background.tsx trigger-node.tsx workflow-canvas.tsx workflow-node.tsx; do
  git show "workflow-automation:src/app/(workspace)/automations/components/$file" > "apps/web/src/app/(workspace)/automations/components/$file"
done
```

**Step 3: Update Convex imports in components that need it**

Check each component file for imports from `convex/_generated` and update paths to `@onetool/backend/convex/_generated`.

Files likely needing updates:
- `automation-action-editor.tsx`
- `automation-trigger-config.tsx`
- `workflow-canvas.tsx`

Run this to fix imports automatically:
```bash
find apps/web/src/app/\(workspace\)/automations/components -name "*.tsx" -exec sed -i '' 's|from ".*convex/_generated|from "@onetool/backend/convex/_generated|g' {} \;
```

**Step 4: Test components compile**

Run: `cd apps/web && pnpm build`
Expected: No TypeScript errors

**Step 5: Commit UI components**

```bash
git add apps/web/src/app/\(workspace\)/automations/components/
git commit -m "feat(web): add workflow builder UI components

Add visual components for automation editor:
- Trigger configuration
- Condition editor
- Action editor
- Node cards
- Workflow canvas
- Add node/step buttons
- Dot pattern background"
```

---

## Task 9: Add Navigation Link to Automations ✅ COMPLETED

> **IMPORTANT:** Ignore Step 1 - correct file is `apps/web/src/components/layout/app-sidebar.tsx`, not `apps/web/src/app/(workspace)/layout.tsx`.

**Files:**
- Modify: `apps/web/src/app/(workspace)/layout.tsx`

**Step 1: Read workspace layout to find navigation**

Run: `grep -n "navigation" apps/web/src/app/\(workspace\)/layout.tsx | head -10`
Expected: Find navigation items array

**Step 2: Add automations navigation item**

Find the navigation items array (likely around line 50-100). Add after "Tasks" or before "Reports":

```typescript
{
	name: "Automations",
	href: "/automations",
	icon: Zap, // Import from lucide-react
	current: pathname === "/automations" || pathname.startsWith("/automations/"),
},
```

**Step 3: Add Zap icon import**

Find the lucide-react import at top of file. Add `Zap` to the import list:

```typescript
import { Home, Users, Briefcase, FileText, DollarSign, CalendarDays, Zap, BarChart, Settings } from "lucide-react";
```

**Step 4: Test navigation renders**

Run: `cd apps/web && pnpm dev`
Expected: Navigate to http://localhost:3000/automations and see the page

**Step 5: Commit navigation update**

```bash
git add apps/web/src/app/\(workspace\)/layout.tsx
git commit -m "feat(web): add automations to workspace navigation

Add Automations link to sidebar navigation with Zap icon."
```

---

## Task 10: Write Backend Tests for Automations ⏳ PENDING

> **Status:** NOT STARTED. Implementer subagent was dispatched but interrupted before work began.

**Files:**
- Create: `packages/backend/convex/automations.test.ts`
- Create: `packages/backend/convex/eventBus.test.ts`

**Step 1: Create automations.test.ts**

Create file with basic tests:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { setupConvexTest } from "./test.setup";
import { createTestOrg, createTestIdentity } from "./test.helpers";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

describe("Automations", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	describe("create", () => {
		it("should create a workflow automation", async () => {
			const { orgId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				return await createTestOrg(ctx);
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const automationId = await asUser.run(async (ctx) => {
				return await ctx.runMutation(api.automations.create, {
					name: "Auto-approve quotes",
					description: "When a quote is sent, automatically mark project as in-progress",
					isActive: true,
					trigger: {
						objectType: "quote",
						toStatus: "sent",
					},
					nodes: [],
				});
			});

			expect(automationId).toBeDefined();
		});
	});

	describe("list", () => {
		it("should list automations for organization", async () => {
			const { orgId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				return await createTestOrg(ctx);
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			// Create automation
			await asUser.run(async (ctx) => {
				return await ctx.runMutation(api.automations.create, {
					name: "Test automation",
					isActive: true,
					trigger: {
						objectType: "project",
						toStatus: "completed",
					},
					nodes: [],
				});
			});

			// List automations
			const automations = await asUser.run(async (ctx) => {
				return await ctx.runQuery(api.automations.list, {});
			});

			expect(automations).toHaveLength(1);
			expect(automations[0].name).toBe("Test automation");
		});

		it("should isolate automations by organization", async () => {
			const org1 = await t.run(async (ctx) => await createTestOrg(ctx));
			const org2 = await t.run(async (ctx) => await createTestOrg(ctx));

			const asUser1 = t.withIdentity(createTestIdentity(org1.clerkUserId, org1.clerkOrgId));
			const asUser2 = t.withIdentity(createTestIdentity(org2.clerkUserId, org2.clerkOrgId));

			// Create automation in org1
			await asUser1.run(async (ctx) => {
				return await ctx.runMutation(api.automations.create, {
					name: "Org 1 automation",
					isActive: true,
					trigger: { objectType: "client", toStatus: "active" },
					nodes: [],
				});
			});

			// List from org2 should be empty
			const org2Automations = await asUser2.run(async (ctx) => {
				return await ctx.runQuery(api.automations.list, {});
			});

			expect(org2Automations).toHaveLength(0);
		});
	});

	describe("update", () => {
		it("should update automation name", async () => {
			const { orgId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				return await createTestOrg(ctx);
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const automationId = await asUser.run(async (ctx) => {
				return await ctx.runMutation(api.automations.create, {
					name: "Original name",
					isActive: true,
					trigger: { objectType: "task", toStatus: "completed" },
					nodes: [],
				});
			});

			await asUser.run(async (ctx) => {
				return await ctx.runMutation(api.automations.update, {
					id: automationId,
					name: "Updated name",
				});
			});

			const automation = await asUser.run(async (ctx) => {
				return await ctx.runQuery(api.automations.get, { id: automationId });
			});

			expect(automation?.name).toBe("Updated name");
		});

		it("should toggle isActive status", async () => {
			const { orgId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				return await createTestOrg(ctx);
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const automationId = await asUser.run(async (ctx) => {
				return await ctx.runMutation(api.automations.create, {
					name: "Test",
					isActive: true,
					trigger: { objectType: "invoice", toStatus: "paid" },
					nodes: [],
				});
			});

			await asUser.run(async (ctx) => {
				return await ctx.runMutation(api.automations.update, {
					id: automationId,
					isActive: false,
				});
			});

			const automation = await asUser.run(async (ctx) => {
				return await ctx.runQuery(api.automations.get, { id: automationId });
			});

			expect(automation?.isActive).toBe(false);
		});
	});

	describe("remove", () => {
		it("should delete automation", async () => {
			const { orgId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				return await createTestOrg(ctx);
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const automationId = await asUser.run(async (ctx) => {
				return await ctx.runMutation(api.automations.create, {
					name: "To be deleted",
					isActive: true,
					trigger: { objectType: "quote", toStatus: "approved" },
					nodes: [],
				});
			});

			await asUser.run(async (ctx) => {
				return await ctx.runMutation(api.automations.remove, { id: automationId });
			});

			const automation = await asUser.run(async (ctx) => {
				return await ctx.runQuery(api.automations.get, { id: automationId });
			});

			expect(automation).toBeNull();
		});
	});
});
```

**Step 2: Create eventBus.test.ts**

Create file with event publishing tests:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { setupConvexTest } from "./test.setup";
import { createTestOrg } from "./test.helpers";
import { internal } from "./_generated/api";

describe("Event Bus", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	it("should publish and store events", async () => {
		const { orgId } = await t.run(async (ctx) => {
			return await createTestOrg(ctx);
		});

		const eventId = await t.run(async (ctx) => {
			return await ctx.runMutation(internal.eventBus.publishEvent, {
				orgId,
				eventType: "entity.status_changed",
				eventSource: "clients.update",
				payload: {
					entityType: "client",
					entityId: "test-client-id",
					field: "status",
					oldValue: "lead",
					newValue: "active",
				},
			});
		});

		expect(eventId).toBeDefined();

		// Verify event was stored
		const event = await t.run(async (ctx) => {
			return await ctx.db.get(eventId);
		});

		expect(event).toBeDefined();
		expect(event?.eventType).toBe("entity.status_changed");
		expect(event?.status).toBe("pending");
	});
});
```

**Step 3: Run tests**

Run: `cd packages/backend && pnpm test:once`
Expected: All tests pass

**Step 4: Commit tests**

```bash
git add packages/backend/convex/automations.test.ts packages/backend/convex/eventBus.test.ts
git commit -m "test(backend): add tests for automations and event bus

Add comprehensive tests for:
- Automation CRUD operations
- Organization isolation
- Event publishing and storage"
```

---

## Task 11: Update Feature Access Hook ⏳ PENDING

**Files:**
- Modify: `apps/web/src/hooks/use-feature-access.ts` (if exists) or create it

**Step 1: Check if feature access hook exists**

Run: `ls apps/web/src/hooks/use-feature-access.ts`

**Step 2: If missing, create basic feature access hook**

Create `apps/web/src/hooks/use-feature-access.ts`:

```typescript
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";

export function useFeatureAccess() {
	const organization = useQuery(api.organizations.get, {});

	const hasPremiumAccess = organization?.subscription?.plan === "pro" ||
		organization?.subscription?.plan === "trial";

	return {
		hasPremiumAccess,
		isLoading: organization === undefined,
	};
}
```

**Step 3: Test hook compiles**

Run: `cd apps/web && pnpm build`
Expected: No errors

**Step 4: Commit feature access hook**

```bash
git add apps/web/src/hooks/use-feature-access.ts
git commit -m "feat(web): add feature access hook for premium features

Provides hasPremiumAccess flag based on subscription plan."
```

---

## Task 12: Add Premium Plan Check to Billing ⏳ PENDING

**Files:**
- Modify: `packages/backend/convex/organizations.ts`

**Step 1: Verify subscription field exists in schema**

Run: `grep -A 10 "subscription:" packages/backend/convex/schema.ts`

Expected: Find subscription object with plan field

**Step 2: If subscription tracking doesn't exist, add to organizations query**

Find the `get` query in `organizations.ts`. Ensure it returns subscription data.

**Step 3: Test organization query**

Run: `cd packages/backend && pnpm dev`
Expected: No errors

**Step 4: Commit if changes made**

```bash
git add packages/backend/convex/organizations.ts
git commit -m "feat(backend): ensure subscription data available for feature access"
```

---

## Task 13: Documentation Update ⏳ PENDING

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add workflow automation section**

Add after the "Invoice Payment Splitting" section (around line 500):

```markdown
### Workflow Automations

Organizations can create automated workflows triggered by entity status changes:

**Architecture:**
- Event-driven with decoupled event bus pattern
- Triggers fire when clients, projects, quotes, invoices, or tasks change status
- Workflows consist of conditions and actions in a graph structure
- Supports cascading automations with recursion limits

**Key Tables:**
- `workflowAutomations` - Workflow definitions with triggers and nodes
- `domainEvents` - Event store for event sourcing and replay

**Backend Modules:**
- `eventBus.ts` - Event publishing, processing, and subscription
- `automationExecutor.ts` - Finds matching automations and executes workflows
- `automations.ts` - CRUD operations for automation definitions

**Event Emission:**
Entity update mutations emit events via `emitStatusChangeEvent()` when status changes:
```typescript
import { emitStatusChangeEvent } from "./eventBus";

// In update mutation, after status change:
if (args.status && args.status !== oldStatus) {
	await emitStatusChangeEvent(
		ctx,
		org.organizationId,
		"client",
		args.id,
		oldStatus,
		args.status,
		"clients.update"
	);
}
```

**Automation Execution Flow:**
1. Entity mutation detects status change
2. `emitStatusChangeEvent()` publishes event to event bus
3. Event processor triggers `handleStatusChangeEvent()`
4. Executor finds matching active automations
5. For each match, executes workflow nodes (conditions → actions)
6. Actions can trigger more status changes (cascading automations)
7. Recursion depth limits prevent infinite loops

**Frontend Routes:**
- `/automations` - List, create, delete automations
- `/automations/editor` - Visual workflow builder

**Premium Feature:**
Automations require Business plan subscription.
```

**Step 2: Commit documentation**

```bash
git add CLAUDE.md
git commit -m "docs: add workflow automation documentation

Document automation architecture, event bus pattern, and usage."
```

---

## Task 14: Manual Testing Checklist ⏳ PENDING

**Step 1: Test automation creation**

Manual steps:
1. Start dev servers: `pnpm dev`
2. Navigate to http://localhost:3000/automations
3. Click "Create Automation"
4. Configure trigger (e.g., "When Quote changes to Sent")
5. Add action (e.g., "Update Project status to In Progress")
6. Save automation
7. Verify it appears in list

**Step 2: Test automation execution**

Manual steps:
1. Create a quote
2. Change quote status to "Sent"
3. Verify associated project status changes to "In Progress"
4. Check domain events table in Convex dashboard
5. Verify event was processed successfully

**Step 3: Test organization isolation**

Manual steps:
1. Create automation in Org A
2. Switch to Org B (if multi-org user)
3. Verify Org B doesn't see Org A's automations

**Step 4: Test premium feature gate**

Manual steps:
1. Sign in with free plan organization
2. Navigate to /automations
3. Verify "Premium Feature" message displayed
4. Verify "Upgrade to Business" button shown

**Step 5: Document any bugs found**

Create GitHub issues for bugs discovered during testing.

---

## Summary

This plan migrates the complete workflow automation feature from the old directory structure to the new monorepo structure. The migration includes:

✅ **Backend (11 files):**
- Schema additions (2 tables)
- Event bus module
- Automation executor
- Automations CRUD
- Event emitters in 5 entity files
- Tests

✅ **Frontend (11 files):**
- Automations list page
- Visual editor page
- 10 UI components
- Navigation integration
- Feature access hook

✅ **Documentation:**
- CLAUDE.md updates
- Manual testing checklist

**Total Commits:** 14 small, focused commits following conventional commits format

**Estimated Complexity:** Medium-High (event-driven architecture, visual builder UI)

**Testing Strategy:** Unit tests for backend, manual testing for UI and event flow
