import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setupConvexTest } from "./test.setup";
import { createTestOrg, createTestIdentity, addMemberToOrg } from "./test.helpers";
import { api, internal } from "./_generated/api";
import { isFatalExecutionError, scanOrgRows } from "./automationExecutor";
import { projectCountsAggregate } from "./aggregates";
import type { Id } from "./_generated/dataModel";

/**
 * Executor coverage for Slice 1 of workflow-automations-v2:
 * - handleRecordEvent (record_created / record_updated dispatch)
 * - v2 executeNode: condition branches, update_field (non-status + status
 *   cascade), org isolation, recursion-depth guard.
 *
 * Event-bus scheduler hops are skipped under VITEST (see eventBus.ts), so
 * tests drive the pipeline manually: trigger the mutation that emits the
 * domain event, then run processEvents + drain scheduled functions.
 */

function updateFieldActionNode(
	id: string,
	field: string,
	value: string | number | boolean,
	opts: {
		target?: "self" | { related: "client" | "project" | "quote" | "invoice" | "task" };
		nextNodeId?: string;
	} = {}
) {
	return {
		id,
		type: "action" as const,
		config: {
			kind: "action" as const,
			action: {
				type: "update_field" as const,
				target: opts.target ?? ("self" as const),
				field,
				value: { kind: "static" as const, value },
			},
		},
		nextNodeId: opts.nextNodeId,
	};
}

/** A step a scheduled run can execute: no record scope needed. */
function notifyNode(id: string, message = "Scheduled run fired") {
	return {
		id,
		type: "action" as const,
		config: {
			kind: "action" as const,
			action: {
				type: "send_notification" as const,
				recipient: "org_admins" as const,
				message,
			},
		},
	};
}

function conditionNode(
	id: string,
	field: string,
	operator: string,
	value: string | number | boolean,
	opts: { nextNodeId?: string; elseNodeId?: string } = {}
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
	};
}

/** Condition comparing a record field against the trigger's event newValue. */
function eventNewValueConditionNode(
	id: string,
	field: string,
	opts: { nextNodeId?: string; elseNodeId?: string } = {}
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
							operator: "equals" as const,
							value: {
								kind: "var" as const,
								path: "trigger.event.newValue",
							},
						},
					],
				},
			],
		},
		nextNodeId: opts.nextNodeId,
		elseNodeId: opts.elseNodeId,
	};
}

describe("automationExecutor (v2 engine)", () => {
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

	/** Drain the pending domainEvents queue and every scheduled function it fans out to. */
	async function drainEvents() {
		await t.mutation(internal.eventBus.processEvents, {});
		await t.finishAllScheduledFunctions(vi.runAllTimers);
	}

	describe("handleRecordEvent — record_created", () => {
		it("runs a matching automation end-to-end when a client is created", async () => {
			const { asUser } = await setupUser();

			await asUser.mutation(api.automations.create, {
				name: "Welcome note",
				trigger: { type: "record_created", objectType: "client" },
				nodes: [updateFieldActionNode("act-1", "notes", "Welcomed!")],
				isActive: true,
			});

			const clientId = await asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "New Co",
				status: "lead",
			});

			await drainEvents();

			const client = await t.run(async (ctx) => ctx.db.get(clientId));
			expect(client?.notes).toBe("Welcomed!");

			const executions = await t.run(async (ctx) =>
				ctx.db.query("workflowExecutions").collect()
			);
			expect(executions).toHaveLength(1);
			expect(executions[0].status).toBe("completed");
		});
	});

	describe("handleRecordEvent — record_updated", () => {
		it("runs on a watched field change and writes a non-status field (update_field)", async () => {
			const { asUser } = await setupUser();

			const clientId = await asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "Acme Co",
				status: "active",
			});
			const projectId = await asUser.mutation(api.projects.create, {
				clientId,
				title: "Kitchen remodel",
				status: "planned",
				projectType: "one-off",
			});

			await asUser.mutation(api.automations.create, {
				name: "Title changed",
				trigger: {
					type: "record_updated",
					objectType: "project",
					fields: ["title"],
				},
				nodes: [
					updateFieldActionNode("act-1", "description", "Auto-updated"),
				],
				isActive: true,
			});

			await asUser.mutation(api.projects.update, {
				id: projectId,
				title: "Kitchen remodel v2",
			});

			await drainEvents();

			const project = await t.run(async (ctx) => ctx.db.get(projectId));
			expect(project?.description).toBe("Auto-updated");
		});

		it("does not fire when the changed field isn't in the watch list", async () => {
			const { asUser } = await setupUser();

			const clientId = await asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "Acme Co",
				status: "active",
			});
			const projectId = await asUser.mutation(api.projects.create, {
				clientId,
				title: "Kitchen remodel",
				status: "planned",
				projectType: "one-off",
			});

			await asUser.mutation(api.automations.create, {
				name: "Title changed",
				trigger: {
					type: "record_updated",
					objectType: "project",
					fields: ["title"],
				},
				nodes: [
					updateFieldActionNode("act-1", "description", "Auto-updated"),
				],
				isActive: true,
			});

			// Change description directly — "title" is the watched field, not this.
			await asUser.mutation(api.projects.update, {
				id: projectId,
				description: "Manually edited",
			});

			await drainEvents();

			const project = await t.run(async (ctx) => ctx.db.get(projectId));
			expect(project?.description).toBe("Manually edited");
		});
	});

	describe("actor threading (Phase 1.4)", () => {
		const stampActorNode = {
			id: "act-1",
			type: "action" as const,
			config: {
				kind: "action" as const,
				action: {
					type: "update_field" as const,
					target: "self" as const,
					field: "notes",
					value: { kind: "var" as const, path: "user.email" },
				},
			},
		};

		it("record_created runs caused by a user resolve user.* globals", async () => {
			const { asUser } = await setupUser();

			await asUser.mutation(api.automations.create, {
				name: "Stamp the actor",
				trigger: { type: "record_created", objectType: "client" },
				nodes: [stampActorNode],
				isActive: true,
			});

			const clientId = await asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "Acme Corp",
				status: "lead",
			});
			await drainEvents();

			const client = await t.run(async (ctx) => ctx.db.get(clientId));
			expect(client?.notes).toBe("test@example.com");

			const executions = await t.run(async (ctx) =>
				ctx.db.query("workflowExecutions").collect()
			);
			expect(executions).toHaveLength(1);
			expect(executions[0].triggeredBy).toMatch(/^actor:/);
		});

		it("status_changed runs caused by a user resolve user.* globals", async () => {
			const { asUser } = await setupUser();

			const clientId = await asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "Acme Corp",
				status: "active",
			});
			const projectId = await asUser.mutation(api.projects.create, {
				clientId,
				title: "Kitchen remodel",
				status: "planned",
				projectType: "one-off",
			});

			await asUser.mutation(api.automations.create, {
				name: "Stamp actor on start",
				trigger: {
					type: "status_changed",
					objectType: "project",
					toStatus: "in-progress",
				},
				nodes: [
					{
						...stampActorNode,
						config: {
							kind: "action" as const,
							action: {
								...stampActorNode.config.action,
								field: "description",
							},
						},
					},
				],
				isActive: true,
			});

			await asUser.mutation(api.projects.update, {
				id: projectId,
				status: "in-progress",
			});
			await drainEvents();

			const project = await t.run(async (ctx) => ctx.db.get(projectId));
			expect(project?.description).toBe("test@example.com");
		});
	});

	describe("snapshot pinning (Phase 1.5)", () => {
		function delayedNodes() {
			return [
				updateFieldActionNode("act-1", "notes", "before delay", {
					nextNodeId: "delay-1",
				}),
				{
					id: "delay-1",
					type: "delay" as const,
					config: {
						kind: "delay" as const,
						amount: 1,
						unit: "hours" as const,
					},
					nextNodeId: "act-2",
				},
				updateFieldActionNode("act-2", "notes", "after delay"),
			];
		}

		async function parkAtDelay() {
			const { orgId, asUser } = await setupUser();
			const clientId = await asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "Acme Co",
				status: "active",
			});
			const automationId = await asUser.mutation(api.automations.create, {
				name: "Delay then follow up (pinned)",
				trigger: { type: "record_created", objectType: "client" },
				nodes: delayedNodes(),
				isActive: true, // publishes snapshot v1
			});
			const executionId = await t.run(async (ctx) =>
				ctx.db.insert("workflowExecutions", {
					orgId,
					automationId,
					triggeredBy: clientId,
					triggeredAt: Date.now(),
					status: "running",
					snapshotVersion: 1,
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
			const mid = await t.run(async (ctx) => ctx.db.get(executionId));
			expect(mid?.resumeState?.resumeNodeId).toBe("act-2");
			return { orgId, asUser, clientId, automationId, executionId };
		}

		it("a republish while parked fails the resume instead of drifting to the new version", async () => {
			const { orgId, asUser, clientId, automationId, executionId } =
				await parkAtDelay();

			// Republish an unchanged definition — only the version bumps.
			await asUser.mutation(api.automations.update, {
				id: automationId,
				nodes: delayedNodes(),
			});
			await asUser.mutation(api.automations.publish, { id: automationId });

			await t.mutation(internal.automationExecutor.resumeExecution, {
				orgId,
				executionId,
				automationId,
			});

			const final = await t.run(async (ctx) => ctx.db.get(executionId));
			expect(final?.status).toBe("failed");
			expect(final?.error).toMatch(/republished/);
			expect(final?.resumeState).toBeUndefined();

			// The post-delay step never ran.
			const client = await t.run(async (ctx) => ctx.db.get(clientId));
			expect(client?.notes).toBe("before delay");
		});

		it("a same-version resume completes normally", async () => {
			const { orgId, clientId, automationId, executionId } =
				await parkAtDelay();

			await t.mutation(internal.automationExecutor.resumeExecution, {
				orgId,
				executionId,
				automationId,
			});

			const final = await t.run(async (ctx) => ctx.db.get(executionId));
			expect(final?.status).toBe("completed");

			const client = await t.run(async (ctx) => ctx.db.get(clientId));
			expect(client?.notes).toBe("after delay");
		});

		it("event-triggered runs record the snapshot version they started on", async () => {
			const { asUser } = await setupUser();
			await asUser.mutation(api.automations.create, {
				name: "Stamp notes",
				trigger: { type: "record_created", objectType: "client" },
				nodes: [updateFieldActionNode("act-1", "notes", "hello")],
				isActive: true,
			});
			await asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "Acme Corp",
				status: "lead",
			});
			await drainEvents();

			const executions = await t.run(async (ctx) =>
				ctx.db.query("workflowExecutions").collect()
			);
			expect(executions).toHaveLength(1);
			expect(executions[0].snapshotVersion).toBe(1);
		});
	});

	describe("idempotency + dispatch observability (Phase 1.6)", () => {
		it("a duplicate executeAutomation invocation never restarts a finished walk", async () => {
			const { orgId, asUser } = await setupUser();
			const clientId = await asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "Acme Co",
				status: "active",
			});
			const automationId = await asUser.mutation(api.automations.create, {
				name: "Stamp once",
				trigger: { type: "record_created", objectType: "client" },
				nodes: [updateFieldActionNode("act-1", "notes", "stamped")],
				isActive: true,
			});
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
			const invoke = () =>
				t.mutation(internal.automationExecutor.executeAutomation, {
					orgId,
					executionId,
					automationId,
					objectType: "client",
					objectId: clientId,
					executionChain: [automationId],
					recursionDepth: 1,
				});

			await invoke();
			const first = await t.run(async (ctx) => ctx.db.get(executionId));
			expect(first?.status).toBe("completed");
			expect(first?.nodesExecuted).toHaveLength(1);

			await invoke(); // duplicate — must no-op
			const second = await t.run(async (ctx) => ctx.db.get(executionId));
			expect(second?.status).toBe("completed");
			expect(second?.nodesExecuted).toHaveLength(1);
		});

		it("a duplicate invocation while parked at a delay leaves the checkpoint intact", async () => {
			const { orgId, asUser } = await setupUser();
			const clientId = await asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "Acme Co",
				status: "active",
			});
			const automationId = await asUser.mutation(api.automations.create, {
				name: "Delay guard",
				trigger: { type: "record_created", objectType: "client" },
				nodes: [
					updateFieldActionNode("act-1", "notes", "before delay", {
						nextNodeId: "delay-1",
					}),
					{
						id: "delay-1",
						type: "delay" as const,
						config: {
							kind: "delay" as const,
							amount: 1,
							unit: "hours" as const,
						},
						nextNodeId: "act-2",
					},
					updateFieldActionNode("act-2", "notes", "after delay"),
				],
				isActive: true,
			});
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
			const invoke = () =>
				t.mutation(internal.automationExecutor.executeAutomation, {
					orgId,
					executionId,
					automationId,
					objectType: "client",
					objectId: clientId,
					executionChain: [automationId],
					recursionDepth: 1,
				});

			await invoke();
			const parked = await t.run(async (ctx) => ctx.db.get(executionId));
			expect(parked?.resumeState?.resumeNodeId).toBe("act-2");
			expect(parked?.nodesExecuted).toHaveLength(2);

			await invoke(); // duplicate while parked — must not restart the walk
			const still = await t.run(async (ctx) => ctx.db.get(executionId));
			expect(still?.resumeState?.resumeNodeId).toBe("act-2");
			expect(still?.nodesExecuted).toHaveLength(2);
			const client = await t.run(async (ctx) => ctx.db.get(clientId));
			expect(client?.notes).toBe("before delay");

			// The real resume still works after the duplicate no-op.
			await t.mutation(internal.automationExecutor.resumeExecution, {
				orgId,
				executionId,
				automationId,
			});
			const final = await t.run(async (ctx) => ctx.db.get(executionId));
			expect(final?.status).toBe("completed");
		});

		it("a per-row dispatch failure inserts a failed run and stops re-dispatch", async () => {
			const { orgId, userId } = await setupUser();

			// Invalid timezone slips past schema validation (plain string) and
			// makes computeNextRunAt throw inside the dispatch try block.
			const badTrigger = {
				type: "scheduled" as const,
				schedule: {
					frequency: "daily" as const,
					timezone: "Not/AZone",
					time: "09:00",
				},
			};
			const automationId = await t.run(async (ctx) =>
				ctx.db.insert("workflowAutomations", {
					orgId,
					name: "Corrupt schedule",
					status: "active" as const,
					trigger: badTrigger,
					nodes: [],
					publishedSnapshot: {
						trigger: badTrigger,
						nodes: [],
						version: 1,
						publishedAt: Date.now(),
					},
					nextRunAt: Date.now() - 1000,
					createdBy: userId,
					createdAt: Date.now(),
					updatedAt: Date.now(),
				})
			);

			const result = await t.mutation(
				internal.automationExecutor.dispatchScheduledAutomations,
				{}
			);
			expect(result.due).toBe(1);
			expect(result.dispatched).toBe(0);

			const executions = await t.run(async (ctx) =>
				ctx.db.query("workflowExecutions").collect()
			);
			expect(executions).toHaveLength(1);
			expect(executions[0].status).toBe("failed");
			expect(executions[0].automationId).toBe(automationId);
			expect(executions[0].error).toBeTruthy();

			// nextRunAt cleared so the corrupt row doesn't fail every tick.
			const automation = await t.run(async (ctx) => ctx.db.get(automationId));
			expect(automation?.nextRunAt).toBeUndefined();
		});
	});

	describe("trigger entry criteria (Phase 1.7 / A5-2)", () => {
		function criteria(field: string, operator: string, value: string) {
			return {
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
			};
		}

		const stampNode = updateFieldActionNode("act-1", "notes", "fired");

		it("a record_created event matching the entry criteria fires the run", async () => {
			const { asUser } = await setupUser();
			await asUser.mutation(api.automations.create, {
				name: "Only Acme clients",
				trigger: {
					type: "record_created",
					objectType: "client",
					entryCriteria: criteria("companyName", "contains", "Acme"),
				},
				nodes: [stampNode],
				isActive: true,
			});

			const clientId = await asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "Acme Corp",
				status: "lead",
			});
			await drainEvents();

			const client = await t.run(async (ctx) => ctx.db.get(clientId));
			expect(client?.notes).toBe("fired");
		});

		it("a non-matching event produces no execution row at all", async () => {
			const { asUser } = await setupUser();
			await asUser.mutation(api.automations.create, {
				name: "Only Acme clients",
				trigger: {
					type: "record_created",
					objectType: "client",
					entryCriteria: criteria("companyName", "contains", "Acme"),
				},
				nodes: [stampNode],
				isActive: true,
			});

			const clientId = await asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "Other Co",
				status: "lead",
			});
			await drainEvents();

			const client = await t.run(async (ctx) => ctx.db.get(clientId));
			expect(client?.notes).toBeUndefined();
			const executions = await t.run(async (ctx) =>
				ctx.db.query("workflowExecutions").collect()
			);
			expect(executions).toHaveLength(0);
		});

		it("record_updated: the fields watch and entry criteria are ANDed", async () => {
			const { asUser } = await setupUser();
			const clientId = await asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "Acme Co",
				status: "active",
			});
			const matchId = await asUser.mutation(api.projects.create, {
				clientId,
				title: "Kitchen remodel",
				status: "planned",
				projectType: "one-off",
			});
			const missId = await asUser.mutation(api.projects.create, {
				clientId,
				title: "Bathroom refresh",
				status: "planned",
				projectType: "one-off",
			});
			await drainEvents(); // flush creation events before the automation exists

			await asUser.mutation(api.automations.create, {
				name: "Kitchen title changes only",
				trigger: {
					type: "record_updated",
					objectType: "project",
					fields: ["title"],
					entryCriteria: criteria("title", "contains", "Kitchen"),
				},
				nodes: [updateFieldActionNode("act-1", "description", "fired")],
				isActive: true,
			});

			// Watched field + criteria match → fires.
			await asUser.mutation(api.projects.update, {
				id: matchId,
				title: "Kitchen remodel v2",
			});
			await drainEvents();
			const match = await t.run(async (ctx) => ctx.db.get(matchId));
			expect(match?.description).toBe("fired");

			// Watched field changes but criteria don't match → no run.
			await asUser.mutation(api.projects.update, {
				id: missId,
				title: "Bathroom refresh v2",
			});
			await drainEvents();
			const miss = await t.run(async (ctx) => ctx.db.get(missId));
			expect(miss?.description).toBeUndefined();

			// Criteria match but the changed field isn't watched → no run.
			await asUser.mutation(api.projects.update, {
				id: matchId,
				description: "manual edit",
			});
			await drainEvents();
			const after = await t.run(async (ctx) => ctx.db.get(matchId));
			expect(after?.description).toBe("manual edit");
		});

		it("matching runs against the published snapshot's criteria, not working-copy edits", async () => {
			const { asUser } = await setupUser();
			const automationId = await asUser.mutation(api.automations.create, {
				name: "Snapshot criteria",
				trigger: {
					type: "record_created",
					objectType: "client",
					entryCriteria: criteria("companyName", "contains", "Acme"),
				},
				nodes: [stampNode],
				isActive: true, // publishes v1 with the Acme criteria
			});

			// Unpublished working-copy edit loosens the criteria to "Other".
			await asUser.mutation(api.automations.update, {
				id: automationId,
				trigger: {
					type: "record_created",
					objectType: "client",
					entryCriteria: criteria("companyName", "contains", "Other"),
				},
			});

			const otherId = await asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "Other Co",
				status: "lead",
			});
			await drainEvents();
			const other = await t.run(async (ctx) => ctx.db.get(otherId));
			// Published (v1) criteria still govern: "Other Co" must NOT fire.
			expect(other?.notes).toBeUndefined();

			const acmeId = await asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "Acme LLC",
				status: "lead",
			});
			await drainEvents();
			const acme = await t.run(async (ctx) => ctx.db.get(acmeId));
			expect(acme?.notes).toBe("fired");
		});

		it("save-time validation rejects entry criteria on unknown fields", async () => {
			const { asUser } = await setupUser();
			await expect(
				asUser.mutation(api.automations.create, {
					name: "Bad criteria",
					trigger: {
						type: "record_created",
						objectType: "client",
						entryCriteria: criteria("noSuchField", "equals", "x"),
					},
					nodes: [stampNode],
					isActive: false,
				})
			).rejects.toThrow(/unknown field/i);
		});
	});

	describe("condition nodes", () => {
		it("follows nextNodeId when true and elseNodeId when false", async () => {
			const { asUser } = await setupUser();

			await asUser.mutation(api.automations.create, {
				name: "Branch on company name",
				trigger: { type: "record_created", objectType: "client" },
				nodes: [
					conditionNode("cond-1", "companyName", "contains", "Acme", {
						nextNodeId: "act-true",
						elseNodeId: "act-false",
					}),
					updateFieldActionNode("act-true", "notes", "Matched Acme"),
					updateFieldActionNode("act-false", "notes", "No match"),
				],
				isActive: true,
			});

			const trueId = await asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "Acme Corp",
				status: "lead",
			});
			await drainEvents();
			const trueClient = await t.run(async (ctx) => ctx.db.get(trueId));
			expect(trueClient?.notes).toBe("Matched Acme");

			const falseId = await asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "Other Co",
				status: "lead",
			});
			await drainEvents();
			const falseClient = await t.run(async (ctx) => ctx.db.get(falseId));
			expect(falseClient?.notes).toBe("No match");
		});
	});

	describe("update_field on status", () => {
		it("reuses the status cascade + aggregate flow", async () => {
			const { asUser, orgId } = await setupUser();

			const clientId = await asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "Acme Co",
				status: "active",
			});
			const projectId = await asUser.mutation(api.projects.create, {
				clientId,
				title: "Kitchen remodel",
				status: "planned",
				projectType: "one-off",
			});

			await asUser.mutation(api.automations.create, {
				name: "Complete on title change",
				trigger: {
					type: "record_updated",
					objectType: "project",
					fields: ["title"],
				},
				nodes: [updateFieldActionNode("act-1", "status", "completed")],
				isActive: true,
			});

			await asUser.mutation(api.projects.update, {
				id: projectId,
				title: "Kitchen remodel v2",
			});

			await drainEvents();

			const project = await t.run(async (ctx) => ctx.db.get(projectId));
			expect(project?.status).toBe("completed");
			expect(project?.completedAt).toBeTypeOf("number");

			// Cascade event: applyStatusUpdate emits entity.status_changed with
			// the execution chain in metadata.
			const cascadeEvents = await t.run(async (ctx) =>
				ctx.db
					.query("domainEvents")
					.filter((q) => q.eq(q.field("eventType"), "entity.status_changed"))
					.collect()
			);
			const projectCascade = cascadeEvents.find(
				(e) => e.payload.entityId === projectId
			);
			expect(projectCascade).toBeDefined();
			expect(projectCascade?.payload.oldValue).toBe("planned");
			expect(projectCascade?.payload.newValue).toBe("completed");
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			expect((projectCascade?.payload.metadata as any)?.isCascade).toBe(true);

			// Aggregate replace fired: the project now counts as "completed".
			const completedCount = await t.run(async (ctx) =>
				projectCountsAggregate.count(ctx, {
					namespace: orgId,
					bounds: {
						lower: { key: ["completed", 0], inclusive: true },
						upper: { key: ["completed", Number.MAX_SAFE_INTEGER], inclusive: true },
					},
				})
			);
			expect(completedCount).toBe(1);
		});
	});

	describe("update_field on a non-status field", () => {
		it("non-status update_field emits record_updated so chained automations fire", async () => {
			const { asUser } = await setupUser();

			// A writes a non-status field. Only `status` writes went through
			// applyStatusUpdate (which emits); this path used to patch silently.
			await asUser.mutation(api.automations.create, {
				name: "A \u2014 stamp notes on create",
				trigger: { type: "record_created", objectType: "client" },
				nodes: [updateFieldActionNode("act-1", "notes", "A wrote this")],
				isActive: true,
			});

			// B chains on the field A writes. Without the emit it never fires.
			await asUser.mutation(api.automations.create, {
				name: "B \u2014 react to the notes change",
				trigger: {
					type: "record_updated",
					objectType: "client",
					fields: ["notes"],
				},
				nodes: [updateFieldActionNode("act-1", "companyDescription", "B ran")],
				isActive: true,
			});

			const clientId = await asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "Acme Co",
				status: "lead",
			});

			await drainEvents();

			const client = await t.run(async (ctx) => ctx.db.get(clientId));
			expect(client?.notes).toBe("A wrote this");
			// The cascade's payoff: B's write only lands if A's write was announced.
			expect(client?.companyDescription).toBe("B ran");

			const executions = await t.run(async (ctx) =>
				ctx.db.query("workflowExecutions").collect()
			);
			expect(executions).toHaveLength(2);
			expect(executions.map((e) => e.status)).toEqual([
				"completed",
				"completed",
			]);

			const cascadeEvents = await t.run(async (ctx) =>
				ctx.db
					.query("domainEvents")
					.filter((q) =>
						q.and(
							q.eq(q.field("eventType"), "entity.record_updated"),
							q.eq(
								q.field("eventSource"),
								"automationExecutor.executeActionNodeV2"
							)
						)
					)
					.collect()
			);
			const notesCascade = cascadeEvents.find(
				(e) => e.payload.field === "notes"
			);
			expect(notesCascade).toBeDefined();
			expect(notesCascade?.payload.oldValue).toBeUndefined();
			expect(notesCascade?.payload.newValue).toBe("A wrote this");
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const metadata = notesCascade?.payload.metadata as any;
			expect(metadata?.changedFields).toEqual(["notes"]);
			expect(metadata?.isCascade).toBe(true);
		});

		it("a no-op update_field (same value) emits no record_updated event", async () => {
			const { asUser } = await setupUser();

			await asUser.mutation(api.automations.create, {
				name: "Rewrite notes with the value already on the record",
				trigger: { type: "record_created", objectType: "client" },
				nodes: [updateFieldActionNode("act-1", "notes", "Preset note")],
				isActive: true,
			});

			await asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "Acme Co",
				status: "lead",
				notes: "Preset note",
			});

			await drainEvents();

			// The action ran \u2014 it just had nothing to announce.
			const executions = await t.run(async (ctx) =>
				ctx.db.query("workflowExecutions").collect()
			);
			expect(executions).toHaveLength(1);
			expect(executions[0].status).toBe("completed");

			const cascadeEvents = await t.run(async (ctx) =>
				ctx.db
					.query("domainEvents")
					.filter((q) =>
						q.and(
							q.eq(q.field("eventType"), "entity.record_updated"),
							q.eq(
								q.field("eventSource"),
								"automationExecutor.executeActionNodeV2"
							)
						)
					)
					.collect()
			);
			expect(cascadeEvents).toHaveLength(0);
		});
	});

	describe("update_fields — multi-field update (Phase B2)", () => {
		function updateFieldsActionNode(
			id: string,
			fields: Array<{ field: string; value: string | number | boolean }>,
			opts: { nextNodeId?: string } = {}
		) {
			return {
				id,
				type: "action" as const,
				config: {
					kind: "action" as const,
					action: {
						type: "update_fields" as const,
						target: "self" as const,
						fields: fields.map(({ field, value }) => ({
							field,
							value: { kind: "static" as const, value },
						})),
					},
				},
				nextNodeId: opts.nextNodeId,
			};
		}

		async function makeProject(asUser: ReturnType<typeof t.withIdentity>) {
			const clientId = await asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "Acme Co",
				status: "active",
			});
			return await asUser.mutation(api.projects.create, {
				clientId,
				title: "Kitchen remodel",
				status: "planned",
				projectType: "one-off",
			});
		}

		async function recordUpdatedCascades() {
			return await t.run(async (ctx) =>
				ctx.db
					.query("domainEvents")
					.filter((q) =>
						q.and(
							q.eq(q.field("eventType"), "entity.record_updated"),
							q.eq(
								q.field("eventSource"),
								"automationExecutor.executeActionNodeV2"
							)
						)
					)
					.collect()
			);
		}

		it("writes every field in one action; a chained automation watching one of them fires exactly once", async () => {
			const { asUser } = await setupUser();
			const startDate = Date.UTC(2026, 6, 20);

			await asUser.mutation(api.automations.create, {
				name: "A — stamp description and start date",
				trigger: { type: "record_created", objectType: "project" },
				nodes: [
					updateFieldsActionNode("act-1", [
						{ field: "description", value: "Multi ran" },
						{ field: "startDate", value: startDate },
					]),
				],
				isActive: true,
			});

			await asUser.mutation(api.automations.create, {
				name: "B — react to the start date",
				trigger: {
					type: "record_updated",
					objectType: "project",
					fields: ["startDate"],
				},
				nodes: [updateFieldActionNode("act-1", "title", "B ran")],
				isActive: true,
			});

			const projectId = await makeProject(asUser);
			await drainEvents();

			const project = await t.run(async (ctx) => ctx.db.get(projectId));
			expect(project?.description).toBe("Multi ran");
			expect(project?.startDate).toBe(startDate);
			// B saw A's one emit and ran exactly once.
			expect(project?.title).toBe("B ran");

			const executions = await t.run(async (ctx) =>
				ctx.db.query("workflowExecutions").collect()
			);
			expect(executions).toHaveLength(2);
			expect(executions.every((e) => e.status === "completed")).toBe(true);

			const cascadeEvents = await recordUpdatedCascades();
			const multi = cascadeEvents.find(
				(e) =>
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					((e.payload.metadata as any)?.changedFields ?? []).length === 2
			);
			expect(multi).toBeDefined();
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			expect((multi?.payload.metadata as any)?.changedFields).toEqual([
				"description",
				"startDate",
			]);
			// With more than one changed field there is no single field to name.
			expect(multi?.payload.field).toBeUndefined();
		});

		it("a status row cascades once and the rest emit one record_updated", async () => {
			const { asUser, orgId } = await setupUser();

			await asUser.mutation(api.automations.create, {
				name: "Complete and describe",
				trigger: { type: "record_created", objectType: "project" },
				nodes: [
					updateFieldsActionNode("act-1", [
						{ field: "status", value: "completed" },
						{ field: "description", value: "done" },
					]),
				],
				isActive: true,
			});

			const projectId = await makeProject(asUser);
			await drainEvents();

			const project = await t.run(async (ctx) => ctx.db.get(projectId));
			expect(project?.status).toBe("completed");
			expect(project?.description).toBe("done");
			expect(project?.completedAt).toBeDefined();

			const statusEvents = await t.run(async (ctx) =>
				ctx.db
					.query("domainEvents")
					.filter((q) => q.eq(q.field("eventType"), "entity.status_changed"))
					.collect()
			);
			const projectStatus = statusEvents.filter(
				(e) => e.payload.entityId === projectId
			);
			expect(projectStatus).toHaveLength(1);
			expect(projectStatus[0].payload.oldValue).toBe("planned");
			expect(projectStatus[0].payload.newValue).toBe("completed");

			const updatedEvents = await recordUpdatedCascades();
			expect(updatedEvents).toHaveLength(1);
			// Status rides its own status_changed event, never record_updated.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			expect((updatedEvents[0].payload.metadata as any)?.changedFields).toEqual([
				"description",
			]);

			// Aggregate replace fired: the project now counts as "completed".
			const completedCount = await t.run(async (ctx) =>
				projectCountsAggregate.count(ctx, {
					namespace: orgId,
					bounds: {
						lower: { key: ["completed", 0], inclusive: true },
						upper: {
							key: ["completed", Number.MAX_SAFE_INTEGER],
							inclusive: true,
						},
					},
				})
			);
			expect(completedCount).toBe(1);
		});

		it("a bad row fails the whole action before anything is written", async () => {
			const { asUser } = await setupUser();

			await asUser.mutation(api.automations.create, {
				name: "Good field, bad date",
				trigger: { type: "record_created", objectType: "project" },
				nodes: [
					updateFieldsActionNode("act-1", [
						{ field: "description", value: "should not land" },
						{ field: "endDate", value: "not-a-date" },
					]),
				],
				isActive: true,
			});

			const projectId = await makeProject(asUser);
			await drainEvents();

			// Rows validate before the first write — the good row must not land.
			const project = await t.run(async (ctx) => ctx.db.get(projectId));
			expect(project?.description).toBeUndefined();
			expect(project?.endDate).toBeUndefined();

			const executions = await t.run(async (ctx) =>
				ctx.db.query("workflowExecutions").collect()
			);
			expect(executions).toHaveLength(1);
			expect(executions[0].status).toBe("failed");
			expect(executions[0].error).toMatch(/not a valid date/i);

			const cascadeEvents = await recordUpdatedCascades();
			expect(cascadeEvents).toHaveLength(0);
		});

		it("a one-row update_fields emits the legacy single-field event shape", async () => {
			const { asUser } = await setupUser();

			await asUser.mutation(api.automations.create, {
				name: "One row",
				trigger: { type: "record_created", objectType: "client" },
				nodes: [
					updateFieldsActionNode("act-1", [{ field: "notes", value: "hello" }]),
				],
				isActive: true,
			});

			await asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "Acme Co",
				status: "lead",
			});
			await drainEvents();

			const cascadeEvents = await recordUpdatedCascades();
			expect(cascadeEvents).toHaveLength(1);
			expect(cascadeEvents[0].payload.field).toBe("notes");
			expect(cascadeEvents[0].payload.oldValue).toBeUndefined();
			expect(cascadeEvents[0].payload.newValue).toBe("hello");
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			expect((cascadeEvents[0].payload.metadata as any)?.changedFields).toEqual([
				"notes",
			]);
		});

		it("rows whose value already matches are left out of the emit", async () => {
			const { asUser } = await setupUser();

			await asUser.mutation(api.automations.create, {
				name: "Half no-op",
				trigger: { type: "record_created", objectType: "client" },
				nodes: [
					updateFieldsActionNode("act-1", [
						{ field: "notes", value: "Preset note" },
						{ field: "companyDescription", value: "fresh" },
					]),
				],
				isActive: true,
			});

			await asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "Acme Co",
				status: "lead",
				notes: "Preset note",
			});
			await drainEvents();

			const cascadeEvents = await recordUpdatedCascades();
			expect(cascadeEvents).toHaveLength(1);
			// Only the real change is announced — and with exactly one change the
			// event names it, same as a single-field write.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			expect((cascadeEvents[0].payload.metadata as any)?.changedFields).toEqual([
				"companyDescription",
			]);
			expect(cascadeEvents[0].payload.field).toBe("companyDescription");
		});
	});

	describe("date writes are normalized to the calendar-date encoding", () => {
		it("stores an instant written into a date field as UTC midnight", async () => {
			const { asUser } = await setupUser();

			const clientId = await asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "Acme Co",
				status: "lead",
			});

			// A mid-afternoon instant, not a calendar date. A formula like
			// ADDDAYS(NOW(), 3) produces exactly this shape.
			const instant = Date.UTC(2026, 6, 4, 15, 30, 0);

			await asUser.mutation(api.automations.create, {
				name: "Stamp a start date",
				trigger: { type: "record_created", objectType: "project" },
				nodes: [updateFieldActionNode("act-1", "startDate", instant)],
				isActive: true,
			});

			const projectId = await asUser.mutation(api.projects.create, {
				clientId,
				title: "Kitchen remodel",
				status: "planned",
				projectType: "one-off",
			});

			await drainEvents();

			const project = await t.run(async (ctx) => ctx.db.get(projectId));
			// Written through unchanged, the stored value would be an instant, which
			// the formula layer then reads as an instant forever after — and
			// `startDate == TODAY()` would go quietly false for this record.
			expect(project?.startDate).toBe(Date.UTC(2026, 6, 4));
			expect((project?.startDate as number) % 86_400_000).toBe(0);
		});
	});

	describe("org isolation", () => {
		it("does not fire an org A automation for an org B record", async () => {
			const orgA = await setupUser({
				clerkUserId: "user_orgA_exec",
				clerkOrgId: "org_orgA_exec",
			});
			const orgB = await setupUser({
				clerkUserId: "user_orgB_exec",
				clerkOrgId: "org_orgB_exec",
			});

			await orgA.asUser.mutation(api.automations.create, {
				name: "Org A only",
				trigger: { type: "record_created", objectType: "client" },
				nodes: [updateFieldActionNode("act-1", "notes", "Org A fired")],
				isActive: true,
			});

			// Positive control: org A's own client IS touched.
			const orgAClientId = await orgA.asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "Org A Client",
				status: "lead",
			});

			// Negative control: org B's client must NOT be touched by org A's automation.
			const orgBClientId = await orgB.asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "Org B Client",
				status: "lead",
			});

			await drainEvents();

			const orgAClient = await t.run(async (ctx) => ctx.db.get(orgAClientId));
			const orgBClient = await t.run(async (ctx) => ctx.db.get(orgBClientId));
			expect(orgAClient?.notes).toBe("Org A fired");
			expect(orgBClient?.notes).toBeUndefined();
		});
	});

	describe("scheduled dispatch", () => {
		function scheduledAutomation(
			overrides: {
				name?: string;
				schedule?: {
					frequency: "daily" | "weekly" | "monthly";
					timezone: string;
					time?: string;
					dayOfWeek?: number;
					dayOfMonth?: number;
				};
				nodes?:
					| ReturnType<typeof conditionNode>[]
					| ReturnType<typeof updateFieldActionNode>[]
					| ReturnType<typeof notifyNode>[];
				isActive?: boolean;
			} = {}
		) {
			return {
				name: overrides.name ?? "Scheduled automation",
				trigger: {
					type: "scheduled" as const,
					schedule: overrides.schedule ?? {
						frequency: "daily" as const,
						timezone: "UTC",
						time: "09:00",
					},
				},
				// A scheduled run has no trigger record, so the default step must not
				// need one — a top-level condition or update_field is rejected at save.
				nodes: overrides.nodes ?? [notifyNode("notify-1")],
				isActive: overrides.isActive,
			};
		}

		/** Marks the org as premium so scheduled dispatch isn't gated. */
		async function makeOrgPremium(orgId: Id<"organizations">) {
			await t.run(async (ctx) =>
				ctx.db.patch(orgId, {
					clerkPlanSlug: "onetool_business_plan_org",
					subscriptionStatus: "active",
				})
			);
		}

		async function drainScheduled() {
			await t.finishAllScheduledFunctions(vi.runAllTimers);
		}

		it("create with isActive + scheduled trigger sets nextRunAt; draft leaves it unset", async () => {
			const { asUser } = await setupUser();

			const activeId = await asUser.mutation(
				api.automations.create,
				scheduledAutomation({ isActive: true })
			);
			const draftId = await asUser.mutation(
				api.automations.create,
				scheduledAutomation({ name: "Draft scheduled" })
			);

			const active = await t.run(async (ctx) => ctx.db.get(activeId));
			const draft = await t.run(async (ctx) => ctx.db.get(draftId));

			expect(active?.nextRunAt).toBeTypeOf("number");
			expect(active!.nextRunAt!).toBeGreaterThan(Date.now());
			expect(draft?.nextRunAt).toBeUndefined();
		});

		it("toggleActive pause clears nextRunAt; re-activating re-sets it", async () => {
			const { asUser } = await setupUser();

			const id = await asUser.mutation(
				api.automations.create,
				scheduledAutomation({ isActive: true })
			);
			const beforePause = await t.run(async (ctx) => ctx.db.get(id));
			expect(beforePause?.nextRunAt).toBeTypeOf("number");

			await asUser.mutation(api.automations.toggleActive, { id });
			const paused = await t.run(async (ctx) => ctx.db.get(id));
			expect(paused?.status).toBe("paused");
			expect(paused?.nextRunAt).toBeUndefined();

			await asUser.mutation(api.automations.toggleActive, { id });
			const reactivated = await t.run(async (ctx) => ctx.db.get(id));
			expect(reactivated?.status).toBe("active");
			expect(reactivated?.nextRunAt).toBeTypeOf("number");
		});

		it("nextRunAt tracks the published trigger, not unpublished working-copy edits", async () => {
			const { asUser } = await setupUser();

			const id = await asUser.mutation(
				api.automations.create,
				scheduledAutomation({ isActive: true })
			);
			expect((await t.run(async (ctx) => ctx.db.get(id)))?.nextRunAt).toBeTypeOf(
				"number"
			);

			// Editing the working copy to a non-scheduled trigger does NOT change
			// nextRunAt — the published scheduled snapshot still governs dispatch.
			await asUser.mutation(api.automations.update, {
				id,
				trigger: { type: "record_created", objectType: "client" },
				nodes: [conditionNode("cond-1", "companyName", "contains", "Acme")],
			});
			expect(
				(await t.run(async (ctx) => ctx.db.get(id)))?.nextRunAt
			).toBeTypeOf("number");

			// Publishing the non-scheduled trigger clears nextRunAt.
			await asUser.mutation(api.automations.publish, { id });
			const switchedAway = await t.run(async (ctx) => ctx.db.get(id));
			expect(switchedAway?.nextRunAt).toBeUndefined();

			// Publishing a scheduled trigger sets it again. The condition has to go:
			// switching back to a schedule takes the trigger record away with it.
			await asUser.mutation(api.automations.update, {
				id,
				trigger: {
					type: "scheduled",
					schedule: { frequency: "daily" as const, timezone: "UTC", time: "09:00" },
				},
				nodes: [notifyNode("notify-1")],
			});
			await asUser.mutation(api.automations.publish, { id });
			const switchedBack = await t.run(async (ctx) => ctx.db.get(id));
			expect(switchedBack?.nextRunAt).toBeTypeOf("number");
		});

		it("dispatches due automations: claims first, runs production execution to completion", async () => {
			const { asUser, orgId } = await setupUser();
			await makeOrgPremium(orgId);

			const id = await asUser.mutation(
				api.automations.create,
				scheduledAutomation({ isActive: true })
			);
			const past = Date.now() - 1000;
			await t.run(async (ctx) => ctx.db.patch(id, { nextRunAt: past }));

			const result = await t.mutation(
				internal.automationExecutor.dispatchScheduledAutomations,
				{}
			);
			expect(result.due).toBe(1);
			expect(result.dispatched).toBe(1);

			// Claim-first: nextRunAt already advanced before the run executes.
			const claimed = await t.run(async (ctx) => ctx.db.get(id));
			expect(claimed?.nextRunAt).toBeGreaterThan(Date.now());

			await drainScheduled();

			const executions = await t.run(async (ctx) =>
				ctx.db.query("workflowExecutions").collect()
			);
			expect(executions).toHaveLength(1);
			expect(executions[0].triggeredBy).toBe("schedule");
			expect(executions[0].mode).toBe("production");
			expect(executions[0].status).toBe("completed");
		});

		it("skips dispatch for a non-premium org: inserts a skipped execution and still advances nextRunAt", async () => {
			const { asUser } = await setupUser();
			// No premium fields set on the org.

			const id = await asUser.mutation(
				api.automations.create,
				scheduledAutomation({ isActive: true })
			);
			const past = Date.now() - 1000;
			await t.run(async (ctx) => ctx.db.patch(id, { nextRunAt: past }));

			await t.mutation(internal.automationExecutor.dispatchScheduledAutomations, {});
			await drainScheduled();

			const automation = await t.run(async (ctx) => ctx.db.get(id));
			expect(automation?.nextRunAt).toBeGreaterThan(Date.now());

			const executions = await t.run(async (ctx) =>
				ctx.db.query("workflowExecutions").collect()
			);
			expect(executions).toHaveLength(1);
			expect(executions[0].status).toBe("skipped");
			expect(executions[0].error).toMatch(/premium/i);
		});

		it("clears a stale nextRunAt pointer when the trigger is no longer scheduled, with no execution", async () => {
			const { asUser } = await setupUser();

			// Active automation with a record_created trigger, whose nextRunAt is
			// a stale pointer left over from a prior scheduled trigger.
			const id = await asUser.mutation(api.automations.create, {
				name: "Stale pointer",
				trigger: { type: "record_created", objectType: "client" },
				nodes: [conditionNode("cond-1", "companyName", "contains", "Acme")],
				isActive: true,
			});
			const past = Date.now() - 1000;
			await t.run(async (ctx) => ctx.db.patch(id, { nextRunAt: past }));

			const result = await t.mutation(
				internal.automationExecutor.dispatchScheduledAutomations,
				{}
			);
			expect(result.due).toBe(1);
			expect(result.dispatched).toBe(0);

			const automation = await t.run(async (ctx) => ctx.db.get(id));
			expect(automation?.nextRunAt).toBeUndefined();

			const executions = await t.run(async (ctx) =>
				ctx.db.query("workflowExecutions").collect()
			);
			expect(executions).toHaveLength(0);
		});

		it("a record-dependent action on a scheduled trigger is rejected at save", async () => {
			const { asUser } = await setupUser();

			await expect(
				asUser.mutation(
					api.automations.create,
					scheduledAutomation({
						isActive: true,
						nodes: [updateFieldActionNode("act-1", "notes", "Should not run")],
					})
				)
			).rejects.toThrow(/no record to update/i);
		});

		it("a snapshot published before that rule still fails the run with a clear error", async () => {
			// Rows published before the save-time rule landed can still carry a
			// top-level update_field. The runtime guard is what protects them.
			const { orgId } = await setupUser();
			await makeOrgPremium(orgId);

			const trigger = {
				type: "scheduled" as const,
				schedule: {
					frequency: "daily" as const,
					timezone: "UTC",
					time: "09:00",
				},
			};
			const nodes = [updateFieldActionNode("act-1", "notes", "Should not run")];

			await t.run(async (ctx) => {
				const user = await ctx.db.query("users").first();
				const now = Date.now();
				return ctx.db.insert("workflowAutomations", {
					orgId,
					name: "Legacy broken scheduled",
					trigger,
					nodes,
					status: "active" as const,
					publishedSnapshot: {
						trigger,
						nodes,
						version: 1,
						publishedAt: now,
					},
					nextRunAt: now - 1000,
					createdBy: user!._id,
					createdAt: now,
					updatedAt: now,
				});
			});

			await t.mutation(internal.automationExecutor.dispatchScheduledAutomations, {});
			await drainScheduled();

			const executions = await t.run(async (ctx) =>
				ctx.db.query("workflowExecutions").collect()
			);
			expect(executions).toHaveLength(1);
			expect(executions[0].status).toBe("failed");
			expect(executions[0].error).toMatch(/needs a record to act on/i);
		});
	});

	describe("recursion depth guard", () => {
		it("pins MAX_RECURSION_DEPTH=5: handleRecordEvent short-circuits at depth 5", async () => {
			const { asUser, orgId } = await setupUser();

			await asUser.mutation(api.automations.create, {
				name: "Should not run at max depth",
				trigger: { type: "record_created", objectType: "client" },
				nodes: [updateFieldActionNode("act-1", "notes", "should not run")],
				isActive: true,
			});

			const eventId: Id<"domainEvents"> = await t.run(async (ctx) =>
				ctx.db.insert("domainEvents", {
					orgId,
					eventType: "entity.record_created",
					eventSource: "test",
					payload: {
						entityType: "client",
						entityId: "fake-client-id",
						metadata: {
							executionChain: ["a", "b", "c", "d", "e"],
							recursionDepth: 5,
						},
					},
					status: "pending",
					attemptCount: 0,
					createdAt: Date.now(),
				})
			);

			const result = await t.mutation(
				internal.automationExecutor.handleRecordEvent,
				{ eventId, orgId }
			);

			expect(result).toEqual({ triggered: 0, recursionLimited: true });

			const executions = await t.run(async (ctx) =>
				ctx.db.query("workflowExecutions").collect()
			);
			expect(executions).toHaveLength(0);
		});
	});

	describe("Slice 3 — full block set", () => {
		function filterGroup(
			field: string,
			operator: string,
			value: string | number | boolean
		) {
			return {
				logic: "and" as const,
				rules: [
					{
						field,
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						operator: operator as any,
						value: { kind: "static" as const, value },
					},
				],
			};
		}

		/** Like filterGroup, but the value resolves from scope (e.g. trigger.record._id). */
		function varFilterGroup(field: string, operator: string, path: string) {
			return {
				logic: "and" as const,
				rules: [
					{
						field,
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						operator: operator as any,
						value: { kind: "var" as const, path },
					},
				],
			};
		}

		function fetchNode(
			id: string,
			objectType: "client" | "project" | "quote" | "invoice" | "task",
			filters: (ReturnType<typeof filterGroup> | ReturnType<typeof varFilterGroup>)[] = [],
			opts: { nextNodeId?: string; limit?: number } = {}
		) {
			return {
				id,
				type: "fetch_records" as const,
				config: {
					kind: "fetch_records" as const,
					objectType,
					filters,
					limit: opts.limit,
				},
				nextNodeId: opts.nextNodeId,
			};
		}

		function loopNode(
			id: string,
			sourceNodeId: string,
			opts: {
				bodyStartNodeId?: string;
				nextNodeId?: string;
				onItemError?: "continue" | "abort";
			} = {}
		) {
			return {
				id,
				type: "loop" as const,
				config: {
					kind: "loop" as const,
					sourceNodeId,
					onItemError: opts.onItemError,
				},
				bodyStartNodeId: opts.bodyStartNodeId,
				nextNodeId: opts.nextNodeId,
			};
		}

		/**
		 * Writes a field from a variable path. Used to poison individual loop items:
		 * driving project.status off the item's own title makes a project titled
		 * "bogus" fail select coercion while its valid-status siblings succeed.
		 */
		function updateFieldFromVarNode(
			id: string,
			field: string,
			path: string,
			opts: { nextNodeId?: string } = {}
		) {
			return {
				id,
				type: "action" as const,
				config: {
					kind: "action" as const,
					action: {
						type: "update_field" as const,
						target: "self" as const,
						field,
						value: { kind: "var" as const, path },
					},
				},
				nextNodeId: opts.nextNodeId,
			};
		}

		function endNode(id: string) {
			return { id, type: "end" as const, config: { kind: "end" as const } };
		}

		function loopConditionNode(
			id: string,
			loopNodeId: string,
			field: string,
			operator: string,
			value: string | number | boolean,
			opts: { nextNodeId?: string; elseNodeId?: string } = {}
		) {
			return {
				id,
				type: "condition" as const,
				config: {
					kind: "condition" as const,
					logic: "and" as const,
					source: { loopNodeId },
					groups: [filterGroup(field, operator, value)],
				},
				nextNodeId: opts.nextNodeId,
				elseNodeId: opts.elseNodeId,
			};
		}

		function createTaskActionNode(
			id: string,
			opts: {
				title: string;
				dueInDays?: number;
				linkToRecord?: boolean;
				nextNodeId?: string;
			}
		) {
			return {
				id,
				type: "action" as const,
				config: {
					kind: "action" as const,
					action: {
						type: "create_task" as const,
						title: { kind: "static" as const, value: opts.title },
						dueInDays: opts.dueInDays,
						linkToRecord: opts.linkToRecord,
					},
				},
				nextNodeId: opts.nextNodeId,
			};
		}

		function sendNotificationActionNode(
			id: string,
			recipient:
				| "org_admins"
				| "all_members"
				| { userId: string }
				| {
						recordField: {
							target:
								| "self"
								| {
										related:
											| "client"
											| "project"
											| "quote"
											| "invoice"
											| "task";
								  };
							field: string;
						};
				  },
			message: string,
			opts: { nextNodeId?: string; channels?: ("in_app" | "push")[] } = {}
		) {
			return {
				id,
				type: "action" as const,
				config: {
					kind: "action" as const,
					action: {
						type: "send_notification" as const,
						recipient,
						...(opts.channels ? { channels: opts.channels } : {}),
						message,
					},
				},
				nextNodeId: opts.nextNodeId,
			};
		}

		function sendTeamMessageActionNode(
			id: string,
			recipients: "all_members" | "admins" | { userIds: string[] },
			title: string,
			message: string,
			opts: { nextNodeId?: string } = {}
		) {
			return {
				id,
				type: "action" as const,
				config: {
					kind: "action" as const,
					action: {
						type: "send_team_message" as const,
						recipients,
						title,
						message,
					},
				},
				nextNodeId: opts.nextNodeId,
			};
		}

		/** Marks the org as premium so scheduled dispatch isn't gated. */
		async function makeOrgPremium(orgId: Id<"organizations">) {
			await t.run(async (ctx) =>
				ctx.db.patch(orgId, {
					clerkPlanSlug: "onetool_business_plan_org",
					subscriptionStatus: "active",
				})
			);
		}

		async function drainScheduled() {
			await t.finishAllScheduledFunctions(vi.runAllTimers);
		}

		/**
		 * Fires a scheduled (no-objectType) automation exactly once: sets
		 * nextRunAt into the past, dispatches, and drains to completion.
		 */
		async function runScheduledOnce(automationId: Id<"workflowAutomations">) {
			await t.run(async (ctx) =>
				ctx.db.patch(automationId, { nextRunAt: Date.now() - 1000 })
			);
			await t.mutation(internal.automationExecutor.dispatchScheduledAutomations, {});
			await drainScheduled();
		}

		it("fetch + loop + update_field e2e: updates only records matching the fetch filter", async () => {
			const { asUser, orgId } = await setupUser();
			await makeOrgPremium(orgId);

			const clientId = await asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "Acme Co",
				status: "active",
			});
			const p1 = await asUser.mutation(api.projects.create, {
				clientId,
				title: "P1",
				status: "planned",
				projectType: "one-off",
			});
			const p2 = await asUser.mutation(api.projects.create, {
				clientId,
				title: "P2",
				status: "planned",
				projectType: "one-off",
			});
			const p3 = await asUser.mutation(api.projects.create, {
				clientId,
				title: "P3",
				status: "completed",
				projectType: "one-off",
			});

			// Scheduled trigger with no objectType: runs once, no trigger record —
			// the loop supplies its own per-item scope. This also sidesteps a
			// validation gap (see final report) where update_field actions inside
			// a loop body are checked against the *trigger's* object type instead
			// of the loop's fetched type.
			const automationId = await asUser.mutation(api.automations.create, {
				name: "Bulk-progress planned projects",
				trigger: {
					type: "scheduled",
					schedule: { frequency: "daily", timezone: "UTC", time: "09:00" },
				},
				nodes: [
					fetchNode(
						"fetch-1",
						"project",
						[filterGroup("status", "equals", "planned")],
						{ nextNodeId: "loop-1" }
					),
					loopNode("loop-1", "fetch-1", {
						bodyStartNodeId: "body-act",
						nextNodeId: "end-1",
					}),
					updateFieldActionNode("body-act", "status", "in-progress", {
						target: "self",
					}),
					endNode("end-1"),
				],
				isActive: true,
			});

			await runScheduledOnce(automationId);

			const [pp1, pp2, pp3] = await t.run(async (ctx) =>
				Promise.all([ctx.db.get(p1), ctx.db.get(p2), ctx.db.get(p3)])
			);
			expect(pp1?.status).toBe("in-progress");
			expect(pp2?.status).toBe("in-progress");
			expect(pp3?.status).toBe("completed");

			const executions = await t.run(async (ctx) =>
				ctx.db.query("workflowExecutions").collect()
			);
			expect(executions).toHaveLength(1);
			expect(executions[0].status).toBe("completed");
			const loopEntry = executions[0].nodesExecuted.find(
				(n) => n.nodeId === "loop-1"
			);
			expect(loopEntry?.recordsProcessed).toBe(2);
		});

		it("loop-scoped condition: only items passing the condition get the body action", async () => {
			const { asUser, orgId } = await setupUser();
			await makeOrgPremium(orgId);

			const clientId = await asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "Acme Co",
				status: "active",
			});
			const keepId = await asUser.mutation(api.projects.create, {
				clientId,
				title: "Keep me",
				status: "planned",
				projectType: "one-off",
			});
			const skipId = await asUser.mutation(api.projects.create, {
				clientId,
				title: "Skip me",
				status: "planned",
				projectType: "one-off",
			});

			const automationId = await asUser.mutation(api.automations.create, {
				name: "Progress matching projects only",
				trigger: {
					type: "scheduled",
					schedule: { frequency: "daily", timezone: "UTC", time: "09:00" },
				},
				nodes: [
					fetchNode(
						"fetch-1",
						"project",
						[filterGroup("status", "equals", "planned")],
						{ nextNodeId: "loop-1" }
					),
					loopNode("loop-1", "fetch-1", {
						bodyStartNodeId: "cond-1",
						nextNodeId: "end-1",
					}),
					loopConditionNode("cond-1", "loop-1", "title", "contains", "Keep", {
						nextNodeId: "body-act",
						// No elseNodeId: a failing condition simply ends the iteration.
					}),
					updateFieldActionNode("body-act", "status", "in-progress", {
						target: "self",
					}),
					endNode("end-1"),
				],
				isActive: true,
			});

			await runScheduledOnce(automationId);

			const [keep, skip] = await t.run(async (ctx) =>
				Promise.all([ctx.db.get(keepId), ctx.db.get(skipId)])
			);
			expect(keep?.status).toBe("in-progress");
			expect(skip?.status).toBe("planned");

			const executions = await t.run(async (ctx) =>
				ctx.db.query("workflowExecutions").collect()
			);
			expect(executions).toHaveLength(1);
			expect(executions[0].status).toBe("completed");
			const loopEntry = executions[0].nodesExecuted.find(
				(n) => n.nodeId === "loop-1"
			);
			expect(loopEntry?.recordsProcessed).toBe(2);
		});

		it("var-kind fetch filter: cancel client cascades to only its own tasks", async () => {
			const { asUser } = await setupUser();

			const clientId = await asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "Acme Co",
				status: "active",
			});
			const otherClientId = await asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "Other Co",
				status: "active",
			});

			const task1 = await asUser.mutation(api.tasks.create, {
				clientId,
				title: "Task 1",
				date: Date.now(),
				status: "pending",
			});
			const task2 = await asUser.mutation(api.tasks.create, {
				clientId,
				title: "Task 2",
				date: Date.now(),
				status: "pending",
			});
			const otherTask = await asUser.mutation(api.tasks.create, {
				clientId: otherClientId,
				title: "Other client's task",
				date: Date.now(),
				status: "pending",
			});

			await asUser.mutation(api.automations.create, {
				name: "Cancel client's tasks on archive",
				trigger: {
					type: "status_changed",
					objectType: "client",
					toStatus: "archived",
				},
				nodes: [
					// clientId resolves via a var-kind value against trigger.record._id,
					// not a static id — the case under test.
					fetchNode(
						"fetch-1",
						"task",
						[varFilterGroup("clientId", "equals", "trigger.record._id")],
						{ nextNodeId: "loop-1" }
					),
					loopNode("loop-1", "fetch-1", {
						bodyStartNodeId: "body-act",
						nextNodeId: "end-1",
					}),
					updateFieldActionNode("body-act", "status", "cancelled", {
						target: "self",
					}),
					endNode("end-1"),
				],
				isActive: true,
			});

			await asUser.mutation(api.clients.update, {
				id: clientId,
				status: "archived",
			});
			await drainEvents();

			const [t1, t2, t3] = await t.run(async (ctx) =>
				Promise.all([
					ctx.db.get(task1),
					ctx.db.get(task2),
					ctx.db.get(otherTask),
				])
			);
			expect(t1?.status).toBe("cancelled");
			expect(t2?.status).toBe("cancelled");
			expect(t3?.status).toBe("pending");

			const executions = await t.run(async (ctx) =>
				ctx.db.query("workflowExecutions").collect()
			);
			expect(executions).toHaveLength(1);
			expect(executions[0].status).toBe("completed");
			const loopEntry = executions[0].nodesExecuted.find(
				(n) => n.nodeId === "loop-1"
			);
			expect(loopEntry?.recordsProcessed).toBe(2);
		});

		it("create_task: interpolates title, links project/client, computes a UTC-midnight due date", async () => {
			const { asUser } = await setupUser();

			const clientId = await asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "Acme Co",
				status: "active",
			});

			await asUser.mutation(api.automations.create, {
				name: "Task on new project",
				trigger: { type: "record_created", objectType: "project" },
				nodes: [
					createTaskActionNode("task-1", {
						title: "Follow up: {{trigger.record.title}}",
						dueInDays: 3,
						linkToRecord: true,
					}),
				],
				isActive: true,
			});

			const projectId = await asUser.mutation(api.projects.create, {
				clientId,
				title: "Kitchen remodel",
				status: "planned",
				projectType: "one-off",
			});

			await drainEvents();

			const tasks = await t.run(async (ctx) => ctx.db.query("tasks").collect());
			expect(tasks).toHaveLength(1);
			const task = tasks[0];
			expect(task.title).toBe("Follow up: Kitchen remodel");
			expect(task.projectId).toBe(projectId);
			expect(task.clientId).toBe(clientId);
			expect(task.status).toBe("pending");
			expect(task.type).toBe("internal");
			expect(task.date % 86_400_000).toBe(0);
			expect(task.date).toBeGreaterThan(Date.now() + 2 * 86_400_000);
			expect(task.date).toBeLessThan(Date.now() + 4 * 86_400_000);
		});

		it("aggregate: sum/avg/min/max over fetched records, precise to cents", async () => {
			const { asUser, orgId } = await setupUser();
			await makeOrgPremium(orgId);

			const clientId = await asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "Acme Co",
				status: "active",
			});

			// Totals 0.10, 0.20, 100 -> sum 100.30 exactly (integer-cent math,
			// not 100.30000000000001 from naive float addition).
			const totals = [0.1, 0.2, 100];
			await t.run(async (ctx) => {
				for (let i = 0; i < totals.length; i++) {
					await ctx.db.insert("invoices", {
						orgId,
						clientId,
						invoiceNumber: `INV-${i}`,
						status: "sent" as const,
						subtotal: totals[i],
						total: totals[i],
						issuedDate: Date.now(),
						dueDate: Date.now(),
						publicToken: crypto.randomUUID(),
					});
				}
			});

			const aggNode = (
				id: string,
				op: "sum" | "avg" | "min" | "max",
				next: string
			) => ({
				id,
				type: "aggregate" as const,
				config: {
					kind: "aggregate" as const,
					sourceNodeId: "fetch-1",
					field: "total",
					op,
				},
				nextNodeId: next,
			});

			const automationId = await asUser.mutation(api.automations.create, {
				name: "Invoice totals",
				trigger: {
					type: "scheduled",
					schedule: { frequency: "daily", timezone: "UTC", time: "09:00" },
				},
				nodes: [
					fetchNode("fetch-1", "invoice", [], { nextNodeId: "sum" }),
					aggNode("sum", "sum", "avg"),
					aggNode("avg", "avg", "min"),
					aggNode("min", "min", "max"),
					aggNode("max", "max", "end-1"),
					endNode("end-1"),
				],
				isActive: true,
			});

			await runScheduledOnce(automationId);

			const executions = await t.run(async (ctx) =>
				ctx.db.query("workflowExecutions").collect()
			);
			expect(executions).toHaveLength(1);
			expect(executions[0].status).toBe("completed");
			const result = (nodeId: string) =>
				(
					executions[0].nodesExecuted.find((n) => n.nodeId === nodeId)
						?.output as { result: number } | undefined
				)?.result;
			expect(result("sum")).toBe(100.3);
			expect(result("avg")).toBe(33.43); // 100.3 / 3, rounded to cents
			expect(result("min")).toBe(0.1);
			expect(result("max")).toBe(100);
		});

		it("aggregate over zero matching records: sum is 0, min/max/avg are null", async () => {
			const { asUser, orgId } = await setupUser();
			await makeOrgPremium(orgId);

			// No invoices exist, so the fetch returns an empty set and every
			// aggregate runs over zero records.
			const aggNode = (
				id: string,
				op: "sum" | "avg" | "min" | "max",
				next: string
			) => ({
				id,
				type: "aggregate" as const,
				config: {
					kind: "aggregate" as const,
					sourceNodeId: "fetch-1",
					field: "total",
					op,
				},
				nextNodeId: next,
			});

			const automationId = await asUser.mutation(api.automations.create, {
				name: "Empty invoice totals",
				trigger: {
					type: "scheduled",
					schedule: { frequency: "daily", timezone: "UTC", time: "09:00" },
				},
				nodes: [
					fetchNode("fetch-1", "invoice", [], { nextNodeId: "sum" }),
					aggNode("sum", "sum", "avg"),
					aggNode("avg", "avg", "min"),
					aggNode("min", "min", "max"),
					aggNode("max", "max", "end-1"),
					endNode("end-1"),
				],
				isActive: true,
			});

			await runScheduledOnce(automationId);

			const executions = await t.run(async (ctx) =>
				ctx.db.query("workflowExecutions").collect()
			);
			expect(executions).toHaveLength(1);
			expect(executions[0].status).toBe("completed");
			const result = (nodeId: string) =>
				(
					executions[0].nodesExecuted.find((n) => n.nodeId === nodeId)
						?.output as { result: number | null } | undefined
				)?.result;
			// Empty sum is genuinely 0; min/max/avg have no value → null (not 0).
			expect(result("sum")).toBe(0);
			expect(result("avg")).toBeNull();
			expect(result("min")).toBeNull();
			expect(result("max")).toBeNull();
		});

		describe("scheduled triggers have no record (A1)", () => {
			/** A condition whose left side is a scope value, not a record field. */
			function varLeftConditionNode(
				id: string,
				path: string,
				operator: string,
				value: number,
				opts: { nextNodeId?: string; elseNodeId?: string } = {}
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
										field: "",
										left: { kind: "var" as const, path },
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
				};
			}

			async function seedInvoices(
				orgId: Id<"organizations">,
				clientId: Id<"clients">,
				totals: number[]
			) {
				await t.run(async (ctx) => {
					for (let i = 0; i < totals.length; i++) {
						await ctx.db.insert("invoices", {
							orgId,
							clientId,
							invoiceNumber: `INV-A1-${i}`,
							status: "sent" as const,
							subtotal: totals[i],
							total: totals[i],
							issuedDate: Date.now(),
							dueDate: Date.now(),
							publicToken: crypto.randomUUID(),
						});
					}
				});
			}

			// The pattern A1 exists to unlock: a record-less run that branches on an
			// aggregate. Before the var-left rule this was unbuildable — a condition
			// could only read a record field, and a scheduled run has no record.
			it("fetch -> aggregate -> condition on the aggregate -> notify", async () => {
				const { asUser, orgId } = await setupUser();
				await makeOrgPremium(orgId);

				const clientId = await asUser.mutation(api.clients.create, {
					portalAccessId: crypto.randomUUID(),
					companyName: "Acme Co",
					status: "active",
				});
				await seedInvoices(orgId, clientId, [6000, 5000]); // sum 11,000

				const automationId = await asUser.mutation(api.automations.create, {
					name: "Unpaid over 10k",
					trigger: {
						type: "scheduled",
						schedule: { frequency: "daily", timezone: "UTC", time: "09:00" },
					},
					nodes: [
						fetchNode("fetch-1", "invoice", [], { nextNodeId: "agg-1" }),
						{
							id: "agg-1",
							type: "aggregate" as const,
							config: {
								kind: "aggregate" as const,
								sourceNodeId: "fetch-1",
								field: "total",
								op: "sum" as const,
							},
							nextNodeId: "cond-1",
						},
						varLeftConditionNode(
							"cond-1",
							"node.agg-1.result",
							"greater_than",
							10000,
							{ nextNodeId: "notify-1", elseNodeId: "end-1" }
						),
						sendNotificationActionNode(
							"notify-1",
							"org_admins",
							"Unpaid invoices are over $10k",
							{ nextNodeId: "end-1" }
						),
						endNode("end-1"),
					],
					isActive: true,
				});

				await runScheduledOnce(automationId);

				const executions = await t.run(async (ctx) =>
					ctx.db.query("workflowExecutions").collect()
				);
				expect(executions).toHaveLength(1);
				expect(executions[0].status).toBe("completed");

				const notifications = await t.run(async (ctx) =>
					ctx.db.query("notifications").collect()
				);
				expect(notifications).toHaveLength(1);
				expect(notifications[0].message).toMatch(/over \$10k/);
			});

			it("takes the else branch when the aggregate is under the threshold", async () => {
				const { asUser, orgId } = await setupUser();
				await makeOrgPremium(orgId);

				const clientId = await asUser.mutation(api.clients.create, {
					portalAccessId: crypto.randomUUID(),
					companyName: "Acme Co",
					status: "active",
				});
				await seedInvoices(orgId, clientId, [1000]); // sum 1,000

				const automationId = await asUser.mutation(api.automations.create, {
					name: "Unpaid over 10k",
					trigger: {
						type: "scheduled",
						schedule: { frequency: "daily", timezone: "UTC", time: "09:00" },
					},
					nodes: [
						fetchNode("fetch-1", "invoice", [], { nextNodeId: "agg-1" }),
						{
							id: "agg-1",
							type: "aggregate" as const,
							config: {
								kind: "aggregate" as const,
								sourceNodeId: "fetch-1",
								field: "total",
								op: "sum" as const,
							},
							nextNodeId: "cond-1",
						},
						varLeftConditionNode(
							"cond-1",
							"node.agg-1.result",
							"greater_than",
							10000,
							{ nextNodeId: "notify-1", elseNodeId: "end-1" }
						),
						sendNotificationActionNode(
							"notify-1",
							"org_admins",
							"Unpaid invoices are over $10k",
							{ nextNodeId: "end-1" }
						),
						endNode("end-1"),
					],
					isActive: true,
				});

				await runScheduledOnce(automationId);

				const executions = await t.run(async (ctx) =>
					ctx.db.query("workflowExecutions").collect()
				);
				expect(executions[0].status).toBe("completed");
				const notifications = await t.run(async (ctx) =>
					ctx.db.query("notifications").collect()
				);
				expect(notifications).toHaveLength(0);
			});

			// Back-compat: the correctly-built scheduled shape (record scope comes
			// from the loop, not the trigger) must keep validating AND running. The
			// rejection rules key on loop-body membership; invert that and this
			// breaks every working scheduled automation in production.
			it("fetch -> loop -> update inside the loop still saves and runs", async () => {
				const { asUser, orgId } = await setupUser();
				await makeOrgPremium(orgId);

				const clientId = await asUser.mutation(api.clients.create, {
					portalAccessId: crypto.randomUUID(),
					companyName: "Acme Co",
					status: "active",
				});
				// Created through the API so aggregates initialise (see CLAUDE.md).
				const projectIds = await Promise.all(
					["Alpha", "Beta"].map((title) =>
						asUser.mutation(api.projects.create, {
							clientId,
							title,
							status: "planned",
							projectType: "one-off",
						})
					)
				);

				const automationId = await asUser.mutation(api.automations.create, {
					name: "Nightly project sweep",
					trigger: {
						type: "scheduled",
						schedule: { frequency: "daily", timezone: "UTC", time: "09:00" },
					},
					nodes: [
						fetchNode("fetch-1", "project", [], { nextNodeId: "loop-1" }),
						loopNode("loop-1", "fetch-1", {
							bodyStartNodeId: "act-1",
							nextNodeId: "end-1",
						}),
						updateFieldActionNode("act-1", "status", "in-progress"),
						endNode("end-1"),
					],
					isActive: true,
				});

				await runScheduledOnce(automationId);

				const executions = await t.run(async (ctx) =>
					ctx.db.query("workflowExecutions").collect()
				);
				expect(executions[0].status).toBe("completed");

				const projects = await t.run(async (ctx) =>
					Promise.all(projectIds.map((id) => ctx.db.get(id)))
				);
				for (const project of projects) {
					expect(project?.status).toBe("in-progress");
				}
			});

			// The dead field: stored rows carry it, so it must still parse — and the
			// run must stay record-less regardless.
			it("a stored objectType is stripped on save and the run stays record-less", async () => {
				const { asUser, orgId } = await setupUser();
				await makeOrgPremium(orgId);

				const automationId = await asUser.mutation(api.automations.create, {
					name: "Legacy scheduled with objectType",
					trigger: {
						type: "scheduled",
						objectType: "quote",
						schedule: { frequency: "daily", timezone: "UTC", time: "09:00" },
					},
					nodes: [notifyNode("notify-1")],
					isActive: true,
				});

				const stored = await t.run(async (ctx) => ctx.db.get(automationId));
				expect(stored?.trigger).not.toHaveProperty("objectType");
				expect(stored?.publishedSnapshot?.trigger).not.toHaveProperty(
					"objectType"
				);

				await runScheduledOnce(automationId);
				const executions = await t.run(async (ctx) =>
					ctx.db.query("workflowExecutions").collect()
				);
				expect(executions[0].status).toBe("completed");
				expect(executions[0].triggerRecord).toBeUndefined();
			});

			it("startTestRun rejects a sample record on a scheduled automation", async () => {
				const { asUser } = await setupUser();

				const clientId = await asUser.mutation(api.clients.create, {
					portalAccessId: crypto.randomUUID(),
					companyName: "Acme Co",
					status: "active",
				});
				const automationId = await asUser.mutation(api.automations.create, {
					name: "Scheduled test-run guard",
					trigger: {
						type: "scheduled",
						schedule: { frequency: "daily", timezone: "UTC", time: "09:00" },
					},
					nodes: [notifyNode("notify-1")],
				});

				// Binding a record would make the dry run lie: production scheduled
				// dispatch never has one.
				await expect(
					asUser.mutation(api.automationExecutor.startTestRun, {
						automationId,
						record: { entityType: "client", entityId: clientId },
					})
				).rejects.toThrow(/without a triggering record/);
			});
		});

		it("adjust_time: shifts a base timestamp by a fixed offset (add and subtract)", async () => {
			const { asUser, orgId } = await setupUser();
			await makeOrgPremium(orgId);

			const base = 1_700_000_000_000;
			const adjustNode = (
				id: string,
				direction: "add" | "subtract",
				amount: number,
				unit: "minutes" | "hours" | "days" | "weeks",
				next: string
			) => ({
				id,
				type: "adjust_time" as const,
				config: {
					kind: "adjust_time" as const,
					base: { kind: "static" as const, value: base },
					amount,
					unit,
					direction,
				},
				nextNodeId: next,
			});

			const automationId = await asUser.mutation(api.automations.create, {
				name: "Shift times",
				trigger: {
					type: "scheduled",
					schedule: { frequency: "daily", timezone: "UTC", time: "09:00" },
				},
				nodes: [
					adjustNode("plus", "add", 5, "days", "minus"),
					adjustNode("minus", "subtract", 2, "hours", "end-1"),
					endNode("end-1"),
				],
				isActive: true,
			});

			await runScheduledOnce(automationId);

			const executions = await t.run(async (ctx) =>
				ctx.db.query("workflowExecutions").collect()
			);
			expect(executions).toHaveLength(1);
			expect(executions[0].status).toBe("completed");
			const result = (nodeId: string) =>
				(
					executions[0].nodesExecuted.find((n) => n.nodeId === nodeId)
						?.output as { result: number } | undefined
				)?.result;
			expect(result("plus")).toBe(base + 5 * 86_400_000);
			expect(result("minus")).toBe(base - 2 * 3_600_000);
		});

		it("send_notification recipient org_admins: creates an automation_message notification per admin", async () => {
			const { asUser, orgId } = await setupUser();

			await asUser.mutation(api.automations.create, {
				name: "Notify admins on new client",
				trigger: { type: "record_created", objectType: "client" },
				nodes: [
					sendNotificationActionNode(
						"notify-1",
						"org_admins",
						"New client: {{trigger.record.companyName}}"
					),
				],
				isActive: true,
			});

			await asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "Acme Co",
				status: "lead",
			});

			await drainEvents();

			const notifications = await t.run(async (ctx) =>
				ctx.db
					.query("notifications")
					.withIndex("by_org", (q) => q.eq("orgId", orgId))
					.collect()
			);
			const autoNotifs = notifications.filter(
				(n) => n.notificationType === "automation_message"
			);
			expect(autoNotifs).toHaveLength(1);
			expect(autoNotifs[0].title).toBe("Notify admins on new client");
			expect(autoNotifs[0].message).toBe("New client: Acme Co");
		});

		it("send_notification recipient all_members: one bell per member, deduped (B6-4)", async () => {
			const { asUser, orgId, userId: ownerId } = await setupUser();
			const m1 = await t.run(async (ctx) =>
				addMemberToOrg(ctx, orgId, { role: "member" })
			);
			const m2 = await t.run(async (ctx) =>
				addMemberToOrg(ctx, orgId, { role: "member" })
			);

			await asUser.mutation(api.automations.create, {
				name: "Broadcast on new client",
				trigger: { type: "record_created", objectType: "client" },
				nodes: [
					sendNotificationActionNode(
						"notify-1",
						"all_members",
						"Everyone: {{trigger.record.companyName}}"
					),
				],
				isActive: true,
			});

			await asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "Acme Co",
				status: "lead",
			});

			await drainEvents();

			const autoNotifs = (
				await t.run(async (ctx) =>
					ctx.db
						.query("notifications")
						.withIndex("by_org", (q) => q.eq("orgId", orgId))
						.collect()
				)
			).filter((n) => n.notificationType === "automation_message");
			const notifiedUserIds = autoNotifs.map((n) => n.userId);
			const expected = [ownerId, m1.userId, m2.userId];
			// One bell per distinct member (deduped — no member notified twice).
			expect(autoNotifs).toHaveLength(expected.length);
			expect(new Set(notifiedUserIds)).toEqual(new Set(expected));
			expect(notifiedUserIds.length).toBe(new Set(notifiedUserIds).size);
			expect(autoNotifs[0].message).toBe("Everyone: Acme Co");
		});

		it("send_notification all_members on a solo-member org: single bell, no crash (B6-4)", async () => {
			const { asUser, orgId, userId: ownerId } = await setupUser();

			await asUser.mutation(api.automations.create, {
				name: "Solo broadcast",
				trigger: { type: "record_created", objectType: "client" },
				nodes: [sendNotificationActionNode("notify-1", "all_members", "Hi")],
				isActive: true,
			});

			await asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "Solo Co",
				status: "lead",
			});

			await drainEvents();

			const autoNotifs = (
				await t.run(async (ctx) =>
					ctx.db
						.query("notifications")
						.withIndex("by_org", (q) => q.eq("orgId", orgId))
						.collect()
				)
			).filter((n) => n.notificationType === "automation_message");
			expect(autoNotifs).toHaveLength(1);
			expect(autoNotifs[0].userId).toBe(ownerId);
		});

		describe("send_notification recordField recipient", () => {
			async function autoNotifs(orgId: Id<"organizations">) {
				return (
					await t.run(async (ctx) =>
						ctx.db
							.query("notifications")
							.withIndex("by_org", (q) => q.eq("orgId", orgId))
							.collect()
					)
				).filter((n) => n.notificationType === "automation_message");
			}

			it("self single field (task.assigneeUserId) notifies that user", async () => {
				const { asUser, orgId } = await setupUser();
				const m1 = await t.run(async (ctx) =>
					addMemberToOrg(ctx, orgId, { role: "member" })
				);
				await asUser.mutation(api.automations.create, {
					name: "Notify assignee",
					trigger: { type: "record_created", objectType: "task" },
					nodes: [
						sendNotificationActionNode(
							"n1",
							{ recordField: { target: "self", field: "assigneeUserId" } },
							"task ping"
						),
					],
					isActive: true,
				});
				const clientId = await asUser.mutation(api.clients.create, {
					portalAccessId: crypto.randomUUID(),
					companyName: "Acme Co",
					status: "active",
				});
				await asUser.mutation(api.tasks.create, {
					title: "T",
					date: Date.now(),
					status: "pending",
					type: "external",
					clientId,
					assigneeUserId: m1.userId,
				});
				await drainEvents();
				const notifs = await autoNotifs(orgId);
				expect(notifs).toHaveLength(1);
				expect(notifs[0].userId).toBe(m1.userId);
			});

			it("self array field (project.assignedUserIds) notifies all assigned, deduped", async () => {
				const { asUser, orgId } = await setupUser();
				const m1 = await t.run(async (ctx) =>
					addMemberToOrg(ctx, orgId, { role: "member" })
				);
				const m2 = await t.run(async (ctx) =>
					addMemberToOrg(ctx, orgId, { role: "member" })
				);
				await asUser.mutation(api.automations.create, {
					name: "Notify team",
					trigger: { type: "record_created", objectType: "project" },
					nodes: [
						sendNotificationActionNode(
							"n1",
							{ recordField: { target: "self", field: "assignedUserIds" } },
							"proj ping"
						),
					],
					isActive: true,
				});
				const clientId = await asUser.mutation(api.clients.create, {
					portalAccessId: crypto.randomUUID(),
					companyName: "Acme Co",
					status: "active",
				});
				await asUser.mutation(api.projects.create, {
					clientId,
					title: "P",
					status: "planned",
					projectType: "one-off",
					assignedUserIds: [m1.userId, m2.userId, m1.userId],
				});
				await drainEvents();
				const notifs = await autoNotifs(orgId);
				const ids = notifs.map((n) => n.userId);
				expect(notifs).toHaveLength(2);
				expect(new Set(ids)).toEqual(new Set([m1.userId, m2.userId]));
			});

			it("related (quote → project.assignedUserIds) notifies the linked project team", async () => {
				const { asUser, orgId } = await setupUser();
				const m1 = await t.run(async (ctx) =>
					addMemberToOrg(ctx, orgId, { role: "member" })
				);
				await asUser.mutation(api.automations.create, {
					name: "Notify quote project team",
					trigger: { type: "record_created", objectType: "quote" },
					nodes: [
						sendNotificationActionNode(
							"n1",
							{
								recordField: {
									target: { related: "project" },
									field: "assignedUserIds",
								},
							},
							"quote ping"
						),
					],
					isActive: true,
				});
				const clientId = await asUser.mutation(api.clients.create, {
					portalAccessId: crypto.randomUUID(),
					companyName: "Acme Co",
					status: "active",
				});
				const projectId = await asUser.mutation(api.projects.create, {
					clientId,
					title: "P",
					status: "planned",
					projectType: "one-off",
					assignedUserIds: [m1.userId],
				});
				await asUser.mutation(api.quotes.create, {
					clientId,
					projectId,
					status: "draft",
					subtotal: 0,
					total: 0,
				});
				await drainEvents();
				const notifs = await autoNotifs(orgId);
				expect(notifs).toHaveLength(1);
				expect(notifs[0].userId).toBe(m1.userId);
			});

			it("valid relation but absent FK at runtime (quote with no linked project) skips gracefully, no crash", async () => {
				const { asUser, orgId } = await setupUser();
				// quote → project is a valid relation (passes save-time validation),
				// but this quote has no projectId, so it resolves to no record.
				await asUser.mutation(api.automations.create, {
					name: "Notify missing project team",
					trigger: { type: "record_created", objectType: "quote" },
					nodes: [
						sendNotificationActionNode(
							"n1",
							{
								recordField: {
									target: { related: "project" },
									field: "assignedUserIds",
								},
							},
							"x"
						),
					],
					isActive: true,
				});
				const clientId = await asUser.mutation(api.clients.create, {
					portalAccessId: crypto.randomUUID(),
					companyName: "Acme Co",
					status: "active",
				});
				await asUser.mutation(api.quotes.create, {
					clientId,
					status: "draft",
					subtotal: 0,
					total: 0,
				});
				await drainEvents();
				expect(await autoNotifs(orgId)).toHaveLength(0);
			});
		});

		describe("send_notification delivery channels (B6-6)", () => {
			let fetchSpy: ReturnType<typeof vi.fn>;

			beforeEach(() => {
				fetchSpy = vi.fn(
					async () =>
						({
							ok: true,
							json: async () => ({ data: [{ status: "ok", id: "r1" }] }),
						}) as unknown as Response
				);
				vi.stubGlobal("fetch", fetchSpy);
			});

			afterEach(() => {
				vi.unstubAllGlobals();
			});

			async function runNotify(channels?: ("in_app" | "push")[]) {
				const { asUser, orgId, userId: ownerId } = await setupUser();
				await t.run(async (ctx) =>
					ctx.db.insert("pushTokens", {
						userId: ownerId,
						token: "ExponentPushToken[N]",
						platform: "ios",
						lastSeenAt: Date.now(),
					})
				);
				await asUser.mutation(api.automations.create, {
					name: "Notify me",
					trigger: { type: "record_created", objectType: "client" },
					nodes: [
						sendNotificationActionNode(
							"notify-1",
							{ userId: ownerId },
							"ping",
							channels ? { channels } : {}
						),
					],
					isActive: true,
				});
				await asUser.mutation(api.clients.create, {
					portalAccessId: crypto.randomUUID(),
					companyName: "Acme Co",
					status: "lead",
				});
				await drainEvents();
				const bells = (
					await t.run(async (ctx) =>
						ctx.db
							.query("notifications")
							.withIndex("by_org", (q) => q.eq("orgId", orgId))
							.collect()
					)
				).filter((n) => n.notificationType === "automation_message");
				return { bells };
			}

			it("undefined channels: in-app bell only, no push (legacy preserved)", async () => {
				const { bells } = await runNotify(undefined);
				expect(bells).toHaveLength(1);
				expect(fetchSpy).not.toHaveBeenCalled();
			});

			it("channels [in_app, push]: bell row AND push per recipient", async () => {
				const { bells } = await runNotify(["in_app", "push"]);
				expect(bells).toHaveLength(1);
				expect(fetchSpy).toHaveBeenCalled();
			});

			it("channels [in_app]: bell, no push", async () => {
				const { bells } = await runNotify(["in_app"]);
				expect(bells).toHaveLength(1);
				expect(fetchSpy).not.toHaveBeenCalled();
			});
		});

		it("send_team_message with recipients.userIds: only in-org members are notified", async () => {
			const { asUser, orgId } = await setupUser();
			const { userId: memberId } = await t.run(async (ctx) =>
				addMemberToOrg(ctx, orgId, { role: "member" })
			);
			const otherOrg = await t.run(async (ctx) =>
				createTestOrg(ctx, {
					clerkUserId: "user_other_org_msg",
					clerkOrgId: "org_other_org_msg",
				})
			);
			const nonMemberId = otherOrg.userId;

			await asUser.mutation(api.automations.create, {
				name: "Team ping",
				trigger: { type: "record_created", objectType: "client" },
				nodes: [
					sendTeamMessageActionNode(
						"msg-1",
						{ userIds: [memberId, nonMemberId] },
						"New client",
						"New client: {{trigger.record.companyName}}"
					),
				],
				isActive: true,
			});

			await asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "Acme Co",
				status: "lead",
			});

			await drainEvents();

			const memberNotifs = await t.run(async (ctx) =>
				ctx.db
					.query("notifications")
					.filter((q) => q.eq(q.field("userId"), memberId))
					.collect()
			);
			const nonMemberNotifs = await t.run(async (ctx) =>
				ctx.db
					.query("notifications")
					.filter((q) => q.eq(q.field("userId"), nonMemberId))
					.collect()
			);
			expect(memberNotifs).toHaveLength(1);
			expect(memberNotifs[0].notificationType).toBe("automation_message");
			expect(memberNotifs[0].title).toBe("New client");
			expect(memberNotifs[0].message).toBe("New client: Acme Co");
			expect(nonMemberNotifs).toHaveLength(0);
		});

		it("send_team_message on a feedless task target: mention created_by notifies the creator, no feed post (H3)", async () => {
			const { asUser, userId } = await setupUser();

			await asUser.mutation(api.automations.create, {
				name: "Task ping",
				trigger: { type: "record_created", objectType: "task" },
				nodes: [
					{
						id: "msg-1",
						type: "action" as const,
						config: {
							kind: "action" as const,
							action: {
								type: "send_team_message" as const,
								recipients: { userIds: [] as string[] },
								mention: { kind: "created_by" as const },
								title: "Task made",
								message: "A task was created",
							},
						},
					},
				],
				isActive: true,
			});

			const clientId = await asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "Acme Co",
				status: "active",
			});
			// Task creator = acting user (createdByUserId stamped on create).
			await asUser.mutation(api.tasks.create, {
				title: "Do it",
				date: Date.now(),
				status: "pending",
				type: "external",
				clientId,
			});

			await drainEvents();

			// Creator is notified even though a task has no feed.
			const creatorNotifs = await t.run(async (ctx) =>
				ctx.db
					.query("notifications")
					.filter((q) => q.eq(q.field("userId"), userId))
					.collect()
			);
			const teamMsgNotifs = creatorNotifs.filter(
				(n) => n.notificationType === "automation_message"
			);
			expect(teamMsgNotifs).toHaveLength(1);
			expect(teamMsgNotifs[0].message).toBe("A task was created");

			// No feed post is written for a feedless (task) target.
			const posts = await t.run(async (ctx) =>
				ctx.db.query("teamMessages").collect()
			);
			expect(posts).toHaveLength(0);
		});

		describe("delay checkpoint + resume", () => {
			it("checkpoints into resumeState mid-run, then resumeExecution completes the post-delay step", async () => {
				const { orgId, asUser } = await setupUser();

				const clientId = await asUser.mutation(api.clients.create, {
					portalAccessId: crypto.randomUUID(),
					companyName: "Acme Co",
					status: "active",
				});

				const automationId = await asUser.mutation(api.automations.create, {
					name: "Delay then follow up",
					trigger: { type: "record_created", objectType: "client" },
					nodes: [
						updateFieldActionNode("act-1", "notes", "before delay", {
							nextNodeId: "delay-1",
						}),
						{
							id: "delay-1",
							type: "delay" as const,
							config: {
								kind: "delay" as const,
								amount: 1,
								unit: "hours" as const,
							},
							nextNodeId: "act-2",
						},
						updateFieldActionNode("act-2", "notes", "after delay"),
					],
					isActive: true,
				});

				// Drive executeAutomation directly (systemMutation: consumes orgId,
				// no scheduler hop needed to reach it) so the mid-run state can be
				// observed deterministically. Going through the normal trigger path
				// and draining with finishAllScheduledFunctions(vi.runAllTimers)
				// does NOT stop at the checkpoint: vi.runAllTimers advances fake
				// time past the future-dated resumeExecution schedule too, so the
				// whole run (both hops) completes within a single drain call.
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

				// Mid-run: parked at the delay, only pre-delay entries logged.
				const midClient = await t.run(async (ctx) => ctx.db.get(clientId));
				expect(midClient?.notes).toBe("before delay");

				const midExecution = await t.run(async (ctx) =>
					ctx.db.get(executionId)
				);
				expect(midExecution?.status).toBe("running");
				expect(midExecution?.resumeState?.resumeNodeId).toBe("act-2");
				expect(
					midExecution?.nodesExecuted.map((n) => n.nodeId)
				).toEqual(["act-1", "delay-1"]);

				// Resume directly (bypassing the scheduled runAt hop).
				await t.mutation(internal.automationExecutor.resumeExecution, {
					orgId,
					executionId,
					automationId,
				});

				const finalClient = await t.run(async (ctx) => ctx.db.get(clientId));
				expect(finalClient?.notes).toBe("after delay");

				const finalExecution = await t.run(async (ctx) =>
					ctx.db.get(executionId)
				);
				expect(finalExecution?.status).toBe("completed");
				expect(finalExecution?.resumeState).toBeUndefined();
			});

			it("resumeState.nodeResults: a pre-delay compute result survives the delay and feeds a post-delay step", async () => {
				const { orgId, asUser } = await setupUser();

				const clientId = await asUser.mutation(api.clients.create, {
					portalAccessId: crypto.randomUUID(),
					companyName: "Acme Co",
					status: "active",
				});

				const base = 1_700_000_000_000;
				const expected = base + 5 * 24 * 60 * 60 * 1000; // +5 days

				const automationId = await asUser.mutation(api.automations.create, {
					name: "Compute, delay, then consume the result",
					trigger: { type: "record_created", objectType: "client" },
					nodes: [
						{
							id: "adjust-1",
							type: "adjust_time" as const,
							config: {
								kind: "adjust_time" as const,
								base: { kind: "static" as const, value: base },
								amount: 5,
								unit: "days" as const,
								direction: "add" as const,
							},
							nextNodeId: "delay-1",
						},
						{
							id: "delay-1",
							type: "delay" as const,
							config: {
								kind: "delay" as const,
								amount: 1,
								unit: "hours" as const,
							},
							nextNodeId: "act-2",
						},
						// Writes the pre-delay adjust_time result via node.<id>.result.
						{
							id: "act-2",
							type: "action" as const,
							config: {
								kind: "action" as const,
								action: {
									type: "update_field" as const,
									target: "self" as const,
									field: "notes",
									value: {
										kind: "var" as const,
										path: "node.adjust-1.result",
									},
								},
							},
						},
					],
					isActive: true,
				});

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

				// Parked at the delay: the pre-delay adjust_time result is
				// checkpointed into resumeState.nodeResults so it survives the wait.
				const midExecution = await t.run(async (ctx) => ctx.db.get(executionId));
				expect(midExecution?.status).toBe("running");
				expect(midExecution?.resumeState?.resumeNodeId).toBe("act-2");
				expect(midExecution?.resumeState?.nodeResults).toEqual([
					{ nodeId: "adjust-1", result: expected },
				]);
				// Post-delay step hasn't run yet.
				const midClient = await t.run(async (ctx) => ctx.db.get(clientId));
				expect(midClient?.notes).toBeUndefined();

				await t.mutation(internal.automationExecutor.resumeExecution, {
					orgId,
					executionId,
					automationId,
				});

				// After resume node.adjust-1.result still resolves, so the post-delay
				// update_field writes it (coerced to the text field).
				const finalClient = await t.run(async (ctx) => ctx.db.get(clientId));
				expect(finalClient?.notes).toBe(String(expected));

				const finalExecution = await t.run(async (ctx) =>
					ctx.db.get(executionId)
				);
				expect(finalExecution?.status).toBe("completed");
				expect(finalExecution?.resumeState).toBeUndefined();
			});

			it("fails clearly when the resume node no longer exists in a republished snapshot", async () => {
				const { orgId, asUser } = await setupUser();

				const clientId = await asUser.mutation(api.clients.create, {
					portalAccessId: crypto.randomUUID(),
					companyName: "Acme Co",
					status: "active",
				});

				const automationId = await asUser.mutation(api.automations.create, {
					name: "Delay then follow up (republished)",
					trigger: { type: "record_created", objectType: "client" },
					nodes: [
						updateFieldActionNode("act-1", "notes", "before delay", {
							nextNodeId: "delay-1",
						}),
						{
							id: "delay-1",
							type: "delay" as const,
							config: {
								kind: "delay" as const,
								amount: 1,
								unit: "hours" as const,
							},
							nextNodeId: "act-2",
						},
						updateFieldActionNode("act-2", "notes", "after delay"),
					],
					isActive: true,
				});

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

				const midExecution = await t.run(async (ctx) => ctx.db.get(executionId));
				expect(midExecution?.resumeState?.resumeNodeId).toBe("act-2");

				// Edit the working copy to drop "act-2" (the parked resume target),
				// then republish so the run's next hop targets a version without it.
				await asUser.mutation(api.automations.update, {
					id: automationId,
					nodes: [
						updateFieldActionNode("act-1", "notes", "before delay", {
							nextNodeId: "delay-1",
						}),
						{
							id: "delay-1",
							type: "delay" as const,
							config: {
								kind: "delay" as const,
								amount: 1,
								unit: "hours" as const,
							},
						},
					],
				});
				await asUser.mutation(api.automations.publish, { id: automationId });

				await t.mutation(internal.automationExecutor.resumeExecution, {
					orgId,
					executionId,
					automationId,
				});

				const finalExecution = await t.run(async (ctx) => ctx.db.get(executionId));
				expect(finalExecution?.status).toBe("failed");
				expect(finalExecution?.error).toMatch(/next step no longer exists/i);
				expect(finalExecution?.resumeState).toBeUndefined();

				// The parked-then-failed run must not have applied the post-delay write.
				const client = await t.run(async (ctx) => ctx.db.get(clientId));
				expect(client?.notes).toBe("before delay");
			});
		});

		it("a formula referencing an out-of-scope path at runtime fails the run clearly", async () => {
			const { orgId, asUser } = await setupUser();

			const clientId = await asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "Acme Co",
				status: "active",
			});

			// The formula references node.ghost.result — a node that never runs, so
			// the path is out of scope. It parses (create/publish allow it; use-site
			// scope is a builder concern), but at runtime resolves to null and the
			// arithmetic throws, which must fail the run rather than silently skip.
			const automationId = await asUser.mutation(api.automations.create, {
				name: "Out-of-scope formula",
				trigger: { type: "record_created", objectType: "client" },
				formulas: [
					{
						id: "oos",
						name: "Ghost math",
						returnType: "number",
						expression: "{node.ghost.result} + 1",
					},
				],
				nodes: [
					{
						id: "cond-1",
						type: "condition" as const,
						config: {
							kind: "condition" as const,
							logic: "and" as const,
							groups: [
								{
									logic: "and" as const,
									rules: [
										{
											field: "companyName",
											operator: "equals" as const,
											value: { kind: "var" as const, path: "formula.oos" },
										},
									],
								},
							],
						},
						nextNodeId: "act-1",
					},
					updateFieldActionNode("act-1", "notes", "should not run"),
				],
				isActive: true,
			});

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

			const execution = await t.run(async (ctx) => ctx.db.get(executionId));
			expect(execution?.status).toBe("failed");
			expect(execution?.error).toBeTruthy();
			expect(execution?.error).toMatch(/number|null/i);

			// The downstream action must not have run.
			const client = await t.run(async (ctx) => ctx.db.get(clientId));
			expect(client?.notes).toBeUndefined();
		});

		it("end node: the true branch terminates the run and the false-branch action never runs", async () => {
			const { asUser } = await setupUser();

			await asUser.mutation(api.automations.create, {
				name: "Branch to end",
				trigger: { type: "record_created", objectType: "client" },
				nodes: [
					conditionNode("cond-1", "companyName", "equals", "Acme Co", {
						nextNodeId: "end-1",
						elseNodeId: "act-false",
					}),
					endNode("end-1"),
					updateFieldActionNode("act-false", "notes", "should not run"),
				],
				isActive: true,
			});

			const clientId = await asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "Acme Co",
				status: "lead",
			});

			await drainEvents();

			const client = await t.run(async (ctx) => ctx.db.get(clientId));
			expect(client?.notes).toBeUndefined();

			const executions = await t.run(async (ctx) =>
				ctx.db.query("workflowExecutions").collect()
			);
			expect(executions).toHaveLength(1);
			expect(executions[0].status).toBe("completed");
			const nodeIds = executions[0].nodesExecuted.map((n) => n.nodeId);
			expect(nodeIds).toContain("end-1");
			expect(nodeIds).not.toContain("act-false");
		});

		describe("fetch scan pagination + truncation (Phase 1.1)", () => {
			async function insertTasks(
				orgId: Id<"organizations">,
				count: number,
				titlePrefix = "Task"
			) {
				await t.run(async (ctx) => {
					for (let i = 0; i < count; i++) {
						await ctx.db.insert("tasks", {
							orgId,
							title: `${titlePrefix} ${i}`,
							date: Date.now(),
							status: "pending" as const,
						});
					}
				});
			}

			it("scanOrgRows pages the whole index newest-first with no dupes or skips", async () => {
				const { orgId } = await setupUser();
				await insertTasks(orgId, 7);

				const result = await t.run(async (ctx) =>
					scanOrgRows(ctx, "task", orgId, { batchSize: 2, maxScan: 100 })
				);

				expect(result.scanned).toBe(7);
				expect(result.truncated).toBe(false);
				expect(result.matches.map((r) => r.title)).toEqual([
					"Task 6",
					"Task 5",
					"Task 4",
					"Task 3",
					"Task 2",
					"Task 1",
					"Task 0",
				]);
			});

			it("scanOrgRows early-exits at stopAfterMatches without flagging truncation", async () => {
				const { orgId } = await setupUser();
				await insertTasks(orgId, 10);

				const result = await t.run(async (ctx) =>
					scanOrgRows(ctx, "task", orgId, {
						batchSize: 2,
						stopAfterMatches: 3,
						maxScan: 100,
					})
				);

				expect(result.matches).toHaveLength(3);
				expect(result.scanned).toBeLessThanOrEqual(4);
				expect(result.truncated).toBe(false);
			});

			it("an org with exactly maxScan rows is not flagged truncated (0.2 false positive)", async () => {
				const { orgId } = await setupUser();
				await insertTasks(orgId, 5);

				const result = await t.run(async (ctx) =>
					scanOrgRows(ctx, "task", orgId, { batchSize: 2, maxScan: 5 })
				);

				expect(result.scanned).toBe(5);
				expect(result.matches).toHaveLength(5);
				expect(result.truncated).toBe(false);
			});

			it("stopping at maxScan with rows remaining flags truncated", async () => {
				const { orgId } = await setupUser();
				await insertTasks(orgId, 7);

				const result = await t.run(async (ctx) =>
					scanOrgRows(ctx, "task", orgId, { batchSize: 2, maxScan: 5 })
				);

				expect(result.scanned).toBe(5);
				expect(result.matches).toHaveLength(5);
				expect(result.truncated).toBe(true);
			});

			it("fetch finds matching records older than the previous 1,000-row cap", async () => {
				const { asUser, orgId } = await setupUser();
				await makeOrgPremium(orgId);

				// The matches are the OLDEST rows: buried past the old cap by 1,100
				// newer rows, so the pre-1.1 single-page scan never saw them.
				await insertTasks(orgId, 3, "Ancient");
				await insertTasks(orgId, 1100, "Recent");

				const automationId = await asUser.mutation(api.automations.create, {
					name: "Find ancient tasks",
					trigger: {
						type: "scheduled",
						schedule: { frequency: "daily", timezone: "UTC", time: "09:00" },
					},
					nodes: [
						fetchNode("fetch-1", "task", [
							filterGroup("title", "contains", "Ancient"),
						], { nextNodeId: "end-1" }),
						endNode("end-1"),
					],
					isActive: true,
				});

				await runScheduledOnce(automationId);

				const executions = await t.run(async (ctx) =>
					ctx.db.query("workflowExecutions").collect()
				);
				expect(executions).toHaveLength(1);
				const execution = executions[0];
				expect(execution.status).toBe("completed");
				expect(execution.dataTruncated).toBeFalsy();
				const fetchEntry = execution.nodesExecuted.find(
					(n) => n.nodeId === "fetch-1"
				);
				expect(fetchEntry?.recordsProcessed).toBe(3);
				expect(fetchEntry?.truncated).toBeFalsy();
			});

			it("a >5,000-row org flags truncated on the node entry and the execution", async () => {
				const { asUser, orgId } = await setupUser();
				await makeOrgPremium(orgId);

				// Filter matches nothing, so the scan runs to the ceiling with rows
				// still remaining — the genuine truncation case.
				await insertTasks(orgId, 5050);

				const automationId = await asUser.mutation(api.automations.create, {
					name: "Scan a huge org",
					trigger: {
						type: "scheduled",
						schedule: { frequency: "daily", timezone: "UTC", time: "09:00" },
					},
					nodes: [
						fetchNode("fetch-1", "task", [
							filterGroup("title", "contains", "no-such-needle"),
						], { nextNodeId: "end-1" }),
						endNode("end-1"),
					],
					isActive: true,
				});

				await runScheduledOnce(automationId);

				const executions = await t.run(async (ctx) =>
					ctx.db.query("workflowExecutions").collect()
				);
				expect(executions).toHaveLength(1);
				const execution = executions[0];
				expect(execution.status).toBe("completed");
				expect(execution.dataTruncated).toBe(true);
				const fetchEntry = execution.nodesExecuted.find(
					(n) => n.nodeId === "fetch-1"
				);
				expect(fetchEntry?.truncated).toBe(true);
				expect(fetchEntry?.recordsProcessed).toBe(0);
			});

			it("fetch_records under the cap leaves truncated/dataTruncated unset", async () => {
				const { asUser, orgId } = await setupUser();
				await makeOrgPremium(orgId);
				await insertTasks(orgId, 5);

				const automationId = await asUser.mutation(api.automations.create, {
					name: "Scan a few tasks",
					trigger: {
						type: "scheduled",
						schedule: { frequency: "daily", timezone: "UTC", time: "09:00" },
					},
					nodes: [
						fetchNode("fetch-1", "task", [], { nextNodeId: "end-1" }),
						endNode("end-1"),
					],
					isActive: true,
				});

				await runScheduledOnce(automationId);

				const executions = await t.run(async (ctx) =>
					ctx.db.query("workflowExecutions").collect()
				);
				expect(executions).toHaveLength(1);
				const execution = executions[0];
				expect(execution.status).toBe("completed");
				expect(execution.dataTruncated).toBeFalsy();
				const fetchEntry = execution.nodesExecuted.find(
					(n) => n.nodeId === "fetch-1"
				);
				expect(fetchEntry?.truncated).toBeFalsy();
			});
		});

		describe("end vs next_item inside loops (Phase 1.3)", () => {
			function nextItemNode(id: string) {
				return {
					id,
					type: "next_item" as const,
					config: { kind: "next_item" as const },
				};
			}

			const dailyTrigger = {
				type: "scheduled" as const,
				schedule: {
					frequency: "daily" as const,
					timezone: "UTC",
					time: "09:00",
				},
			};

			it("next_item skips the current record only; the loop and post-loop steps continue", async () => {
				const { asUser, orgId } = await setupUser();
				await makeOrgPremium(orgId);

				const clientId = await asUser.mutation(api.clients.create, {
					portalAccessId: crypto.randomUUID(),
					companyName: "Acme Co",
					status: "active",
				});
				const keepId = await asUser.mutation(api.projects.create, {
					clientId,
					title: "Keep me",
					status: "planned",
					projectType: "one-off",
				});
				const skipId = await asUser.mutation(api.projects.create, {
					clientId,
					title: "Skip me",
					status: "planned",
					projectType: "one-off",
				});

				const automationId = await asUser.mutation(api.automations.create, {
					name: "Skip via next_item",
					trigger: dailyTrigger,
					nodes: [
						fetchNode(
							"fetch-1",
							"project",
							[filterGroup("status", "equals", "planned")],
							{ nextNodeId: "loop-1" }
						),
						loopNode("loop-1", "fetch-1", {
							bodyStartNodeId: "cond-1",
							nextNodeId: "end-1",
						}),
						loopConditionNode("cond-1", "loop-1", "title", "contains", "Skip", {
							nextNodeId: "skip-1",
							elseNodeId: "act-1",
						}),
						nextItemNode("skip-1"),
						updateFieldActionNode("act-1", "status", "in-progress", {
							target: "self",
						}),
						endNode("end-1"),
					],
					isActive: true,
				});

				await runScheduledOnce(automationId);

				const [keep, skip] = await t.run(async (ctx) =>
					Promise.all([ctx.db.get(keepId), ctx.db.get(skipId)])
				);
				expect(keep?.status).toBe("in-progress");
				expect(skip?.status).toBe("planned");

				const executions = await t.run(async (ctx) =>
					ctx.db.query("workflowExecutions").collect()
				);
				expect(executions).toHaveLength(1);
				const execution = executions[0];
				expect(execution.status).toBe("completed");
				const loopEntry = execution.nodesExecuted.find(
					(n) => n.nodeId === "loop-1"
				);
				expect(loopEntry?.recordsProcessed).toBe(2);
				// next_item logged once for the skipped record, and post-loop ran.
				expect(
					execution.nodesExecuted.filter((n) => n.nodeId === "skip-1")
				).toHaveLength(1);
				expect(
					execution.nodesExecuted.some((n) => n.nodeId === "end-1")
				).toBe(true);
			});

			it("legacy published end-in-loop still halts the entire run (pinned semantics)", async () => {
				const { asUser, orgId, userId } = await setupUser();
				await makeOrgPremium(orgId);

				const clientId = await asUser.mutation(api.clients.create, {
					portalAccessId: crypto.randomUUID(),
					companyName: "Acme Co",
					status: "active",
				});
				await asUser.mutation(api.projects.create, {
					clientId,
					title: "P1",
					status: "planned",
					projectType: "one-off",
				});
				await asUser.mutation(api.projects.create, {
					clientId,
					title: "P2",
					status: "planned",
					projectType: "one-off",
				});

				// Direct insert: save-time validation now rejects this shape, but
				// automations published before 1.3 may still contain it.
				const nodes = [
					fetchNode(
						"fetch-1",
						"project",
						[filterGroup("status", "equals", "planned")],
						{ nextNodeId: "loop-1" }
					),
					loopNode("loop-1", "fetch-1", {
						bodyStartNodeId: "end-body",
						nextNodeId: "end-2",
					}),
					endNode("end-body"),
					endNode("end-2"),
				];
				const automationId = await t.run(async (ctx) =>
					ctx.db.insert("workflowAutomations", {
						orgId,
						name: "Legacy end-in-loop",
						status: "active" as const,
						trigger: dailyTrigger,
						nodes,
						publishedSnapshot: {
							trigger: dailyTrigger,
							nodes,
							version: 1,
							publishedAt: Date.now(),
						},
						createdBy: userId,
						createdAt: Date.now(),
						updatedAt: Date.now(),
					})
				);

				await runScheduledOnce(automationId);

				const executions = await t.run(async (ctx) =>
					ctx.db.query("workflowExecutions").collect()
				);
				expect(executions).toHaveLength(1);
				const execution = executions[0];
				// `end` in the body ends the whole run on the FIRST record: one
				// end-body entry, and the post-loop end-2 never runs.
				expect(execution.status).toBe("completed");
				expect(
					execution.nodesExecuted.filter((n) => n.nodeId === "end-body")
				).toHaveLength(1);
				expect(
					execution.nodesExecuted.some((n) => n.nodeId === "end-2")
				).toBe(false);
			});

			it("save-time validation rejects an End step inside a loop", async () => {
				const { asUser } = await setupUser();
				await expect(
					asUser.mutation(api.automations.create, {
						name: "End in loop",
						trigger: dailyTrigger,
						nodes: [
							fetchNode("fetch-1", "project", [], { nextNodeId: "loop-1" }),
							loopNode("loop-1", "fetch-1", { bodyStartNodeId: "end-body" }),
							endNode("end-body"),
						],
						isActive: false,
					})
				).rejects.toThrow(/End step inside a loop/);
			});

			it('save-time validation rejects "Next item" outside a loop', async () => {
				const { asUser } = await setupUser();
				await expect(
					asUser.mutation(api.automations.create, {
						name: "Stray next item",
						trigger: dailyTrigger,
						nodes: [nextItemNode("skip-1")],
						isActive: false,
					})
				).rejects.toThrow(/only works inside a loop/);
			});
		});

		describe("per-item error isolation (Phase A3)", () => {
			it("isFatalExecutionError matches Convex's verbatim limit errors", () => {
				// Wording from get-convex/convex-backend. These doom the whole
				// transaction and must rethrow, not count as one item's failure.
				const fatal = [
					"Too many documents read in a single function execution (limit: 32000)",
					"Too many bytes read in a single function execution",
					"Too many bytes written in a single function execution",
					"Too many writes in a single function execution",
					"Too many functions scheduled by this mutation",
					"Function execution timed out (maximum duration: 1s)",
				];
				for (const message of fatal) {
					expect(isFatalExecutionError(new Error(message)), message).toBe(true);
				}
				expect(
					isFatalExecutionError(new Error("Status bogus is not valid for project"))
				).toBe(false);
			});

			/**
			 * Projects whose titles are valid project statuses, plus poisoned ones
			 * titled "bogus". The loop body writes status = {loop item's title}, so a
			 * poisoned project fails select coercion and its siblings don't.
			 *
			 * `titles` is given in LOOP order. fetch_records returns newest-first, so
			 * they're created back-to-front — otherwise every index assertion below
			 * would be quietly testing the reverse of what it reads like.
			 */
			async function createProjects(
				asUser: ReturnType<typeof t.withIdentity>,
				titles: string[]
			) {
				const clientId = await asUser.mutation(api.clients.create, {
					portalAccessId: crypto.randomUUID(),
					companyName: "Acme Co",
					status: "active",
				});
				for (const title of [...titles].reverse()) {
					await asUser.mutation(api.projects.create, {
						clientId,
						title,
						status: "planned",
						projectType: "one-off",
					});
				}
				return clientId;
			}

			function poisonedLoopNodes(onItemError?: "continue" | "abort") {
				return [
					fetchNode(
						"fetch-1",
						"project",
						[filterGroup("status", "equals", "planned")],
						{ nextNodeId: "loop-1", limit: 100 }
					),
					loopNode("loop-1", "fetch-1", {
						bodyStartNodeId: "body-act",
						nextNodeId: "end-1",
						onItemError,
					}),
					updateFieldFromVarNode(
						"body-act",
						"status",
						"loop.loop-1.item.title"
					),
					endNode("end-1"),
				];
			}

			async function runPoisonedLoop(
				titles: string[],
				onItemError?: "continue" | "abort"
			) {
				const { asUser, orgId } = await setupUser();
				await makeOrgPremium(orgId);
				await createProjects(asUser, titles);

				const automationId = await asUser.mutation(api.automations.create, {
					name: "Advance every project",
					trigger: {
						type: "scheduled",
						schedule: { frequency: "daily", timezone: "UTC", time: "09:00" },
					},
					nodes: poisonedLoopNodes(onItemError),
					isActive: true,
				});

				await runScheduledOnce(automationId);

				const execution = await t.run(async (ctx) => {
					const rows = await ctx.db.query("workflowExecutions").collect();
					return rows[0];
				});
				const projects = await t.run(async (ctx) =>
					ctx.db.query("projects").collect()
				);
				return { execution, projects };
			}

			it("skips the failing item and finishes the rest — completed_with_errors names the record", async () => {
				// 5 items: three advance, one is poisoned, one advances after it.
				const { execution, projects } = await runPoisonedLoop(
					["in-progress", "in-progress", "bogus", "in-progress", "completed"],
					"continue"
				);

				expect(execution.status).toBe("completed_with_errors");
				expect(execution.resumeState).toBeUndefined();

				// The poisoned record is untouched; every other record was written.
				const advanced = projects.filter((p) => p.status !== "planned");
				expect(advanced).toHaveLength(4);
				expect(
					projects.find((p) => p.title === "bogus")?.status
				).toBe("planned");

				const summary = execution.loopSummary?.find(
					(l) => l.nodeId === "loop-1"
				);
				expect(summary).toBeDefined();
				expect(summary).toMatchObject({
					total: 5,
					succeeded: 4,
					failed: 1,
					skipped: 0,
				});
				expect(summary!.errors).toHaveLength(1);
				expect(summary!.errors[0].label).toBe("bogus");
				expect(summary!.errors[0].index).toBe(2);
				expect(summary!.errors[0].error).toContain("not a valid value");
			});

			it("stamps loop identity on body entries so a failure traces to its record", async () => {
				const { execution } = await runPoisonedLoop(
					["in-progress", "bogus", "in-progress"],
					"continue"
				);

				const bodyEntries = execution.nodesExecuted.filter(
					(n) => n.nodeId === "body-act"
				);
				expect(bodyEntries).toHaveLength(3);
				expect(bodyEntries.map((e) => e.loopIndex)).toEqual([0, 1, 2]);
				expect(bodyEntries.every((e) => e.loopNodeId === "loop-1")).toBe(true);
				expect(bodyEntries.every((e) => !!e.loopItemId)).toBe(true);

				const failedEntry = bodyEntries.find((e) => e.result === "failed");
				expect(failedEntry?.loopItemLabel).toBe("bogus");
				expect(failedEntry?.loopIndex).toBe(1);

				// The loop node's own entries carry no iteration identity.
				const loopEntry = execution.nodesExecuted.find(
					(n) => n.nodeId === "loop-1"
				);
				expect(loopEntry?.loopIndex).toBeUndefined();
			});

			it("a legacy loop (no onItemError) still aborts the whole run at the first failure", async () => {
				// Field absent = "abort" — the semantics every snapshot published
				// before onItemError existed actually had.
				const { execution, projects } = await runPoisonedLoop([
					"in-progress",
					"bogus",
					"in-progress",
				]);

				expect(execution.status).toBe("failed");
				// Item 0 was written (its chunk committed); item 2 never ran.
				expect(
					projects.filter((p) => p.status === "in-progress")
				).toHaveLength(1);
				// Even a failed run reports what got through before it stopped, and
				// names the record it died on.
				const summary = execution.loopSummary?.find(
					(l) => l.nodeId === "loop-1"
				);
				expect(summary).toMatchObject({ total: 3, succeeded: 1, failed: 1 });
				expect(summary!.errors).toHaveLength(1);
				expect(summary!.errors[0].label).toBe("bogus");
			});

			it('"abort" set explicitly behaves the same as the legacy absent field', async () => {
				const { execution } = await runPoisonedLoop(
					["in-progress", "bogus", "in-progress"],
					"abort"
				);
				expect(execution.status).toBe("failed");
			});

			it("circuit breaker: the first 10 items all failing stops the run as a config problem", async () => {
				// 12 poisoned records, none of which can ever succeed.
				const { execution, projects } = await runPoisonedLoop(
					Array.from({ length: 12 }, () => "bogus"),
					"continue"
				);

				expect(execution.status).toBe("failed");
				expect(execution.error).toContain("configuration problem");
				// It stopped at 10 rather than grinding through all 12.
				const summary = execution.loopSummary?.find(
					(l) => l.nodeId === "loop-1"
				);
				expect(summary).toMatchObject({ total: 12, succeeded: 0, failed: 10 });
				// Nothing was written.
				expect(
					projects.every((p) => p.status === "planned")
				).toBe(true);
			});

			it("one success disarms the circuit breaker — later failures don't trip it", async () => {
				// One good item first, then 12 poisoned ones: the breaker only fires
				// when nothing at all has succeeded.
				const titles = [
					"in-progress",
					...Array.from({ length: 12 }, () => "bogus"),
				];
				const { execution } = await runPoisonedLoop(titles, "continue");

				expect(execution.status).toBe("completed_with_errors");
				expect(
					execution.loopSummary?.find((l) => l.nodeId === "loop-1")
				).toMatchObject({ total: 13, succeeded: 1, failed: 12 });
			});

			it("compacts successful iterations past the log window but keeps every failure", async () => {
				// 60 items (> the 50-iteration log window) with one poisoned item near
				// the end. Without compaction the failure is exactly the kind of entry
				// the 400-entry cap eats.
				const titles = Array.from({ length: 60 }, (_, i) =>
					i === 55 ? "bogus" : "in-progress"
				);
				const { execution } = await runPoisonedLoop(titles, "continue");

				expect(execution.status).toBe("completed_with_errors");
				expect(
					execution.loopSummary?.find((l) => l.nodeId === "loop-1")
				).toMatchObject({ total: 60, succeeded: 59, failed: 1 });

				const bodyEntries = execution.nodesExecuted.filter(
					(n) => n.nodeId === "body-act"
				);
				// The first 50 iterations are logged in full; later successes are
				// dropped from the log (their outcome lives in loopSummary).
				expect(bodyEntries.filter((e) => e.result === "success")).toHaveLength(
					50
				);
				// The late failure survives regardless — that's the whole point.
				const failures = bodyEntries.filter((e) => e.result === "failed");
				expect(failures).toHaveLength(1);
				expect(failures[0].loopIndex).toBe(55);
				expect(failures[0].loopItemLabel).toBe("bogus");

				// The log never hit the global truncation cap.
				expect(
					execution.nodesExecuted.some((e) =>
						e.error?.includes("Execution log truncated")
					)
				).toBe(false);

				// Exactly one note explains why the log stops short of the tally.
				const notes = execution.nodesExecuted.filter((e) =>
					String(
						(e.output as { note?: string } | undefined)?.note ?? ""
					).includes("Step-by-step log covers")
				);
				expect(notes).toHaveLength(1);
			});

			it("carries failures across a chunk boundary and still finishes", async () => {
				// 30 items (> LOOP_CHUNK_SIZE of 25) with poison on both sides of the
				// boundary — the tally has to survive the checkpoint/resume hop.
				const titles = Array.from({ length: 30 }, (_, i) =>
					i === 3 || i === 27 ? "bogus" : "in-progress"
				);
				const { execution, projects } = await runPoisonedLoop(
					titles,
					"continue"
				);

				expect(execution.status).toBe("completed_with_errors");
				expect(execution.resumeState).toBeUndefined();
				expect(
					projects.filter((p) => p.status === "in-progress")
				).toHaveLength(28);

				const summary = execution.loopSummary?.find(
					(l) => l.nodeId === "loop-1"
				);
				expect(summary).toMatchObject({
					total: 30,
					succeeded: 28,
					failed: 2,
					skipped: 0,
				});
				expect(summary!.errors.map((e) => e.index)).toEqual([3, 27]);
			});
		});

		describe("chunked loop execution (Phase 1.2)", () => {
			const CHUNK = 25; // mirrors LOOP_CHUNK_SIZE in automationExecutor.ts

			async function createPlannedProjects(
				asUser: ReturnType<typeof t.withIdentity>,
				count: number
			) {
				const clientId = await asUser.mutation(api.clients.create, {
					portalAccessId: crypto.randomUUID(),
					companyName: "Acme Co",
					status: "active",
				});
				const ids: Id<"projects">[] = [];
				for (let i = 0; i < count; i++) {
					ids.push(
						await asUser.mutation(api.projects.create, {
							clientId,
							title: `P${i}`,
							status: "planned",
							projectType: "one-off",
						})
					);
				}
				return ids;
			}

			function chunkedLoopNodes() {
				return [
					fetchNode(
						"fetch-1",
						"project",
						[filterGroup("status", "equals", "planned")],
						{ nextNodeId: "loop-1", limit: 50 }
					),
					loopNode("loop-1", "fetch-1", {
						bodyStartNodeId: "body-act",
						nextNodeId: "end-1",
					}),
					updateFieldActionNode("body-act", "status", "in-progress", {
						target: "self",
					}),
					endNode("end-1"),
				];
			}

			async function countInProgress() {
				return await t.run(async (ctx) => {
					const projects = await ctx.db.query("projects").collect();
					return projects.filter((p) => p.status === "in-progress").length;
				});
			}

			it("a loop past the chunk size completes across scheduled continuations", async () => {
				const { asUser, orgId } = await setupUser();
				await makeOrgPremium(orgId);
				await createPlannedProjects(asUser, CHUNK + 5);

				const automationId = await asUser.mutation(api.automations.create, {
					name: "Bulk update many projects",
					trigger: {
						type: "scheduled",
						schedule: { frequency: "daily", timezone: "UTC", time: "09:00" },
					},
					nodes: chunkedLoopNodes(),
					isActive: true,
				});

				await runScheduledOnce(automationId);

				expect(await countInProgress()).toBe(CHUNK + 5);

				const executions = await t.run(async (ctx) =>
					ctx.db.query("workflowExecutions").collect()
				);
				expect(executions).toHaveLength(1);
				const execution = executions[0];
				expect(execution.status).toBe("completed");
				expect(execution.resumeState).toBeUndefined();
				const loopEntry = execution.nodesExecuted.find(
					(n) => n.nodeId === "loop-1"
				);
				expect(loopEntry?.recordsProcessed).toBe(CHUNK + 5);
				expect(
					execution.nodesExecuted.filter((n) => n.nodeId === "body-act")
				).toHaveLength(CHUNK + 5);
				expect(
					execution.nodesExecuted.some((n) => n.nodeId === "end-1")
				).toBe(true);
			});

			it("checkpoints at the chunk boundary with earlier iterations committed (commit-per-chunk)", async () => {
				const { asUser, orgId } = await setupUser();
				await makeOrgPremium(orgId);
				await createPlannedProjects(asUser, CHUNK + 5);

				const automationId = await asUser.mutation(api.automations.create, {
					name: "Bulk update many projects",
					trigger: {
						type: "scheduled",
						schedule: { frequency: "daily", timezone: "UTC", time: "09:00" },
					},
					nodes: chunkedLoopNodes(),
					isActive: true,
				});

				// Drive executeAutomation directly (see the delay checkpoint test):
				// draining the scheduler would run the continuation too, hiding the
				// mid-run state this test is about.
				const executionId = await t.run(async (ctx) =>
					ctx.db.insert("workflowExecutions", {
						orgId,
						automationId,
						triggeredBy: "schedule",
						triggeredAt: Date.now(),
						status: "running",
						mode: "production" as const,
						nodesExecuted: [],
						executionChain: [automationId],
						recursionDepth: 0,
					})
				);
				await t.mutation(internal.automationExecutor.executeAutomation, {
					orgId,
					executionId,
					automationId,
					executionChain: [automationId],
					recursionDepth: 1,
				});

				// Chunk 1 committed durably; the rest is parked in resumeState.
				expect(await countInProgress()).toBe(CHUNK);
				const mid = await t.run(async (ctx) => ctx.db.get(executionId));
				expect(mid?.status).toBe("running");
				expect(mid?.resumeState?.loop?.nodeId).toBe("loop-1");
				expect(mid?.resumeState?.loop?.nextIndex).toBe(CHUNK);
				expect(mid?.resumeState?.loop?.remainingItemIds).toHaveLength(5);

				await t.mutation(internal.automationExecutor.resumeExecution, {
					orgId,
					executionId,
					automationId,
				});

				expect(await countInProgress()).toBe(CHUNK + 5);
				const final = await t.run(async (ctx) => ctx.db.get(executionId));
				expect(final?.status).toBe("completed");
				expect(final?.resumeState).toBeUndefined();
			});

			it("records deleted between chunks are skipped without derailing the rest", async () => {
				const { asUser, orgId } = await setupUser();
				await makeOrgPremium(orgId);
				await createPlannedProjects(asUser, CHUNK + 5);

				const automationId = await asUser.mutation(api.automations.create, {
					name: "Bulk update many projects",
					trigger: {
						type: "scheduled",
						schedule: { frequency: "daily", timezone: "UTC", time: "09:00" },
					},
					nodes: chunkedLoopNodes(),
					isActive: true,
				});

				const executionId = await t.run(async (ctx) =>
					ctx.db.insert("workflowExecutions", {
						orgId,
						automationId,
						triggeredBy: "schedule",
						triggeredAt: Date.now(),
						status: "running",
						mode: "production" as const,
						nodesExecuted: [],
						executionChain: [automationId],
						recursionDepth: 0,
					})
				);
				await t.mutation(internal.automationExecutor.executeAutomation, {
					orgId,
					executionId,
					automationId,
					executionChain: [automationId],
					recursionDepth: 1,
				});

				// Delete one not-yet-processed record while the run is parked.
				await t.run(async (ctx) => {
					const mid = await ctx.db.get(executionId);
					const goneId = ctx.db.normalizeId(
						"projects",
						mid!.resumeState!.loop!.remainingItemIds[0]
					);
					await ctx.db.delete(goneId!);
				});

				await t.mutation(internal.automationExecutor.resumeExecution, {
					orgId,
					executionId,
					automationId,
				});

				// 25 from chunk 1 + 4 survivors from chunk 2; no failure.
				expect(await countInProgress()).toBe(CHUNK + 4);
				const final = await t.run(async (ctx) => ctx.db.get(executionId));
				expect(final?.status).toBe("completed");
				expect(final?.resumeState).toBeUndefined();
			});
		});
	});

	describe("interactive runs — event threading + org isolation", () => {
		// Fix 5: startManualRun must thread the trigger's simulated event values
		// (status_changed from/to) so a condition on trigger.event.newValue
		// resolves — matching startTestRun's behavior.
		it("startManualRun threads status_changed event values so a condition on trigger.event.newValue proceeds", async () => {
			const { asUser } = await setupUser();

			const automationId = await asUser.mutation(api.automations.create, {
				name: "Manual run event threading",
				trigger: {
					type: "status_changed",
					objectType: "client",
					fromStatus: "lead",
					toStatus: "active",
				},
				nodes: [
					eventNewValueConditionNode("cond-1", "status", {
						nextNodeId: "act-1",
					}),
					updateFieldActionNode("act-1", "notes", "condition passed"),
				],
				// isActive publishes a snapshot (startManualRun requires one).
				isActive: true,
			});

			const clientId = await asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "Acme Co",
				status: "active",
			});

			await asUser.mutation(api.automationExecutor.startManualRun, {
				automationId,
				record: { entityType: "client", entityId: clientId },
			});
			await t.finishAllScheduledFunctions(vi.runAllTimers);

			// event.newValue ("active") === record.status → condition true → act-1
			// runs. Without threading, event.newValue is undefined and the run
			// silently skips the true branch.
			const client = await t.run(async (ctx) => ctx.db.get(clientId));
			expect(client?.notes).toBe("condition passed");

			const executions = await t.run(async (ctx) =>
				ctx.db.query("workflowExecutions").collect()
			);
			expect(executions).toHaveLength(1);
			expect(executions[0].status).toBe("completed");
			expect(executions[0].nodesExecuted.map((n) => n.nodeId)).toContain(
				"act-1"
			);
		});

		// Fix 6: executeAutomation and its siblings must reject rows from a
		// different org than the caller passed.
		it("startManualRun rejects an automation from another org", async () => {
			const orgA = await setupUser({
				clerkUserId: "user_a_manual_xorg",
				clerkOrgId: "org_a_manual_xorg",
			});
			const orgB = await setupUser({
				clerkUserId: "user_b_manual_xorg",
				clerkOrgId: "org_b_manual_xorg",
			});

			const automationId = await orgA.asUser.mutation(api.automations.create, {
				name: "Org A manual",
				trigger: { type: "record_created", objectType: "client" },
				nodes: [updateFieldActionNode("act-1", "notes", "org A")],
				isActive: true,
			});

			await expect(
				orgB.asUser.mutation(api.automationExecutor.startManualRun, {
					automationId,
				})
			).rejects.toThrow(/Automation not found/);
		});

		it("startTestRun rejects an automation from another org", async () => {
			const orgA = await setupUser({
				clerkUserId: "user_a_test_xorg",
				clerkOrgId: "org_a_test_xorg",
			});
			const orgB = await setupUser({
				clerkUserId: "user_b_test_xorg",
				clerkOrgId: "org_b_test_xorg",
			});

			const automationId = await orgA.asUser.mutation(api.automations.create, {
				name: "Org A test",
				trigger: { type: "record_created", objectType: "client" },
				nodes: [conditionNode("cond-1", "companyName", "equals", "Acme Co")],
				isActive: true,
			});

			await expect(
				orgB.asUser.mutation(api.automationExecutor.startTestRun, {
					automationId,
				})
			).rejects.toThrow(/Automation not found/);
		});

		it("executeTestStep: a mismatched org cannot advance another org's test run", async () => {
			const orgA = await setupUser({
				clerkUserId: "user_a_step_xorg",
				clerkOrgId: "org_a_step_xorg",
			});
			const orgB = await setupUser({
				clerkUserId: "user_b_step_xorg",
				clerkOrgId: "org_b_step_xorg",
			});

			const automationId = await orgA.asUser.mutation(api.automations.create, {
				name: "Org A streaming test",
				trigger: { type: "record_created", objectType: "client" },
				nodes: [conditionNode("cond-1", "companyName", "equals", "Acme Co")],
				isActive: true,
			});

			const executionId = await orgA.asUser.mutation(
				api.automationExecutor.startTestRun,
				{ automationId }
			);

			const before = await t.run(async (ctx) => ctx.db.get(executionId));
			expect(before?.status).toBe("running");
			expect(before?.testCursor).toBeDefined();

			// Org B tries to advance org A's run: the guard makes it a no-op.
			await t.mutation(internal.automationExecutor.executeTestStep, {
				orgId: orgB.orgId,
				executionId,
			});

			const after = await t.run(async (ctx) => ctx.db.get(executionId));
			expect(after?.status).toBe("running");
			expect(after?.nodesExecuted.length).toBe(before?.nodesExecuted.length);
			expect(after?.testCursor).toBeDefined();
		});

		it("executeAutomation: a mismatched org cannot run another org's execution", async () => {
			const orgA = await setupUser({
				clerkUserId: "user_a_exec_xorg",
				clerkOrgId: "org_a_exec_xorg",
			});
			const orgB = await setupUser({
				clerkUserId: "user_b_exec_xorg",
				clerkOrgId: "org_b_exec_xorg",
			});

			const automationId = await orgA.asUser.mutation(api.automations.create, {
				name: "Org A automation",
				trigger: { type: "record_created", objectType: "client" },
				nodes: [updateFieldActionNode("act-1", "notes", "should not run")],
				isActive: true,
			});

			const clientId = await orgA.asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "Acme Co",
				status: "active",
			});

			const executionId = await t.run(async (ctx) =>
				ctx.db.insert("workflowExecutions", {
					orgId: orgA.orgId,
					automationId,
					triggeredBy: clientId,
					triggeredAt: Date.now(),
					status: "running",
					nodesExecuted: [],
					executionChain: [automationId],
					recursionDepth: 0,
				})
			);

			// Org B drives execution of org A's run: the org guard makes it a no-op.
			await t.mutation(internal.automationExecutor.executeAutomation, {
				orgId: orgB.orgId,
				executionId,
				automationId,
				objectType: "client",
				objectId: clientId,
				executionChain: [automationId],
				recursionDepth: 1,
			});

			const execution = await t.run(async (ctx) => ctx.db.get(executionId));
			expect(execution?.status).toBe("running");
			const client = await t.run(async (ctx) => ctx.db.get(clientId));
			expect(client?.notes).toBeUndefined();
		});
	});

	describe("create_record — generic record creation (Phase B1)", () => {
		function createRecordActionNode(
			id: string,
			opts: {
				objectType: "client" | "project" | "quote" | "invoice" | "task";
				fields?: Array<{
					field: string;
					value:
						| { kind: "static"; value: string | number | boolean | null }
						| { kind: "var"; path: string };
				}>;
				linkToScope?: boolean;
				nextNodeId?: string;
			}
		) {
			return {
				id,
				type: "action" as const,
				config: {
					kind: "action" as const,
					action: {
						type: "create_record" as const,
						objectType: opts.objectType,
						fields: opts.fields ?? [],
						linkToScope: opts.linkToScope,
					},
				},
				nextNodeId: opts.nextNodeId,
			};
		}

		async function makeOrgPremium(orgId: Id<"organizations">) {
			await t.run(async (ctx) =>
				ctx.db.patch(orgId, {
					clerkPlanSlug: "onetool_business_plan_org",
					subscriptionStatus: "active",
				})
			);
		}

		async function runScheduledOnce(automationId: Id<"workflowAutomations">) {
			await t.run(async (ctx) =>
				ctx.db.patch(automationId, { nextRunAt: Date.now() - 1000 })
			);
			await t.mutation(
				internal.automationExecutor.dispatchScheduledAutomations,
				{}
			);
			await t.finishAllScheduledFunctions(vi.runAllTimers);
		}

		it("creates a project linked to the scope client, with defaults, activity, aggregate, and a record_created emit", async () => {
			const { asUser, orgId } = await setupUser();

			await asUser.mutation(api.automations.create, {
				name: "Onboard project",
				trigger: { type: "record_created", objectType: "client" },
				nodes: [
					createRecordActionNode("act-1", {
						objectType: "project",
						linkToScope: true,
						fields: [
							{ field: "title", value: { kind: "static", value: "Onboarding" } },
						],
					}),
				],
				isActive: true,
			});

			const clientId = await asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "Acme Co",
				status: "active",
			});

			await drainEvents();

			const projects = await t.run(async (ctx) =>
				ctx.db.query("projects").collect()
			);
			expect(projects).toHaveLength(1);
			const project = projects[0];
			expect(project.clientId).toBe(clientId);
			expect(project.title).toBe("Onboarding");
			expect(project.status).toBe("planned");
			expect(project.projectType).toBe("one-off");
			expect(project.orgId).toBe(orgId);

			// Aggregate kept in sync: the new planned project is counted.
			const count = await t.run(async (ctx) =>
				projectCountsAggregate.count(ctx, {
					namespace: orgId,
					bounds: {
						lower: { key: ["planned", 0], inclusive: true },
						upper: {
							key: ["planned", Number.MAX_SAFE_INTEGER],
							inclusive: true,
						},
					},
				})
			);
			expect(count).toBe(1);

			// Activity logged.
			const activities = await t.run(async (ctx) =>
				ctx.db.query("activities").collect()
			);
			expect(
				activities.some(
					(a) => a.activityType === "project_created" && a.entityId === project._id
				)
			).toBe(true);

			// record_created emitted for the new project so cascades can fire.
			const events = await t.run(async (ctx) =>
				ctx.db.query("domainEvents").collect()
			);
			expect(
				events.some(
					(e) =>
						e.eventType === "entity.record_created" &&
						e.payload.entityType === "project" &&
						e.payload.entityId === project._id
				)
			).toBe(true);
		});

		it("creates an unlinked task at a scheduled top-level, defaulting type/status/date", async () => {
			const { asUser, orgId } = await setupUser();
			await makeOrgPremium(orgId);

			const automationId = await asUser.mutation(api.automations.create, {
				name: "Daily task",
				trigger: {
					type: "scheduled",
					schedule: { frequency: "daily", timezone: "UTC", time: "09:00" },
				},
				nodes: [
					createRecordActionNode("act-1", {
						objectType: "task",
						fields: [
							{ field: "title", value: { kind: "static", value: "Standup" } },
						],
					}),
				],
				isActive: true,
			});

			await runScheduledOnce(automationId);

			const tasks = await t.run(async (ctx) => ctx.db.query("tasks").collect());
			expect(tasks).toHaveLength(1);
			const task = tasks[0];
			expect(task.title).toBe("Standup");
			expect(task.type).toBe("internal");
			expect(task.status).toBe("pending");
			expect(task.clientId).toBeUndefined();
			expect(task.date % 86_400_000).toBe(0);

			const executions = await t.run(async (ctx) =>
				ctx.db.query("workflowExecutions").collect()
			);
			expect(executions).toHaveLength(1);
			expect(executions[0].status).toBe("completed");
		});

		it("enforces the free-plan client cap: an 11th create_record client fails without inserting", async () => {
			const { asUser } = await setupUser(); // free org (no premium)

			// Ten clients already exist.
			for (let i = 0; i < 10; i++) {
				await asUser.mutation(api.clients.create, {
					portalAccessId: crypto.randomUUID(),
					companyName: `Client ${i}`,
					status: "active",
				});
			}
			const anchorClient = await t.run(async (ctx) => {
				const rows = await ctx.db.query("clients").collect();
				return rows[0]._id;
			});

			await asUser.mutation(api.automations.create, {
				name: "Overflow client",
				trigger: { type: "record_created", objectType: "project" },
				nodes: [
					createRecordActionNode("act-1", {
						objectType: "client",
						fields: [
							{
								field: "companyName",
								value: { kind: "static", value: "Eleventh" },
							},
						],
					}),
				],
				isActive: true,
			});

			// Firing a project create drives the automation.
			await asUser.mutation(api.projects.create, {
				clientId: anchorClient,
				title: "Trigger",
				status: "planned",
				projectType: "one-off",
			});
			await drainEvents();

			const clients = await t.run(async (ctx) =>
				ctx.db.query("clients").collect()
			);
			expect(clients).toHaveLength(10); // no 11th
			expect(clients.some((c) => c.companyName === "Eleventh")).toBe(false);

			const executions = await t.run(async (ctx) =>
				ctx.db.query("workflowExecutions").collect()
			);
			expect(executions).toHaveLength(1);
			expect(executions[0].status).toBe("failed");
			expect(executions[0].error ?? "").toMatch(/limit|plan|upgrade/i);
		});

		it("rejects a cross-tenant FK: a supplied clientId from another org is not found", async () => {
			const { asUser } = await setupUser();
			const other = await setupUser({
				clerkUserId: "user-other",
				clerkOrgId: "org-other",
			});
			const foreignClient = await other.asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "Foreign Co",
				status: "active",
			});

			const anchorClient = await asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "Home Co",
				status: "active",
			});

			await asUser.mutation(api.automations.create, {
				name: "Bad FK task",
				trigger: { type: "record_created", objectType: "project" },
				nodes: [
					createRecordActionNode("act-1", {
						objectType: "task",
						fields: [
							{ field: "title", value: { kind: "static", value: "T" } },
							{
								field: "clientId",
								value: { kind: "static", value: foreignClient },
							},
						],
					}),
				],
				isActive: true,
			});

			await asUser.mutation(api.projects.create, {
				clientId: anchorClient,
				title: "Trigger",
				status: "planned",
				projectType: "one-off",
			});
			await drainEvents();

			const tasks = await t.run(async (ctx) => ctx.db.query("tasks").collect());
			expect(tasks).toHaveLength(0);

			const executions = await t.run(async (ctx) =>
				ctx.db.query("workflowExecutions").collect()
			);
			expect(executions[0].status).toBe("failed");
			expect(executions[0].error ?? "").toMatch(/client.*not found/i);
		});

		it("publish validation rejects a project create missing its required client", async () => {
			const { asUser } = await setupUser();
			await expect(
				asUser.mutation(api.automations.create, {
					name: "Bad project create",
					trigger: { type: "record_created", objectType: "task" },
					nodes: [
						createRecordActionNode("act-1", {
							objectType: "project",
							fields: [
								{ field: "title", value: { kind: "static", value: "X" } },
							],
						}),
					],
					isActive: true,
				})
			).rejects.toThrow(/client is required/i);
		});

		it("publish validation rejects creating a non-creatable object type (quote)", async () => {
			const { asUser } = await setupUser();
			await expect(
				asUser.mutation(api.automations.create, {
					name: "Bad quote create",
					trigger: { type: "record_created", objectType: "task" },
					nodes: [
						createRecordActionNode("act-1", {
							objectType: "quote",
							fields: [
								{ field: "title", value: { kind: "static", value: "X" } },
							],
						}),
					],
					isActive: true,
				})
			).rejects.toThrow(/isn't supported/i);
		});

		it("publish validation rejects a non-creatable field and an invalid select option", async () => {
			const { asUser } = await setupUser();
			await expect(
				asUser.mutation(api.automations.create, {
					name: "Bad field",
					trigger: { type: "record_created", objectType: "task" },
					nodes: [
						createRecordActionNode("act-1", {
							objectType: "task",
							fields: [
								{ field: "title", value: { kind: "static", value: "X" } },
								{
									field: "completedAt",
									value: { kind: "static", value: 0 },
								},
							],
						}),
					],
					isActive: true,
				})
			).rejects.toThrow(/completedAt.*can't be set/i);

			await expect(
				asUser.mutation(api.automations.create, {
					name: "Bad status",
					trigger: { type: "record_created", objectType: "task" },
					nodes: [
						createRecordActionNode("act-1", {
							objectType: "task",
							fields: [
								{ field: "title", value: { kind: "static", value: "X" } },
								{
									field: "status",
									value: { kind: "static", value: "nonsense" },
								},
							],
						}),
					],
					isActive: true,
				})
			).rejects.toThrow(/not a valid value/i);
		});
	});
});
