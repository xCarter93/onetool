import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { setupConvexTest } from "./test.setup";
import {
	createPremiumTestIdentity,
	createTestClient,
	createTestClientProperty,
	createTestOrgWithAddress,
} from "./test.helpers";

// A Sunday afternoon so today's visit, its tasks and the week window all agree.
const NOW = Date.UTC(2026, 8, 6, 16);
const DAY = 86_400_000;
const START_OF_TODAY = new Date(NOW).setHours(0, 0, 0, 0);

const projectIds = (rows: Array<{ projectId?: Id<"projects"> }>) =>
	rows.flatMap((row) => (row.projectId ? [row.projectId] : []));

describe("suppressed recurring visits stay off every schedule surface", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
		t = setupConvexTest();
	});
	afterEach(() => vi.useRealTimers());

	async function setup() {
		const org = await t.run(async (ctx) => {
			const created = await createTestOrgWithAddress(ctx, {
				clerkUserId: "suppression_user",
				clerkOrgId: "suppression_org",
				latitude: 40.7,
				longitude: -74.0,
			});
			await ctx.db.patch(created.orgId, { timezone: "UTC" });
			const clientId = await createTestClient(ctx, created.orgId);
			await createTestClientProperty(ctx, created.orgId, clientId, {
				isPrimary: true,
				latitude: 40.71,
				longitude: -74.01,
			});
			return { ...created, clientId };
		});
		const asUser = t.withIdentity(
			createPremiumTestIdentity(org.clerkUserId, org.clerkOrgId)
		);
		const projectId = await asUser.mutation(api.projects.create, {
			clientId: org.clientId,
			title: "Daily service",
			status: "planned",
			projectType: "recurring",
			assignedUserIds: [org.userId],
			startDate: Date.UTC(2026, 8, 6),
			endDate: Date.UTC(2026, 8, 6),
		});
		const seriesId = await asUser.mutation(api.projectSeries.enroll, {
			projectId,
			rule: {
				frequency: "daily",
				interval: 1,
				end: { kind: "count", count: 5 },
			},
		});
		const visits = await t.run(async (ctx) =>
			ctx.db
				.query("projects")
				.withIndex("by_series_start", (q) =>
					q.eq("recurringSeriesId", seriesId)
				)
				.collect()
		);
		expect(visits.length).toBeGreaterThanOrEqual(4);
		return { ...org, asUser, seriesId, visits };
	}

	async function taskOn(
		asUser: ReturnType<typeof t.withIdentity>,
		visit: Doc<"projects">,
		status: "pending" | "in-progress"
	) {
		return await asUser.mutation(api.tasks.create, {
			title: `Work on ${visit.title}`,
			date: NOW,
			status,
			projectId: visit._id,
			clientId: visit.clientId,
			type: "external",
		});
	}

	it("hides skipped and paused visits from calendar, routes, task lists and home stats", async () => {
		const { asUser, seriesId, visits } = await setup();
		const [active, , toSkip, toPause] = visits;

		// Tasks are created before suppression: the in-progress one keeps today's visit out of the pause.
		await taskOn(asUser, active, "in-progress");
		await taskOn(asUser, toSkip, "pending");
		await taskOn(asUser, toPause, "pending");

		await asUser.mutation(api.projectSeries.skip, { projectId: toSkip._id });
		const preview = await asUser.query(api.projectSeries.previewLifecycle, {
			seriesId,
			action: "pause",
		});
		await asUser.mutation(api.projectSeries.lifecycle, {
			seriesId,
			action: "pause",
			expectedVersion: preview.revision,
		});

		const states = await t.run(async (ctx) =>
			Promise.all([active, toSkip, toPause].map((v) => ctx.db.get(v._id)))
		);
		expect(states.map((p) => p?.recurringState)).toEqual([
			undefined,
			"skipped",
			"paused",
		]);

		const calendar = await asUser.query(api.calendar.getCalendarEvents, {
			startDate: NOW - DAY,
			endDate: NOW + 10 * DAY,
		});
		const calendarProjects = calendar.projects.map((event) => event.id);
		expect(calendarProjects).toContain(active._id);
		expect(calendarProjects).not.toContain(toSkip._id);
		expect(calendarProjects).not.toContain(toPause._id);
		const calendarTaskProjects = projectIds(calendar.tasks);
		expect(calendarTaskProjects).toEqual([active._id]);

		expect(projectIds(await asUser.query(api.tasks.getToday, {}))).toEqual([
			active._id,
		]);
		expect(
			projectIds(
				await asUser.query(api.tasks.getUpcoming, { today: START_OF_TODAY })
			)
		).toEqual([active._id]);
		expect(
			await asUser.query(api.tasks.getSidebarCounts, { today: START_OF_TODAY })
		).toEqual({ todayTasks: 1, overdue: 0 });

		const home = await asUser.query(api.homeStats.getHomeStats, {});
		expect(home.pendingTasks.dueThisWeek).toBe(1);

		// Seeding refuses an empty day, so a suppressed visit surfaces as a throw.
		for (const suppressed of [toSkip, toPause])
			await expect(
				asUser.mutation(api.routes.seedFromSchedule, {
					date: suppressed.startDate!,
				})
			).rejects.toThrow(/No scheduled work/);
		const activeDay = await asUser.mutation(api.routes.seedFromSchedule, {
			date: active.startDate!,
		});
		expect(activeDay.stopCount).toBe(1);
	});

	it("returns a billing state per visit for viewers with billing access", async () => {
		const { asUser, seriesId, visits } = await setup();
		const page = await asUser.query(api.projectSeries.listOccurrences, {
			seriesId,
		});
		expect(page.billing).toBeDefined();
		for (const visit of visits) {
			expect(page.billing?.[visit._id]?.state).toBe("no_agreement");
		}
	});
});
