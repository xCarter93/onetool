import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import {
	addMemberToOrg,
	createTestClient,
	createTestClientProperty,
	createTestIdentity,
	createTestOrg,
	createTestQuote,
	createTestTask,
} from "./test.helpers";

const NOW = Date.UTC(2026, 8, 6, 16);
const DAY = 86_400_000;
const daily = (count: number) => ({
	frequency: "daily" as const,
	interval: 1,
	end: { kind: "count" as const, count },
});

describe("project series", () => {
	let t: ReturnType<typeof setupConvexTest>;
	let fixture = 0;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
		t = setupConvexTest();
		fixture = 0;
	});

	afterEach(() => vi.useRealTimers());

	async function setupOrigin(
		overrides: {
			startDate?: number;
			endDate?: number;
			status?: "planned" | "in-progress" | "completed" | "cancelled";
			clientStatus?: "active" | "archived";
		} = {}
	) {
		const setup = await t.run(async (ctx) => {
			fixture++;
			const org = await createTestOrg(ctx, {
				clerkUserId: `series_user_${fixture}`,
				clerkOrgId: `series_org_${fixture}`,
			});
			await ctx.db.patch(org.orgId, { timezone: "America/New_York" });
			const clientId = await createTestClient(ctx, org.orgId, {
				status: overrides.clientStatus ?? "active",
			});
			return { ...org, clientId };
		});
		const asUser = t.withIdentity(
			createTestIdentity(setup.clerkUserId, setup.clerkOrgId)
		);
		const projectId = await asUser.mutation(api.projects.create, {
			clientId: setup.clientId,
			title: "Monday cleaning",
			description: "Kitchen and bathrooms",
			status: overrides.status ?? "planned",
			projectType: "one-off",
			startDate: overrides.startDate ?? Date.UTC(2026, 8, 6),
			endDate: overrides.endDate ?? Date.UTC(2026, 8, 8),
		});
		return { ...setup, projectId };
	}

	it("previews UTC calendar dates, includes the origin in count, and rejects invalid bounds", async () => {
		const setup = await setupOrigin();
		const asUser = t.withIdentity(
			createTestIdentity(setup.clerkUserId, setup.clerkOrgId)
		);
		const before = await t.run(async (ctx) => ({
			series: (await ctx.db.query("projectSeries").collect()).length,
			projects: (await ctx.db.query("projects").collect()).length,
		}));

		await expect(
			asUser.query(api.projectSeries.preview, {
				projectId: setup.projectId,
				rule: daily(4),
				from: "2026-09-06",
				through: "2026-09-10",
				limit: 101,
			})
		).rejects.toThrow(/limit/i);
		expect(
			await asUser.query(api.projectSeries.preview, {
				projectId: setup.projectId,
				rule: daily(4),
				from: "2026-09-06",
				through: "2026-09-10",
			})
		).toEqual(["2026-09-06", "2026-09-07", "2026-09-08", "2026-09-09"]);
		expect(
			await t.run(async (ctx) => ({
				series: (await ctx.db.query("projectSeries").collect()).length,
				projects: (await ctx.db.query("projects").collect()).length,
			}))
		).toEqual(before);
	});

	it("enrolls an existing project and copies only reusable project fields", async () => {
		const setup = await setupOrigin({ status: "completed" });
		await t.run(async (ctx) => {
			const propertyId = await createTestClientProperty(
				ctx,
				setup.orgId,
				setup.clientId
			);
			await ctx.db.patch(setup.projectId, { propertyId });
			await createTestTask(ctx, setup.orgId, {
				projectId: setup.projectId,
				clientId: setup.clientId,
			});
			await createTestQuote(ctx, setup.orgId, setup.clientId, {
				projectId: setup.projectId,
			});
		});
		const asUser = t.withIdentity(
			createTestIdentity(setup.clerkUserId, setup.clerkOrgId)
		);
		const seriesId = await asUser.mutation(api.projectSeries.enroll, {
			projectId: setup.projectId,
			rule: daily(3),
		});

		const snapshot = await t.run(async (ctx) => ({
			series: await ctx.db.get(seriesId),
			origin: await ctx.db.get(setup.projectId),
			projects: await ctx.db
				.query("projects")
				.withIndex("by_series_date", (q) => q.eq("recurringSeriesId", seriesId))
				.collect(),
			tasks: await ctx.db.query("tasks").collect(),
			quotes: await ctx.db.query("quotes").collect(),
		}));
		expect(snapshot.origin).toMatchObject({
			status: "completed",
			recurringSeriesId: seriesId,
			recurringNominalDate: "2026-09-06",
		});
		expect(snapshot.projects).toHaveLength(3);
		expect(
			snapshot.projects.filter((project) => project._id !== setup.projectId)
		).toEqual([
			expect.objectContaining({
				title: "Monday cleaning",
				description: "Kitchen and bathrooms",
				status: "planned",
				startDate: Date.UTC(2026, 8, 7),
				endDate: Date.UTC(2026, 8, 9),
			}),
			expect.objectContaining({
				title: "Monday cleaning",
				description: "Kitchen and bathrooms",
				status: "planned",
				startDate: Date.UTC(2026, 8, 8),
				endDate: Date.UTC(2026, 8, 10),
			}),
		]);
		expect(snapshot.tasks).toHaveLength(1);
		expect(snapshot.quotes).toHaveLength(1);
		expect(snapshot.series).toMatchObject({
			originatingProjectId: setup.projectId,
			clientId: setup.clientId,
			propertyId: snapshot.origin?.propertyId,
			anchorDateKey: "2026-09-06",
			durationDays: 2,
		});
		expect(
			snapshot.projects.every(
				(project) =>
					project.clientId === setup.clientId &&
					project.propertyId === snapshot.origin?.propertyId
			)
		).toBe(true);
		expect(
			snapshot.projects.every(
				(project) => typeof project.searchText === "string"
			)
		).toBe(true);
		expect((await asUser.query(api.projects.getStats, {})).total).toBe(3);
	});

	it("requires organization-wide project access and rejects another organization's project", async () => {
		const setup = await setupOrigin();
		const member = await t.run(async (ctx) => addMemberToOrg(ctx, setup.orgId));
		const scoped = t.withIdentity(
			createTestIdentity(member.clerkUserId, setup.clerkOrgId)
		);
		await expect(
			scoped.mutation(api.projectSeries.enroll, {
				projectId: setup.projectId,
				rule: daily(2),
			})
		).rejects.toThrow(/organization-wide/i);

		const foreign = await setupOrigin();
		const owner = t.withIdentity(
			createTestIdentity(setup.clerkUserId, setup.clerkOrgId)
		);
		await expect(
			owner.query(api.projectSeries.preview, {
				projectId: foreign.projectId,
				rule: daily(2),
			})
		).rejects.toThrow();
	});

	it("halts archived clients and rejects malformed recurrence during enrollment", async () => {
		const archived = await setupOrigin({ clientStatus: "archived" });
		const archivedUser = t.withIdentity(
			createTestIdentity(archived.clerkUserId, archived.clerkOrgId)
		);
		await expect(
			archivedUser.mutation(api.projectSeries.enroll, {
				projectId: archived.projectId,
				rule: daily(2),
			})
		).rejects.toThrow(/archived/i);

		const setup = await setupOrigin();
		const asUser = t.withIdentity(
			createTestIdentity(setup.clerkUserId, setup.clerkOrgId)
		);
		await expect(
			asUser.mutation(api.projectSeries.enroll, {
				projectId: setup.projectId,
				rule: { frequency: "daily", interval: 0 },
			})
		).rejects.toThrow(/interval/i);
	});

	it("tombstones a deleted visit and never regenerates it", async () => {
		const setup = await setupOrigin();
		const asUser = t.withIdentity(
			createTestIdentity(setup.clerkUserId, setup.clerkOrgId)
		);
		const seriesId = await asUser.mutation(api.projectSeries.enroll, {
			projectId: setup.projectId,
			rule: daily(3),
		});
		const visit = await t.run(async (ctx) =>
			ctx.db
				.query("projects")
				.withIndex("by_series_date", (q) =>
					q
						.eq("recurringSeriesId", seriesId)
						.eq("recurringNominalDate", "2026-09-07")
				)
				.unique()
		);
		expect(visit).not.toBeNull();
		await asUser.mutation(api.projects.remove, { id: visit!._id });
		await t.mutation(internal.projectSeries.generate, {
			orgId: setup.orgId,
			seriesId,
		});

		const result = await t.run(async (ctx) => ({
			visit: await ctx.db.get(visit!._id),
			ledger: await ctx.db
				.query("projectOccurrences")
				.withIndex("by_series_date", (q) =>
					q.eq("seriesId", seriesId).eq("nominalDate", "2026-09-07")
				)
				.unique(),
		}));
		expect(result.visit).toBeNull();
		expect(result.ledger).toMatchObject({ state: "deleted" });
		expect(result.ledger && "projectId" in result.ledger).toBe(false);
	});

	it("tracks reusable field overrides but ignores occurrence status history", async () => {
		const setup = await setupOrigin();
		const asUser = t.withIdentity(
			createTestIdentity(setup.clerkUserId, setup.clerkOrgId)
		);
		const seriesId = await asUser.mutation(api.projectSeries.enroll, {
			projectId: setup.projectId,
			rule: daily(2),
		});
		const visit = await t.run(async (ctx) =>
			ctx.db
				.query("projects")
				.withIndex("by_series_date", (q) =>
					q
						.eq("recurringSeriesId", seriesId)
						.eq("recurringNominalDate", "2026-09-07")
				)
				.unique()
		);
		await asUser.mutation(api.projects.update, {
			id: visit!._id,
			title: "Customer requested title",
			startDate: Date.UTC(2026, 8, 10),
			endDate: Date.UTC(2026, 8, 12),
			status: "completed",
		});
		const updated = await t.run(async (ctx) => ctx.db.get(visit!._id));
		expect(updated?.recurringNominalDate).toBe("2026-09-07");
		expect(updated?.recurringFieldOverrides).toEqual(
			expect.arrayContaining(["title", "startDate", "endDate"])
		);
		expect(updated?.recurringFieldOverrides).not.toContain("status");
	});

	it("blocks deletion when a recurring visit has financial history", async () => {
		const setup = await setupOrigin();
		const asUser = t.withIdentity(
			createTestIdentity(setup.clerkUserId, setup.clerkOrgId)
		);
		const seriesId = await asUser.mutation(api.projectSeries.enroll, {
			projectId: setup.projectId,
			rule: daily(2),
		});
		const visit = await t.run(async (ctx) =>
			ctx.db
				.query("projects")
				.withIndex("by_series_date", (q) =>
					q
						.eq("recurringSeriesId", seriesId)
						.eq("recurringNominalDate", "2026-09-07")
				)
				.unique()
		);
		await t.run(async (ctx) =>
			createTestQuote(ctx, setup.orgId, setup.clientId, {
				projectId: visit!._id,
			})
		);
		await expect(
			asUser.mutation(api.projects.remove, { id: visit!._id })
		).rejects.toThrow(/financial history/i);
		expect(await t.run(async (ctx) => ctx.db.get(visit!._id))).not.toBeNull();
		const ledger = await t.run(async (ctx) =>
			ctx.db
				.query("projectOccurrences")
				.withIndex("by_series_date", (q) =>
					q.eq("seriesId", seriesId).eq("nominalDate", "2026-09-07")
				)
				.unique()
		);
		expect(ledger).toMatchObject({
			state: "materialized",
			projectId: visit!._id,
		});
	});

	it("serializes concurrent continuation generation without duplicate nominal dates", async () => {
		const setup = await setupOrigin();
		const seriesId = await t.run(async (ctx) => {
			const id = await ctx.db.insert("projectSeries", {
				orgId: setup.orgId,
				originatingProjectId: setup.projectId,
				clientId: setup.clientId,
				title: "Monday cleaning",
				createdByUserId: setup.userId,
				anchorDateKey: "2026-09-06",
				durationDays: 2,
				timezone: "America/New_York",
				rule: daily(25),
				state: "active",
				nextGenerationAt: NOW,
			});
			await ctx.db.patch(setup.projectId, {
				projectType: "recurring",
				recurringSeriesId: id,
				recurringNominalDate: "2026-09-06",
			});
			await ctx.db.insert("projectOccurrences", {
				orgId: setup.orgId,
				seriesId: id,
				nominalDate: "2026-09-06",
				projectId: setup.projectId,
				state: "materialized",
			});
			return id;
		});
		await Promise.all([
			t.mutation(internal.projectSeries.generate, {
				orgId: setup.orgId,
				seriesId,
			}),
			t.mutation(internal.projectSeries.generate, {
				orgId: setup.orgId,
				seriesId,
			}),
		]);
		const rows = await t.run(async (ctx) =>
			ctx.db
				.query("projectOccurrences")
				.withIndex("by_series_date", (q) => q.eq("seriesId", seriesId))
				.collect()
		);
		expect(rows).toHaveLength(25);
		expect(new Set(rows.map((row) => row.nominalDate)).size).toBe(25);
		expect(rows.every((row) => row.projectId)).toBe(true);
	});

	it("keeps a far-future next occurrence even outside the rolling horizon", async () => {
		const setup = await setupOrigin({
			startDate: NOW + 300 * DAY,
			endDate: NOW + 301 * DAY,
		});
		const asUser = t.withIdentity(
			createTestIdentity(setup.clerkUserId, setup.clerkOrgId)
		);
		const seriesId = await asUser.mutation(api.projectSeries.enroll, {
			projectId: setup.projectId,
			rule: {
				frequency: "yearly",
				interval: 1,
				end: { kind: "count", count: 2 },
			},
		});
		const rows = await t.run(async (ctx) =>
			ctx.db
				.query("projectOccurrences")
				.withIndex("by_series_date", (q) => q.eq("seriesId", seriesId))
				.collect()
		);
		expect(rows.map((row) => row.nominalDate).sort()).toEqual([
			"2027-07-03",
			"2028-07-03",
		]);
	});

	it("materializes exactly the rolling 90-day window in bounded continuations", async () => {
		const setup = await setupOrigin();
		const asUser = t.withIdentity(
			createTestIdentity(setup.clerkUserId, setup.clerkOrgId)
		);
		const seriesId = await asUser.mutation(api.projectSeries.enroll, {
			projectId: setup.projectId,
			rule: { frequency: "daily", interval: 1 },
		});
		const results = [];
		for (;;) {
			const result = await t.mutation(internal.projectSeries.generate, {
				orgId: setup.orgId,
				seriesId,
			});
			results.push(result);
			if (result.remaining === 0) break;
		}
		let rows = await t.run(async (ctx) =>
			ctx.db
				.query("projectOccurrences")
				.withIndex("by_series_date", (q) => q.eq("seriesId", seriesId))
				.collect()
		);
		expect(rows).toHaveLength(91);
		expect(
			rows
				.map((row) => row.nominalDate)
				.sort()
				.at(-1)
		).toBe("2026-12-05");
		expect(results.every((result) => result.created <= 25)).toBe(true);

		vi.setSystemTime(NOW + 30 * DAY);
		for (;;) {
			const result = await t.mutation(internal.projectSeries.generate, {
				orgId: setup.orgId,
				seriesId,
			});
			if (result.remaining === 0) break;
		}
		rows = await t.run(async (ctx) =>
			ctx.db
				.query("projectOccurrences")
				.withIndex("by_series_date", (q) => q.eq("seriesId", seriesId))
				.collect()
		);
		expect(rows).toHaveLength(121);
		expect(
			rows
				.map((row) => row.nominalDate)
				.sort()
				.at(-1)
		).toBe("2027-01-04");
	});

	it("halts while its client is archived and resumes without backfill", async () => {
		const setup = await setupOrigin();
		const asUser = t.withIdentity(
			createTestIdentity(setup.clerkUserId, setup.clerkOrgId)
		);
		const seriesId = await asUser.mutation(api.projectSeries.enroll, {
			projectId: setup.projectId,
			rule: daily(40),
		});
		const before = await t.run(async (ctx) => {
			await ctx.db.patch(setup.clientId, { status: "archived" });
			return (
				await ctx.db
					.query("projectOccurrences")
					.withIndex("by_series_date", (q) => q.eq("seriesId", seriesId))
					.collect()
			).length;
		});
		vi.setSystemTime(NOW + 30 * DAY);
		expect(
			await t.mutation(internal.projectSeries.generate, {
				orgId: setup.orgId,
				seriesId,
			})
		).toEqual({ created: 0, remaining: 0 });
		expect(
			await t.run(
				async (ctx) =>
					(
						await ctx.db
							.query("projectOccurrences")
							.withIndex("by_series_date", (q) => q.eq("seriesId", seriesId))
							.collect()
					).length
			)
		).toBe(before);
		await t.run(async (ctx) =>
			ctx.db.patch(setup.clientId, { status: "active" })
		);
		await t.mutation(internal.projectSeries.generate, {
			orgId: setup.orgId,
			seriesId,
		});
		const result = await t.run(async (ctx) => ({
			series: await ctx.db.get(seriesId),
			dates: (
				await ctx.db
					.query("projectOccurrences")
					.withIndex("by_series_date", (q) => q.eq("seriesId", seriesId))
					.collect()
			).map((row) => row.nominalDate),
		}));
		expect(result.series).toMatchObject({ state: "active" });
		expect(result.dates).toContain("2026-10-06");
		expect(result.dates).not.toContain("2026-10-02");
	});

	it("filters departed crew from later continuation batches", async () => {
		const setup = await setupOrigin();
		const crew = await t.run(async (ctx) => {
			const member = await addMemberToOrg(ctx, setup.orgId, {
				clerkUserId: "departing_crew",
			});
			await ctx.db.patch(setup.projectId, { assignedUserIds: [member.userId] });
			return member;
		});
		const asUser = t.withIdentity(
			createTestIdentity(setup.clerkUserId, setup.clerkOrgId)
		);
		const seriesId = await asUser.mutation(api.projectSeries.enroll, {
			projectId: setup.projectId,
			rule: daily(40),
		});
		await t.run(async (ctx) => {
			const membership = await ctx.db
				.query("organizationMemberships")
				.withIndex("by_org_user", (q) =>
					q.eq("orgId", setup.orgId).eq("userId", crew.userId)
				)
				.unique();
			await ctx.db.delete(membership!._id);
		});
		await t.mutation(internal.projectSeries.generate, {
			orgId: setup.orgId,
			seriesId,
		});
		const projects = await t.run(async (ctx) =>
			ctx.db
				.query("projects")
				.withIndex("by_series_date", (q) => q.eq("recurringSeriesId", seriesId))
				.collect()
		);
		const firstBatch = projects.find(
			(project) => project.recurringNominalDate === "2026-09-07"
		);
		const secondBatch = projects.find(
			(project) => project.recurringNominalDate === "2026-10-02"
		);
		expect(firstBatch?.assignedUserIds).toEqual([crew.userId]);
		expect(secondBatch?.assignedUserIds).toEqual([]);
	});

	it("claims only due active series and does not dispatch them twice", async () => {
		const setup = await setupOrigin();
		const asUser = t.withIdentity(
			createTestIdentity(setup.clerkUserId, setup.clerkOrgId)
		);
		const seriesId = await asUser.mutation(api.projectSeries.enroll, {
			projectId: setup.projectId,
			rule: daily(1),
		});
		await t.run(async (ctx) => {
			const series = await ctx.db.get(seriesId);
			const { _id, _creationTime, ...data } = series!;
			await ctx.db.patch(seriesId, { nextGenerationAt: NOW });
			await ctx.db.insert("projectSeries", {
				...data,
				state: "paused",
				nextGenerationAt: NOW,
			});
			await ctx.db.insert("projectSeries", {
				...data,
				state: "ended",
				nextGenerationAt: NOW,
			});
			await ctx.db.insert("projectSeries", {
				...data,
				nextGenerationAt: NOW + DAY,
			});
		});
		expect(await t.mutation(internal.projectSeries.sweep, {})).toEqual({
			dispatched: 1,
		});
		expect(await t.mutation(internal.projectSeries.sweep, {})).toEqual({
			dispatched: 0,
		});
		await t.mutation(internal.projectSeries.generate, {
			orgId: setup.orgId,
			seriesId,
		});
		const exhausted = await t.run(async (ctx) => ctx.db.get(seriesId));
		expect(exhausted?.nextGenerationAt).toBeUndefined();
	});

	it("organization cascade drains series and occurrence rows", async () => {
		const setup = await setupOrigin();
		const asUser = t.withIdentity(
			createTestIdentity(setup.clerkUserId, setup.clerkOrgId)
		);
		await asUser.mutation(api.projectSeries.enroll, {
			projectId: setup.projectId,
			rule: daily(3),
		});
		await t.run(async (ctx) => ctx.db.delete(setup.orgId));
		await t.mutation(internal.orgCascade.cascadeDeleteOrgDataChunk, {
			orgId: setup.orgId,
		});
		const remaining = await t.run(async (ctx) => ({
			series: (
				await ctx.db
					.query("projectSeries")
					.withIndex("by_org", (q) => q.eq("orgId", setup.orgId))
					.collect()
			).length,
			occurrences: (
				await ctx.db
					.query("projectOccurrences")
					.withIndex("by_org", (q) => q.eq("orgId", setup.orgId))
					.collect()
			).length,
		}));
		expect(remaining).toEqual({ series: 0, occurrences: 0 });
	});
});
