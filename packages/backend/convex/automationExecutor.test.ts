import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setupConvexTest } from "./test.setup";
import { createTestOrg, createTestIdentity } from "./test.helpers";
import { api, internal } from "./_generated/api";
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
					| ReturnType<typeof updateFieldActionNode>[];
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
				nodes: overrides.nodes ?? [conditionNode("cond-1", "status", "equals", "active")],
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

		it("switching an active automation's trigger away from scheduled clears nextRunAt, and back sets it", async () => {
			const { asUser } = await setupUser();

			const id = await asUser.mutation(
				api.automations.create,
				scheduledAutomation({ isActive: true })
			);
			expect((await t.run(async (ctx) => ctx.db.get(id)))?.nextRunAt).toBeTypeOf(
				"number"
			);

			await asUser.mutation(api.automations.update, {
				id,
				trigger: { type: "record_created", objectType: "client" },
				nodes: [conditionNode("cond-1", "companyName", "contains", "Acme")],
			});
			const switchedAway = await t.run(async (ctx) => ctx.db.get(id));
			expect(switchedAway?.nextRunAt).toBeUndefined();

			await asUser.mutation(api.automations.update, {
				id,
				trigger: {
					type: "scheduled",
					schedule: { frequency: "daily" as const, timezone: "UTC", time: "09:00" },
				},
				nodes: [conditionNode("cond-1", "status", "equals", "active")],
			});
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

		it("a record-dependent action on a scheduled run fails with a clear error", async () => {
			const { asUser, orgId } = await setupUser();
			await makeOrgPremium(orgId);

			const id = await asUser.mutation(
				api.automations.create,
				scheduledAutomation({
					isActive: true,
					nodes: [updateFieldActionNode("act-1", "notes", "Should not run")],
				})
			);
			const past = Date.now() - 1000;
			await t.run(async (ctx) => ctx.db.patch(id, { nextRunAt: past }));

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
});
