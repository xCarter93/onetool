import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setupConvexTest } from "./test.setup";
import { createTestOrg, createTestIdentity } from "./test.helpers";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

/**
 * Slice 4 coverage: dry-run test mode (precompute + streamed reveal), manual
 * run (production, published snapshot), and the supporting queries/watchdog.
 */

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

function statusActionNode(id: string, value: string, nextNodeId?: string) {
	return {
		id,
		type: "action" as const,
		config: {
			kind: "action" as const,
			action: {
				type: "update_field" as const,
				target: "self" as const,
				field: "status",
				value: { kind: "static" as const, value },
			},
		},
		nextNodeId,
	};
}

function createTaskNode(id: string, title: string, nextNodeId?: string) {
	return {
		id,
		type: "action" as const,
		config: {
			kind: "action" as const,
			action: {
				type: "create_task" as const,
				title: { kind: "static" as const, value: title },
			},
		},
		nextNodeId,
	};
}

function conditionNode(
	id: string,
	field: string,
	operator: string,
	value: string,
	opts: { nextNodeId?: string; elseNodeId?: string; mergeNodeId?: string } = {}
) {
	return {
		id,
		type: "condition" as const,
		config: {
			kind: "condition" as const,
			logic: "and" as const,
			groups: [
				{
					logic: "and" as const,
					rules: [
						{
							field,
							// eslint-disable-next-line @typescript-eslint/no-explicit-any
							operator: operator as any,
							value: { kind: "static" as const, value },
						},
					],
				},
			],
		},
		nextNodeId: opts.nextNodeId,
		elseNodeId: opts.elseNodeId,
		mergeNodeId: opts.mergeNodeId,
	};
}

function fetchNode(
	id: string,
	objectType: "client" | "project" | "quote" | "invoice" | "task",
	opts: { nextNodeId?: string } = {}
) {
	return {
		id,
		type: "fetch_records" as const,
		config: {
			kind: "fetch_records" as const,
			objectType,
			filters: [],
		},
		nextNodeId: opts.nextNodeId,
	};
}

function loopNode(
	id: string,
	sourceNodeId: string,
	opts: { bodyStartNodeId?: string; nextNodeId?: string } = {}
) {
	return {
		id,
		type: "loop" as const,
		config: { kind: "loop" as const, sourceNodeId },
		bodyStartNodeId: opts.bodyStartNodeId,
		nextNodeId: opts.nextNodeId,
	};
}

function delayNode(
	id: string,
	amount: number,
	unit: "minutes" | "hours" | "days",
	opts: { nextNodeId?: string } = {}
) {
	return {
		id,
		type: "delay" as const,
		config: { kind: "delay" as const, amount, unit },
		nextNodeId: opts.nextNodeId,
	};
}

function endNode(id: string) {
	return { id, type: "end" as const, config: { kind: "end" as const } };
}

const clientCreatedTrigger = {
	type: "record_created" as const,
	objectType: "client" as const,
};

describe("automation runs (test + manual)", () => {
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

	async function drainScheduled() {
		await t.finishAllScheduledFunctions(vi.runAllTimers);
	}

	// ------------------------------------------------------------------
	// Dry-run test mode
	// ------------------------------------------------------------------

	describe("startTestRun (dry run)", () => {
		it("streams to completion without writing anything", async () => {
			const { asUser } = await setupUser();
			const clientId = await makeClient(asUser);

			const automationId = await asUser.mutation(api.automations.create, {
				name: "Set notes",
				trigger: clientCreatedTrigger,
				nodes: [statusActionNode("act-1", "inactive")],
			});

			const executionId = await asUser.mutation(
				api.automationExecutor.startTestRun,
				{ automationId, record: { entityType: "client", entityId: clientId } }
			);

			// Before the reveal chain runs: first node pending, nothing revealed.
			const initial = await asUser.query(api.automationExecutor.getExecution, {
				executionId,
			});
			expect(initial?.mode).toBe("test");
			expect(initial?.dryRun).toBe(true);
			expect(initial?.status).toBe("running");
			expect(initial?.currentNodeId).toBe("act-1");
			expect(initial?.nodesExecuted).toHaveLength(0);
			expect(initial?.triggerRecord?.entityId).toBe(clientId);

			await drainScheduled();

			const done = await asUser.query(api.automationExecutor.getExecution, {
				executionId,
			});
			expect(done?.status).toBe("completed");
			expect(done?.currentNodeId).toBeUndefined();
			expect(done?.testCursor).toBeUndefined();
			expect(done?.nodesExecuted.map((n) => n.nodeId)).toEqual(["act-1"]);
			expect(done?.nodesExecuted[0].result).toBe("success");

			// Dry run must not have touched the client.
			const client = await t.run(async (ctx) => ctx.db.get(clientId));
			expect(client?.status).toBe("lead");
		});

		// The dry-run walk duplicates the production walk, so merge routing has
		// to be asserted on both sides or the two silently drift.
		it("routes a dangling branch tail into the merge chain, same as production", async () => {
			const { asUser } = await setupUser();
			const clientId = await makeClient(asUser);

			const automationId = await asUser.mutation(api.automations.create, {
				name: "Dry-run merge convergence",
				trigger: clientCreatedTrigger,
				nodes: [
					// True branch dangles into the merge; the false branch has no
					// elseNodeId, so it converges straight onto it.
					conditionNode("cond-1", "companyName", "contains", "Acme", {
						nextNodeId: "act-true",
						mergeNodeId: "merge-1",
					}),
					notesActionNode("act-true", "branch ran"),
					statusActionNode("merge-1", "inactive"),
				],
			});

			const executionId = await asUser.mutation(
				api.automationExecutor.startTestRun,
				{ automationId, record: { entityType: "client", entityId: clientId } }
			);
			await drainScheduled();

			const done = await asUser.query(api.automationExecutor.getExecution, {
				executionId,
			});
			expect(done?.status).toBe("completed");
			expect(done?.nodesExecuted.map((n) => n.nodeId)).toEqual([
				"cond-1",
				"act-true",
				"merge-1",
			]);

			// Still a dry run: nothing written.
			const client = await t.run(async (ctx) => ctx.db.get(clientId));
			expect(client?.status).toBe("lead");
			expect(client?.notes).toBeUndefined();
		});

		it("simulates create_task without creating a task", async () => {
			const { asUser, orgId } = await setupUser();
			const clientId = await makeClient(asUser);

			const automationId = await asUser.mutation(api.automations.create, {
				name: "Make a task",
				trigger: clientCreatedTrigger,
				nodes: [createTaskNode("task-1", "Follow up")],
			});

			const executionId = await asUser.mutation(
				api.automationExecutor.startTestRun,
				{ automationId, record: { entityType: "client", entityId: clientId } }
			);
			await drainScheduled();

			const done = await asUser.query(api.automationExecutor.getExecution, {
				executionId,
			});
			expect(done?.status).toBe("completed");
			expect(done?.nodesExecuted[0].result).toBe("success");
			expect(
				(done?.nodesExecuted[0].output as { summary?: string })?.summary
			).toContain("Follow up");

			const tasks = await t.run(async (ctx) =>
				ctx.db
					.query("tasks")
					.withIndex("by_org", (q) => q.eq("orgId", orgId))
					.collect()
			);
			expect(tasks).toHaveLength(0);
		});

		it("previews update_fields without writing and lists every field (B2)", async () => {
			const { asUser } = await setupUser();
			const clientId = await makeClient(asUser);

			const automationId = await asUser.mutation(api.automations.create, {
				name: "Multi-field preview",
				trigger: clientCreatedTrigger,
				nodes: [
					{
						id: "act-1",
						type: "action" as const,
						config: {
							kind: "action" as const,
							action: {
								type: "update_fields" as const,
								target: "self" as const,
								fields: [
									{
										field: "notes",
										value: { kind: "static" as const, value: "hello" },
									},
									{
										field: "companyDescription",
										value: { kind: "static" as const, value: "desc" },
									},
								],
							},
						},
					},
				],
			});

			const executionId = await asUser.mutation(
				api.automationExecutor.startTestRun,
				{ automationId, record: { entityType: "client", entityId: clientId } }
			);
			await drainScheduled();

			const done = await asUser.query(api.automationExecutor.getExecution, {
				executionId,
			});
			expect(done?.status).toBe("completed");
			expect(done?.nodesExecuted[0].result).toBe("success");
			expect(
				(done?.nodesExecuted[0].output as { summary?: string })?.summary
			).toBe(
				'Would set notes to "hello", companyDescription to "desc" on the client'
			);

			const client = await t.run(async (ctx) => ctx.db.get(clientId));
			expect(client?.notes).toBeUndefined();
			expect(client?.companyDescription).toBeUndefined();
		});

		it("reveals only the taken branch of a condition", async () => {
			const { asUser } = await setupUser();
			const clientId = await makeClient(asUser, "Globex");

			const automationId = await asUser.mutation(api.automations.create, {
				name: "Branchy",
				trigger: clientCreatedTrigger,
				nodes: [
					conditionNode("cond-1", "companyName", "equals", "Nope", {
						nextNodeId: "yes-act",
						elseNodeId: "no-act",
					}),
					notesActionNode("yes-act", "yes"),
					notesActionNode("no-act", "no"),
				],
			});

			const executionId = await asUser.mutation(
				api.automationExecutor.startTestRun,
				{ automationId, record: { entityType: "client", entityId: clientId } }
			);
			await drainScheduled();

			const done = await asUser.query(api.automationExecutor.getExecution, {
				executionId,
			});
			expect(done?.status).toBe("completed");
			const nodeIds = done?.nodesExecuted.map((n) => n.nodeId) ?? [];
			expect(nodeIds).toEqual(["cond-1", "no-act"]);
			expect(nodeIds).not.toContain("yes-act");
		});

		it("marks the run failed when a step errors (non-member recipient)", async () => {
			const { asUser } = await setupUser();
			const clientId = await makeClient(asUser);
			// A syntactically valid users id that is not a member of the org.
			const strangerId = await t.run(async (ctx) =>
				ctx.db.insert("users", {
					name: "Stranger",
					email: "stranger@example.com",
					image: "https://example.com/x.jpg",
					externalId: "user_stranger",
				})
			);

			const automationId = await asUser.mutation(api.automations.create, {
				name: "Notify stranger",
				trigger: clientCreatedTrigger,
				nodes: [
					{
						id: "notify-1",
						type: "action" as const,
						config: {
							kind: "action" as const,
							action: {
								type: "send_notification" as const,
								recipient: { userId: strangerId },
								message: "hi",
							},
						},
					},
				],
			});

			const executionId = await asUser.mutation(
				api.automationExecutor.startTestRun,
				{ automationId, record: { entityType: "client", entityId: clientId } }
			);
			await drainScheduled();

			const done = await asUser.query(api.automationExecutor.getExecution, {
				executionId,
			});
			expect(done?.status).toBe("failed");
			expect(done?.nodesExecuted[0].result).toBe("failed");
			expect(done?.error).toMatch(/not a member/i);

			const notifications = await t.run(async (ctx) =>
				ctx.db.query("notifications").collect()
			);
			expect(notifications).toHaveLength(0);
		});

		it("rejects a record whose entityType mismatches the trigger's object type", async () => {
			const { asUser } = await setupUser();
			const clientId = await makeClient(asUser);
			const projectId = await asUser.mutation(api.projects.create, {
				clientId,
				title: "Kitchen remodel",
				status: "planned",
				projectType: "one-off",
			});

			const automationId = await asUser.mutation(api.automations.create, {
				name: "Client only",
				trigger: clientCreatedTrigger,
				nodes: [notesActionNode("act-1", "x")],
			});

			await expect(
				asUser.mutation(api.automationExecutor.startTestRun, {
					automationId,
					record: { entityType: "project", entityId: projectId },
				})
			).rejects.toThrow(/pick a client/i);
		});

		it("runs record-less (no record) for a node with no per-record step", async () => {
			const { asUser } = await setupUser();

			const automationId = await asUser.mutation(api.automations.create, {
				name: "Just end",
				trigger: clientCreatedTrigger,
				nodes: [{ id: "end-1", type: "end" as const, config: { kind: "end" as const } }],
			});

			const executionId = await asUser.mutation(
				api.automationExecutor.startTestRun,
				{ automationId }
			);
			await drainScheduled();

			const done = await asUser.query(api.automationExecutor.getExecution, {
				executionId,
			});
			expect(done?.status).toBe("completed");
			expect(done?.nodesExecuted.map((n) => n.nodeId)).toEqual(["end-1"]);
		});
	});

	describe("startTestRun (dry run) — fetch/loop/delay walk", () => {
		it("samples at most DRY_LOOP_SAMPLE loop iterations and records a would-wait delay without parking or writing", async () => {
			const { asUser, orgId } = await setupUser();
			// 5 matching clients so the loop's DRY_LOOP_SAMPLE=3 truncation is observable.
			for (let i = 0; i < 5; i++) {
				await makeClient(asUser, `Client ${i}`);
			}

			const automationId = await asUser.mutation(api.automations.create, {
				name: "Fetch, loop, delay",
				trigger: clientCreatedTrigger,
				nodes: [
					fetchNode("fetch-1", "client", { nextNodeId: "loop-1" }),
					loopNode("loop-1", "fetch-1", {
						bodyStartNodeId: "body-act",
						nextNodeId: "delay-1",
					}),
					statusActionNode("body-act", "inactive"),
					delayNode("delay-1", 1, "hours", { nextNodeId: "end-1" }),
					endNode("end-1"),
				],
			});

			const executionId = await asUser.mutation(
				api.automationExecutor.startTestRun,
				{ automationId }
			);
			await drainScheduled();

			const done = await asUser.query(api.automationExecutor.getExecution, {
				executionId,
			});
			expect(done?.status).toBe("completed");
			expect(done?.resumeState).toBeUndefined();
			expect(done?.currentNodeId).toBeUndefined();

			const entries = done?.nodesExecuted ?? [];
			const loopEntry = entries.find((e) => e.nodeId === "loop-1");
			expect(loopEntry?.recordsProcessed).toBe(5);
			expect(loopEntry?.output).toMatchObject({ total: 5, sampled: 3 });

			const bodyEntries = entries.filter((e) => e.nodeId === "body-act");
			expect(bodyEntries).toHaveLength(3);
			expect(bodyEntries.every((e) => e.result === "success")).toBe(true);

			const delayEntry = entries.find((e) => e.nodeId === "delay-1");
			expect(delayEntry?.result).toBe("success");
			expect(delayEntry?.output).toMatchObject({ dryRunSkipped: true });
			expect(
				(delayEntry?.output as { wouldWaitUntil?: number })?.wouldWaitUntil
			).toBeTypeOf("number");

			expect(entries.map((e) => e.nodeId)).toContain("end-1");

			// Dry run must not have written to any client.
			const clients = await t.run(async (ctx) =>
				ctx.db
					.query("clients")
					.withIndex("by_org", (q) => q.eq("orgId", orgId))
					.collect()
			);
			expect(clients.every((c) => c.status === "lead")).toBe(true);
		});
	});

	describe("startTestRun (dry run) — per-node input snapshots", () => {
		it("stamps a bounded input for condition and action nodes", async () => {
			const { asUser } = await setupUser();
			const clientId = await makeClient(asUser, "Globex");

			const automationId = await asUser.mutation(api.automations.create, {
				name: "Input capture",
				trigger: clientCreatedTrigger,
				nodes: [
					conditionNode("cond-1", "companyName", "equals", "Globex", {
						nextNodeId: "yes-act",
						elseNodeId: "no-act",
					}),
					notesActionNode("yes-act", "yes"),
					notesActionNode("no-act", "no"),
				],
			});

			const executionId = await asUser.mutation(
				api.automationExecutor.startTestRun,
				{ automationId, record: { entityType: "client", entityId: clientId } }
			);
			await drainScheduled();

			const done = await asUser.query(api.automationExecutor.getExecution, {
				executionId,
			});
			const entries = done?.nodesExecuted ?? [];

			const condInput = entries.find((e) => e.nodeId === "cond-1")?.input as {
				record?: Record<string, unknown>;
				logic?: string;
				groups?: unknown[];
			};
			expect(condInput?.record?.companyName).toBe("Globex");
			expect(condInput?.logic).toBe("and");
			expect(Array.isArray(condInput?.groups)).toBe(true);

			const act = entries.find((e) => e.nodeId === "yes-act");
			expect(act?.input).toMatchObject({
				target: "self",
				field: "notes",
				value: "yes",
			});
		});

		it("omits input for an end node", async () => {
			const { asUser } = await setupUser();
			const clientId = await makeClient(asUser);

			const automationId = await asUser.mutation(api.automations.create, {
				name: "Ends cleanly",
				trigger: clientCreatedTrigger,
				nodes: [
					statusActionNode("act-1", "inactive", "end-1"),
					endNode("end-1"),
				],
			});

			const executionId = await asUser.mutation(
				api.automationExecutor.startTestRun,
				{ automationId, record: { entityType: "client", entityId: clientId } }
			);
			await drainScheduled();

			const done = await asUser.query(api.automationExecutor.getExecution, {
				executionId,
			});
			const endEntry = done?.nodesExecuted.find((e) => e.nodeId === "end-1");
			expect(endEntry?.result).toBe("success");
			expect(endEntry?.input).toBeUndefined();
		});

		it("stamps input for a fetch_records node", async () => {
			const { asUser } = await setupUser();
			const clientId = await makeClient(asUser);

			const automationId = await asUser.mutation(api.automations.create, {
				name: "Fetch input",
				trigger: clientCreatedTrigger,
				nodes: [
					fetchNode("fetch-1", "client", { nextNodeId: "end-1" }),
					endNode("end-1"),
				],
			});

			const executionId = await asUser.mutation(
				api.automationExecutor.startTestRun,
				{ automationId, record: { entityType: "client", entityId: clientId } }
			);
			await drainScheduled();

			const done = await asUser.query(api.automationExecutor.getExecution, {
				executionId,
			});
			const fetchEntry = done?.nodesExecuted.find((e) => e.nodeId === "fetch-1");
			expect(fetchEntry?.input).toMatchObject({ objectType: "client" });
			expect(
				Array.isArray((fetchEntry?.input as { filters?: unknown })?.filters)
			).toBe(true);
		});

		it("truncates an oversized input snapshot to a ~4KB marker", async () => {
			const { asUser } = await setupUser();
			// A notes field far larger than the ~4KB snapshot ceiling.
			const clientId = await asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "Bulky",
				status: "lead",
				notes: "x".repeat(5000),
			});

			const automationId = await asUser.mutation(api.automations.create, {
				name: "Oversized input",
				trigger: clientCreatedTrigger,
				nodes: [
					conditionNode("cond-1", "companyName", "equals", "Bulky", {
						nextNodeId: "yes-act",
					}),
					notesActionNode("yes-act", "seen"),
				],
			});

			const executionId = await asUser.mutation(
				api.automationExecutor.startTestRun,
				{ automationId, record: { entityType: "client", entityId: clientId } }
			);
			await drainScheduled();

			const done = await asUser.query(api.automationExecutor.getExecution, {
				executionId,
			});
			const input = done?.nodesExecuted.find((e) => e.nodeId === "cond-1")
				?.input as { _truncated?: boolean; preview?: string };
			expect(input?._truncated).toBe(true);
			expect(typeof input?.preview).toBe("string");
			expect((input?.preview ?? "").length).toBeLessThanOrEqual(4096);
		});
	});

	describe("cancelTestRun", () => {
		it("stops the reveal chain", async () => {
			const { asUser } = await setupUser();
			const clientId = await makeClient(asUser);

			const automationId = await asUser.mutation(api.automations.create, {
				name: "Multi step",
				trigger: clientCreatedTrigger,
				nodes: [
					notesActionNode("a", "1", "b"),
					notesActionNode("b", "2", "c"),
					notesActionNode("c", "3"),
				],
			});

			const executionId = await asUser.mutation(
				api.automationExecutor.startTestRun,
				{ automationId, record: { entityType: "client", entityId: clientId } }
			);

			await asUser.mutation(api.automationExecutor.cancelTestRun, {
				executionId,
			});

			const cancelled = await asUser.query(
				api.automationExecutor.getExecution,
				{ executionId }
			);
			expect(cancelled?.status).toBe("cancelled");
			expect(cancelled?.testCursor).toBeUndefined();

			// Draining the already-scheduled step must not resurrect the run.
			await drainScheduled();
			const stillCancelled = await asUser.query(
				api.automationExecutor.getExecution,
				{ executionId }
			);
			expect(stillCancelled?.status).toBe("cancelled");
			expect(stillCancelled?.nodesExecuted).toHaveLength(0);
		});
	});

	// ------------------------------------------------------------------
	// Manual run (production)
	// ------------------------------------------------------------------

	describe("startManualRun", () => {
		it("runs the published snapshot with real effects", async () => {
			const { asUser } = await setupUser();
			const clientId = await makeClient(asUser);

			const automationId = await asUser.mutation(api.automations.create, {
				name: "Manual notes",
				trigger: clientCreatedTrigger,
				nodes: [notesActionNode("act-1", "ran manually")],
			});
			await asUser.mutation(api.automations.publish, { id: automationId });

			const executionId = await asUser.mutation(
				api.automationExecutor.startManualRun,
				{ automationId, record: { entityType: "client", entityId: clientId } }
			);
			await drainScheduled();

			const execution = await asUser.query(
				api.automationExecutor.getExecution,
				{ executionId }
			);
			expect(execution?.mode).toBe("production");
			expect(execution?.status).toBe("completed");
			expect(execution?.triggeredBy).toMatch(/^manual:/);

			const client = await t.run(async (ctx) => ctx.db.get(clientId));
			expect(client?.notes).toBe("ran manually");
		});

		it("requires the automation to be published", async () => {
			const { asUser } = await setupUser();
			const clientId = await makeClient(asUser);

			const automationId = await asUser.mutation(api.automations.create, {
				name: "Unpublished",
				trigger: clientCreatedTrigger,
				nodes: [notesActionNode("act-1", "nope")],
			});

			await expect(
				asUser.mutation(api.automationExecutor.startManualRun, {
					automationId,
					record: { entityType: "client", entityId: clientId },
				})
			).rejects.toThrow(/publish/i);
		});

		it("executes the PUBLISHED snapshot, ignoring unpublished working-copy edits", async () => {
			const { asUser } = await setupUser();
			const clientId = await makeClient(asUser);

			const automationId = await asUser.mutation(api.automations.create, {
				name: "Snapshot wins",
				trigger: clientCreatedTrigger,
				nodes: [notesActionNode("act-1", "published")],
			});
			await asUser.mutation(api.automations.publish, { id: automationId });

			// Edit the working copy but do NOT publish.
			await asUser.mutation(api.automations.update, {
				id: automationId,
				nodes: [notesActionNode("act-1", "working-copy")],
			});

			const executionId = await asUser.mutation(
				api.automationExecutor.startManualRun,
				{ automationId, record: { entityType: "client", entityId: clientId } }
			);
			await drainScheduled();

			const client = await t.run(async (ctx) => ctx.db.get(clientId));
			expect(client?.notes).toBe("published");
			const execution = await asUser.query(
				api.automationExecutor.getExecution,
				{ executionId }
			);
			expect(execution?.snapshotVersion).toBe(1);
		});

		it("rejects a record whose entityType mismatches the published trigger's object type", async () => {
			const { asUser } = await setupUser();
			const clientId = await makeClient(asUser);
			const projectId = await asUser.mutation(api.projects.create, {
				clientId,
				title: "Kitchen remodel",
				status: "planned",
				projectType: "one-off",
			});

			const automationId = await asUser.mutation(api.automations.create, {
				name: "Client only manual",
				trigger: clientCreatedTrigger,
				nodes: [notesActionNode("act-1", "x")],
			});
			await asUser.mutation(api.automations.publish, { id: automationId });

			await expect(
				asUser.mutation(api.automationExecutor.startManualRun, {
					automationId,
					record: { entityType: "project", entityId: projectId },
				})
			).rejects.toThrow(/pick a client/i);
		});

		it("requires a record when the published trigger scopes an object type", async () => {
			const { asUser } = await setupUser();

			const automationId = await asUser.mutation(api.automations.create, {
				name: "Needs record",
				trigger: clientCreatedTrigger,
				nodes: [notesActionNode("act-1", "x")],
			});
			await asUser.mutation(api.automations.publish, { id: automationId });

			await expect(
				asUser.mutation(api.automationExecutor.startManualRun, {
					automationId,
				})
			).rejects.toThrow(/pick a record/i);
		});
	});

	// ------------------------------------------------------------------
	// Supporting queries + watchdog
	// ------------------------------------------------------------------

	describe("getSampleRecords", () => {
		it("returns the latest records of the trigger object type with labels", async () => {
			const { asUser } = await setupUser();
			await makeClient(asUser, "First Co");
			await makeClient(asUser, "Second Co");

			const automationId = await asUser.mutation(api.automations.create, {
				name: "Sampler",
				trigger: clientCreatedTrigger,
				nodes: [notesActionNode("act-1", "x")],
			});

			const samples = await asUser.query(
				api.automationExecutor.getSampleRecords,
				{ automationId }
			);
			expect(samples).toHaveLength(2);
			expect(samples.every((s) => s.entityType === "client")).toBe(true);
			expect(samples.map((s) => s.label).sort()).toEqual([
				"First Co",
				"Second Co",
			]);
		});
	});

	describe("getExecution", () => {
		it("returns null for an execution in another org", async () => {
			const org1 = await setupUser({
				clerkUserId: "u1",
				clerkOrgId: "o1",
			});
			const org2 = await setupUser({
				clerkUserId: "u2",
				clerkOrgId: "o2",
			});
			const clientId = await makeClient(org1.asUser);

			const automationId = await org1.asUser.mutation(api.automations.create, {
				name: "Org1",
				trigger: clientCreatedTrigger,
				nodes: [{ id: "end-1", type: "end" as const, config: { kind: "end" as const } }],
			});
			const executionId = await org1.asUser.mutation(
				api.automationExecutor.startTestRun,
				{ automationId, record: { entityType: "client", entityId: clientId } }
			);

			expect(
				await org2.asUser.query(api.automationExecutor.getExecution, {
					executionId,
				})
			).toBeNull();
		});
	});

	describe("failStaleTestRuns", () => {
		it("fails stale test runs but leaves fresh and production runs alone", async () => {
			const { asUser, orgId } = await setupUser();
			const automationId = await asUser.mutation(api.automations.create, {
				name: "For ids",
				trigger: clientCreatedTrigger,
				nodes: [{ id: "end-1", type: "end" as const, config: { kind: "end" as const } }],
			});

			const now = Date.now();
			const staleTest = await t.run(async (ctx) =>
				ctx.db.insert("workflowExecutions", {
					orgId,
					automationId,
					triggeredBy: "test:x",
					triggeredAt: now - 10 * 60 * 1000,
					status: "running",
					mode: "test",
					dryRun: true,
					nodesExecuted: [],
				})
			);
			const freshTest = await t.run(async (ctx) =>
				ctx.db.insert("workflowExecutions", {
					orgId,
					automationId,
					triggeredBy: "test:y",
					triggeredAt: now,
					status: "running",
					mode: "test",
					dryRun: true,
					nodesExecuted: [],
				})
			);
			const staleProd = await t.run(async (ctx) =>
				ctx.db.insert("workflowExecutions", {
					orgId,
					automationId,
					triggeredBy: "schedule",
					triggeredAt: now - 10 * 60 * 1000,
					status: "running",
					mode: "production",
					nodesExecuted: [],
				})
			);

			const result = await t.mutation(
				internal.automationExecutor.failStaleTestRuns,
				{}
			);
			expect(result.failed).toBe(1);

			const rows = await t.run(async (ctx) => ({
				stale: await ctx.db.get(staleTest),
				fresh: await ctx.db.get(freshTest),
				prod: await ctx.db.get(staleProd),
			}));
			expect(rows.stale?.status).toBe("failed");
			expect(rows.stale?.error).toMatch(/timed out/i);
			expect(rows.fresh?.status).toBe("running");
			expect(rows.prod?.status).toBe("running");
		});

		it("drains a backlog larger than one page via self-rechain", async () => {
			// Regression for the automation-execution-scale PRD (item 0.2): the
			// watchdog used to .take(100) once per cron tick, so a backlog above
			// the page size never fully drained. It now rechains on a cursor.
			const { asUser, orgId } = await setupUser();
			const automationId = await asUser.mutation(api.automations.create, {
				name: "Backlog",
				trigger: clientCreatedTrigger,
				nodes: [
					{ id: "end-1", type: "end" as const, config: { kind: "end" as const } },
				],
			});

			const now = Date.now();
			// 250 stale test runs > the 100-row page, with distinct triggeredAt so
			// the exclusive cursor advances cleanly past every row.
			await t.run(async (ctx) => {
				for (let i = 0; i < 250; i++) {
					await ctx.db.insert("workflowExecutions", {
						orgId,
						automationId,
						triggeredBy: `test:${i}`,
						triggeredAt: now - (30 * 60 * 1000 + i),
						status: "running" as const,
						mode: "test" as const,
						dryRun: true,
						nodesExecuted: [],
					});
				}
			});

			// One invocation processes its own page and schedules the rest; drain
			// the runAfter(0) rechain (fake timers are active for this suite).
			await t.mutation(internal.automationExecutor.failStaleTestRuns, {});
			await t.finishAllScheduledFunctions(vi.runAllTimers);

			// Scope to this test's org: assert only the backlog we seeded drained,
			// not unrelated running rows.
			const remaining = await t.run(async (ctx) =>
				ctx.db
					.query("workflowExecutions")
					.withIndex("by_org_status_triggeredAt", (q) =>
						q.eq("orgId", orgId).eq("status", "running")
					)
					.collect()
			);
			expect(remaining.length).toBe(0);
		});
	});

	describe("failStaleProductionRuns", () => {
		async function makeAutomation(
			asUser: ReturnType<typeof t.withIdentity>,
			name: string
		) {
			return await asUser.mutation(api.automations.create, {
				name,
				trigger: clientCreatedTrigger,
				nodes: [
					{ id: "end-1", type: "end" as const, config: { kind: "end" as const } },
				],
			});
		}

		async function automationFailedNotes(userId: Id<"users">) {
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

		it("fails stuck production runs (mode unset or 'production'), notifies admins, and leaves fresh/parked-future/test/completed runs alone", async () => {
			const { asUser, orgId, userId } = await setupUser();
			const now = Date.now();
			const STALE = 45 * 60 * 1000;

			const recordTriggeredId = await makeAutomation(
				asUser,
				"Record-triggered watchdog target"
			);
			const stuckModeUnset = await t.run(async (ctx) =>
				ctx.db.insert("workflowExecutions", {
					orgId,
					automationId: recordTriggeredId,
					triggeredBy: "status_changed",
					triggeredAt: now - STALE,
					status: "running",
					nodesExecuted: [],
					// mode intentionally unset — record-triggered runs leave it unset.
				})
			);

			const scheduledId = await makeAutomation(
				asUser,
				"Scheduled watchdog target"
			);
			const stuckModeProd = await t.run(async (ctx) =>
				ctx.db.insert("workflowExecutions", {
					orgId,
					automationId: scheduledId,
					triggeredBy: "schedule",
					triggeredAt: now - STALE,
					status: "running",
					mode: "production",
					nodesExecuted: [],
				})
			);

			const parkedFutureAutomationId = await makeAutomation(
				asUser,
				"Parked future"
			);
			const parkedFuture = await t.run(async (ctx) =>
				ctx.db.insert("workflowExecutions", {
					orgId,
					automationId: parkedFutureAutomationId,
					triggeredBy: "schedule",
					triggeredAt: now - STALE,
					status: "running",
					mode: "production",
					nodesExecuted: [],
					resumeState: {
						resumeNodeId: "delay-1",
						resumeAt: now + 60 * 60 * 1000,
						checkpointAt: now - STALE,
						fetchOutputs: [],
					},
				})
			);

			const freshAutomationId = await makeAutomation(asUser, "Fresh");
			const fresh = await t.run(async (ctx) =>
				ctx.db.insert("workflowExecutions", {
					orgId,
					automationId: freshAutomationId,
					triggeredBy: "schedule",
					triggeredAt: now,
					status: "running",
					mode: "production",
					nodesExecuted: [],
				})
			);

			const staleTestAutomationId = await makeAutomation(asUser, "Stale test");
			const staleTest = await t.run(async (ctx) =>
				ctx.db.insert("workflowExecutions", {
					orgId,
					automationId: staleTestAutomationId,
					triggeredBy: "test:x",
					triggeredAt: now - STALE,
					status: "running",
					mode: "test",
					dryRun: true,
					nodesExecuted: [],
				})
			);

			const completedAutomationId = await makeAutomation(asUser, "Completed");
			const oldCompleted = await t.run(async (ctx) =>
				ctx.db.insert("workflowExecutions", {
					orgId,
					automationId: completedAutomationId,
					triggeredBy: "schedule",
					triggeredAt: now - STALE,
					status: "completed",
					completedAt: now - STALE + 1000,
					mode: "production",
					nodesExecuted: [],
				})
			);

			const result = await t.mutation(
				internal.automationExecutor.failStaleProductionRuns,
				{}
			);
			expect(result.failed).toBe(2);

			const rows = await t.run(async (ctx) => ({
				stuckModeUnset: await ctx.db.get(stuckModeUnset),
				stuckModeProd: await ctx.db.get(stuckModeProd),
				parkedFuture: await ctx.db.get(parkedFuture),
				fresh: await ctx.db.get(fresh),
				staleTest: await ctx.db.get(staleTest),
				oldCompleted: await ctx.db.get(oldCompleted),
			}));

			expect(rows.stuckModeUnset?.status).toBe("failed");
			expect(rows.stuckModeUnset?.error).toMatch(/stalled without completing/i);
			expect(rows.stuckModeUnset?.completedAt).toBe(now);

			expect(rows.stuckModeProd?.status).toBe("failed");
			expect(rows.stuckModeProd?.error).toMatch(/stalled without completing/i);

			expect(rows.parkedFuture?.status).toBe("running");
			expect(rows.fresh?.status).toBe("running");
			expect(rows.staleTest?.status).toBe("running");
			expect(rows.oldCompleted?.status).toBe("completed");

			const notes = await automationFailedNotes(userId);
			expect(notes).toHaveLength(2);
			expect(notes.map((n) => n.title).sort()).toEqual(
				["Record-triggered watchdog target", "Scheduled watchdog target"].sort()
			);
		});

		it("fails a parked run whose wake passed more than 30 minutes ago, folding the elapsed pause into pausedMs", async () => {
			const { asUser, orgId } = await setupUser();
			const now = Date.now();
			const automationId = await makeAutomation(asUser, "Parked expired");

			const checkpointAt = now - 2 * 60 * 60 * 1000; // parked 2h ago
			const resumeAt = now - 45 * 60 * 1000; // wake was due 45min ago
			const executionId = await t.run(async (ctx) =>
				ctx.db.insert("workflowExecutions", {
					orgId,
					automationId,
					triggeredBy: "schedule",
					triggeredAt: now - 3 * 60 * 60 * 1000,
					status: "running",
					mode: "production",
					nodesExecuted: [],
					pausedMs: 1000,
					resumeState: {
						resumeNodeId: "delay-1",
						resumeAt,
						checkpointAt,
						fetchOutputs: [],
					},
				})
			);

			const result = await t.mutation(
				internal.automationExecutor.failStaleProductionRuns,
				{}
			);
			expect(result.failed).toBe(1);

			const row = await t.run(async (ctx) => ctx.db.get(executionId));
			expect(row?.status).toBe("failed");
			expect(row?.error).toMatch(/never woke/i);
			expect(row?.resumeState).toBeUndefined();
			expect(row?.currentNodeId).toBeUndefined();
			expect(row?.completedAt).toBe(now);
			// seeded 1000 + exact elapsed since checkpoint (fake timers freeze now).
			expect(row?.pausedMs).toBe(1000 + (now - checkpointAt));
		});

		it("still marks a stranded run failed when its automation was deleted, without throwing or notifying", async () => {
			const { asUser, orgId, userId } = await setupUser();
			const now = Date.now();
			const automationId = await makeAutomation(asUser, "Deleted mid-flight");

			const executionId = await t.run(async (ctx) =>
				ctx.db.insert("workflowExecutions", {
					orgId,
					automationId,
					triggeredBy: "schedule",
					triggeredAt: now - 45 * 60 * 1000,
					status: "running",
					mode: "production",
					nodesExecuted: [],
				})
			);
			await t.run(async (ctx) => ctx.db.delete(automationId));

			await expect(
				t.mutation(internal.automationExecutor.failStaleProductionRuns, {})
			).resolves.toEqual({ failed: 1 });

			const row = await t.run(async (ctx) => ctx.db.get(executionId));
			expect(row?.status).toBe("failed");

			const notes = await automationFailedNotes(userId);
			expect(notes).toHaveLength(0);
		});

		it("a late resume after the watchdog failed the run is a no-op", async () => {
			const { asUser, orgId } = await setupUser();
			const now = Date.now();
			const automationId = await makeAutomation(asUser, "Late wake");

			const executionId = await t.run(async (ctx) =>
				ctx.db.insert("workflowExecutions", {
					orgId,
					automationId,
					triggeredBy: "schedule",
					triggeredAt: now - 3 * 60 * 60 * 1000,
					status: "running",
					mode: "production",
					nodesExecuted: [],
					pausedMs: 1000,
					resumeState: {
						resumeNodeId: "delay-1",
						resumeAt: now - 45 * 60 * 1000,
						checkpointAt: now - 2 * 60 * 60 * 1000,
						fetchOutputs: [],
					},
				})
			);

			const result = await t.mutation(
				internal.automationExecutor.failStaleProductionRuns,
				{}
			);
			expect(result.failed).toBe(1);

			const afterWatchdog = await t.run(async (ctx) => ctx.db.get(executionId));
			expect(afterWatchdog?.status).toBe("failed");
			const watchdogPausedMs = afterWatchdog?.pausedMs;

			// The dropped scheduler hop finally fires — must not revive the run
			// or re-accumulate pause time.
			await t.mutation(internal.automationExecutor.resumeExecution, {
				orgId,
				executionId,
				automationId,
			});

			const afterResume = await t.run(async (ctx) => ctx.db.get(executionId));
			expect(afterResume?.status).toBe("failed");
			expect(afterResume?.pausedMs).toBe(watchdogPausedMs);
			expect(afterResume?.resumeState).toBeUndefined();
		});

		it("one sweep failing two stuck runs of the same automation notifies the admin only once (dedupe)", async () => {
			const { asUser, orgId, userId } = await setupUser();
			const now = Date.now();
			const automationId = await makeAutomation(asUser, "Flapping");

			for (let i = 0; i < 2; i++) {
				await t.run(async (ctx) =>
					ctx.db.insert("workflowExecutions", {
						orgId,
						automationId,
						triggeredBy: "status_changed",
						triggeredAt: now - 45 * 60 * 1000,
						status: "running",
						mode: "production",
						nodesExecuted: [],
					})
				);
			}

			const result = await t.mutation(
				internal.automationExecutor.failStaleProductionRuns,
				{}
			);
			expect(result.failed).toBe(2);

			const notes = await automationFailedNotes(userId);
			expect(notes).toHaveLength(1);
			expect(notes[0].title).toBe("Flapping");
		});
	});
});
