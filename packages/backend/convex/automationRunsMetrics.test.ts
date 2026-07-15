import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setupConvexTest } from "./test.setup";
import { createTestOrg, createTestIdentity } from "./test.helpers";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";

/**
 * Slice 5 (Part 1) coverage:
 * - active-execution latency (pausedMs accumulation across delay + resume)
 * - per-node startedAt/completedAt timing (production + dry)
 * - listRuns / getRunMetrics / getRunThroughput / getRecentFailures
 * - org isolation on the new queries
 * - automation_failed notifications (prod fires, test/dry does not, dedupe)
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const clientCreatedTrigger = {
	type: "record_created" as const,
	objectType: "client" as const,
};

function notesActionNode(id: string, value: string, nextNodeId?: string) {
	return {
		id,
		type: "action" as const,
		config: {
			kind: "action" as const,
			action: {
				type: "update_field" as const,
				target: "self" as const,
				field: "notes",
				value: { kind: "static" as const, value },
			},
		},
		nextNodeId,
	};
}

/**
 * update_field on `status` sourcing its value from a VAR (companyName) — this
 * bypasses save-time static-select validation but resolves to an invalid status
 * at runtime, so the node fails deterministically in BOTH production and dry.
 */
function failingStatusNode(id: string) {
	return {
		id,
		type: "action" as const,
		config: {
			kind: "action" as const,
			action: {
				type: "update_field" as const,
				target: "self" as const,
				field: "status",
				value: { kind: "var" as const, path: "trigger.record.companyName" },
			},
		},
	};
}

function delayNode(
	id: string,
	amount: number,
	unit: "minutes" | "hours" | "days",
	nextNodeId?: string
) {
	return {
		id,
		type: "delay" as const,
		config: { kind: "delay" as const, amount, unit },
		nextNodeId,
	};
}

describe("automation runs & latency (Slice 5)", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	async function setupUser(overrides?: {
		clerkUserId?: string;
		clerkOrgId?: string;
	}) {
		const setup = await t.run(async (ctx) => createTestOrg(ctx, overrides));
		const asUser = t.withIdentity(
			createTestIdentity(setup.clerkUserId, setup.clerkOrgId)
		);
		return { ...setup, asUser };
	}

	async function makeClient(
		asUser: ReturnType<typeof t.withIdentity>,
		companyName = "Acme Co"
	): Promise<Id<"clients">> {
		return await asUser.mutation(api.clients.create, {
			portalAccessId: crypto.randomUUID(),
			companyName,
			status: "lead",
		});
	}

	/** Insert a workflowExecutions row directly (query tests don't need the engine). */
	async function seedRun(
		fields: {
			orgId: Id<"organizations">;
			automationId: Id<"workflowAutomations">;
			triggeredAt: number;
			status: Doc<"workflowExecutions">["status"];
			completedAt?: number;
			pausedMs?: number;
			mode?: "production" | "test";
			nodesExecuted?: Doc<"workflowExecutions">["nodesExecuted"];
			error?: string;
			loopSummary?: Doc<"workflowExecutions">["loopSummary"];
		}
	): Promise<Id<"workflowExecutions">> {
		return await t.run(async (ctx) =>
			ctx.db.insert("workflowExecutions", {
				orgId: fields.orgId,
				automationId: fields.automationId,
				triggeredBy: "test",
				triggeredAt: fields.triggeredAt,
				status: fields.status,
				completedAt: fields.completedAt,
				pausedMs: fields.pausedMs,
				mode: fields.mode,
				error: fields.error,
				nodesExecuted: fields.nodesExecuted ?? [],
				loopSummary: fields.loopSummary,
			})
		);
	}

	// -------------------------------------------------------------------
	// 1. Active-execution latency: pausedMs excludes parked delay time
	// -------------------------------------------------------------------

	describe("pausedMs (active-execution latency)", () => {
		it("accumulates parked time across two sequential delays; activeMs excludes it", async () => {
			const t0 = 1_700_000_000_000;
			vi.setSystemTime(t0);

			const { orgId, asUser } = await setupUser();
			const clientId = await makeClient(asUser);

			const automationId = await asUser.mutation(api.automations.create, {
				name: "Two delays",
				trigger: clientCreatedTrigger,
				nodes: [
					notesActionNode("act-1", "start", "delay-1"),
					delayNode("delay-1", 1, "hours", "act-2"),
					notesActionNode("act-2", "middle", "delay-2"),
					delayNode("delay-2", 1, "hours", "act-3"),
					notesActionNode("act-3", "end"),
				],
			});

			const executionId = await t.run(async (ctx) =>
				ctx.db.insert("workflowExecutions", {
					orgId,
					automationId,
					triggeredBy: clientId,
					triggeredAt: t0,
					status: "running",
					nodesExecuted: [],
					executionChain: [automationId],
					recursionDepth: 0,
				})
			);

			// Runs act-1, parks at delay-1 (checkpointAt = t0).
			await t.mutation(internal.automationExecutor.executeAutomation, {
				orgId,
				executionId,
				automationId,
				objectType: "client",
				objectId: clientId,
				executionChain: [automationId],
				recursionDepth: 1,
			});

			let exec = await t.run(async (ctx) => ctx.db.get(executionId));
			expect(exec?.status).toBe("running");
			expect(exec?.resumeState?.checkpointAt).toBe(t0);
			expect(exec?.pausedMs).toBeUndefined();

			// One hour parked, then resume → parks again at delay-2.
			vi.setSystemTime(t0 + 60 * 60 * 1000);
			await t.mutation(internal.automationExecutor.resumeExecution, {
				orgId,
				executionId,
				automationId,
			});

			exec = await t.run(async (ctx) => ctx.db.get(executionId));
			expect(exec?.status).toBe("running");
			expect(exec?.pausedMs).toBe(60 * 60 * 1000); // first hour
			expect(exec?.resumeState?.checkpointAt).toBe(t0 + 60 * 60 * 1000);

			// Second hour parked, then resume → runs act-3, completes.
			vi.setSystemTime(t0 + 2 * 60 * 60 * 1000);
			await t.mutation(internal.automationExecutor.resumeExecution, {
				orgId,
				executionId,
				automationId,
			});

			exec = await t.run(async (ctx) => ctx.db.get(executionId));
			expect(exec?.status).toBe("completed");
			expect(exec?.pausedMs).toBe(2 * 60 * 60 * 1000); // both hours
			expect(exec?.completedAt).toBe(t0 + 2 * 60 * 60 * 1000);

			// Derived: wallMs = 2h, activeMs = wall - paused ≈ 0 (work was instant).
			const wallMs = exec!.completedAt! - exec!.triggeredAt;
			const activeMs = wallMs - (exec!.pausedMs ?? 0);
			expect(wallMs).toBe(2 * 60 * 60 * 1000);
			expect(activeMs).toBe(0);
		});
	});

	// -------------------------------------------------------------------
	// 2. Per-node timing populated
	// -------------------------------------------------------------------

	describe("per-node startedAt/completedAt", () => {
		it("stamps each production node entry", async () => {
			const t0 = 1_700_000_100_000;
			vi.setSystemTime(t0);

			const { orgId, asUser } = await setupUser();
			const clientId = await makeClient(asUser);

			const automationId = await asUser.mutation(api.automations.create, {
				name: "Two steps",
				trigger: clientCreatedTrigger,
				nodes: [
					notesActionNode("act-1", "one", "act-2"),
					notesActionNode("act-2", "two"),
				],
			});

			const executionId = await t.run(async (ctx) =>
				ctx.db.insert("workflowExecutions", {
					orgId,
					automationId,
					triggeredBy: clientId,
					triggeredAt: t0,
					status: "running",
					nodesExecuted: [],
					executionChain: [automationId],
					recursionDepth: 0,
				})
			);

			await t.mutation(internal.automationExecutor.executeAutomation, {
				orgId,
				executionId,
				automationId,
				objectType: "client",
				objectId: clientId,
				executionChain: [automationId],
				recursionDepth: 1,
			});

			const exec = await t.run(async (ctx) => ctx.db.get(executionId));
			expect(exec?.status).toBe("completed");
			expect(exec?.nodesExecuted).toHaveLength(2);
			for (const entry of exec!.nodesExecuted) {
				expect(typeof entry.startedAt).toBe("number");
				expect(typeof entry.completedAt).toBe("number");
				expect(entry.completedAt!).toBeGreaterThanOrEqual(entry.startedAt!);
			}
		});

		it("stamps each dry (test-run) node entry", async () => {
			const { asUser } = await setupUser();
			const clientId = await makeClient(asUser);

			const automationId = await asUser.mutation(api.automations.create, {
				name: "Dry timing",
				trigger: clientCreatedTrigger,
				nodes: [notesActionNode("act-1", "x")],
			});

			const executionId = await asUser.mutation(
				api.automationExecutor.startTestRun,
				{ automationId, record: { entityType: "client", entityId: clientId } }
			);
			await t.finishAllScheduledFunctions(vi.runAllTimers);

			const exec = await asUser.query(api.automationExecutor.getExecution, {
				executionId,
			});
			expect(exec?.status).toBe("completed");
			expect(exec?.nodesExecuted).toHaveLength(1);
			expect(typeof exec?.nodesExecuted[0].startedAt).toBe("number");
			expect(typeof exec?.nodesExecuted[0].completedAt).toBe("number");
		});
	});

	// -------------------------------------------------------------------
	// 3. listRuns
	// -------------------------------------------------------------------

	describe("listRuns", () => {
		it("paginates newest-first and joins the automation name + durations", async () => {
			const { orgId, asUser } = await setupUser();
			const automationId = await asUser.mutation(api.automations.create, {
				name: "Runner",
				trigger: clientCreatedTrigger,
				nodes: [notesActionNode("act-1", "x")],
			});

			const base = 1_700_000_000_000;
			for (let i = 0; i < 5; i++) {
				await seedRun({
					orgId,
					automationId,
					triggeredAt: base + i * 1000,
					status: "completed",
					completedAt: base + i * 1000 + 500,
					pausedMs: 100,
				});
			}

			const first = await asUser.query(api.automations.listRuns, {
				paginationOpts: { numItems: 2, cursor: null },
			});
			expect(first.page).toHaveLength(2);
			expect(first.isDone).toBe(false);
			// Newest first.
			expect(first.page[0].triggeredAt).toBeGreaterThan(
				first.page[1].triggeredAt
			);
			// Joined name + derived durations.
			expect(first.page[0].automationName).toBe("Runner");
			expect(first.page[0].wallMs).toBe(500);
			expect(first.page[0].activeMs).toBe(400); // 500 - 100 paused

			const second = await asUser.query(api.automations.listRuns, {
				paginationOpts: { numItems: 2, cursor: first.continueCursor },
			});
			expect(second.page).toHaveLength(2);
			expect(second.page[0].triggeredAt).toBeLessThan(
				first.page[1].triggeredAt
			);
		});

		it("filters by status", async () => {
			const { orgId, asUser } = await setupUser();
			const automationId = await asUser.mutation(api.automations.create, {
				name: "Mixed",
				trigger: clientCreatedTrigger,
				nodes: [notesActionNode("act-1", "x")],
			});
			const base = 1_700_000_000_000;
			await seedRun({ orgId, automationId, triggeredAt: base, status: "completed", completedAt: base });
			await seedRun({ orgId, automationId, triggeredAt: base + 1, status: "failed", completedAt: base + 1 });
			await seedRun({ orgId, automationId, triggeredAt: base + 2, status: "failed", completedAt: base + 2 });
			await seedRun({ orgId, automationId, triggeredAt: base + 3, status: "skipped", completedAt: base + 3 });

			const failed = await asUser.query(api.automations.listRuns, {
				status: "failed",
				paginationOpts: { numItems: 10, cursor: null },
			});
			expect(failed.page).toHaveLength(2);
			expect(failed.page.every((r) => r.status === "failed")).toBe(true);
		});

		it("filters by automationId", async () => {
			const { orgId, asUser } = await setupUser();
			const autoA = await asUser.mutation(api.automations.create, {
				name: "A",
				trigger: clientCreatedTrigger,
				nodes: [notesActionNode("act-1", "x")],
			});
			const autoB = await asUser.mutation(api.automations.create, {
				name: "B",
				trigger: clientCreatedTrigger,
				nodes: [notesActionNode("act-1", "x")],
			});
			const base = 1_700_000_000_000;
			await seedRun({ orgId, automationId: autoA, triggeredAt: base, status: "completed", completedAt: base });
			await seedRun({ orgId, automationId: autoB, triggeredAt: base + 1, status: "completed", completedAt: base + 1 });
			await seedRun({ orgId, automationId: autoB, triggeredAt: base + 2, status: "completed", completedAt: base + 2 });

			const onlyA = await asUser.query(api.automations.listRuns, {
				automationId: autoA,
				paginationOpts: { numItems: 10, cursor: null },
			});
			expect(onlyA.page).toHaveLength(1);
			expect(onlyA.page[0].automationId).toBe(autoA);
			expect(onlyA.page[0].automationName).toBe("A");
		});

		it("is org-isolated (cross-org runs never leak)", async () => {
			const orgA = await setupUser({
				clerkUserId: "user_A",
				clerkOrgId: "org_A",
			});
			const orgB = await setupUser({
				clerkUserId: "user_B",
				clerkOrgId: "org_B",
			});

			const autoB = await orgB.asUser.mutation(api.automations.create, {
				name: "B-only",
				trigger: clientCreatedTrigger,
				nodes: [notesActionNode("act-1", "x")],
			});
			const base = 1_700_000_000_000;
			await seedRun({ orgId: orgB.orgId, automationId: autoB, triggeredAt: base, status: "completed", completedAt: base });

			const asA = await orgA.asUser.query(api.automations.listRuns, {
				paginationOpts: { numItems: 10, cursor: null },
			});
			expect(asA.page).toHaveLength(0);

			const asB = await orgB.asUser.query(api.automations.listRuns, {
				paginationOpts: { numItems: 10, cursor: null },
			});
			expect(asB.page).toHaveLength(1);
		});
	});

	// -------------------------------------------------------------------
	// 4. getRunMetrics + getRunThroughput
	// -------------------------------------------------------------------

	describe("getRunMetrics", () => {
		it("computes counts, successRate, latency percentiles, active count", async () => {
			const now = 1_700_000_500_000;
			vi.setSystemTime(now);

			const { orgId, asUser } = await setupUser();
			const activeAuto = await asUser.mutation(api.automations.create, {
				name: "Active",
				trigger: clientCreatedTrigger,
				nodes: [notesActionNode("act-1", "x")],
			});
			await asUser.mutation(api.automations.create, {
				name: "Draft",
				trigger: clientCreatedTrigger,
				nodes: [notesActionNode("act-1", "x")],
			});
			// Make one automation active for activeAutomationCount.
			await t.run(async (ctx) =>
				ctx.db.patch(activeAuto, { status: "active" })
			);

			const b = now - 60_000;
			// Three completed with activeMs 100 / 200 / 300.
			await seedRun({ orgId, automationId: activeAuto, triggeredAt: b, status: "completed", completedAt: b + 100, pausedMs: 0 });
			await seedRun({ orgId, automationId: activeAuto, triggeredAt: b, status: "completed", completedAt: b + 250, pausedMs: 50 });
			await seedRun({ orgId, automationId: activeAuto, triggeredAt: b, status: "completed", completedAt: b + 300, pausedMs: 0 });
			await seedRun({ orgId, automationId: activeAuto, triggeredAt: b, status: "failed", completedAt: b + 10 });
			await seedRun({ orgId, automationId: activeAuto, triggeredAt: b, status: "skipped", completedAt: b });
			await seedRun({ orgId, automationId: activeAuto, triggeredAt: b, status: "running" });
			// Test-mode run must be excluded from every metric.
			await seedRun({ orgId, automationId: activeAuto, triggeredAt: b, status: "completed", completedAt: b + 99999, mode: "test" });

			const m = await asUser.query(api.automations.getRunMetrics, {});
			expect(m.totalRuns).toBe(6); // 3 completed + 1 failed + 1 skipped + 1 running
			expect(m.successCount).toBe(3);
			expect(m.failedCount).toBe(1);
			expect(m.skippedCount).toBe(1);
			expect(m.successRate).toBeCloseTo(0.75); // 3 / (3 + 1)
			expect(m.avgActiveMs).toBe(200); // (100+200+300)/3
			expect(m.p50ActiveMs).toBe(200);
			expect(m.p95ActiveMs).toBe(300);
			expect(m.activeAutomationCount).toBe(1);
		});

		it("successRate is 0 when there are no decided runs", async () => {
			const now = 1_700_000_500_000;
			vi.setSystemTime(now);
			const { orgId, asUser } = await setupUser();
			const auto = await asUser.mutation(api.automations.create, {
				name: "Only skipped",
				trigger: clientCreatedTrigger,
				nodes: [notesActionNode("act-1", "x")],
			});
			await seedRun({ orgId, automationId: auto, triggeredAt: now - 1000, status: "skipped", completedAt: now - 1000 });

			const m = await asUser.query(api.automations.getRunMetrics, {});
			expect(m.successRate).toBe(0);
			expect(m.avgActiveMs).toBe(0);
			expect(m.p50ActiveMs).toBe(0);
		});

		it("counts completed_with_errors in withErrorsCount, excludes it from successCount, and it lowers successRate", async () => {
			const now = 1_700_000_500_000;
			vi.setSystemTime(now);
			const { orgId, asUser } = await setupUser();
			const auto = await asUser.mutation(api.automations.create, {
				name: "Partial",
				trigger: clientCreatedTrigger,
				nodes: [notesActionNode("act-1", "x")],
			});

			const b = now - 60_000;
			await seedRun({ orgId, automationId: auto, triggeredAt: b, status: "completed", completedAt: b + 100 });
			await seedRun({
				orgId,
				automationId: auto,
				triggeredAt: b,
				status: "completed_with_errors",
				completedAt: b + 200,
				loopSummary: [
					{ nodeId: "loop-1", total: 5, succeeded: 3, failed: 2, skipped: 0, errors: [] },
				],
			});

			const m = await asUser.query(api.automations.getRunMetrics, {});
			expect(m.totalRuns).toBe(2);
			expect(m.successCount).toBe(1);
			expect(m.withErrorsCount).toBe(1);
			expect(m.failedCount).toBe(0);
			// successRate = successCount / (successCount + failedCount + withErrorsCount) = 1/2.
			expect(m.successRate).toBeCloseTo(0.5);
			// completed_with_errors runs DID complete — their latency joins the same distribution.
			expect(m.avgActiveMs).toBe(150); // (100 + 200) / 2
		});
	});

	describe("getRunThroughput", () => {
		it("buckets by UTC day, includes zero-count days, excludes test runs", async () => {
			const now = Date.UTC(2026, 6, 4, 12, 0, 0); // 2026-07-04T12:00Z
			vi.setSystemTime(now);
			const todayMidnight = Date.UTC(2026, 6, 4);

			const { orgId, asUser } = await setupUser();
			const auto = await asUser.mutation(api.automations.create, {
				name: "Throughput",
				trigger: clientCreatedTrigger,
				nodes: [notesActionNode("act-1", "x")],
			});

			// Window = 3 days → buckets [07-02, 07-03, 07-04].
			await seedRun({ orgId, automationId: auto, triggeredAt: todayMidnight - 2 * DAY_MS + 3600_000, status: "failed", completedAt: todayMidnight });
			await seedRun({ orgId, automationId: auto, triggeredAt: todayMidnight + 3600_000, status: "completed", completedAt: todayMidnight });
			await seedRun({ orgId, automationId: auto, triggeredAt: todayMidnight + 7200_000, status: "skipped", completedAt: todayMidnight });
			// Test run on today — excluded.
			await seedRun({ orgId, automationId: auto, triggeredAt: todayMidnight + 3600_000, status: "completed", completedAt: todayMidnight, mode: "test" });

			const buckets = await asUser.query(api.automations.getRunThroughput, {
				windowDays: 3,
			});
			expect(buckets).toHaveLength(3);
			expect(buckets[0].day).toBe(todayMidnight - 2 * DAY_MS);
			expect(buckets[2].day).toBe(todayMidnight);
			// 07-02: one failed.
			expect(buckets[0]).toMatchObject({ success: 0, failed: 1 });
			// 07-03: empty (zero-count day present).
			expect(buckets[1]).toMatchObject({ success: 0, failed: 0 });
			// 07-04: one success; the skipped run (and the test run) is excluded —
			// the chart tracks executed runs only.
			expect(buckets[2]).toMatchObject({ success: 1, failed: 0 });
			expect(buckets[2]).not.toHaveProperty("skipped");
		});

		it("buckets a completed_with_errors run into withErrors and nowhere else", async () => {
			const now = Date.UTC(2026, 6, 4, 12, 0, 0); // 2026-07-04T12:00Z
			vi.setSystemTime(now);
			const todayMidnight = Date.UTC(2026, 6, 4);

			const { orgId, asUser } = await setupUser();
			const auto = await asUser.mutation(api.automations.create, {
				name: "Throughput partial",
				trigger: clientCreatedTrigger,
				nodes: [notesActionNode("act-1", "x")],
			});

			await seedRun({
				orgId,
				automationId: auto,
				triggeredAt: todayMidnight + 3600_000,
				status: "completed_with_errors",
				completedAt: todayMidnight + 3700_000,
				loopSummary: [
					{ nodeId: "loop-1", total: 3, succeeded: 2, failed: 1, skipped: 0, errors: [] },
				],
			});

			const buckets = await asUser.query(api.automations.getRunThroughput, {
				windowDays: 1,
			});
			expect(buckets).toHaveLength(1);
			expect(buckets[0]).toMatchObject({
				success: 0,
				failed: 0,
				withErrors: 1,
			});
		});
	});

	// -------------------------------------------------------------------
	// 5. getRecentFailures
	// -------------------------------------------------------------------

	describe("getRecentFailures", () => {
		it("returns only production failures, newest first, with failedNodeId", async () => {
			const { orgId, asUser } = await setupUser();
			const auto = await asUser.mutation(api.automations.create, {
				name: "Failer",
				trigger: clientCreatedTrigger,
				nodes: [notesActionNode("act-1", "x")],
			});
			const base = 1_700_000_000_000;

			await seedRun({
				orgId,
				automationId: auto,
				triggeredAt: base,
				status: "failed",
				completedAt: base + 5,
				error: "first boom",
				nodesExecuted: [
					{ nodeId: "n1", result: "success" },
					{ nodeId: "n2", result: "failed", error: "boom" },
				],
			});
			await seedRun({
				orgId,
				automationId: auto,
				triggeredAt: base + 10,
				status: "failed",
				completedAt: base + 15,
				error: "second boom",
				nodesExecuted: [{ nodeId: "only", result: "failed", error: "x" }],
			});
			// Excluded: a test-mode failure and a completed run.
			await seedRun({ orgId, automationId: auto, triggeredAt: base + 20, status: "failed", completedAt: base + 21, mode: "test" });
			await seedRun({ orgId, automationId: auto, triggeredAt: base + 30, status: "completed", completedAt: base + 31 });

			const failures = await asUser.query(api.automations.getRecentFailures, {});
			expect(failures).toHaveLength(2);
			// Newest first.
			expect(failures[0].triggeredAt).toBe(base + 10);
			expect(failures[0].failedNodeId).toBe("only");
			expect(failures[0].error).toBe("second boom");
			expect(failures[1].failedNodeId).toBe("n2");
			expect(failures[1].automationName).toBe("Failer");
		});

		it("is org-isolated", async () => {
			const orgA = await setupUser({ clerkUserId: "u_A", clerkOrgId: "o_A" });
			const orgB = await setupUser({ clerkUserId: "u_B", clerkOrgId: "o_B" });
			const autoB = await orgB.asUser.mutation(api.automations.create, {
				name: "B",
				trigger: clientCreatedTrigger,
				nodes: [notesActionNode("act-1", "x")],
			});
			await seedRun({ orgId: orgB.orgId, automationId: autoB, triggeredAt: 1_700_000_000_000, status: "failed", completedAt: 1_700_000_000_001, error: "b" });

			const asA = await orgA.asUser.query(api.automations.getRecentFailures, {});
			expect(asA).toHaveLength(0);
		});

		it("includes completed_with_errors runs alongside failed runs, newest first, tagged with status", async () => {
			const { orgId, asUser } = await setupUser();
			const auto = await asUser.mutation(api.automations.create, {
				name: "Mixed failures",
				trigger: clientCreatedTrigger,
				nodes: [notesActionNode("act-1", "x")],
			});
			const base = 1_700_000_000_000;

			await seedRun({
				orgId,
				automationId: auto,
				triggeredAt: base,
				status: "failed",
				completedAt: base + 5,
				error: "boom",
				nodesExecuted: [{ nodeId: "n1", result: "failed", error: "boom" }],
			});
			await seedRun({
				orgId,
				automationId: auto,
				triggeredAt: base + 10,
				status: "completed_with_errors",
				completedAt: base + 15,
				loopSummary: [
					{ nodeId: "loop-1", total: 4, succeeded: 2, failed: 2, skipped: 0, errors: [] },
				],
			});

			const failures = await asUser.query(api.automations.getRecentFailures, {});
			expect(failures).toHaveLength(2);
			// Newest first.
			expect(failures[0].status).toBe("completed_with_errors");
			expect(failures[0].error).toBe("2 of 4 items failed");
			expect(failures[1].status).toBe("failed");
			expect(failures[1].error).toBe("boom");
		});
	});

	// -------------------------------------------------------------------
	// 6. automation_failed notifications
	// -------------------------------------------------------------------

	describe("automation_failed notifications", () => {
		async function failingAutomation(
			asUser: ReturnType<typeof t.withIdentity>
		): Promise<Id<"workflowAutomations">> {
			return await asUser.mutation(api.automations.create, {
				name: "Will fail",
				trigger: clientCreatedTrigger,
				nodes: [failingStatusNode("bad-1")],
			});
		}

		async function runProdFailure(
			orgId: Id<"organizations">,
			automationId: Id<"workflowAutomations">,
			clientId: Id<"clients">
		) {
			const executionId = await t.run(async (ctx) =>
				ctx.db.insert("workflowExecutions", {
					orgId,
					automationId,
					triggeredBy: clientId,
					triggeredAt: Date.now(),
					status: "running",
					nodesExecuted: [],
					executionChain: [automationId],
					recursionDepth: 0,
				})
			);
			await t.mutation(internal.automationExecutor.executeAutomation, {
				orgId,
				executionId,
				automationId,
				objectType: "client",
				objectId: clientId,
				executionChain: [automationId],
				recursionDepth: 1,
			});
			return executionId;
		}

		async function failureNotifications(
			orgId: Id<"organizations">,
			userId: Id<"users">
		) {
			return await t.run(async (ctx) =>
				ctx.db
					.query("notifications")
					.withIndex("by_user_read", (q) => q.eq("userId", userId))
					.filter((q) =>
						q.eq(q.field("notificationType"), "automation_failed")
					)
					.collect()
			);
		}

		it("fires an in-app admin alert on a production failure", async () => {
			vi.setSystemTime(1_700_000_000_000);
			const { orgId, userId, asUser } = await setupUser();
			const clientId = await makeClient(asUser);
			const automationId = await failingAutomation(asUser);

			const executionId = await runProdFailure(orgId, automationId, clientId);

			const exec = await t.run(async (ctx) => ctx.db.get(executionId));
			expect(exec?.status).toBe("failed");

			const notes = await failureNotifications(orgId, userId);
			expect(notes).toHaveLength(1);
			expect(notes[0].title).toBe("Will fail");
			expect(notes[0].actionUrl).toBe("/automations");
			expect(notes[0].entityId).toBe(automationId);
			expect(notes[0].isRead).toBe(false);
		});

		it("does NOT fire on a test/dry-run failure", async () => {
			const { orgId, userId, asUser } = await setupUser();
			const clientId = await makeClient(asUser);
			const automationId = await failingAutomation(asUser);

			const executionId = await asUser.mutation(
				api.automationExecutor.startTestRun,
				{ automationId, record: { entityType: "client", entityId: clientId } }
			);
			await t.finishAllScheduledFunctions(vi.runAllTimers);

			const exec = await asUser.query(api.automationExecutor.getExecution, {
				executionId,
			});
			expect(exec?.status).toBe("failed"); // the dry run did fail

			const notes = await failureNotifications(orgId, userId);
			expect(notes).toHaveLength(0);
		});

		it("dedupes: a second failure while the first is unread does not add a notification", async () => {
			vi.setSystemTime(1_700_000_000_000);
			const { orgId, userId, asUser } = await setupUser();
			const clientId = await makeClient(asUser);
			const automationId = await failingAutomation(asUser);

			await runProdFailure(orgId, automationId, clientId);
			expect(await failureNotifications(orgId, userId)).toHaveLength(1);

			// Second failure a few minutes later, first still unread → suppressed.
			vi.setSystemTime(1_700_000_000_000 + 5 * 60 * 1000);
			await runProdFailure(orgId, automationId, clientId);
			expect(await failureNotifications(orgId, userId)).toHaveLength(1);
		});
	});
});
