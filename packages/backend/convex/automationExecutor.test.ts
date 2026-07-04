import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setupConvexTest } from "./test.setup";
import { createTestOrg, createTestIdentity, addMemberToOrg } from "./test.helpers";
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

			// Publishing a scheduled trigger sets it again.
			await asUser.mutation(api.automations.update, {
				id,
				trigger: {
					type: "scheduled",
					schedule: { frequency: "daily" as const, timezone: "UTC", time: "09:00" },
				},
				nodes: [conditionNode("cond-1", "status", "equals", "active")],
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

		function fetchNode(
			id: string,
			objectType: "client" | "project" | "quote" | "invoice" | "task",
			filters: ReturnType<typeof filterGroup>[] = [],
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
			recipient: "org_admins" | "record_owner" | { userId: string },
			message: string,
			opts: { nextNodeId?: string } = {}
		) {
			return {
				id,
				type: "action" as const,
				config: {
					kind: "action" as const,
					action: {
						type: "send_notification" as const,
						recipient,
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
});
