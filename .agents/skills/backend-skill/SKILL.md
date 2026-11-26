---
name: backend-skill
description: OneTool Convex backend rules that AGENTS.md leaves out, covering authorization and read scope, plan gates, actions, outbound email, webhooks, schema, deletes and tests. Use when creating or modifying backend functions, handling webhooks, managing data, or implementing authentication and authorization, and whenever org data separation is at stake.
---

# OneTool backend

Backend code lives in `packages/backend/convex/`. Read `AGENTS.md` first. It covers the function builders, triggers, money, numbering, plan limits and the event bus, and this skill does not repeat any of that. The code is the source of truth. Each example below names its source file, and if the two ever disagree, follow the file.

## Authorization

A function that touches org data makes three separate checks. Membership in the org is not enough on its own.

| Check | Call | Proves |
| --- | --- | --- |
| Level | `ctx.requireLevel(object, level)` | the caller holds `view`, `modify` or `delete` on the object |
| Tenancy | `ctx.orgEntity(table, id)` | the row exists and its `orgId` is the caller's org |
| Record scope | `ctx.requireRecordScope(object, ref)` for one row, `ctx.applyReadScope` or `ctx.scopedToActor` for lists | a scoped member is assigned to the record |

- The record-scope checks return early for the owner, for admins and for members with an `allRecords` grant, so they never check tenancy. Run `ctx.orgEntity` on every id argument. When one id hangs off another, check that link too. A `contactId` must belong to the `clientId` it came with.
- `PERMISSION_OBJECTS` in `lib/permissionKeys.ts` defines the permission objects, their scope kind and the level ladder, and the web app imports it too. The owner and admins resolve to full access. Members start from `DEFAULT_MEMBER_PERMISSIONS`, which grants modify on their assigned projects and tasks and nothing else, so a default member gets `FORBIDDEN` from `clients.list`.
- The scope kind picks the list filter. Projects, tasks and reports are `direct` objects and filter on an assignee field with `ctx.scopedToActor(object, rows, getAssignees)`. Clients, quotes, invoices and documents are `derived` objects and filter through the caller's assigned projects with `ctx.applyReadScope(object, rows, keep)`.
- For a single record, pass `requireRecordScope` a ref such as `{ clientId }` or `{ projectId, clientId }`. A ref resolves by point read. A closure over `ctx.actorScope()` reads every project in the org and widens the transaction's read set, which invites OCC conflicts.
- `ctx.can(object, level)` returns a boolean for optional parts of a response. `ctx.gateRead(object)` runs the same check at `view` for a query that composes several object types. `projects.ts` uses it for its client, quote and invoice panels.
- For a custom gate, throw through `denyPermission` in `lib/permissions.ts`. It raises `ConvexError({ code: "FORBIDDEN", object, level })` and leaves user and org ids out of the payload.
- `isAdminRole(role)` in `lib/permissions.ts` is the exact-match admin test for a membership row, for jobs like finding the admins to notify. Gate access with the ctx checks above.

A list read, from `clients.listNamesForOrg` in `clients.ts`. `clients.list` does the same through a local helper.

```ts
export const listNamesForOrg = optionalUserQuery({
	args: {},
	handler: async (ctx) => {
		const orgId = ctx.orgId;
		if (!orgId) return [];
		await ctx.requireLevel("clients", "view");

		const clients = await ctx.db
			.query("clients")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect();
		const visible = await ctx.applyReadScope("clients", clients, (c, s) =>
			s.clientIds.has(c._id)
		);

		return visible
			.filter((c) => c.status !== "archived")
			.map((c) => ({
				_id: c._id,
				companyName: c.companyName,
			}));
	},
});
```

Most workspace reads use `optionalUserQuery` and return an empty value when `ctx.orgId` is null, so a call with no active org gets an empty result instead of an error.

A write, from `clients.archive` in `clients.ts`. The real function also logs activity and analytics.

```ts
export const archive = userMutation({
	args: { id: v.id("clients") },
	handler: async (ctx, args) => {
		await ctx.requireLevel("clients", "modify");
		await ctx.orgEntity("clients", args.id);
		await ctx.requireRecordScope("clients", { clientId: args.id });

		await ctx.db.patch(args.id, { status: "archived", archivedAt: Date.now() });
		return args.id;
	},
});
```

Create records through the domain's create helper when it has one. `createClient` in `clients.ts` mints the portal id, logs activity, emits the record-created automation event and enqueues QuickBooks sync. A bare `ctx.db.insert("clients", ...)` skips all four.

## Plan gates

Plan checks go through `lib/entitlements.ts`.

- `requireFeature(ctx, key)` gates a switch row in `FEATURES` that throws on denial. For rows with `deny: { type: "soft" }`, branch on `isFeatureAllowed(plan, key)` instead. On a denied soft row, `requireFeature` throws a misconfiguration error where the caller should have skipped quietly.
- Check and debit a meter in the same mutation with one timestamp. Both then land in the same billing period, and the debit rolls back if a later step throws. From `quotes.create` in `quotes.ts`:

```ts
const { plan } = await entitlementsFromIdentity(ctx);
const now = Date.now();
await requireMeter(ctx, ctx.orgId, "clientSends", plan, { now });
await consumeMeter(ctx, ctx.orgId, "clientSends", { now });
```

The `hasPremiumAccess` helper in `lib/permissions.ts` has no callers left. `assistantChat.ts` gates the assistant with `requireFeature(ctx, "aiAssistant")` and the `assistantMessages` meter. The public `api.permissions.hasPremiumAccess` query stays frozen for mobile and resolves through `entitlementsFromIdentity`.

## Actions

Actions have no builder and no `ctx.db`. Import `action` or `internalAction` from `_generated/server` and authorize inside the internal query or mutation the action runs. The caller's identity carries through `ctx.runQuery`, so that function can call `getCurrentUserOrgId` from `lib/auth.ts` with `requireLevel` and `hasAllRecords` from `lib/permissions.ts`, the non-ctx forms of the checks above. The model is `boldsignActions.createEmbeddedSignatureRequest`, which calls `internal.boldsign.getEmbeddedRequestContext`, which calls `authorizeQuoteModify` in `boldsign.ts`.

## Outbound email

Mutations enqueue sends on the durable `@convex-dev/resend` component in `email/durableResend.ts`, the app's one outbound queue. Outbound email never goes out through `fetch` or the raw SDK from a public action.

- New sends tied to a client go through `deliverOutbound` in `email/deliver.ts`, which sends, writes the `emailMessages` row and bumps the inbox thread. `quotes.sendToClient` and `invoices.sendToClient` show the full shape. The inbox composer, `resend.sendClientEmail`, is the exception. It calls `sendOutbound` directly and writes the row itself.
- `deliverOutbound` calls `sendOutbound` in `email/outbound.ts`, the single provider seam. It handles the idempotency key, the suppression list and attachment deferral to `email/attachmentSend.ts`. The message type is `OutboundMessage` in `email/types.ts`, with `from`, `to[]`, `subject` and `html`, plus optional `text`, `cc`, `bcc` and `replyTo`.
- Build `from` with `formatEmailFrom(name, resolveFromEmail(organization))`, from `lib/emailFrom.ts` and `email/branding.ts`. It strips CR and LF from user-controlled names to block header injection.
- React Email templates need an action to render. Template sends schedule an action that renders the HTML and hands it to a mutation that calls `deliverOutbound`. The header comment of `portal/quoteEmail.ts` walks through it.
- Quote and invoice sends debit the `clientSends` meter.
- The only direct `resend.sendEmail` call is the portal OTP in `portal/email.ts`, an internal action with a fixed OneTool sender. The raw SDK, `getResendClient()` in `lib/resendClient.ts`, serves inbound reads and attachment sends.

## Webhooks and HTTP routes

Every route is in `http.ts`. Verify the signature with `verifySvixWebhook`, `verifyBoldSignWebhook` or `verifyStripeWebhook` from `lib/webhooks.ts` before trusting the payload, and return 500 when the secret is unset. Then hand off to an internal function. Clerk sync uses `internalMutation` from `lib/triggers.ts`. Anything org-scoped uses `systemMutation` once verified data names the org, the way the Stripe handler resolves the org from the connected account id. A `systemMutation` ctx carries `orgId`, `orgEntity` and `db` only, with no user or permission helpers.

- Retry policy varies by route. Stripe returns 500 when dispatch fails so Stripe retries, and it dedupes through `stripeWebhookEvents.startProcessingEvent`. The Clerk organization and membership cases and Resend inbound catch the error, log it and return 200, so the sender stops retrying. Choose one on purpose for a new route.
- Forward Resend lifecycle events such as `email.sent` and `email.bounced` to `resend.handleResendEventWebhook`. Only the component can map Resend's `email_id` to the id stored on `emailMessages`. Its callback is `resendWebhook.handleEmailEvent`.
- The BoldSign route answers `Verification` events before the signature check, because that event is the setup handshake.
- `/portal/otp/request`, `/community/interest` and `/community/view` are server-to-server routes that Next.js calls. Each checks a shared secret header with `constantTimeEqual`. When rotating one of these secrets, set the new value in Convex before Vercel, as the comment above `communitySecretAccepted` explains. Env vars ending in `_NEXT` hold the incoming secret during a rotation.
- `auth.config.ts` throws at load when `PORTAL_JWT_ISSUER` is unset, so every deployment needs that variable.

## Portal functions

Client-portal functions in `portal/` authenticate a portal JWT, not Clerk. They use raw `query`, and `mutation` from `lib/triggers.ts`. Each one calls `getPortalSessionOrThrow(ctx)` from `portal/helpers.ts` first, then checks every row against `session.orgId` and the session contact's client.

## Schema and deletes

- An org-scoped table carries `orgId: v.id("organizations")` even when it also points at a parent, so `clientContacts` has both `clientId` and `orgId`. It needs an index that starts with `orgId`, either `by_org` or a compound such as `by_status` on `["orgId", "status"]`.
- An index that doesn't start with `orgId`, like `clients.by_portal_access_id`, spans every tenant. Mint values stored there on the server and keep them globally unique. The comment on `mintPortalAccessId` in `clients.ts` describes the takeover a caller-chosen value allowed.
- A new org-scoped table needs an entry in `ORG_SCOPED_CASCADE_TABLES` and a drain block in `cascadeDeleteOrgDataPage`, both in `lib/orgCascade.ts`. Drain children before parents, and delete stored files with `StorageHelpers.deleteFromStorage`. The guard in `orgCascade.test.ts` only compares that list with `schema.ts`, so it can't catch a missing drain block.
- Deleting one record removes its children and their stored files in the same mutation. `projects.remove` shows the order.

## Tests

Adapted from `clientDocuments.test.ts` and `permissionsGating.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import { createTestIdentity, createTestOrg } from "./test.helpers";

describe("clients org isolation", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	it("rejects an update to another org's client", async () => {
		const orgA = await t.run((ctx) =>
			createTestOrg(ctx, { clerkUserId: "user_a", clerkOrgId: "org_a" })
		);
		const orgB = await t.run((ctx) =>
			createTestOrg(ctx, { clerkUserId: "user_b", clerkOrgId: "org_b" })
		);
		const asA = t.withIdentity(createTestIdentity(orgA.clerkUserId, orgA.clerkOrgId));
		const asB = t.withIdentity(createTestIdentity(orgB.clerkUserId, orgB.clerkOrgId));

		const clientId = await asB.mutation(api.clients.create, {
			companyName: "Org B Co",
			status: "active",
		});

		await expect(
			asA.mutation(api.clients.update, { id: clientId, companyName: "Taken" })
		).rejects.toThrow("Client does not belong to your organization");
		expect(await asA.query(api.clients.list, {})).toEqual([]);
	});
});
```

- `setupConvexTest()` registers the app's components, including the aggregates, Resend, workpool and rate limiter. A bare `convexTest(schema)` lacks them.
- `createTestOrg` seeds a user, an org owned by that user and an admin membership. Its default Clerk ids come from `Date.now()`, so pass `clerkUserId` and `clerkOrgId` whenever a test seeds two orgs.
- `addMemberToOrg` seeds a member with the default grants. To grant more, patch the membership's `permissions` the way `grantMemberPermissions` does in `permissionsGating.test.ts`.
- When the function under test schedules work, use fake timers and drain them with `t.finishAllScheduledFunctions(vi.runAllTimers)`, as `clients.test.ts` does.

## Done when

- Every public query and mutation uses a builder from `lib/factories.ts`, or is a deliberate public endpoint with its own auth, either a portal session or a shared secret. Public actions authorize in the internal function they run.
- Every id argument passes through `ctx.orgEntity`, and each linked id matches its parent.
- Every Clerk-authenticated function has a level gate. Single-record reads and writes on scopable objects have a record-scope check, and lists apply read scope.
- New webhook routes verify the signature before anything else.
- Tests cover the cross-org case and the default-member case.
