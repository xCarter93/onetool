import { beforeEach, describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import { createTestIdentity, createTestOrg } from "./test.helpers";

const DAY = 24 * 60 * 60 * 1000;

describe("tasks.getSidebarCounts", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	it("matches getStats todayTasks/overdue with status, date, and org decoys", async () => {
		const [org, otherOrg] = await t.run(async (ctx) => [
			await createTestOrg(ctx),
			await createTestOrg(ctx, { clerkOrgId: "org_other", clerkUserId: "user_other" }),
		]);
		const asOwner = t.withIdentity(
			createTestIdentity(org.clerkUserId, org.clerkOrgId)
		);
		const asOther = t.withIdentity(
			createTestIdentity(otherOrg.clerkUserId, otherOrg.clerkOrgId)
		);
		const today = Math.floor(Date.now() / DAY) * DAY;
		const create = (
			who: typeof asOwner,
			date: number,
			status: "pending" | "in-progress" | "completed" | "cancelled"
		) => who.mutation(api.tasks.create, { title: `${status} ${date}`, date, status, type: "internal" });

		await create(asOwner, today - DAY, "pending");
		await create(asOwner, today - 3 * DAY, "in-progress");
		await create(asOwner, today - DAY, "completed");
		await create(asOwner, today - DAY, "cancelled");
		await create(asOwner, today + 60_000, "pending");
		await create(asOwner, today + 60_000, "in-progress");
		await create(asOwner, today + 60_000, "completed");
		await create(asOwner, today + DAY, "pending");
		await create(asOther, today - DAY, "pending");
		await create(asOther, today, "pending");

		const counts = await asOwner.query(api.tasks.getSidebarCounts, { today });
		const stats = await asOwner.query(api.tasks.getStats, { today });
		expect(counts).toEqual({ todayTasks: 2, overdue: 2 });
		expect(counts).toEqual({ todayTasks: stats.todayTasks, overdue: stats.overdue });
	});
});
