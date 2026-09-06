import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { setupConvexTest } from "./test.setup";
import { triggers } from "./lib/triggers";
import { createTestOrg, createTestClient, createTestIdentity, addMemberToOrg } from "./test.helpers";

const DAY = 86_400_000;
const START = Date.UTC(2026, 8, 6);
const NOW = START + 16 * 3_600_000;

describe("recurring project task copy-forward", () => {
	let t: ReturnType<typeof setupConvexTest>;
	let sequence = 0;
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
		t = setupConvexTest();
		sequence = 0;
	});
	afterEach(() => vi.useRealTimers());

	async function fixture(count = 5, interval = 1) {
		const n = ++sequence;
		const org = await t.run(async (ctx) => {
			const setup = await createTestOrg(ctx, { clerkUserId: `copy_user_${n}`, clerkOrgId: `copy_org_${n}` });
			await ctx.db.patch(setup.orgId, { timezone: "America/New_York" });
			return { ...setup, clientId: await createTestClient(ctx, setup.orgId) };
		});
		const user = t.withIdentity(createTestIdentity(org.clerkUserId, org.clerkOrgId));
		const projectId = await user.mutation(api.projects.create, {
			clientId: org.clientId, title: "Weekly clean", projectType: "recurring", status: "planned", startDate: START,
			recurrenceRule: { frequency: "weekly", interval, end: { kind: "count", count } },
		});
		const project = await t.run((ctx) => ctx.db.get(projectId));
		const seriesId = project!.recurringSeriesId!;
		const taskId = await user.mutation(api.tasks.create, {
			clientId: org.clientId, projectId, type: "external", title: "Clean windows", description: "Inside and outside",
			date: START + DAY, startTime: "09:00", endTime: "10:30", status: "pending", assigneeUserId: org.userId,
		});
		return { ...org, user, projectId, seriesId, taskId };
	}
	type Fixture = Awaited<ReturnType<typeof fixture>>;
	async function visits(f: Fixture) {
		return t.run((ctx) => ctx.db.query("projects").withIndex("by_series_start", (q) => q.eq("recurringSeriesId", f.seriesId)).collect());
	}
	async function tasks(projectId: Id<"projects">) {
		return t.run((ctx) => ctx.db.query("tasks").withIndex("by_project", (q) => q.eq("projectId", projectId)).collect());
	}
	async function copy(f: Fixture, taskId = f.taskId) {
		const preview = await f.user.query(api.projectSeriesTasks.previewCopy, { taskId });
		await f.user.mutation(api.projectSeriesTasks.copy, { taskId, expectedRevision: preview.revision });
		return preview;
	}
	async function template(f: Fixture) {
		const setup = await f.user.query(api.projectSeriesTasks.getSetup, { projectId: f.projectId });
		return setup!.templates.find((item) => item.sourceTaskId === f.taskId)!;
	}

	it("copies a selected saved task with dates relative to each project and fresh pending state", async () => {
		const f = await fixture();
		await f.user.mutation(api.tasks.complete, { id: f.taskId });
		const preview = await copy(f);
		expect(preview.createCount).toBe(4);
		for (const visit of (await visits(f)).slice(1)) {
			const copied = await tasks(visit._id);
			expect(copied).toHaveLength(1);
			expect(copied[0]).toMatchObject({ title: "Clean windows", description: "Inside and outside", date: visit.startDate! + DAY,
				startTime: "09:00", endTime: "10:30", assigneeUserId: f.userId, status: "pending", clientId: f.clientId });
			expect(copied[0]._id).not.toBe(f.taskId);
			expect(copied[0].completedAt).toBeUndefined();
			expect(copied[0].parentTaskId).toBeUndefined();
			expect(copied[0].repeatUntil).toBeUndefined();
		}
		expect((await tasks(f.projectId))[0].status).toBe("completed");
	});

	it("repeated copying updates untouched copies in place and leaves manual tasks alone", async () => {
		const f = await fixture(3);
		await copy(f);
		const future = (await visits(f))[1];
		const first = (await tasks(future._id))[0];
		const manual = await f.user.mutation(api.tasks.create, { clientId: f.clientId, projectId: future._id, title: "Manual extra", date: future.startDate!, status: "pending" });
		await f.user.mutation(api.tasks.update, { id: f.taskId, title: "Wash windows", description: "New saved scope" });
		await copy(f);
		await copy(f);
		const after = await tasks(future._id);
		expect(after).toHaveLength(2);
		expect(after.find((task) => task._id === first._id)).toMatchObject({ title: "Wash windows", description: "New saved scope" });
		expect(after.find((task) => task._id === manual)?.title).toBe("Manual extra");
	});

	it("preserves edits, started-then-reverted tasks, and permanently deleted copies", async () => {
		const f = await fixture();
		await copy(f);
		const future = (await visits(f)).slice(1);
		const copies = await Promise.all(future.map(async (project) => (await tasks(project._id))[0]));
		await f.user.mutation(api.tasks.update, { id: copies[0]._id, title: "One visit exception" });
		await f.user.mutation(api.tasks.update, { id: copies[1]._id, status: "in-progress" });
		await f.user.mutation(api.tasks.update, { id: copies[1]._id, status: "pending" });
		await f.user.mutation(api.tasks.remove, { id: copies[2]._id });
		await f.user.mutation(api.tasks.update, { id: f.taskId, title: "Updated template" });
		await copy(f);
		expect((await tasks(future[0]._id))[0].title).toBe("One visit exception");
		expect((await tasks(future[1]._id))[0].title).toBe("Clean windows");
		expect(await tasks(future[2]._id)).toHaveLength(0);
		expect((await tasks(future[3]._id))[0].title).toBe("Updated template");
	});

	it("uses the last explicitly copied snapshot for visits generated later, even after source deletion", async () => {
		const f = await fixture(4, 8);
		await copy(f);
		await f.user.mutation(api.tasks.update, { id: f.taskId, title: "Unpublished change" });
		await f.user.mutation(api.tasks.remove, { id: f.taskId });
		vi.setSystemTime(NOW + 60 * DAY);
		await t.mutation(internal.projectSeries.generate, { orgId: f.orgId, seriesId: f.seriesId });
		const later = (await visits(f)).find((project) => project.startDate === START + 112 * DAY)!;
		expect(later).toBeDefined();
		expect((await tasks(later._id))[0]).toMatchObject({ title: "Clean windows", date: later.startDate! + DAY });
		expect(await template(f)).toMatchObject({ active: true, sourceAvailable: false });
	});

	it("removing a saved setup preserves edited copies and stops future generation", async () => {
		const f = await fixture(5, 4);
		await copy(f);
		const future = (await visits(f)).slice(1);
		const edited = (await tasks(future[0]._id))[0];
		await f.user.mutation(api.tasks.update, { id: edited._id, title: "Keep this exception" });
		const saved = await template(f);
		const preview = await f.user.query(api.projectSeriesTasks.previewRemoval, { templateId: saved._id });
		expect(preview.removeCount).toBe(2);
		await f.user.mutation(api.projectSeriesTasks.remove, { templateId: saved._id, expectedRevision: preview.revision });
		expect((await tasks(future[0]._id))[0].title).toBe("Keep this exception");
		expect(await tasks(future[1]._id)).toHaveLength(0);
		expect((await tasks(f.projectId))[0]._id).toBe(f.taskId);
		vi.setSystemTime(NOW + 30 * DAY);
		await t.mutation(internal.projectSeries.generate, { orgId: f.orgId, seriesId: f.seriesId });
		const later = (await visits(f)).find((project) => project.startDate === START + 112 * DAY)!;
		expect(await tasks(later._id)).toHaveLength(0);
		expect((await template(f)).active).toBe(false);
	});

	it("rejects stale copy and removal previews after source or destination edits", async () => {
		const f = await fixture(3);
		let preview = await f.user.query(api.projectSeriesTasks.previewCopy, { taskId: f.taskId });
		await f.user.mutation(api.tasks.update, { id: f.taskId, title: "Changed since preview" });
		await expect(f.user.mutation(api.projectSeriesTasks.copy, { taskId: f.taskId, expectedRevision: preview.revision })).rejects.toThrow(/changed|preview/i);
		await copy(f);
		const saved = await template(f);
		preview = await f.user.query(api.projectSeriesTasks.previewRemoval, { templateId: saved._id });
		const target = (await visits(f))[1];
		await f.user.mutation(api.tasks.update, { id: (await tasks(target._id))[0]._id, title: "Keep mine" });
		await expect(f.user.mutation(api.projectSeriesTasks.remove, { templateId: saved._id, expectedRevision: preview.revision })).rejects.toThrow(/changed|preview/i);
	});

	it("does not populate skipped, started, invoiced, or past projects", async () => {
		const f = await fixture(6);
		const rows = await visits(f);
		await f.user.mutation(api.projectSeries.skip, { projectId: rows[1]._id });
		await f.user.mutation(api.projects.update, { id: rows[2]._id, status: "in-progress" });
		await f.user.mutation(api.invoices.create, { clientId: f.clientId, projectId: rows[3]._id, invoiceNumber: "TASK-COPY-1", status: "draft", subtotal: 10, total: 10, issuedDate: NOW, dueDate: NOW + DAY });
		vi.setSystemTime(NOW + 30 * DAY);
		await copy(f);
		for (const row of rows.slice(1, 5)) expect(await tasks(row._id)).toHaveLength(0);
		expect(await tasks(rows[5]._id)).toHaveLength(1);
	});

	it("never expands standalone task recurrence in generated copies", async () => {
		const f = await fixture(3);
		const source = await f.user.mutation(api.tasks.create, { clientId: f.clientId, projectId: f.projectId, title: "Repeating source", date: START, status: "pending", repeat: "daily", repeatUntil: START + 2 * DAY });
		await copy(f, source);
		for (const visit of (await visits(f)).slice(1)) {
			const rows = await tasks(visit._id);
			expect(rows).toHaveLength(1);
			expect(rows[0].repeat ?? "none").toBe("none");
			expect(rows[0].repeatUntil).toBeUndefined();
			expect(rows[0].parentTaskId).toBeUndefined();
		}
	});

	it("keeps ongoing series manageable after more than 200 historical visits", async () => {
		const f = await fixture(350);
		await copy(f);
		for (let period = 1; period <= 18; period++) {
			vi.setSystemTime(NOW + period * 84 * DAY);
			await t.mutation(internal.projectSeries.generate, { orgId: f.orgId, seriesId: f.seriesId });
		}
		expect((await visits(f)).length).toBeGreaterThan(200);
		const saved = await template(f);
		const removal = await f.user.query(api.projectSeriesTasks.previewRemoval, { templateId: saved._id });
		expect(removal.removeCount).toBeGreaterThan(0);
		await f.user.query(api.projectSeriesTasks.previewCopy, { taskId: f.taskId });
		await f.user.mutation(api.projectSeriesTasks.remove, { templateId: saved._id, expectedRevision: removal.revision });
		expect((await template(f)).active).toBe(false);
	});

	it("preserves task type and public-form trust provenance in copies and future generation", async () => {
		const f = await fixture(4, 8);
		await f.user.mutation(api.tasks.update, { id: f.taskId, type: "internal" });
		await t.run(async (ctx) => {
			const wrapped = triggers.wrapDB(ctx);
			await wrapped.db.patch(f.taskId, { source: "public_form" });
		});
		await copy(f);
		const next = (await visits(f))[1];
		expect((await tasks(next._id))[0]).toMatchObject({ type: "internal", source: "public_form" });
		vi.setSystemTime(NOW + 60 * DAY);
		await t.mutation(internal.projectSeries.generate, { orgId: f.orgId, seriesId: f.seriesId });
		const later = (await visits(f)).find((project) => project.startDate === START + 112 * DAY)!;
		expect((await tasks(later._id))[0]).toMatchObject({ type: "internal", source: "public_form" });
	});

	it("emits task events for actual changes without retriggering automations on an unchanged recopy", async () => {
		const f = await fixture(3);
		await copy(f);
		await copy(f);
		const copyEvents = () => t.run(async (ctx) =>
			(await ctx.db.query("domainEvents").collect()).filter((event) => event.eventSource === "projectSeriesTasks.copy")
		);
		expect(await copyEvents()).toHaveLength(2);
		await f.user.mutation(api.tasks.update, { id: f.taskId, title: "Changed task" });
		await copy(f);
		const updates = (await copyEvents()).filter((event) => event.eventType === "entity.record_updated");
		expect(updates).toHaveLength(2);
		expect(updates.every((event) => JSON.stringify(event.payload.metadata?.changedFields) === JSON.stringify(["title"]))).toBe(true);
	});

	it("denies cross-tenant and assigned-only propagation", async () => {
		const f = await fixture(3);
		const foreign = await fixture(3);
		await expect(foreign.user.query(api.projectSeriesTasks.previewCopy, { taskId: f.taskId })).rejects.toThrow();
		await expect(foreign.user.mutation(api.projectSeriesTasks.copy, { taskId: f.taskId, expectedRevision: 0 })).rejects.toThrow();
		const member = await t.run((ctx) => addMemberToOrg(ctx, f.orgId, { clerkUserId: "copy_member", role: "member" }));
		const asMember = t.withIdentity(createTestIdentity(member.clerkUserId, f.clerkOrgId));
		await expect(asMember.query(api.projectSeriesTasks.previewCopy, { taskId: f.taskId })).rejects.toThrow();
		await expect(asMember.mutation(api.projectSeriesTasks.copy, { taskId: f.taskId, expectedRevision: 0 })).rejects.toThrow();
	});
});
