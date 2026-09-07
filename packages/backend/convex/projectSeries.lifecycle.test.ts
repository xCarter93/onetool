import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ProjectRecurrenceRule } from "./lib/projectRecurrence";
import { setupConvexTest } from "./test.setup";
import {
	addMemberToOrg,
	createTestClient,
	createTestIdentity,
	createTestOrg,
} from "./test.helpers";

const NOW = Date.UTC(2026, 8, 6, 16);
const DAY = 86_400_000;
const daily = (count: number) => ({
	frequency: "daily" as const,
	interval: 1,
	end: { kind: "count" as const, count },
});
const weekly = (count: number) => ({
	frequency: "weekly" as const,
	interval: 1,
	end: { kind: "count" as const, count },
});

describe("project series lifecycle", () => {
	let t: ReturnType<typeof setupConvexTest>;
	let fixture = 0;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
		t = setupConvexTest();
		fixture = 0;
	});
	afterEach(() => vi.useRealTimers());

	async function series(
		count = 5,
		rule: ProjectRecurrenceRule = daily(count)
	) {
		fixture++;
		const setup = await t.run(async (ctx) => {
			const org = await createTestOrg(ctx, {
				clerkUserId: `lifecycle_user_${fixture}`,
				clerkOrgId: `lifecycle_org_${fixture}`,
			});
			await ctx.db.patch(org.orgId, { timezone: "America/New_York" });
			const clientId = await createTestClient(ctx, org.orgId);
			return { ...org, clientId };
		});
		const asUser = t.withIdentity(
			createTestIdentity(setup.clerkUserId, setup.clerkOrgId)
		);
		const projectId = await asUser.mutation(api.projects.create, {
			clientId: setup.clientId,
			title: "Weekly service",
			description: "Original scope",
			status: "planned",
			projectType: "recurring",
			startDate: Date.UTC(2026, 8, 6),
			endDate: Date.UTC(2026, 8, 6),
		});
		const seriesId = await asUser.mutation(api.projectSeries.enroll, {
			projectId,
			rule,
		});
		return { ...setup, asUser, projectId, seriesId };
	}

	async function occurrences(seriesId: Id<"projectSeries">) {
		return await t.run(async (ctx) =>
			ctx.db
				.query("projects")
				.withIndex("by_series_start", (q) =>
					q.eq("recurringSeriesId", seriesId)
				)
				.collect()
		);
	}

	it("counts preserved visits once when several overridden fields are sent together", async () => {
		const setup = await series(3);
		const visits = await occurrences(setup.seriesId);
		await setup.asUser.mutation(api.projects.update, {
			id: visits[1]._id,
			title: "Custom title",
			description: "Custom service",
		});
		const result = await setup.asUser.mutation(api.projectSeries.updateFuture, {
			projectId: setup.projectId,
			updates: { title: "New title", description: "New service" },
		});
		expect(result).toEqual({ updated: 2, preserved: 1 });
	});

	it("lists and gets a Free-plan series while enforcing org-wide and tenant access", async () => {
		const setup = await series();
		expect(await setup.asUser.query(api.projectSeries.listForOrg, {})).toEqual([
			expect.objectContaining({ _id: setup.seriesId, state: "active" }),
		]);
		const detail = await setup.asUser.query(api.projectSeries.get, {
			seriesId: setup.seriesId,
		});
		expect(detail?.nextVisit).not.toBeNull();
		expect(detail?.returnProject).toEqual({
			_id: setup.projectId,
			title: "Weekly service",
		});
		const generated = (await occurrences(setup.seriesId)).find(
			(project) => project._id !== setup.projectId
		);
		expect(generated).toBeDefined();
		expect(
			await setup.asUser.query(api.projectSeries.get, {
				seriesId: setup.seriesId,
				fromProjectId: generated!._id,
			})
		).toMatchObject({
			returnProject: { _id: generated!._id, title: generated!.title },
		});
		expect(
			await setup.asUser.query(api.projectSeries.get, {
				seriesId: setup.seriesId,
				fromProjectId: "not-a-project-id",
			})
		).toMatchObject({
			returnProject: { _id: setup.projectId, title: "Weekly service" },
		});

		const member = await t.run(async (ctx) => addMemberToOrg(ctx, setup.orgId));
		const scoped = t.withIdentity(
			createTestIdentity(member.clerkUserId, setup.clerkOrgId)
		);
		await expect(
			scoped.query(api.projectSeries.listForOrg, {})
		).rejects.toThrow(/organization-wide/i);
		const foreign = await series();
		expect(
			await setup.asUser.query(api.projectSeries.get, {
				seriesId: foreign.seriesId,
			})
		).toBeNull();
	});

	it("pauses only future unstarted visits, blocks old-mobile task completion, and resumes without backfill", async () => {
		const setup = await series();
		const rows = await occurrences(setup.seriesId);
		const begun = rows[1];
		const taskId = await setup.asUser.mutation(api.tasks.create, {
			title: "Started work",
			date: begun.startDate!,
			status: "in-progress",
			projectId: begun._id,
			clientId: setup.clientId,
			type: "external",
		});
		const page = await setup.asUser.query(api.projectSeries.listOccurrences, {
			seriesId: setup.seriesId,
		});
		expect(page.skippableIds).toContain(setup.projectId);
		expect(page.skippableIds).not.toContain(begun._id);
		expect(page.restorableIds).toEqual([]);
		const preview = await setup.asUser.query(
			api.projectSeries.previewLifecycle,
			{
				seriesId: setup.seriesId,
				action: "pause",
			}
		);
		expect(preview.preserved).toBeGreaterThanOrEqual(1);
		await setup.asUser.mutation(api.projectSeries.lifecycle, {
			seriesId: setup.seriesId,
			action: "pause",
			expectedVersion: preview.revision,
		});
		let paused = await occurrences(setup.seriesId);
		expect(
			paused.find((p) => p._id === begun._id)?.recurringState
		).toBeUndefined();
		expect(
			paused.filter((p) => p.recurringState === "paused").length
		).toBeGreaterThan(0);
		const pausedVisit = paused.find((p) => p.recurringState === "paused")!;
		const pausedTask = await setup.asUser.mutation(api.tasks.create, {
			title: "Cached mobile row",
			date: pausedVisit.startDate!,
			status: "cancelled",
			projectId: pausedVisit._id,
			clientId: setup.clientId,
			type: "external",
		});
		await expect(
			setup.asUser.mutation(api.tasks.update, {
				id: pausedTask,
				status: "pending",
			})
		).rejects.toThrow(/suspended/i);
		await expect(
			setup.asUser.mutation(api.tasks.complete, { id: pausedTask })
		).rejects.toThrow(/suspended/i);

		vi.setSystemTime(NOW + 2 * DAY);
		const resumeDay = Date.UTC(2026, 8, 8);
		const resume = await setup.asUser.query(
			api.projectSeries.previewLifecycle,
			{
				seriesId: setup.seriesId,
				action: "resume",
			}
		);
		await setup.asUser.mutation(api.projectSeries.lifecycle, {
			seriesId: setup.seriesId,
			action: "resume",
			expectedVersion: resume.revision,
		});
		paused = await occurrences(setup.seriesId);
		expect(
			paused
				.filter((p) => (p.startDate ?? 0) >= resumeDay)
				.every((p) => !p.recurringState)
		).toBe(true);
		expect(
			paused
				.filter((p) => (p.startDate ?? 0) < resumeDay && p._id !== begun._id)
				.every((p) => p.recurringState === "skipped")
		).toBe(true);
		expect(await t.run(async (ctx) => ctx.db.get(taskId))).not.toBeNull();
	});

	it("resumes an ended five-visit weekly series without duplicates or extending its rule", async () => {
		const rule = weekly(5);
		const setup = await series(5, rule);
		const rows = await occurrences(setup.seriesId);
		await setup.asUser.mutation(api.projects.update, {
			id: rows[1]._id,
			status: "in-progress",
		});
		await setup.asUser.mutation(api.projectSeries.skip, {
			projectId: rows[2]._id,
		});
		await setup.asUser.mutation(api.invoices.create, {
			clientId: setup.clientId,
			projectId: rows[3]._id,
			invoiceNumber: "INV-END-RESUME",
			status: "draft",
			subtotal: 100,
			total: 100,
			issuedDate: NOW,
			dueDate: NOW + 30 * DAY,
		});
		const beforeSeries = await t.run(async (ctx) => ctx.db.get(setup.seriesId));
		const preview = await setup.asUser.query(
			api.projectSeries.previewLifecycle,
			{
				seriesId: setup.seriesId,
				action: "end",
			}
		);
		await setup.asUser.mutation(api.projectSeries.lifecycle, {
			seriesId: setup.seriesId,
			action: "end",
			expectedVersion: preview.revision,
		});
		const ended = await occurrences(setup.seriesId);
		expect(ended.find((p) => p._id === rows[1]._id)?.status).toBe(
			"in-progress"
		);
		expect(ended.some((p) => p.recurringState === "ended")).toBe(true);
		expect(ended.find((p) => p._id === rows[2]._id)).toMatchObject({
			recurringState: "skipped",
			recurringSkipReason: "manual",
		});
		expect(ended.find((p) => p._id === rows[3]._id)?.recurringState).toBeUndefined();

		vi.setSystemTime(NOW + 15 * DAY);
		const resume = await setup.asUser.query(
			api.projectSeries.previewLifecycle,
			{ seriesId: setup.seriesId, action: "resume" }
		);
		await expect(
			setup.asUser.mutation(api.projectSeries.lifecycle, {
				seriesId: setup.seriesId,
				action: "resume",
				expectedVersion: resume.revision - 1,
			})
		).rejects.toThrow(/changed/i);
		await setup.asUser.mutation(api.projectSeries.lifecycle, {
			seriesId: setup.seriesId,
			action: "resume",
			expectedVersion: resume.revision,
		});
		await t.mutation(internal.projectSeries.generate, {
			orgId: setup.orgId,
			seriesId: setup.seriesId,
		});

		const resumed = await occurrences(setup.seriesId);
		expect(resumed).toHaveLength(5);
		expect(new Set(resumed.map((visit) => visit.recurringNominalDate)).size).toBe(5);
		expect(
			resumed
				.filter((visit) => visit.recurringState === "ended")
			).toHaveLength(0);
		expect(
			resumed
				.filter(
					(visit) =>
						visit.status === "cancelled" &&
						visit.recurringSkipReason !== "manual" &&
						(visit.startDate ?? 0) < Date.UTC(2026, 8, 21)
				)
				.every((visit) => visit.recurringState === "skipped")
		).toBe(true);
		expect(resumed.find((p) => p._id === rows[2]._id)).toMatchObject({
			recurringState: "skipped",
			recurringSkipReason: "manual",
		});
		expect(resumed.find((p) => p._id === rows[3]._id)?.recurringState).toBeUndefined();
		expect(resumed.find((p) => p._id === rows[4]._id)).toMatchObject({
			status: "planned",
		});
		expect(resumed.find((p) => p._id === rows[4]._id)?.recurringState).toBeUndefined();
		expect(resumed.find((p) => p._id === rows[0]._id)).toMatchObject({
			status: "cancelled",
			recurringState: "skipped",
		});
		const afterSeries = await t.run(async (ctx) => ctx.db.get(setup.seriesId));
		expect(afterSeries).toMatchObject({
			state: "active",
			anchorDateKey: beforeSeries!.anchorDateKey,
			rule,
		});
	});

	it("restores all five ended weekly visits on a same-day resume", async () => {
		const setup = await series(5, weekly(5));
		const before = await occurrences(setup.seriesId);
		const beforeIds = before.map((visit) => visit._id);
		const end = await setup.asUser.query(api.projectSeries.previewLifecycle, {
			seriesId: setup.seriesId,
			action: "end",
		});
		await setup.asUser.mutation(api.projectSeries.lifecycle, {
			seriesId: setup.seriesId,
			action: "end",
			expectedVersion: end.revision,
		});
		const resume = await setup.asUser.query(api.projectSeries.previewLifecycle, {
			seriesId: setup.seriesId,
			action: "resume",
		});
		expect(resume.count).toBe(5);
		await setup.asUser.mutation(api.projectSeries.lifecycle, {
			seriesId: setup.seriesId,
			action: "resume",
			expectedVersion: resume.revision,
		});
		const restored = await occurrences(setup.seriesId);
		expect(restored.map((visit) => visit._id)).toEqual(beforeIds);
		expect(restored).toHaveLength(5);
		expect(
			restored.every(
				(visit) => visit.status === "planned" && !visit.recurringState
			)
		).toBe(true);
		const resumeEvents = await t.run(async (ctx) =>
			(await ctx.db.query("domainEvents").collect()).filter(
				(event) => event.eventSource === "projectSeries.resume"
			)
		);
		expect(resumeEvents).toHaveLength(5);
		expect(
			resumeEvents.every(
				(event) =>
					event.payload.oldValue === "cancelled" &&
					event.payload.newValue === "planned"
			)
		).toBe(true);

		vi.setSystemTime(NOW + 365 * DAY);
		await t.mutation(internal.projectSeries.generate, {
			orgId: setup.orgId,
			seriesId: setup.seriesId,
		});
		expect(await occurrences(setup.seriesId)).toHaveLength(5);
	});

	it("restores a leftover ended visit once its series is active", async () => {
		const setup = await series(3);
		const visit = (await occurrences(setup.seriesId))[1];
		const preview = await setup.asUser.query(
			api.projectSeries.previewLifecycle,
			{ seriesId: setup.seriesId, action: "end" }
		);
		await setup.asUser.mutation(api.projectSeries.lifecycle, {
			seriesId: setup.seriesId,
			action: "end",
			expectedVersion: preview.revision,
		});
		await t.run(async (ctx) =>
			ctx.db.patch(setup.seriesId, { state: "active" })
		);
		const page = await setup.asUser.query(api.projectSeries.listOccurrences, {
			seriesId: setup.seriesId,
		});
		expect(page.restorableIds).toContain(visit._id);
		await setup.asUser.mutation(api.projectSeries.restoreVisit, {
			projectId: visit._id,
		});
		expect(await t.run(async (ctx) => ctx.db.get(visit._id))).toMatchObject({
			status: "planned",
		});
	});

	it("manual skip and restore retain the occurrence ledger without regeneration", async () => {
		const setup = await series();
		const visit = (await occurrences(setup.seriesId))[2];
		await setup.asUser.mutation(api.projectSeries.skip, {
			projectId: visit._id,
		});
		expect(await t.run(async (ctx) => ctx.db.get(visit._id))).toMatchObject({
			status: "cancelled",
			recurringState: "skipped",
			recurringSkipReason: "manual",
		});
		await t.mutation(internal.projectSeries.generate, {
			orgId: setup.orgId,
			seriesId: setup.seriesId,
		});
		expect(
			(await occurrences(setup.seriesId)).filter(
				(p) => p.startDate === visit.startDate
			)
		).toHaveLength(1);
		await setup.asUser.mutation(api.projectSeries.restoreVisit, {
			projectId: visit._id,
		});
		expect(await t.run(async (ctx) => ctx.db.get(visit._id))).toMatchObject({
			status: "planned",
		});
	});

	it("reports the first unsuppressed upcoming visit as next and keeps visits recurring", async () => {
		const setup = await series();
		const visits = await occurrences(setup.seriesId);
		await setup.asUser.mutation(api.projects.update, {
			id: setup.projectId,
			status: "completed",
		});
		await setup.asUser.mutation(api.projectSeries.skip, {
			projectId: visits[1]._id,
		});
		const detail = await setup.asUser.query(api.projectSeries.get, {
			seriesId: setup.seriesId,
		});
		expect(detail?.nextVisit?._id).toBe(visits[2]._id);
		await expect(
			setup.asUser.mutation(api.projects.update, {
				id: visits[2]._id,
				projectType: "one-off",
			})
		).rejects.toThrow(/recurring/i);
	});

	it("propagates reusable fields while preserving a future occurrence override", async () => {
		const setup = await series();
		const rows = await occurrences(setup.seriesId);
		await setup.asUser.mutation(api.projects.update, {
			id: rows[2]._id,
			description: "Customer-specific scope",
		});
		const result = await setup.asUser.mutation(api.projectSeries.updateFuture, {
			projectId: rows[1]._id,
			updates: { title: "New title", description: "Shared scope" },
		});
		expect(result.updated).toBeGreaterThan(1);
		const updated = await occurrences(setup.seriesId);
		expect(updated.find((p) => p._id === rows[2]._id)?.description).toBe(
			"Customer-specific scope"
		);
		expect(updated.find((p) => p._id === rows[3]._id)).toMatchObject({
			title: "New title",
			description: "Shared scope",
		});
		await setup.asUser.mutation(api.projects.update, {
			id: rows[3]._id,
			title: "Later override",
		});
		expect(await t.run(async (ctx) => ctx.db.get(rows[3]._id))).toMatchObject({
			recurringFieldOverrides: expect.arrayContaining(["title"]),
		});
	});

	it("rejects a stale lifecycle preview after an intervening series change", async () => {
		const setup = await series();
		const preview = await setup.asUser.query(
			api.projectSeries.previewLifecycle,
			{
				seriesId: setup.seriesId,
				action: "pause",
			}
		);
		const visit = (await occurrences(setup.seriesId))[1];
		await setup.asUser.mutation(api.projectSeries.updateFuture, {
			projectId: visit._id,
			updates: { title: "Changed after preview" },
		});
		await expect(
			setup.asUser.mutation(api.projectSeries.lifecycle, {
				seriesId: setup.seriesId,
				action: "pause",
				expectedVersion: preview.revision,
			})
		).rejects.toThrow(/changed/i);
	});

	it("invalidates lifecycle previews after generic project date and status writes", async () => {
		const setup = await series();
		const visit = (await occurrences(setup.seriesId))[1];
		const datePreview = await setup.asUser.query(
			api.projectSeries.previewLifecycle,
			{ seriesId: setup.seriesId, action: "pause" }
		);
		await setup.asUser.mutation(api.projects.update, {
			id: visit._id,
			startDate: visit.startDate! + DAY,
			endDate: visit.startDate! + DAY,
		});
		await expect(
			setup.asUser.mutation(api.projectSeries.lifecycle, {
				seriesId: setup.seriesId,
				action: "pause",
				expectedVersion: datePreview.revision,
			})
		).rejects.toThrow(/changed/i);

		const statusPreview = await setup.asUser.query(
			api.projectSeries.previewLifecycle,
			{ seriesId: setup.seriesId, action: "pause" }
		);
		await setup.asUser.mutation(api.projects.update, {
			id: visit._id,
			status: "in-progress",
		});
		await expect(
			setup.asUser.mutation(api.projectSeries.lifecycle, {
				seriesId: setup.seriesId,
				action: "pause",
				expectedVersion: statusPreview.revision,
			})
		).rejects.toThrow(/changed/i);
	});

	it("preserves completed and invoiced future visits during pause", async () => {
		const setup = await series();
		const rows = await occurrences(setup.seriesId);
		await setup.asUser.mutation(api.projects.update, {
			id: rows[1]._id,
			status: "completed",
		});
		await setup.asUser.mutation(api.invoices.create, {
			clientId: setup.clientId,
			projectId: rows[2]._id,
			invoiceNumber: "INV-9001",
			status: "draft",
			subtotal: 100,
			total: 100,
			issuedDate: NOW,
			dueDate: NOW + 30 * DAY,
		});
		const preview = await setup.asUser.query(
			api.projectSeries.previewLifecycle,
			{
				seriesId: setup.seriesId,
				action: "pause",
			}
		);
		expect(preview.preserved).toBeGreaterThanOrEqual(2);
		await setup.asUser.mutation(api.projectSeries.lifecycle, {
			seriesId: setup.seriesId,
			action: "pause",
			expectedVersion: preview.revision,
		});
		const after = await occurrences(setup.seriesId);
		expect(after.find((p) => p._id === rows[1]._id)?.status).toBe("completed");
		expect(
			after.find((p) => p._id === rows[2]._id)?.recurringState
		).toBeUndefined();
	});

	it("changes cadence around protected visits and only restores schedule-change skips", async () => {
		const setup = await series(6);
		const rows = await occurrences(setup.seriesId);
		const begun = rows[1];
		const manual = rows[2];
		const overridden = rows[3];
		await setup.asUser.mutation(api.tasks.create, {
			title: "Begun",
			date: begun.startDate!,
			status: "in-progress",
			projectId: begun._id,
			clientId: setup.clientId,
			type: "external",
		});
		await setup.asUser.mutation(api.projectSeries.skip, {
			projectId: manual._id,
		});
		await setup.asUser.mutation(api.projects.update, {
			id: overridden._id,
			title: "Keep this visit",
		});
		const spaced = {
			frequency: "daily" as const,
			interval: 2,
			end: { kind: "count" as const, count: 4 },
		};
		const preview = await setup.asUser.query(
			api.projectSeries.previewScheduleChange,
			{ seriesId: setup.seriesId, rule: spaced }
		);
		expect(preview.preserved).toBeGreaterThanOrEqual(2);
		await setup.asUser.mutation(api.projectSeries.updateSchedule, {
			seriesId: setup.seriesId,
			rule: spaced,
			expectedVersion: preview.revision,
		});
		let changed = await occurrences(setup.seriesId);
		expect(
			changed.find((p) => p._id === begun._id)?.recurringState
		).toBeUndefined();
		expect(changed.find((p) => p._id === manual._id)).toMatchObject({
			recurringState: "skipped",
			recurringSkipReason: "manual",
		});
		expect(changed.find((p) => p._id === overridden._id)?.title).toBe(
			"Keep this visit"
		);
		const scheduleSkipped = changed.find(
			(p) => p.recurringSkipReason === "schedule-change"
		);
		expect(scheduleSkipped).toBeDefined();

		const restore = await setup.asUser.query(
			api.projectSeries.previewScheduleChange,
			{ seriesId: setup.seriesId, rule: daily(6) }
		);
		await setup.asUser.mutation(api.projectSeries.updateSchedule, {
			seriesId: setup.seriesId,
			rule: daily(6),
			expectedVersion: restore.revision,
		});
		changed = await occurrences(setup.seriesId);
		expect(
			changed.find((p) => p._id === scheduleSkipped!._id)?.recurringState
		).toBeUndefined();
		expect(changed.find((p) => p._id === manual._id)?.recurringSkipReason).toBe(
			"manual"
		);
	});

	it("requires a revised agreement for cadence and shared scope changes", async () => {
		const setup = await series();
		const quoteId = await setup.asUser.mutation(api.quotes.create, {
			clientId: setup.clientId,
			projectId: setup.projectId,
			title: "Standing agreement",
			status: "approved",
			subtotal: 100,
			total: 100,
		});
		await t.run(async (ctx) =>
			ctx.db.patch(setup.seriesId, { agreementQuoteId: quoteId })
		);
		const visit = (await occurrences(setup.seriesId))[1];
		await expect(
			setup.asUser.mutation(api.projectSeries.updateFuture, {
				projectId: visit._id,
				updates: { description: "Changed service" },
			})
		).rejects.toThrow(/agreement/i);
		const preview = await setup.asUser.query(
			api.projectSeries.previewScheduleChange,
			{ seriesId: setup.seriesId, rule: daily(3) }
		);
		await expect(
			setup.asUser.mutation(api.projectSeries.updateSchedule, {
				seriesId: setup.seriesId,
				rule: daily(3),
				expectedVersion: preview.revision,
			})
		).rejects.toThrow(/agreement/i);
	});
});
