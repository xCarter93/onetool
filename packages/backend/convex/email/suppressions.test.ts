import { describe, it, expect, beforeEach } from "vitest";
import type { convexTest } from "convex-test";
import { setupConvexTest } from "../test.setup";
import { createTestOrg } from "../test.helpers";
import { isSuppressed, recordSuppression } from "./suppressions";

/**
 * Suppression lookups run once per recipient on every send, so they read the
 * `by_org_email` index directly. Org-scoped and global rows must both block.
 */
describe("email suppressions", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	async function twoOrgs() {
		return await t.run(async (ctx) => ({
			orgA: (
				await createTestOrg(ctx, {
					clerkUserId: "user_supp_a",
					clerkOrgId: "org_supp_a",
				})
			).orgId,
			orgB: (
				await createTestOrg(ctx, {
					clerkUserId: "user_supp_b",
					clerkOrgId: "org_supp_b",
				})
			).orgId,
		}));
	}

	it("suppresses an org-scoped address for that org only", async () => {
		const { orgA, orgB } = await twoOrgs();
		await t.run(async (ctx) => {
			await recordSuppression(ctx, {
				orgId: orgA,
				email: "Bounced@Example.com",
				reason: "hard_bounce",
				source: "resend_webhook",
			});
		});

		const results = await t.run(async (ctx) => ({
			sameOrg: await isSuppressed(ctx, orgA, "bounced@example.com"),
			mixedCase: await isSuppressed(ctx, orgA, "  BOUNCED@example.COM "),
			otherOrg: await isSuppressed(ctx, orgB, "bounced@example.com"),
			otherAddress: await isSuppressed(ctx, orgA, "fine@example.com"),
		}));

		expect(results).toEqual({
			sameOrg: true,
			mixedCase: true,
			otherOrg: false,
			otherAddress: false,
		});
	});

	it("suppresses a global address (no orgId) for every org", async () => {
		const { orgA, orgB } = await twoOrgs();
		await t.run(async (ctx) => {
			await recordSuppression(ctx, {
				email: "global@example.com",
				reason: "complaint",
				source: "admin",
			});
		});

		const results = await t.run(async (ctx) => ({
			orgA: await isSuppressed(ctx, orgA, "global@example.com"),
			orgB: await isSuppressed(ctx, orgB, "GLOBAL@example.com"),
		}));

		expect(results).toEqual({ orgA: true, orgB: true });
	});
});
