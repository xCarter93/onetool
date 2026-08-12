import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api, internal } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import { createTestOrg, addMemberToOrg } from "./test.helpers";

// Slice 8: per-category push preferences + the sendNotificationPush gate.
//
// Gate assertions are made at the ACTION level via the fetch spy (the same
// pattern push.test.ts uses): a muted category must produce zero exp.host POSTs
// even though the notification/bell row is still written.

const EXPO_URL = "https://exp.host/--/api/v2/push/send";

describe("notificationPreferences", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	describe("get — defaults", () => {
		it("returns all categories ON when no row exists", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(
				async (ctx) => await createTestOrg(ctx)
			);

			const prefs = await t
				.withIdentity({ subject: clerkUserId, activeOrgId: clerkOrgId })
				.query(api.notificationPreferences.get, {});

			expect(prefs).toEqual({
				mentions: true,
				automations: true,
				paymentsApprovals: true,
			});
		});

		it("treats an ABSENT FIELD on an existing row as ON", async () => {
			const { userId, orgId, clerkUserId, clerkOrgId } = await t.run(
				async (ctx) => await createTestOrg(ctx)
			);
			// Row exists but only carries `mentions` — a later-added category must
			// not be silently muted for users who already have a row.
			await t.run(async (ctx) => {
				await ctx.db.insert("notificationPreferences", {
					userId,
					orgId,
					mentions: false,
				});
			});

			const prefs = await t
				.withIdentity({ subject: clerkUserId, activeOrgId: clerkOrgId })
				.query(api.notificationPreferences.get, {});

			expect(prefs).toEqual({
				mentions: false,
				automations: true,
				paymentsApprovals: true,
			});
		});
	});

	describe("set — upsert semantics", () => {
		it("inserts on first call and patches only the provided fields after", async () => {
			const { userId, orgId, clerkUserId, clerkOrgId } = await t.run(
				async (ctx) => await createTestOrg(ctx)
			);
			const asUser = t.withIdentity({
				subject: clerkUserId,
				activeOrgId: clerkOrgId,
			});

			const first = await asUser.mutation(api.notificationPreferences.set, {
				mentions: false,
			});
			expect(first).toEqual({
				mentions: false,
				automations: true,
				paymentsApprovals: true,
			});

			// Second call touches a DIFFERENT category — mentions must survive.
			const second = await asUser.mutation(api.notificationPreferences.set, {
				paymentsApprovals: false,
			});
			expect(second).toEqual({
				mentions: false,
				automations: true,
				paymentsApprovals: false,
			});

			// Upsert, not insert-per-call: exactly one row for (user, org).
			const rows = await t.run(async (ctx) =>
				ctx.db
					.query("notificationPreferences")
					.withIndex("by_user_org", (q) =>
						q.eq("userId", userId).eq("orgId", orgId)
					)
					.collect()
			);
			expect(rows).toHaveLength(1);

			// Re-enabling works in both directions.
			const third = await asUser.mutation(api.notificationPreferences.set, {
				mentions: true,
			});
			expect(third.mentions).toBe(true);
			expect(third.paymentsApprovals).toBe(false);
		});
	});

	describe("per-org isolation", () => {
		it("a mute in org A leaves org B untouched for the same user", async () => {
			const { userId, orgAClerk, orgBClerk } = await t.run(async (ctx) => {
				const a = await createTestOrg(ctx, {
					clerkUserId: "user_multi",
					clerkOrgId: "org_A",
					userEmail: "multi@example.com",
				});
				// Same user, second org.
				const orgBId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_B",
					name: "Org B",
					ownerUserId: a.userId,
				});
				await ctx.db.insert("organizationMemberships", {
					orgId: orgBId,
					userId: a.userId,
					role: "admin",
				});
				await ctx.db.insert("notificationPreferences", {
					userId: a.userId,
					orgId: a.orgId,
					mentions: false,
					paymentsApprovals: false,
				});
				return { userId: a.userId, orgAClerk: "org_A", orgBClerk: "org_B" };
			});

			// Sequential awaits — never Promise.all across convex-test reads.
			const inA = await t.query(
				internal.notificationPreferences.effectiveForUserOrg,
				{ userId, clerkOrgId: orgAClerk }
			);
			const inB = await t.query(
				internal.notificationPreferences.effectiveForUserOrg,
				{ userId, clerkOrgId: orgBClerk }
			);

			expect(inA.mentions).toBe(false);
			expect(inA.paymentsApprovals).toBe(false);
			expect(inB).toEqual({
				mentions: true,
				automations: true,
				paymentsApprovals: true,
			});
		});

		it("fails OPEN for an unresolvable clerk org id", async () => {
			const { userId } = await t.run(
				async (ctx) => await createTestOrg(ctx)
			);
			const prefs = await t.query(
				internal.notificationPreferences.effectiveForUserOrg,
				{ userId, clerkOrgId: "org_does_not_exist" }
			);
			expect(prefs).toEqual({
				mentions: true,
				automations: true,
				paymentsApprovals: true,
			});
		});
	});

	describe("push gate", () => {
		let fetchSpy: ReturnType<typeof vi.fn>;

		beforeEach(() => {
			vi.useFakeTimers();
			fetchSpy = vi.fn(
				async () =>
					({
						ok: true,
						json: async () => ({ data: [{ status: "ok", id: "r1" }] }),
					}) as unknown as Response
			);
			vi.stubGlobal("fetch", fetchSpy);
		});

		afterEach(async () => {
			// Drain before restoring globals so no scheduled write lands after the
			// test ends ("Write outside of transaction" suite killer).
			await t.finishAllScheduledFunctions(vi.runAllTimers);
			vi.unstubAllGlobals();
			vi.useRealTimers();
		});

		const sendCalls = () =>
			fetchSpy.mock.calls.filter((c) => c[0] === EXPO_URL);

		it("suppresses a mention push when mentions is muted, and delivers it when not", async () => {
			const { authorClerk, clerkOrgId, taggedId, orgId, clientId } =
				await t.run(async (ctx) => {
					const author = await createTestOrg(ctx);
					const tagged = await addMemberToOrg(ctx, author.orgId);
					await ctx.db.insert("pushTokens", {
						userId: tagged.userId,
						token: "ExponentPushToken[MUTE]",
						platform: "ios",
						lastSeenAt: Date.now(),
					});
					const clientId = await ctx.db.insert("clients", {
						orgId: author.orgId,
						portalAccessId: crypto.randomUUID(),
						companyName: "Acme Co",
						status: "active",
					});
					return {
						authorClerk: author.clerkUserId,
						clerkOrgId: author.clerkOrgId,
						taggedId: tagged.userId,
						orgId: author.orgId,
						clientId,
					};
				});

			const asAuthor = t.withIdentity({
				subject: authorClerk,
				activeOrgId: clerkOrgId,
			});

			// MUTED — the recipient's own preference, in this org.
			await t.run(async (ctx) => {
				await ctx.db.insert("notificationPreferences", {
					userId: taggedId,
					orgId,
					mentions: false,
				});
			});

			await asAuthor.mutation(api.notifications.createMention, {
				mentionedUserIds: [taggedId],
				message: "muted one",
				entityType: "client",
				entityId: clientId,
				entityName: "Acme Co",
			});
			await t.finishAllScheduledFunctions(vi.runAllTimers);

			expect(sendCalls()).toHaveLength(0);

			// The bell notification is still written — only the PUSH is gated.
			const bells = await t.run(async (ctx) =>
				ctx.db
					.query("notifications")
					.withIndex("by_user_read", (q) => q.eq("userId", taggedId))
					.collect()
			);
			expect(bells.length).toBeGreaterThan(0);

			// UNMUTE — same flow now delivers, proving the gate is what blocked it.
			await t.run(async (ctx) => {
				const row = await ctx.db
					.query("notificationPreferences")
					.withIndex("by_user_org", (q) =>
						q.eq("userId", taggedId).eq("orgId", orgId)
					)
					.unique();
				if (row) await ctx.db.patch(row._id, { mentions: true });
			});

			await asAuthor.mutation(api.notifications.createMention, {
				mentionedUserIds: [taggedId],
				message: "audible one",
				entityType: "client",
				entityId: clientId,
				entityName: "Acme Co",
			});
			await t.finishAllScheduledFunctions(vi.runAllTimers);

			expect(sendCalls().length).toBeGreaterThan(0);
		});
	});

	describe("celebrations push", () => {
		let fetchSpy: ReturnType<typeof vi.fn>;

		beforeEach(() => {
			vi.useFakeTimers();
			fetchSpy = vi.fn(
				async () =>
					({
						ok: true,
						json: async () => ({ data: [{ status: "ok", id: "r1" }] }),
					}) as unknown as Response
			);
			vi.stubGlobal("fetch", fetchSpy);
		});

		afterEach(async () => {
			await t.finishAllScheduledFunctions(vi.runAllTimers);
			vi.unstubAllGlobals();
			vi.useRealTimers();
		});

		/** Every `to` token across all exp.host POSTs made so far. */
		const pushedTokens = (): string[] =>
			fetchSpy.mock.calls
				.filter((c) => c[0] === EXPO_URL)
				.flatMap((c) => {
					const body = JSON.parse(c[1].body);
					return (Array.isArray(body) ? body : [body]).map(
						(m: { to: string }) => m.to
					);
				});

		// Owner (the actor) + a second admin, both with tokens and both in the
		// "admins" default audience, so the only difference is actor exclusion.
		async function seedPaidInvoiceOrg() {
			return await t.run(async (ctx) => {
				const owner = await createTestOrg(ctx, {
					clerkUserId: "user_actor",
					clerkOrgId: "org_celebrate",
					userEmail: "actor@example.com",
				});
				const peer = await addMemberToOrg(ctx, owner.orgId, {
					role: "admin",
					clerkUserId: "user_peer",
					userEmail: "peer@example.com",
				});
				await ctx.db.insert("pushTokens", {
					userId: owner.userId,
					token: "ExponentPushToken[ACTOR]",
					platform: "ios",
					lastSeenAt: Date.now(),
				});
				await ctx.db.insert("pushTokens", {
					userId: peer.userId,
					token: "ExponentPushToken[PEER]",
					platform: "ios",
					lastSeenAt: Date.now(),
				});
				const clientId = await ctx.db.insert("clients", {
					orgId: owner.orgId,
					portalAccessId: crypto.randomUUID(),
					companyName: "Acme Co",
					status: "active",
				});
				const invoiceId = await ctx.db.insert("invoices", {
					orgId: owner.orgId,
					clientId,
					invoiceNumber: "INV-1",
					status: "paid",
					subtotal: 100,
					total: 100,
					issuedDate: Date.now(),
					dueDate: Date.now(),
				});
				return {
					orgId: owner.orgId,
					actorId: owner.userId,
					peerId: peer.userId,
					invoiceId,
				};
			});
		}

		it("gives the actor a bell row but never a push, while peers are pushed", async () => {
			const { actorId, peerId, invoiceId } = await seedPaidInvoiceOrg();

			await t.run(async (ctx) => {
				const invoice = await ctx.db.get(invoiceId);
				const { celebrateInvoicePaid } = await import("./lib/celebrations");
				await celebrateInvoicePaid(ctx, invoice!, actorId);
			});
			await t.finishAllScheduledFunctions(vi.runAllTimers);

			const tokens = pushedTokens();
			// Actor recorded the payment — their own phone must stay quiet.
			expect(tokens).not.toContain("ExponentPushToken[ACTOR]");
			expect(tokens).toContain("ExponentPushToken[PEER]");

			// …but the actor DOES get the bell row.
			const actorBells = await t.run(async (ctx) =>
				ctx.db
					.query("notifications")
					.withIndex("by_user_read", (q) => q.eq("userId", actorId))
					.collect()
			);
			expect(actorBells).toHaveLength(1);
			expect(actorBells[0].notificationType).toBe("payment_received");

			const peerBells = await t.run(async (ctx) =>
				ctx.db
					.query("notifications")
					.withIndex("by_user_read", (q) => q.eq("userId", peerId))
					.collect()
			);
			expect(peerBells).toHaveLength(1);
		});

		it("respects the recipient's paymentsApprovals mute", async () => {
			const { orgId, actorId, peerId, invoiceId } = await seedPaidInvoiceOrg();

			await t.run(async (ctx) => {
				await ctx.db.insert("notificationPreferences", {
					userId: peerId,
					orgId,
					paymentsApprovals: false,
				});
			});

			await t.run(async (ctx) => {
				const invoice = await ctx.db.get(invoiceId);
				const { celebrateInvoicePaid } = await import("./lib/celebrations");
				await celebrateInvoicePaid(ctx, invoice!, actorId);
			});
			await t.finishAllScheduledFunctions(vi.runAllTimers);

			// Actor excluded by identity, peer excluded by preference → silence.
			expect(pushedTokens()).toHaveLength(0);

			// Bell rows are unaffected by the push preference.
			const peerBells = await t.run(async (ctx) =>
				ctx.db
					.query("notifications")
					.withIndex("by_user_read", (q) => q.eq("userId", peerId))
					.collect()
			);
			expect(peerBells).toHaveLength(1);
		});

		it("pushes everyone when there is no actor (portal/webhook paths)", async () => {
			const { invoiceId } = await seedPaidInvoiceOrg();

			await t.run(async (ctx) => {
				const invoice = await ctx.db.get(invoiceId);
				const { celebrateInvoicePaid } = await import("./lib/celebrations");
				// No actorUserId — a client paid through the portal.
				await celebrateInvoicePaid(ctx, invoice!);
			});
			await t.finishAllScheduledFunctions(vi.runAllTimers);

			const tokens = pushedTokens();
			expect(tokens).toContain("ExponentPushToken[ACTOR]");
			expect(tokens).toContain("ExponentPushToken[PEER]");
		});
	});
});
