import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { setupConvexTest } from "./test.setup";
import {
	addMemberToOrg,
	createPremiumTestIdentity,
	createTestIdentity,
	createTestOrg,
} from "./test.helpers";

const HOUR = 60 * 60 * 1000;

function tokenArgs(overrides: Partial<Record<string, unknown>> = {}) {
	const now = Date.now();
	return {
		realmId: "realm_a",
		environment: "sandbox" as const,
		accessToken: "access_1",
		accessTokenExpiresAt: now + HOUR,
		refreshToken: "refresh_1",
		refreshTokenExpiresAt: now + 100 * 24 * HOUR,
		companyName: "Sandbox Co",
		...overrides,
	};
}

describe("QuickBooks connection", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	// disconnect schedules revokeConnection via runAfter(0); fake timers +
	// finishAllScheduledFunctions is the convex-test pattern for draining it.
	// The revoke action fetches Intuit and then writes (token scrub), so give
	// it a resolved fetch or the drain ends before the chain does.
	function useScheduledDrain() {
		vi.useFakeTimers();
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: true,
				status: 200,
				headers: { get: () => null },
				json: async () => ({}),
				text: async () => "",
			}))
		);
	}

	async function setupOwnerOrg(suffix: string) {
		const org = await t.run(async (ctx) =>
			createTestOrg(ctx, {
				clerkUserId: `user_${suffix}`,
				clerkOrgId: `org_${suffix}`,
			})
		);
		const asOwner = t.withIdentity(
			createPremiumTestIdentity(org.clerkUserId, org.clerkOrgId)
		);
		return { org, asOwner };
	}

	describe("storeConnection", () => {
		it("inserts with sync-setting defaults", async () => {
			const { org, asOwner } = await setupOwnerOrg("a");

			await asOwner.mutation(internal.quickbooks.storeConnection, tokenArgs());

			const connection = await t.run(async (ctx) =>
				ctx.db
					.query("quickbooksConnections")
					.withIndex("by_org", (q) => q.eq("orgId", org.orgId))
					.first()
			);
			expect(connection).toMatchObject({
				realmId: "realm_a",
				environment: "sandbox",
				status: "connected",
				companyName: "Sandbox Co",
				connectedByUserId: org.userId,
				syncInvoicesOn: "sent",
				syncPayments: true,
				autoDisambiguateNames: true,
			});
			expect(connection?.lastHealthCheckAt).toBeGreaterThan(0);
		});

		it("upserts in place when reconnecting the same realm", async () => {
			const { org, asOwner } = await setupOwnerOrg("b");

			await asOwner.mutation(internal.quickbooks.storeConnection, tokenArgs());
			const first = await t.run(async (ctx) =>
				ctx.db
					.query("quickbooksConnections")
					.withIndex("by_org", (q) => q.eq("orgId", org.orgId))
					.first()
			);

			await asOwner.mutation(
				internal.quickbooks.storeConnection,
				tokenArgs({
					accessToken: "access_2",
					refreshToken: "refresh_2",
					companyName: "Renamed Co",
				})
			);

			const rows = await t.run(async (ctx) =>
				ctx.db
					.query("quickbooksConnections")
					.withIndex("by_org", (q) => q.eq("orgId", org.orgId))
					.collect()
			);
			expect(rows).toHaveLength(1);
			expect(rows[0]._id).toBe(first?._id);
			expect(rows[0].accessToken).toBe("access_2");
			expect(rows[0].companyName).toBe("Renamed Co");
		});

		it("rejects a realm already claimed by another org", async () => {
			const { asOwner: ownerOne } = await setupOwnerOrg("c1");
			const { asOwner: ownerTwo } = await setupOwnerOrg("c2");

			await ownerOne.mutation(internal.quickbooks.storeConnection, tokenArgs());

			await expect(
				ownerTwo.mutation(internal.quickbooks.storeConnection, tokenArgs())
			).rejects.toThrow(/realm_in_use/);
		});

		it("rejects reconnecting the same org to a different realm", async () => {
			const { asOwner } = await setupOwnerOrg("d");

			await asOwner.mutation(internal.quickbooks.storeConnection, tokenArgs());

			await expect(
				asOwner.mutation(
					internal.quickbooks.storeConnection,
					tokenArgs({ realmId: "realm_other" })
				)
			).rejects.toThrow(/realm_mismatch/);
		});

		it("rejects a non-owner", async () => {
			const { org } = await setupOwnerOrg("e");
			const member = await t.run(async (ctx) =>
				addMemberToOrg(ctx, org.orgId, { clerkUserId: "member_e" })
			);
			const asMember = t.withIdentity(
				createPremiumTestIdentity(member.clerkUserId, org.clerkOrgId)
			);

			await expect(
				asMember.mutation(internal.quickbooks.storeConnection, tokenArgs())
			).rejects.toThrow(/not_owner/);
		});

		it("rejects a non-premium owner", async () => {
			const org = await t.run(async (ctx) =>
				createTestOrg(ctx, { clerkUserId: "user_f", clerkOrgId: "org_f" })
			);
			const asFreeOwner = t.withIdentity(
				createTestIdentity(org.clerkUserId, org.clerkOrgId)
			);

			await expect(
				asFreeOwner.mutation(internal.quickbooks.storeConnection, tokenArgs())
			).rejects.toThrow(/not_premium/);
		});
	});

	describe("getConnectionStatus", () => {
		it("returns null when there is no connection", async () => {
			const { asOwner } = await setupOwnerOrg("g");
			const status = await asOwner.query(api.quickbooks.getConnectionStatus, {});
			expect(status).toBeNull();
		});

		it("strips tokens from the returned doc", async () => {
			const { asOwner } = await setupOwnerOrg("h");
			await asOwner.mutation(internal.quickbooks.storeConnection, tokenArgs());

			const status = await asOwner.query(api.quickbooks.getConnectionStatus, {});
			expect(status).toMatchObject({ realmId: "realm_a", status: "connected" });
			expect(status).not.toHaveProperty("accessToken");
			expect(status).not.toHaveProperty("refreshToken");
		});

		it("returns null for a non-premium caller even when connected", async () => {
			const { org, asOwner } = await setupOwnerOrg("i");
			await asOwner.mutation(internal.quickbooks.storeConnection, tokenArgs());

			const asFree = t.withIdentity(
				createTestIdentity(org.clerkUserId, org.clerkOrgId)
			);
			const status = await asFree.query(api.quickbooks.getConnectionStatus, {});
			expect(status).toBeNull();
		});
	});

	describe("updateSyncSettings", () => {
		it("patches only the provided toggles", async () => {
			const { org, asOwner } = await setupOwnerOrg("j");
			await asOwner.mutation(internal.quickbooks.storeConnection, tokenArgs());

			await asOwner.mutation(api.quickbooks.updateSyncSettings, {
				syncInvoicesOn: "created",
				syncPayments: false,
			});

			const connection = await t.run(async (ctx) =>
				ctx.db
					.query("quickbooksConnections")
					.withIndex("by_org", (q) => q.eq("orgId", org.orgId))
					.first()
			);
			expect(connection).toMatchObject({
				syncInvoicesOn: "created",
				syncPayments: false,
				autoDisambiguateNames: true,
			});
		});

		it("denies a non-owner", async () => {
			const { org, asOwner } = await setupOwnerOrg("k");
			await asOwner.mutation(internal.quickbooks.storeConnection, tokenArgs());

			const member = await t.run(async (ctx) =>
				addMemberToOrg(ctx, org.orgId, { clerkUserId: "member_k" })
			);
			const asMember = t.withIdentity(
				createPremiumTestIdentity(member.clerkUserId, org.clerkOrgId)
			);

			await expect(
				asMember.mutation(api.quickbooks.updateSyncSettings, {
					syncPayments: false,
				})
			).rejects.toThrow(/owner/);
		});
	});

	describe("disconnect", () => {
		it("flips status, cancels pending jobs, and keeps entity links", async () => {
			useScheduledDrain();
			const { org, asOwner } = await setupOwnerOrg("l");
			await asOwner.mutation(internal.quickbooks.storeConnection, tokenArgs());

			const { pendingJobId, doneJobId, linkId } = await t.run(async (ctx) => {
				const pendingJobId = await ctx.db.insert("quickbooksSyncJobs", {
					orgId: org.orgId,
					entityType: "invoice",
					localId: "invoice_1",
					operation: "upsert",
					status: "pending",
					attempts: 0,
					runAfter: Date.now(),
					dedupeKey: "invoice:invoice_1",
				});
				const doneJobId = await ctx.db.insert("quickbooksSyncJobs", {
					orgId: org.orgId,
					entityType: "client",
					localId: "client_1",
					operation: "upsert",
					status: "succeeded",
					attempts: 1,
					runAfter: Date.now(),
					dedupeKey: "client:client_1",
				});
				const linkId = await ctx.db.insert("quickbooksEntityLinks", {
					orgId: org.orgId,
					entityType: "client",
					localId: "client_1",
					qboId: "42",
					qboSyncToken: "0",
					lastSyncedAt: Date.now(),
				});
				return { pendingJobId, doneJobId, linkId };
			});

			await asOwner.mutation(api.quickbooks.disconnect, {});
			await t.finishAllScheduledFunctions(vi.runAllTimers);

			const after = await t.run(async (ctx) => {
				const connection = await ctx.db
					.query("quickbooksConnections")
					.withIndex("by_org", (q) => q.eq("orgId", org.orgId))
					.first();
				const pending = await ctx.db.get(pendingJobId);
				const done = await ctx.db.get(doneJobId);
				const link = await ctx.db.get(linkId);
				return { connection, pending, done, link };
			});

			expect(after.connection?.status).toBe("disconnected");
			// Post-revoke scrub: no live secrets left at rest.
			expect(after.connection?.refreshToken).toBe("");
			expect(after.connection?.accessToken).toBe("");
			expect(after.pending?.status).toBe("ignored");
			expect(after.done?.status).toBe("succeeded");
			expect(after.link).not.toBeNull();
		});

		it("denies a non-owner", async () => {
			const { org, asOwner } = await setupOwnerOrg("m");
			await asOwner.mutation(internal.quickbooks.storeConnection, tokenArgs());

			const member = await t.run(async (ctx) =>
				addMemberToOrg(ctx, org.orgId, { clerkUserId: "member_m" })
			);
			const asMember = t.withIdentity(
				createPremiumTestIdentity(member.clerkUserId, org.clerkOrgId)
			);

			await expect(
				asMember.mutation(api.quickbooks.disconnect, {})
			).rejects.toThrow(/owner/);
		});
	});

	describe("token lifecycle", () => {
		it("updateTokens persists both rotated tokens", async () => {
			const { org, asOwner } = await setupOwnerOrg("n");
			await asOwner.mutation(internal.quickbooks.storeConnection, tokenArgs());

			const now = Date.now();
			await t.mutation(internal.quickbooks.updateTokens, {
				orgId: org.orgId as Id<"organizations">,
				accessToken: "access_rotated",
				accessTokenExpiresAt: now + 2 * HOUR,
				refreshToken: "refresh_rotated",
				refreshTokenExpiresAt: now + 90 * 24 * HOUR,
			});

			const connection = await t.run(async (ctx) =>
				ctx.db
					.query("quickbooksConnections")
					.withIndex("by_org", (q) => q.eq("orgId", org.orgId))
					.first()
			);
			expect(connection).toMatchObject({
				accessToken: "access_rotated",
				refreshToken: "refresh_rotated",
				status: "connected",
			});
			expect(connection?.accessTokenExpiresAt).toBe(now + 2 * HOUR);
		});

		it("markNeedsReauth flips a live connection", async () => {
			const { org, asOwner } = await setupOwnerOrg("o");
			await asOwner.mutation(internal.quickbooks.storeConnection, tokenArgs());

			await t.mutation(internal.quickbooks.markNeedsReauth, {
				orgId: org.orgId as Id<"organizations">,
			});

			const connection = await t.run(async (ctx) =>
				ctx.db
					.query("quickbooksConnections")
					.withIndex("by_org", (q) => q.eq("orgId", org.orgId))
					.first()
			);
			expect(connection?.status).toBe("needs_reauth");
		});

		it("updateTokens does not revive a disconnected connection", async () => {
			useScheduledDrain();
			const { org, asOwner } = await setupOwnerOrg("r");
			await asOwner.mutation(internal.quickbooks.storeConnection, tokenArgs());
			await asOwner.mutation(api.quickbooks.disconnect, {});
			await t.finishAllScheduledFunctions(vi.runAllTimers);

			const now = Date.now();
			await t.mutation(internal.quickbooks.updateTokens, {
				orgId: org.orgId as Id<"organizations">,
				accessToken: "access_late",
				accessTokenExpiresAt: now + HOUR,
				refreshToken: "refresh_late",
				refreshTokenExpiresAt: now + 90 * 24 * HOUR,
			});

			const connection = await t.run(async (ctx) =>
				ctx.db
					.query("quickbooksConnections")
					.withIndex("by_org", (q) => q.eq("orgId", org.orgId))
					.first()
			);
			expect(connection?.status).toBe("disconnected");
			// Disconnect scrubbed the tokens, and the late refresh must not restore them.
			expect(connection?.accessToken).toBe("");
		});

		it("markNeedsReauth leaves a disconnected connection alone", async () => {
			useScheduledDrain();
			const { org, asOwner } = await setupOwnerOrg("p");
			await asOwner.mutation(internal.quickbooks.storeConnection, tokenArgs());
			await asOwner.mutation(api.quickbooks.disconnect, {});
			await t.finishAllScheduledFunctions(vi.runAllTimers);

			await t.mutation(internal.quickbooks.markNeedsReauth, {
				orgId: org.orgId as Id<"organizations">,
			});

			const connection = await t.run(async (ctx) =>
				ctx.db
					.query("quickbooksConnections")
					.withIndex("by_org", (q) => q.eq("orgId", org.orgId))
					.first()
			);
			expect(connection?.status).toBe("disconnected");
		});

		it("listConnectionsForHealthCheck returns only connected rows", async () => {
			useScheduledDrain();
			const { asOwner: ownerOne } = await setupOwnerOrg("q1");
			const { asOwner: ownerTwo } = await setupOwnerOrg("q2");

			await ownerOne.mutation(internal.quickbooks.storeConnection, tokenArgs());
			await ownerTwo.mutation(
				internal.quickbooks.storeConnection,
				tokenArgs({ realmId: "realm_q2" })
			);
			await ownerTwo.mutation(api.quickbooks.disconnect, {});
			await t.finishAllScheduledFunctions(vi.runAllTimers);

			const live = await t.query(
				internal.quickbooks.listConnectionsForHealthCheck,
				{}
			);
			expect(live).toHaveLength(1);
			expect(live[0].realmId).toBe("realm_a");
		});

		it("markNeedsReauth honors the access-token guard", async () => {
			const { org, asOwner } = await setupOwnerOrg("g1");
			await asOwner.mutation(internal.quickbooks.storeConnection, tokenArgs());

			// Stale guard: the failing request used a token that has since rotated.
			const stale = await t.mutation(internal.quickbooks.markNeedsReauth, {
				orgId: org.orgId as Id<"organizations">,
				ifAccessTokenMatches: "access_rotated_away",
			});
			expect(stale).toBe(false);
			let connection = await t.run(async (ctx) =>
				ctx.db
					.query("quickbooksConnections")
					.withIndex("by_org", (q) => q.eq("orgId", org.orgId))
					.first()
			);
			expect(connection?.status).toBe("connected");

			// Matching guard: the stored token really is the one that failed.
			const marked = await t.mutation(internal.quickbooks.markNeedsReauth, {
				orgId: org.orgId as Id<"organizations">,
				ifAccessTokenMatches: "access_1",
			});
			expect(marked).toBe(true);
			connection = await t.run(async (ctx) =>
				ctx.db
					.query("quickbooksConnections")
					.withIndex("by_org", (q) => q.eq("orgId", org.orgId))
					.first()
			);
			expect(connection?.status).toBe("needs_reauth");
		});

		it("refresh sweep lazily encrypts legacy plaintext tokens", async () => {
			vi.stubEnv("QUICKBOOKS_TOKEN_ENC_KEY", btoa("0123456789abcdef0123456789abcdef"));
			vi.stubEnv("QUICKBOOKS_CLIENT_ID", "cid");
			vi.stubEnv("QUICKBOOKS_CLIENT_SECRET", "secret");
			const { org, asOwner } = await setupOwnerOrg("g2");
			// Plaintext tokens, stale health check: the sweep must refresh it.
			await asOwner.mutation(internal.quickbooks.storeConnection, tokenArgs());
			await t.run(async (ctx) => {
				const connection = await ctx.db
					.query("quickbooksConnections")
					.withIndex("by_org", (q) => q.eq("orgId", org.orgId))
					.first();
				await ctx.db.patch(connection!._id, { lastHealthCheckAt: 1 });
			});

			const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => ({
				ok: true,
				status: 200,
				headers: { get: () => null },
				json: async () => ({
					access_token: "access_2",
					refresh_token: "refresh_2",
					expires_in: 3600,
					x_refresh_token_expires_in: 100 * 24 * 3600,
				}),
				text: async () => "",
			}));
			vi.stubGlobal("fetch", fetchMock);

			await t.action(internal.quickbooksActions.refreshStaleConnections, {});

			// Intuit received the original plaintext refresh token...
			const body = String(fetchMock.mock.calls[0][1]?.body ?? "");
			expect(body).toContain("refresh_token=refresh_1");

			// ...and the rotated tokens landed encrypted at rest.
			const connection = await t.run(async (ctx) =>
				ctx.db
					.query("quickbooksConnections")
					.withIndex("by_org", (q) => q.eq("orgId", org.orgId))
					.first()
			);
			expect(connection?.accessToken).toMatch(/^qbenc1:/);
			expect(connection?.refreshToken).toMatch(/^qbenc1:/);
			expect(connection?.accessToken).not.toContain("access_2");
			expect(connection?.refreshToken).not.toContain("refresh_2");

			// A second sweep decrypts the stored refresh token before calling out.
			await t.run(async (ctx) => {
				const doc = await ctx.db
					.query("quickbooksConnections")
					.withIndex("by_org", (q) => q.eq("orgId", org.orgId))
					.first();
				await ctx.db.patch(doc!._id, { lastHealthCheckAt: 1 });
			});
			await t.action(internal.quickbooksActions.refreshStaleConnections, {});
			const secondBody = String(fetchMock.mock.calls[1][1]?.body ?? "");
			expect(secondBody).toContain("refresh_token=refresh_2");
		});
	});

	describe("sync job state machine hardening", () => {
		async function insertJob(
			orgId: Id<"organizations">,
			overrides: Partial<Record<string, unknown>> = {}
		) {
			return await t.run(async (ctx) =>
				ctx.db.insert("quickbooksSyncJobs", {
					orgId,
					entityType: "client",
					localId: "client_1",
					operation: "upsert",
					status: "pending",
					attempts: 0,
					runAfter: 0,
					dedupeKey: "client:client_1",
					...overrides,
				})
			);
		}

		it("markJobSucceeded only lands on a processing job", async () => {
			const { org } = await setupOwnerOrg("s1");
			const jobId = await insertJob(org.orgId as Id<"organizations">);

			// Still pending (released mid-flight): must not be revived as succeeded.
			await t.mutation(internal.quickbooks.markJobSucceeded, { jobId });
			let job = await t.run(async (ctx) => ctx.db.get(jobId));
			expect(job?.status).toBe("pending");

			await t.run(async (ctx) =>
				ctx.db.patch(jobId, { status: "processing", claimedAt: Date.now() })
			);
			await t.mutation(internal.quickbooks.markJobSucceeded, { jobId });
			job = await t.run(async (ctx) => ctx.db.get(jobId));
			expect(job?.status).toBe("succeeded");
		});

		it("claimDueJobs leaves a job pending while its entity is in flight", async () => {
			const { org } = await setupOwnerOrg("s2");
			const orgId = org.orgId as Id<"organizations">;

			const firstId = await insertJob(orgId);
			const firstClaim = await t.mutation(internal.quickbooks.claimDueJobs, {
				orgId,
				limit: 10,
			});
			expect(firstClaim.map((job) => job._id)).toEqual([firstId]);

			// Same entity re-enqueued while the first job is processing: a second
			// worker must not claim it, or both could create the same QBO record.
			const secondId = await insertJob(orgId);
			const secondClaim = await t.mutation(internal.quickbooks.claimDueJobs, {
				orgId,
				limit: 10,
			});
			expect(secondClaim).toHaveLength(0);

			// Once the first finishes, the queued job becomes claimable.
			await t.mutation(internal.quickbooks.markJobSucceeded, {
				jobId: firstId,
			});
			const thirdClaim = await t.mutation(internal.quickbooks.claimDueJobs, {
				orgId,
				limit: 10,
			});
			expect(thirdClaim.map((job) => job._id)).toEqual([secondId]);
		});

		it("claimDueJobs claims one job per entity within a batch", async () => {
			const { org } = await setupOwnerOrg("s3");
			const orgId = org.orgId as Id<"organizations">;

			await insertJob(orgId);
			await insertJob(orgId, {
				localId: "client_2",
				dedupeKey: "client:client_2",
			});
			// Duplicate key inside the same due batch (possible after a release).
			await insertJob(orgId);

			const claimed = await t.mutation(internal.quickbooks.claimDueJobs, {
				orgId,
				limit: 10,
			});
			expect(claimed).toHaveLength(2);
			expect(new Set(claimed.map((job) => job.dedupeKey)).size).toBe(2);
		});
	});
});
