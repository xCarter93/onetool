---
name: backend-skill
description: Guidelines for working with OneTool's Convex backend services. Use this when creating or modifying backend functions, handling webhooks, managing data, or implementing authentication and authorization. Emphasizes organization data separation and proper authentication patterns.
---

# Backend Development Skill

## Overview

OneTool uses **Convex** as its backend framework. All backend code lives in `packages/backend/convex/`. This skill provides essential patterns for building secure, multi-tenant backend functions with proper organization data isolation.

## Critical Security Principles

### 1. Always Authenticate Users

**Every query and mutation must verify the user is authenticated.**

```typescript
import { getCurrentUserOrThrow } from "./lib/auth";

export const myQuery = query({
  args: {},
  handler: async (ctx) => {
    // ALWAYS start with authentication
    const user = await getCurrentUserOrThrow(ctx);
    // ... rest of logic
  },
});
```

**Authentication helpers** (`lib/auth.ts`):
- `getCurrentUserOrThrow()` - Gets user, throws if not authenticated (use this by default)
- `getCurrentUser()` - Gets user, returns null if not authenticated
- `userByExternalId()` - Looks up user by Clerk ID

### 2. Always Enforce Organization Data Separation

**Every operation must validate organization access to prevent data leaks between organizations.**

```typescript
import { getCurrentUserOrgId } from "./lib/auth";

export const listClients = query({
  args: {},
  handler: async (ctx) => {
    await getCurrentUserOrThrow(ctx);
    
    // ALWAYS get and validate organization ID
    const orgId = await getCurrentUserOrgId(ctx);
    
    // ALWAYS filter by organization
    return await ctx.db
      .query("clients")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
  },
});
```

**Organization helpers** (`lib/auth.ts`):
- `getCurrentUserOrgId()` - Gets organization ID, throws if not found
- `getCurrentUserOrgIdOptional()` - Gets organization ID, returns null if not found
- `validateOrgAccess(ctx, orgId)` - Validates user has access to specified org
- `getOrganizationByClerkId()` - Looks up organization by Clerk org ID

**Pattern for operations on existing records:**

```typescript
export const updateClient = mutation({
  args: { id: v.id("clients"), name: v.string() },
  handler: async (ctx, args) => {
    await getCurrentUserOrThrow(ctx);
    const userOrgId = await getCurrentUserOrgId(ctx);
    
    // Get the record
    const client = await ctx.db.get(args.id);
    if (!client) throw new Error("Client not found");
    
    // ALWAYS validate organization ownership
    if (client.orgId !== userOrgId) {
      throw new Error("Client does not belong to your organization");
    }
    
    // Now safe to update
    await ctx.db.patch(args.id, { name: args.name });
  },
});
```

## Backend Structure

### Core Files

**Location**: `packages/backend/convex/`

- `schema.ts` - Database schema definitions
- `auth.config.ts` - Clerk authentication configuration
- `http.ts` - HTTP routes and webhook handlers
- `convex.config.ts` - Convex deployment configuration

### Library Utilities

**Location**: `packages/backend/convex/lib/`

- `auth.ts` - Authentication and organization helpers
- `permissions.ts` - Role-based and feature-based permissions
- `memberships.ts` - Organization membership utilities
- `activities.ts` - Activity logging helpers
- `aggregates.ts` - Aggregate data calculation helpers
- `shared.ts` - Shared utility functions
- `storage.ts` - File storage helpers

### Domain Files

Each domain has its own file (e.g., `clients.ts`, `projects.ts`, `tasks.ts`, `invoices.ts`):
- Queries (read operations)
- Mutations (write operations)
- Internal mutations (webhook/cron handlers)
- Domain-specific helper functions

## Webhook Management

**All webhooks are defined in**: `packages/backend/convex/http.ts`

### Available Webhooks

#### 1. Clerk Users Webhook (`/clerk-users-webhook`)

**Purpose**: Sync user and organization data from Clerk

**Supported events**:
- `user.created` / `user.updated` - Sync user data
- `user.deleted` - Clean up user data
- `session.created` - Update last sign-in date
- `organization.created` - Create organization in database
- `organization.updated` - Sync organization changes
- `organization.deleted` - Clean up organization data
- `organizationMembership.created` - Add user to organization
- `organizationMembership.updated` - Update user's role
- `organizationMembership.deleted` - Remove user from organization

**Handler functions**: `users.ts`, `organizations.ts`

**When to modify**: When adding new user or organization fields to sync from Clerk

#### 2. Clerk Billing Webhook (`/clerk-billing-webhook`)

**Purpose**: Handle subscription and payment events

**Supported events**:
- `paymentAttempt.created` - Log new payment attempts
- `paymentAttempt.updated` - Track payment status
- `subscription.created` - Initialize new subscription
- `subscription.active` - Activate premium features
- `subscription.updated` - Sync subscription changes
- `subscription.pastDue` - Handle payment failures

**Handler functions**: `billingWebhook.ts`

**When to modify**: When adding billing-related features or subscription tiers

#### 3. BoldSign Webhook (`/boldsign-webhook`)

**Purpose**: Track e-signature document status

**Supported events**:
- `Sent` - Document sent to signers
- `Viewed` - Document viewed by signer
- `Signed` - Document signed by a party
- `Completed` - All parties signed
- `Declined` - Document declined
- `Revoked` - Document revoked by sender
- `Expired` - Document expired

**Handler functions**: `boldsign.ts`

**When to modify**: When adding e-signature workflow changes or notifications

#### 4. Resend Email Webhook (`/resend-webhook`)

**Purpose**: Track email delivery and handle inbound email

**Supported events**:
- `email.sent` - Email accepted by Resend
- `email.delivered` - Email delivered to recipient
- `email.opened` - Email opened by recipient
- `email.bounced` - Email bounced
- `email.complained` - Marked as spam
- `email.received` - Inbound email received

**Handler functions**: `resendWebhook.ts`, `resendReceiving.ts`

**When to modify**: When adding email tracking features or inbound email processing

### Webhook Security

All webhooks verify signatures before processing:
- Clerk webhooks: Svix signature verification
- BoldSign webhooks: HMAC SHA-256 signature verification
- Resend webhooks: Svix signature verification

## Permission & Role Management

**Location**: `packages/backend/convex/lib/permissions.ts`

### Role-Based Permissions

```typescript
import { requireAdmin, isAdmin, isMember } from "./lib/permissions";

export const deleteClient = mutation({
  args: { id: v.id("clients") },
  handler: async (ctx, args) => {
    await getCurrentUserOrThrow(ctx);
    
    // Require admin role
    await requireAdmin(ctx);
    
    // ... perform delete
  },
});

// Or check role and handle logic
export const getAnalytics = query({
  args: {},
  handler: async (ctx) => {
    await getCurrentUserOrThrow(ctx);
    const userIsAdmin = await isAdmin(ctx);
    
    // Return different data based on role
    if (userIsAdmin) {
      return fullAnalytics;
    } else {
      return limitedAnalytics;
    }
  },
});
```

**Role helpers**:
- `getCurrentUserRole()` - Gets role from Clerk JWT
- `isAdmin()` - Checks if user is admin
- `isMember()` - Checks if user is member (non-admin)
- `requireAdmin()` - Throws if user is not admin

### Feature-Based Permissions

```typescript
import { requirePremiumAccess, hasPremiumAccess } from "./lib/permissions";

export const exportData = mutation({
  args: { format: v.string() },
  handler: async (ctx, args) => {
    await getCurrentUserOrThrow(ctx);
    
    // Require premium feature
    await requirePremiumAccess(ctx);
    
    // ... perform export
  },
});

// Or check feature and return availability
export const checkExportAccess = query({
  args: {},
  handler: async (ctx) => {
    const hasAccess = await hasPremiumAccess(ctx);
    return { canExport: hasAccess };
  },
});
```

**Feature helpers**:
- `hasFeature(ctx, feature)` - Checks if user has feature
- `requireFeature(ctx, feature)` - Throws if user lacks feature
- `hasPremiumAccess()` - Checks for premium access
- `requirePremiumAccess()` - Throws if no premium access

## Function Types

### Queries (Read Operations)

Use `query` for read-only operations:

```typescript
import { query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    await getCurrentUserOrThrow(ctx);
    const orgId = await getCurrentUserOrgId(ctx);
    
    return await ctx.db
      .query("clients")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
  },
});
```

### Mutations (Write Operations)

Use `mutation` for operations that modify data:

```typescript
import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: {
    name: v.string(),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await getCurrentUserOrThrow(ctx);
    const orgId = await getCurrentUserOrgId(ctx);
    
    return await ctx.db.insert("clients", {
      ...args,
      orgId, // ALWAYS include orgId
      status: "active",
    });
  },
});
```

### Actions (External API Calls)

Use `action` for operations that call external APIs:

```typescript
import { action } from "./_generated/server";
import { v } from "convex/values";

export const sendEmail = action({
  args: {
    to: v.string(),
    subject: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    // Actions can make external API calls
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
    });
    
    return await response.json();
  },
});
```

### Internal Mutations (Webhooks/Crons)

Use `internalMutation` for webhook handlers and cron jobs:

```typescript
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const upsertFromClerk = internalMutation({
  args: {
    data: v.object({
      id: v.string(),
      email_addresses: v.array(v.any()),
      // ... other Clerk fields
    }),
  },
  handler: async (ctx, args) => {
    // Internal mutations don't require auth checks
    // They're only called by webhooks or other internal functions
    
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_external_id", (q) => q.eq("externalId", args.data.id))
      .unique();
    
    if (existingUser) {
      await ctx.db.patch(existingUser._id, {
        email: args.data.email_addresses[0]?.email_address,
      });
    } else {
      await ctx.db.insert("users", {
        externalId: args.data.id,
        email: args.data.email_addresses[0]?.email_address,
        name: args.data.first_name + " " + args.data.last_name,
      });
    }
  },
});
```

## Schema Patterns

**Location**: `packages/backend/convex/schema.ts`

### Organization-Scoped Tables

**Every table with user data MUST have an `orgId` field:**

```typescript
clients: defineTable({
  // Organization reference (REQUIRED for multi-tenancy)
  orgId: v.id("organizations"),
  
  // Client fields
  name: v.string(),
  email: v.optional(v.string()),
  status: v.union(
    v.literal("active"),
    v.literal("inactive"),
    v.literal("archived")
  ),
})
  .index("by_org", ["orgId"])
  .index("by_status", ["orgId", "status"]),
```

**Always index by organization:**
- Primary index: `by_org` on `orgId`
- Compound indexes: Start with `orgId` (e.g., `by_status` on `["orgId", "status"]`)

### User and Organization Tables

```typescript
users: defineTable({
  name: v.string(),
  email: v.string(),
  externalId: v.string(), // Clerk user ID
  // ... other fields
})
  .index("by_external_id", ["externalId"])
  .index("by_email", ["email"]),

organizations: defineTable({
  clerkOrganizationId: v.string(), // Clerk org ID
  name: v.string(),
  ownerUserId: v.id("users"),
  // Billing fields
  clerkSubscriptionId: v.optional(v.string()),
  clerkPlanId: v.optional(v.string()),
  subscriptionStatus: v.optional(v.union(/* ... */)),
  // ... other fields
})
  .index("by_clerk_org", ["clerkOrganizationId"])
  .index("by_owner", ["ownerUserId"]),
```

## Complete Function Example

Here's a complete example showing all best practices:

```typescript
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUserOrThrow, getCurrentUserOrgId } from "./lib/auth";
import { requireAdmin } from "./lib/permissions";

// Query - List with organization filtering
export const list = query({
  args: {
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // 1. Authenticate user
    await getCurrentUserOrThrow(ctx);
    
    // 2. Get organization ID
    const orgId = await getCurrentUserOrgId(ctx);
    
    // 3. Query with organization filter
    let query = ctx.db
      .query("clients")
      .withIndex("by_org", (q) => q.eq("orgId", orgId));
    
    const clients = await query.collect();
    
    // 4. Additional filtering
    if (args.status) {
      return clients.filter((c) => c.status === args.status);
    }
    
    return clients;
  },
});

// Mutation - Create with organization
export const create = mutation({
  args: {
    name: v.string(),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // 1. Authenticate user
    await getCurrentUserOrThrow(ctx);
    
    // 2. Get organization ID
    const orgId = await getCurrentUserOrgId(ctx);
    
    // 3. Insert with organization
    return await ctx.db.insert("clients", {
      ...args,
      orgId, // ALWAYS include
      status: "active",
    });
  },
});

// Mutation - Update with validation
export const update = mutation({
  args: {
    id: v.id("clients"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    // 1. Authenticate user
    await getCurrentUserOrThrow(ctx);
    
    // 2. Get organization ID
    const userOrgId = await getCurrentUserOrgId(ctx);
    
    // 3. Get and validate record
    const client = await ctx.db.get(args.id);
    if (!client) throw new Error("Client not found");
    
    // 4. CRITICAL: Validate organization access
    if (client.orgId !== userOrgId) {
      throw new Error("Client does not belong to your organization");
    }
    
    // 5. Update
    await ctx.db.patch(args.id, {
      name: args.name,
    });
  },
});

// Mutation - Delete with admin check
export const remove = mutation({
  args: { id: v.id("clients") },
  handler: async (ctx, args) => {
    // 1. Authenticate user
    await getCurrentUserOrThrow(ctx);
    
    // 2. Require admin role
    await requireAdmin(ctx);
    
    // 3. Get and validate organization
    const userOrgId = await getCurrentUserOrgId(ctx);
    const client = await ctx.db.get(args.id);
    
    if (!client) throw new Error("Client not found");
    if (client.orgId !== userOrgId) {
      throw new Error("Access denied");
    }
    
    // 4. Delete
    await ctx.db.delete(args.id);
  },
});
```

## Testing

**Location**: `packages/backend/convex/*.test.ts`

**Test setup**: `test.setup.ts`

Tests use Convex's test helpers with authentication mocking:

```typescript
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";

describe("clients", () => {
  it("should list clients for organization", async () => {
    const t = convexTest(schema);
    
    // Create test data
    const orgId = await t.run(async (ctx) => {
      return await ctx.db.insert("organizations", {
        name: "Test Org",
        clerkOrganizationId: "org_test",
      });
    });
    
    // Run query with auth context
    const clients = await t.query(api.clients.list, {}, {
      auth: {
        getUserIdentity: async () => ({
          subject: "user_test",
          activeOrgId: "org_test",
        }),
      },
    });
    
    expect(clients).toHaveLength(0);
  });
});
```

## Common Patterns

### Pagination

```typescript
export const listPaginated = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await getCurrentUserOrThrow(ctx);
    const orgId = await getCurrentUserOrgId(ctx);
    
    return await ctx.db
      .query("clients")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .paginate(args.paginationOpts);
  },
});
```

### Cascade Deletes

```typescript
export const deleteProject = mutation({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    await getCurrentUserOrThrow(ctx);
    const orgId = await getCurrentUserOrgId(ctx);
    
    // Validate ownership
    const project = await ctx.db.get(args.id);
    if (!project || project.orgId !== orgId) {
      throw new Error("Project not found");
    }
    
    // Delete related tasks
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.id))
      .collect();
    
    for (const task of tasks) {
      await ctx.db.delete(task._id);
    }
    
    // Delete project
    await ctx.db.delete(args.id);
  },
});
```

## Environment Variables

Common environment variables used in backend:
- `CLERK_ISSUER_DOMAIN` - Clerk authentication domain
- `CLERK_USER_WEBHOOK_SECRET` - Clerk webhook signature verification
- `CLERK_BILLING_WEBHOOK_SECRET` - Clerk billing webhook signature
- `RESEND_API_KEY` - Resend email API key
- `RESEND_WEBHOOK_SECRET` - Resend webhook signature
- `BOLDSIGN_WEBHOOK_SECRET` - BoldSign webhook signature

## Security Checklist

Before merging any backend code:

- [ ] Does the function authenticate the user?
- [ ] Does it validate organization access?
- [ ] Are all queries filtered by `orgId`?
- [ ] Are all updates/deletes validated against user's organization?
- [ ] Are role/feature checks applied where needed?
- [ ] Are webhooks properly secured with signature verification?
- [ ] Are error messages safe (no sensitive data leaks)?
- [ ] Is the schema properly indexed?
- [ ] Are tests covering the organization isolation?

## Summary

1. **Always authenticate**: Start every function with `getCurrentUserOrThrow()`
2. **Always validate organization**: Use `getCurrentUserOrgId()` and validate `orgId` matches
3. **Always filter by organization**: Every query must include organization filter
4. **Use proper function types**: Query for reads, mutation for writes, action for external APIs
5. **Webhooks are in http.ts**: All webhook handlers centralized in one file
6. **Follow schema patterns**: Every user-data table needs `orgId` and organization indexes
7. **Test organization isolation**: Verify users can't access other organizations' data

