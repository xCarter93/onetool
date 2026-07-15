import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setupConvexTest } from "./test.setup";
import { createTestOrg, createTestIdentity } from "./test.helpers";
import { api, internal } from "./_generated/api";
import { computeNextRunAt } from "./lib/schedule";

// Valid v2 trigger: client statuses are lead/active/inactive/archived
const clientTrigger = {
	type: "status_changed",
	objectType: "client",
	toStatus: "active",
} as const;

function conditionNode(id: string, nextNodeId?: string) {
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
							field: "companyName",
							operator: "contains" as const,
							value: { kind: "static" as const, value: "Acme" },
						},
					],
				},
			],
		},
		nextNodeId,
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

function endNode(id: string) {
	return { id, type: "end" as const, config: { kind: "end" as const } };
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

function delayUntilNode(
	id: string,
	until: { kind: "static"; value: string | number },
	opts: { nextNodeId?: string } = {}
) {
	return {
		id,
		type: "delay_until" as const,
		config: { kind: "delay_until" as const, until },
		nextNodeId: opts.nextNodeId,
	};
}

function createTaskNode(
	id: string,
	title: string | null,
	opts: { dueInDays?: number; nextNodeId?: string } = {}
) {
	return {
		id,
		type: "action" as const,
		config: {
			kind: "action" as const,
			action: {
				type: "create_task" as const,
				title: { kind: "static" as const, value: title },
				dueInDays: opts.dueInDays,
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

function actionNode(id: string, statusValue = "inactive") {
	return {
		id,
		type: "action" as const,
		config: {
			kind: "action" as const,
			action: {
				type: "update_field" as const,
				target: "self" as const,
				field: "status",
				value: { kind: "static" as const, value: statusValue },
			},
		},
	};
}

function updateFieldsNode(
	id: string,
	fields: Array<{ field: string; value: string | number | boolean }>
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
	};
}

describe("Automations", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
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

	describe("create", () => {
		it("creates a draft by default (no published snapshot)", async () => {
			const { asUser } = await setupUser();

			const id = await asUser.mutation(api.automations.create, {
				name: "Flag big clients",
				description: "Condition then action",
				trigger: clientTrigger,
				nodes: [conditionNode("cond-1", "act-1"), actionNode("act-1")],
			});

			const automation = await asUser.query(api.automations.get, { id });
			expect(automation?.status).toBe("draft");
			expect(automation?.publishedSnapshot).toBeUndefined();
			expect(automation?.nodes).toHaveLength(2);
		});

		it("creates active with snapshot v1 when isActive is true", async () => {
			const { asUser } = await setupUser();

			const id = await asUser.mutation(api.automations.create, {
				name: "Active on create",
				trigger: clientTrigger,
				nodes: [actionNode("act-1")],
				isActive: true,
			});

			const automation = await asUser.query(api.automations.get, { id });
			expect(automation?.status).toBe("active");
			expect(automation?.publishedSnapshot?.version).toBe(1);
			expect(automation?.publishedSnapshot?.nodes).toHaveLength(1);
		});

		it("accepts a record_created trigger", async () => {
			const { asUser } = await setupUser();

			const id = await asUser.mutation(api.automations.create, {
				name: "New project",
				trigger: { type: "record_created", objectType: "project" },
				nodes: [actionNode("act-1", "in-progress")],
			});

			const automation = await asUser.query(api.automations.get, { id });
			expect(automation?.trigger).toHaveProperty("type", "record_created");
		});

		it("accepts a record_updated trigger with a fields array", async () => {
			const { asUser } = await setupUser();

			const id = await asUser.mutation(api.automations.create, {
				name: "Project edited",
				trigger: {
					type: "record_updated",
					objectType: "project",
					fields: ["status", "title"],
				},
				nodes: [actionNode("act-1", "completed")],
			});

			const automation = await asUser.query(api.automations.get, { id });
			expect(automation?.trigger).toHaveProperty("fields", ["status", "title"]);
		});

		it("accepts a valid scheduled trigger and sets nextRunAt when active", async () => {
			const { asUser } = await setupUser();

			const id = await asUser.mutation(api.automations.create, {
				name: "Nightly sweep",
				trigger: {
					type: "scheduled",
					schedule: {
						frequency: "daily",
						timezone: "America/New_York",
						time: "09:00",
					},
				},
				nodes: [notifyNode("notify-1")],
				isActive: true,
			});

			const automation = await asUser.query(api.automations.get, { id });
			expect(automation?.trigger).toHaveProperty("type", "scheduled");
			expect(automation?.nextRunAt).toBeTypeOf("number");
			expect(automation!.nextRunAt!).toBeGreaterThan(Date.now());
		});
	});

	describe("send_team_message validation (recipients retired) — C1", () => {
		function teamMessageNode(
			mention: { kind: "none" } | { kind: "created_by" }
		) {
			return {
				id: "msg-1",
				type: "action" as const,
				config: {
					kind: "action" as const,
					action: {
						type: "send_team_message" as const,
						recipients: { userIds: [] as string[] },
						mention,
						title: "Ping",
						message: "hello team",
					},
				},
			};
		}

		it("saves + publishes with empty recipients and mention none", async () => {
			const { asUser } = await setupUser();
			const id = await asUser.mutation(api.automations.create, {
				name: "Team msg none",
				trigger: clientTrigger,
				nodes: [teamMessageNode({ kind: "none" })],
			});
			await asUser.mutation(api.automations.publish, { id });
			const automation = await asUser.query(api.automations.get, { id });
			expect(automation?.publishedSnapshot).toBeDefined();
		});

		it("saves + publishes with mention created_by", async () => {
			const { asUser } = await setupUser();
			const id = await asUser.mutation(api.automations.create, {
				name: "Team msg created_by",
				trigger: clientTrigger,
				nodes: [teamMessageNode({ kind: "created_by" })],
			});
			await asUser.mutation(api.automations.publish, { id });
			const automation = await asUser.query(api.automations.get, { id });
			expect(automation?.publishedSnapshot).toBeDefined();
		});
	});

	describe("formulas", () => {
		it("stores formulas on create and snapshots them on publish", async () => {
			const { asUser } = await setupUser();
			const id = await asUser.mutation(api.automations.create, {
				name: "With formula",
				trigger: clientTrigger,
				nodes: [actionNode("act-1")],
				formulas: [
					{
						id: "f1",
						name: "Doubled",
						returnType: "number",
						expression: "{trigger.record.budget} * 2",
					},
				],
			});
			let automation = await asUser.query(api.automations.get, { id });
			expect(automation?.formulas).toHaveLength(1);

			await asUser.mutation(api.automations.publish, { id });
			automation = await asUser.query(api.automations.get, { id });
			expect(automation?.publishedSnapshot?.formulas).toHaveLength(1);
		});

		it("rejects a formula with a syntax error", async () => {
			const { asUser } = await setupUser();
			await expect(
				asUser.mutation(api.automations.create, {
					name: "Bad formula",
					trigger: clientTrigger,
					nodes: [actionNode("act-1")],
					formulas: [
						{ id: "f1", name: "Broken", returnType: "number", expression: "1 +" },
					],
				})
			).rejects.toThrow(/syntax error/i);
		});

		it("rejects a formula reference cycle", async () => {
			const { asUser } = await setupUser();
			await expect(
				asUser.mutation(api.automations.create, {
					name: "Cyclic",
					trigger: clientTrigger,
					nodes: [actionNode("act-1")],
					formulas: [
						{
							id: "a",
							name: "A",
							returnType: "number",
							expression: "{formula.b} + 1",
						},
						{
							id: "b",
							name: "B",
							returnType: "number",
							expression: "{formula.a} + 1",
						},
					],
				})
			).rejects.toThrow(/cycle/i);
		});
	});

	describe("validation", () => {
		it("rejects an unknown field in a condition rule", async () => {
			const { asUser } = await setupUser();

			const node = conditionNode("cond-1");
			node.config.groups[0].rules[0].field = "notARealField";

			await expect(
				asUser.mutation(api.automations.create, {
					name: "Bad field",
					trigger: clientTrigger,
					nodes: [node],
				})
			).rejects.toThrow(/unknown field/i);
		});

		it("rejects an invalid status value in an update_field action", async () => {
			const { asUser } = await setupUser();

			await expect(
				asUser.mutation(api.automations.create, {
					name: "Bad status",
					trigger: clientTrigger,
					nodes: [actionNode("act-1", "prospect")],
				})
			).rejects.toThrow(/not a valid value/i);
		});

		it("accepts a multi-field update_fields action (Phase B2)", async () => {
			const { asUser } = await setupUser();

			const id = await asUser.mutation(api.automations.create, {
				name: "Multi-field update",
				trigger: clientTrigger,
				nodes: [
					updateFieldsNode("act-1", [
						{ field: "notes", value: "swept" },
						{ field: "status", value: "inactive" },
					]),
				],
			});

			expect(await asUser.query(api.automations.get, { id })).toBeTruthy();
		});

		it("rejects update_fields with a duplicated field", async () => {
			const { asUser } = await setupUser();

			await expect(
				asUser.mutation(api.automations.create, {
					name: "Twice the notes",
					trigger: clientTrigger,
					nodes: [
						updateFieldsNode("act-1", [
							{ field: "notes", value: "a" },
							{ field: "notes", value: "b" },
						]),
					],
				})
			).rejects.toThrow(/appears more than once/i);
		});

		it("rejects update_fields with no rows", async () => {
			const { asUser } = await setupUser();

			await expect(
				asUser.mutation(api.automations.create, {
					name: "Empty update",
					trigger: clientTrigger,
					nodes: [updateFieldsNode("act-1", [])],
				})
			).rejects.toThrow(/at least one field/i);
		});

		it("rejects update_fields writing a non-writable field", async () => {
			const { asUser } = await setupUser();

			await expect(
				asUser.mutation(api.automations.create, {
					name: "Hands off completedAt",
					trigger: { type: "record_created", objectType: "project" },
					nodes: [
						updateFieldsNode("act-1", [
							{ field: "description", value: "fine" },
							{ field: "completedAt", value: 0 },
						]),
					],
				})
			).rejects.toThrow(/cannot be updated/i);
		});

		it("rejects an invalid static select value in update_fields", async () => {
			const { asUser } = await setupUser();

			await expect(
				asUser.mutation(api.automations.create, {
					name: "Bogus status",
					trigger: clientTrigger,
					nodes: [
						updateFieldsNode("act-1", [{ field: "status", value: "bogus" }]),
					],
				})
			).rejects.toThrow(/not a valid value/i);
		});

		it("rejects a scheduled trigger with an invalid IANA timezone", async () => {
			const { asUser } = await setupUser();

			await expect(
				asUser.mutation(api.automations.create, {
					name: "Bad timezone",
					trigger: {
						type: "scheduled",
						schedule: {
							frequency: "daily",
							timezone: "Not/AZone",
							time: "09:00",
						},
					},
					nodes: [actionNode("act-1", "inactive")],
				})
			).rejects.toThrow(/timezone/i);
		});

		it("rejects an operator not valid for the field type", async () => {
			const { asUser } = await setupUser();

			const node = conditionNode("cond-1");
			// status is a select field; greater_than is numeric-only
			node.config.groups[0].rules[0] = {
				field: "status",
				operator: "greater_than" as never,
				value: { kind: "static", value: "active" },
			};

			await expect(
				asUser.mutation(api.automations.create, {
					name: "Bad operator",
					trigger: clientTrigger,
					nodes: [node],
				})
			).rejects.toThrow(/not valid for field/i);
		});

		it("rejects a config kind that does not match the node type", async () => {
			const { asUser } = await setupUser();

			await expect(
				asUser.mutation(api.automations.create, {
					name: "Kind mismatch",
					trigger: clientTrigger,
					nodes: [
						{
							id: "act-1",
							type: "action" as const,
							config: conditionNode("act-1").config,
						},
					],
				})
			).rejects.toThrow(/does not match node type/i);
		});

		it("rejects a nextNodeId pointing to a missing node", async () => {
			const { asUser } = await setupUser();

			await expect(
				asUser.mutation(api.automations.create, {
					name: "Dangling ref",
					trigger: clientTrigger,
					nodes: [conditionNode("cond-1", "ghost")],
				})
			).rejects.toThrow(/references missing node/i);
		});

		it("rejects a cyclic node graph", async () => {
			const { asUser } = await setupUser();

			await expect(
				asUser.mutation(api.automations.create, {
					name: "Cycle",
					trigger: clientTrigger,
					nodes: [
						conditionNode("cond-1", "cond-2"),
						conditionNode("cond-2", "cond-1"),
					],
				})
			).rejects.toThrow(/cycle/i);
		});

		it("rejects activating with zero nodes but allows a zero-node draft", async () => {
			const { asUser } = await setupUser();

			await expect(
				asUser.mutation(api.automations.create, {
					name: "Empty active",
					trigger: clientTrigger,
					nodes: [],
					isActive: true,
				})
			).rejects.toThrow(/at least one step/i);

			const id = await asUser.mutation(api.automations.create, {
				name: "Empty draft",
				trigger: clientTrigger,
				nodes: [],
			});
			const automation = await asUser.query(api.automations.get, { id });
			expect(automation?.status).toBe("draft");
		});
	});

	describe("scheduled triggers have no record (A1)", () => {
		const schedule = {
			frequency: "daily" as const,
			timezone: "UTC",
			time: "09:00",
		};
		const scheduledTrigger = { type: "scheduled" as const, schedule };

		/** A condition whose left side is a scope value, not a record field. */
		function varLeftConditionNode(id: string, path: string) {
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
									operator: "greater_than" as const,
									value: { kind: "static" as const, value: 100 },
								},
							],
						},
					],
				},
			};
		}

		it("rejects a top-level update_field on update, not just create", async () => {
			const { asUser } = await setupUser();

			// Starts life as a record trigger, where update_field(self) is fine.
			const id = await asUser.mutation(api.automations.create, {
				name: "Switcher",
				trigger: clientTrigger,
				nodes: [actionNode("act-1")],
			});

			await expect(
				asUser.mutation(api.automations.update, {
					id,
					trigger: scheduledTrigger,
				})
			).rejects.toThrow(/no record to update/i);
		});

		it("rejects a top-level update_fields, same as update_field (B2)", async () => {
			const { asUser } = await setupUser();

			await expect(
				asUser.mutation(api.automations.create, {
					name: "Multi on a schedule",
					trigger: scheduledTrigger,
					nodes: [updateFieldsNode("act-1", [{ field: "notes", value: "x" }])],
				})
			).rejects.toThrow(/no record to update/i);
		});

		it("accepts update_fields inside a fetch → loop body (B2)", async () => {
			const { asUser } = await setupUser();

			const id = await asUser.mutation(api.automations.create, {
				name: "Bulk sweep on a schedule",
				trigger: scheduledTrigger,
				nodes: [
					fetchNode("fetch-1", "project", { nextNodeId: "loop-1" }),
					loopNode("loop-1", "fetch-1", { bodyStartNodeId: "upd-1" }),
					updateFieldsNode("upd-1", [
						{ field: "description", value: "swept" },
						{ field: "title", value: "Renamed" },
					]),
				],
			});

			expect(await asUser.query(api.automations.get, { id })).toBeTruthy();
		});

		it("rejects a condition that reads a record field", async () => {
			const { asUser } = await setupUser();

			await expect(
				asUser.mutation(api.automations.create, {
					name: "Record-reading condition",
					trigger: scheduledTrigger,
					nodes: [conditionNode("cond-1")],
				})
			).rejects.toThrow(/nothing to test/i);
		});

		it("accepts a top-level condition whose left side is a variable", async () => {
			const { asUser } = await setupUser();

			const id = await asUser.mutation(api.automations.create, {
				name: "Aggregate threshold",
				trigger: scheduledTrigger,
				nodes: [varLeftConditionNode("cond-1", "node.agg-1.result")],
			});

			expect(await asUser.query(api.automations.get, { id })).toBeTruthy();
		});

		it("rejects a {{trigger.record.*}} token inside a message template", async () => {
			const { asUser } = await setupUser();

			await expect(
				asUser.mutation(api.automations.create, {
					name: "Dead token in a template",
					trigger: scheduledTrigger,
					// Not a ValueRef — a path-only scan would sail right past this.
					nodes: [notifyNode("notify-1", "Total: {{trigger.record.total}}")],
				})
			).rejects.toThrow(/always empty/i);
		});

		it("rejects a formula that reads the trigger record", async () => {
			const { asUser } = await setupUser();

			await expect(
				asUser.mutation(api.automations.create, {
					name: "Dead formula",
					trigger: scheduledTrigger,
					nodes: [notifyNode("notify-1")],
					formulas: [
						{
							id: "f1",
							name: "Doubled",
							returnType: "number" as const,
							expression: "{trigger.record.budget} * 2",
						},
					],
				})
			).rejects.toThrow(/always empty/i);
		});

		it("rejects switching to a schedule when a stored formula reads the record", async () => {
			const { asUser } = await setupUser();

			// Formulas are automation-level: changing only the trigger has to
			// re-check them, or a live formula is stranded reading nothing.
			const id = await asUser.mutation(api.automations.create, {
				name: "Formula stranded by a trigger switch",
				trigger: clientTrigger,
				nodes: [notifyNode("notify-1")],
				formulas: [
					{
						id: "f1",
						name: "Doubled",
						returnType: "number" as const,
						expression: "{trigger.record.budget} * 2",
					},
				],
			});

			await expect(
				asUser.mutation(api.automations.update, { id, trigger: scheduledTrigger })
			).rejects.toThrow(/always empty/i);
		});

		it("rejects a variable left side in a fetch filter", async () => {
			const { asUser } = await setupUser();

			await expect(
				asUser.mutation(api.automations.create, {
					name: "Var left in a filter",
					trigger: scheduledTrigger,
					nodes: [
						{
							id: "fetch-1",
							type: "fetch_records" as const,
							config: {
								kind: "fetch_records" as const,
								objectType: "client" as const,
								filters: [
									{
										logic: "and" as const,
										rules: [
											{
												field: "",
												left: { kind: "var" as const, path: "node.x.count" },
												operator: "greater_than" as const,
												value: { kind: "static" as const, value: 1 },
											},
										],
									},
								],
							},
						},
					],
				})
			).rejects.toThrow(/must compare a field/i);
		});

		it("refuses to resume a snapshot that breaks the rules", async () => {
			// toggleActive resumes the PUBLISHED snapshot. It never re-checked it, so
			// an automation published before this rule landed could be switched back
			// on and fail every tick.
			const { asUser, orgId } = await setupUser();

			const trigger = { type: "scheduled" as const, schedule };
			const nodes = [actionNode("act-1")]; // update_field(self) — no record to act on

			const id = await t.run(async (ctx) => {
				const user = await ctx.db.query("users").first();
				const now = Date.now();
				return ctx.db.insert("workflowAutomations", {
					orgId,
					name: "Broken scheduled, paused",
					trigger,
					nodes,
					status: "paused" as const,
					publishedSnapshot: { trigger, nodes, version: 1, publishedAt: now },
					createdBy: user!._id,
					createdAt: now,
					updatedAt: now,
				});
			});

			await expect(
				asUser.mutation(api.automations.toggleActive, { id })
			).rejects.toThrow(/no record to update/i);

			const after = await t.run(async (ctx) => ctx.db.get(id));
			expect(after?.status).toBe("paused");
		});

		it("rejects a variable left side in trigger entry criteria", async () => {
			const { asUser } = await setupUser();

			await expect(
				asUser.mutation(api.automations.create, {
					name: "Var left in entry criteria",
					trigger: {
						...clientTrigger,
						entryCriteria: {
							logic: "and" as const,
							groups: [
								{
									logic: "and" as const,
									rules: [
										{
											field: "",
											left: { kind: "var" as const, path: "node.x.count" },
											operator: "greater_than" as const,
											value: { kind: "static" as const, value: 1 },
										},
									],
								},
							],
						},
					},
					nodes: [notifyNode("notify-1")],
				})
			).rejects.toThrow(/must compare a field/i);
		});
	});

	describe("Slice 3 — walk-engine node validation", () => {
		it("rejects a loop body that contains another loop", async () => {
			const { asUser } = await setupUser();

			await expect(
				asUser.mutation(api.automations.create, {
					name: "Nested loop",
					trigger: clientTrigger,
					nodes: [
						fetchNode("fetch-1", "project", { nextNodeId: "loop-outer" }),
						loopNode("loop-outer", "fetch-1", { bodyStartNodeId: "loop-inner" }),
						loopNode("loop-inner", "fetch-1"),
					],
				})
			).rejects.toThrow(/loops cannot contain other loops/i);
		});

		it("rejects a delay step inside a loop body", async () => {
			const { asUser } = await setupUser();

			await expect(
				asUser.mutation(api.automations.create, {
					name: "Delay in loop",
					trigger: clientTrigger,
					nodes: [
						fetchNode("fetch-1", "project", { nextNodeId: "loop-1" }),
						loopNode("loop-1", "fetch-1", { bodyStartNodeId: "delay-1" }),
						delayNode("delay-1", 1, "hours"),
					],
				})
			).rejects.toThrow(/delay steps aren't supported inside loops/i);
		});

		it("rejects an aggregate over a non-numeric field", async () => {
			const { asUser } = await setupUser();

			await expect(
				asUser.mutation(api.automations.create, {
					name: "Bad aggregate field",
					trigger: clientTrigger,
					nodes: [
						fetchNode("fetch-1", "invoice", { nextNodeId: "agg-1" }),
						{
							id: "agg-1",
							type: "aggregate" as const,
							config: {
								kind: "aggregate" as const,
								sourceNodeId: "fetch-1",
								field: "status", // select, not numeric
								op: "sum" as const,
							},
						},
					],
				})
			).rejects.toThrow(/number or currency field/i);
		});

		it("rejects an aggregate whose source is not a Find records node", async () => {
			const { asUser } = await setupUser();

			await expect(
				asUser.mutation(api.automations.create, {
					name: "Bad aggregate source",
					trigger: clientTrigger,
					nodes: [
						{
							id: "agg-1",
							type: "aggregate" as const,
							config: {
								kind: "aggregate" as const,
								sourceNodeId: "nope",
								field: "total",
								op: "sum" as const,
							},
						},
					],
				})
			).rejects.toThrow(/must reference a "Find records" node/i);
		});

		it("rejects an adjust_time with a non-date static base", async () => {
			const { asUser } = await setupUser();

			await expect(
				asUser.mutation(api.automations.create, {
					name: "Bad adjust base",
					trigger: clientTrigger,
					nodes: [
						{
							id: "adj-1",
							type: "adjust_time" as const,
							config: {
								kind: "adjust_time" as const,
								base: { kind: "static" as const, value: "not a date" },
								amount: 5,
								unit: "days" as const,
								direction: "add" as const,
							},
						},
					],
				})
			).rejects.toThrow(/needs a valid date/i);
		});

		it("rejects a loop body node that's also reachable from the main chain", async () => {
			const { asUser } = await setupUser();

			await expect(
				asUser.mutation(api.automations.create, {
					name: "Shared body node",
					trigger: clientTrigger,
					nodes: [
						fetchNode("fetch-1", "project", { nextNodeId: "loop-1" }),
						loopNode("loop-1", "fetch-1", {
							bodyStartNodeId: "shared-act",
							nextNodeId: "shared-act",
						}),
						// Field-agnostic action so the structural check is what fires
						// (update_field would fail type-scoped field validation first).
						{
							id: "shared-act",
							type: "action" as const,
							config: {
								kind: "action" as const,
								action: {
									type: "send_notification" as const,
									recipient: "org_admins" as const,
									message: "Shared step",
								},
							},
						},
					],
				})
			).rejects.toThrow(/is inside a loop but also reachable outside it/i);
		});

		it("rejects a delay over the 90-day cap", async () => {
			const { asUser } = await setupUser();

			await expect(
				asUser.mutation(api.automations.create, {
					name: "Too-long delay",
					trigger: clientTrigger,
					// 2161 hours ≈ 90.04 days > MAX_DELAY_MS (90 days).
					nodes: [delayNode("delay-1", 2161, "hours")],
				})
			).rejects.toThrow(/capped at 90 days/i);
		});

		it("rejects a delay amount of zero", async () => {
			const { asUser } = await setupUser();

			await expect(
				asUser.mutation(api.automations.create, {
					name: "Zero delay",
					trigger: clientTrigger,
					nodes: [delayNode("delay-1", 0, "minutes")],
				})
			).rejects.toThrow(/delay must be a whole number/i);
		});

		it("rejects a delay_until static value that isn't a valid date", async () => {
			const { asUser } = await setupUser();

			await expect(
				asUser.mutation(api.automations.create, {
					name: "Bad delay-until",
					trigger: clientTrigger,
					nodes: [
						delayUntilNode("du-1", { kind: "static", value: "not-a-date" }),
					],
				})
			).rejects.toThrow(/needs a valid date/i);
		});

		it("rejects create_task with an empty static title", async () => {
			const { asUser } = await setupUser();

			await expect(
				asUser.mutation(api.automations.create, {
					name: "Empty task title",
					trigger: clientTrigger,
					nodes: [createTaskNode("task-1", "")],
				})
			).rejects.toThrow(/task title is required/i);
		});

		it("rejects a create_task dueInDays outside 0-365", async () => {
			const { asUser } = await setupUser();

			await expect(
				asUser.mutation(api.automations.create, {
					name: "Due too far out",
					trigger: clientTrigger,
					nodes: [createTaskNode("task-1", "Follow up", { dueInDays: 400 })],
				})
			).rejects.toThrow(/due date must be/i);
		});

		it("accepts a valid fetch → loop(update_field) → end workflow", async () => {
			const { asUser } = await setupUser();

			const id = await asUser.mutation(api.automations.create, {
				name: "Valid walk",
				trigger: {
					type: "scheduled",
					schedule: { frequency: "daily", timezone: "UTC", time: "09:00" },
				},
				nodes: [
					fetchNode("fetch-1", "project", { nextNodeId: "loop-1" }),
					loopNode("loop-1", "fetch-1", {
						bodyStartNodeId: "body-act",
						nextNodeId: "end-1",
					}),
					{
						id: "body-act",
						type: "action" as const,
						config: {
							kind: "action" as const,
							action: {
								type: "update_field" as const,
								target: "self" as const,
								field: "status",
								value: { kind: "static" as const, value: "in-progress" },
							},
						},
					},
					endNode("end-1"),
				],
			});

			const automation = await asUser.query(api.automations.get, { id });
			expect(automation?.status).toBe("draft");
			expect(automation?.nodes).toHaveLength(4);
		});

		it("validates loop-body update_field against the loop's fetched type, not the trigger's", async () => {
			const { asUser } = await setupUser();

			// Trigger is a client; loop iterates projects. "in-progress" is a
			// valid project status but not a client status — this must save.
			const id = await asUser.mutation(api.automations.create, {
				name: "Cross-type loop body",
				trigger: { type: "record_created", objectType: "client" },
				nodes: [
					fetchNode("fetch-1", "project", { nextNodeId: "loop-1" }),
					loopNode("loop-1", "fetch-1", { bodyStartNodeId: "body-act" }),
					{
						id: "body-act",
						type: "action" as const,
						config: {
							kind: "action" as const,
							action: {
								type: "update_field" as const,
								target: "self" as const,
								field: "status",
								value: { kind: "static" as const, value: "in-progress" },
							},
						},
					},
				],
			});

			const automation = await asUser.query(api.automations.get, { id });
			expect(automation?.nodes).toHaveLength(3);

			// And an invalid status for the fetched type is still rejected.
			await expect(
				asUser.mutation(api.automations.create, {
					name: "Bad loop-body status",
					trigger: { type: "record_created", objectType: "client" },
					nodes: [
						fetchNode("fetch-1", "project", { nextNodeId: "loop-1" }),
						loopNode("loop-1", "fetch-1", { bodyStartNodeId: "body-act" }),
						{
							id: "body-act",
							type: "action" as const,
							config: {
								kind: "action" as const,
								action: {
									type: "update_field" as const,
									target: "self" as const,
									field: "status",
									// A client status, invalid for projects.
									value: { kind: "static" as const, value: "lead" },
								},
							},
						},
					],
				})
			).rejects.toThrow(/not a valid value/i);
		});
	});

	describe("update", () => {
		it("saves the working copy without republishing while active", async () => {
			const { asUser } = await setupUser();

			const id = await asUser.mutation(api.automations.create, {
				name: "Active edit",
				trigger: clientTrigger,
				nodes: [actionNode("act-1")],
				isActive: true,
			});

			await asUser.mutation(api.automations.update, {
				id,
				nodes: [actionNode("act-1", "archived")],
			});

			const automation = await asUser.query(api.automations.get, { id });
			// Stays active and live on the ORIGINAL snapshot; edits are unpublished.
			expect(automation?.status).toBe("active");
			expect(automation?.publishedSnapshot?.version).toBe(1);

			// Working copy reflects the edit; the published snapshot does not.
			const value = (node: unknown) =>
				(
					node as {
						config?: { action?: { value?: { value?: unknown } } };
					}
				)?.config?.action?.value?.value;
			expect(value(automation?.nodes[0])).toBe("archived");
			expect(value(automation?.publishedSnapshot?.nodes[0])).toBe("inactive");
		});

		it("does not create a snapshot when editing a draft", async () => {
			const { asUser } = await setupUser();

			const id = await asUser.mutation(api.automations.create, {
				name: "Draft edit",
				trigger: clientTrigger,
				nodes: [],
			});

			await asUser.mutation(api.automations.update, {
				id,
				name: "Draft edit renamed",
				nodes: [actionNode("act-1")],
			});

			const automation = await asUser.query(api.automations.get, { id });
			expect(automation?.name).toBe("Draft edit renamed");
			expect(automation?.status).toBe("draft");
			expect(automation?.publishedSnapshot).toBeUndefined();
		});
	});

	describe("publish", () => {
		it("publishes a valid draft, then v2 after a paused edit", async () => {
			const { asUser } = await setupUser();

			const id = await asUser.mutation(api.automations.create, {
				name: "Publish flow",
				trigger: clientTrigger,
				nodes: [actionNode("act-1")],
			});

			await asUser.mutation(api.automations.publish, { id });
			let automation = await asUser.query(api.automations.get, { id });
			expect(automation?.status).toBe("active");
			expect(automation?.publishedSnapshot?.version).toBe(1);

			// Pause, edit the working copy (no auto-republish), publish again
			await asUser.mutation(api.automations.toggleActive, { id });
			await asUser.mutation(api.automations.update, {
				id,
				nodes: [actionNode("act-1", "archived")],
			});
			automation = await asUser.query(api.automations.get, { id });
			expect(automation?.publishedSnapshot?.version).toBe(1);

			await asUser.mutation(api.automations.publish, { id });
			automation = await asUser.query(api.automations.get, { id });
			expect(automation?.status).toBe("active");
			expect(automation?.publishedSnapshot?.version).toBe(2);
		});
	});

	describe("toggleActive", () => {
		it("cycles active -> paused -> active, resuming the same snapshot", async () => {
			const { asUser } = await setupUser();

			const id = await asUser.mutation(api.automations.create, {
				name: "Toggle",
				trigger: clientTrigger,
				nodes: [actionNode("act-1")],
				isActive: true,
			});

			await asUser.mutation(api.automations.toggleActive, { id });
			let automation = await asUser.query(api.automations.get, { id });
			expect(automation?.status).toBe("paused");
			expect(automation?.publishedSnapshot?.version).toBe(1);

			// Resuming a published automation reuses its snapshot (no republish),
			// so unpublished working-copy edits stay unpublished.
			await asUser.mutation(api.automations.toggleActive, { id });
			automation = await asUser.query(api.automations.get, { id });
			expect(automation?.status).toBe("active");
			expect(automation?.publishedSnapshot?.version).toBe(1);
		});

		it("publishes a draft with nodes", async () => {
			const { asUser } = await setupUser();

			const id = await asUser.mutation(api.automations.create, {
				name: "Draft toggle",
				trigger: clientTrigger,
				nodes: [actionNode("act-1")],
			});

			await asUser.mutation(api.automations.toggleActive, { id });
			const automation = await asUser.query(api.automations.get, { id });
			expect(automation?.status).toBe("active");
			expect(automation?.publishedSnapshot?.version).toBe(1);
		});

		it("resumes on the PUBLISHED schedule, ignoring an edited working-copy schedule", async () => {
			const { asUser } = await setupUser();

			const originalSchedule = {
				frequency: "daily" as const,
				timezone: "UTC",
				time: "09:00",
			};
			const workingSchedule = {
				frequency: "weekly" as const,
				timezone: "UTC",
				dayOfWeek: 3,
				time: "16:00",
			};

			const id = await asUser.mutation(api.automations.create, {
				name: "Resume trigger check",
				trigger: { type: "scheduled", schedule: originalSchedule },
				nodes: [notifyNode("notify-1")],
				isActive: true,
			});

			// Pause, then edit the working copy's schedule (no republish).
			await asUser.mutation(api.automations.toggleActive, { id });
			await asUser.mutation(api.automations.update, {
				id,
				trigger: { type: "scheduled", schedule: workingSchedule },
			});

			// Resume: must reuse the published snapshot/schedule, not the edit.
			await asUser.mutation(api.automations.toggleActive, { id });

			const automation = await asUser.query(api.automations.get, { id });
			expect(automation?.status).toBe("active");
			expect(automation?.publishedSnapshot?.version).toBe(1);
			expect(automation?.publishedSnapshot?.trigger).toEqual({
				type: "scheduled",
				schedule: originalSchedule,
			});

			const now = Date.now();
			const expectedFromPublished = computeNextRunAt(originalSchedule, now);
			const expectedFromWorking = computeNextRunAt(workingSchedule, now);
			expect(automation!.nextRunAt).toBe(expectedFromPublished);
			expect(automation!.nextRunAt).not.toBe(expectedFromWorking);
		});

		it("rejects activating a zero-node draft", async () => {
			const { asUser } = await setupUser();

			const id = await asUser.mutation(api.automations.create, {
				name: "Empty draft toggle",
				trigger: clientTrigger,
				nodes: [],
			});

			await expect(
				asUser.mutation(api.automations.toggleActive, { id })
			).rejects.toThrow(/at least one step/i);
		});
	});

	describe("org isolation", () => {
		it("hides and protects automations across organizations", async () => {
			const org1 = await setupUser({
				clerkUserId: "user_org1_test",
				clerkOrgId: "org_org1_test",
			});
			const org2 = await setupUser({
				clerkUserId: "user_org2_test",
				clerkOrgId: "org_org2_test",
			});

			const id = await org1.asUser.mutation(api.automations.create, {
				name: "Org 1 automation",
				trigger: clientTrigger,
				nodes: [actionNode("act-1")],
				isActive: true,
			});

			expect(await org2.asUser.query(api.automations.list, {})).toHaveLength(0);
			await expect(
				org2.asUser.query(api.automations.get, { id })
			).rejects.toThrow(/does not belong/i);
			await expect(
				org2.asUser.mutation(api.automations.update, { id, name: "Hijack" })
			).rejects.toThrow(/does not belong/i);
		});
	});

	describe("remove", () => {
		it("deletes the automation and its executions", async () => {
			const { asUser, orgId } = await setupUser();

			const id = await asUser.mutation(api.automations.create, {
				name: "To be deleted",
				trigger: clientTrigger,
				nodes: [actionNode("act-1")],
				isActive: true,
			});

			const executionId = await t.run(async (ctx) =>
				ctx.db.insert("workflowExecutions", {
					orgId,
					automationId: id,
					triggeredBy: "status_changed",
					triggeredAt: Date.now(),
					status: "completed",
					nodesExecuted: [],
				})
			);

			await asUser.mutation(api.automations.remove, { id });

			const [automation, execution] = await t.run(async (ctx) =>
				Promise.all([ctx.db.get(id), ctx.db.get(executionId)])
			);
			expect(automation).toBeNull();
			expect(execution).toBeNull();
		});
	});

	describe("remove — batched execution cleanup", () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it("deletes an automation with >100 execution rows fully once scheduled batches finish, leaving only the 100-row inline batch gone right after remove", async () => {
			const { asUser, orgId } = await setupUser();

			const id = await asUser.mutation(api.automations.create, {
				name: "Heavy history",
				trigger: clientTrigger,
				nodes: [actionNode("act-1")],
				isActive: true,
			});

			const TOTAL_EXECUTIONS = 120;
			await t.run(async (ctx) => {
				for (let i = 0; i < TOTAL_EXECUTIONS; i++) {
					await ctx.db.insert("workflowExecutions", {
						orgId,
						automationId: id,
						triggeredBy: "status_changed",
						triggeredAt: Date.now(),
						status: "completed",
						nodesExecuted: [],
					});
				}
			});

			await asUser.mutation(api.automations.remove, { id });

			// Inline batch deletes exactly REMOVE_EXECUTIONS_BATCH (100) rows before
			// the scheduled follow-up runs — 20 should remain right now.
			const remainingAfterInline = await t.run(async (ctx) =>
				ctx.db
					.query("workflowExecutions")
					.withIndex("by_automation", (q) => q.eq("automationId", id))
					.collect()
			);
			expect(remainingAfterInline).toHaveLength(
				TOTAL_EXECUTIONS - 100
			);

			await t.finishAllScheduledFunctions(vi.runAllTimers);

			const [automation, remainingAfterDrain] = await t.run(async (ctx) =>
				Promise.all([
					ctx.db.get(id),
					ctx.db
						.query("workflowExecutions")
						.withIndex("by_automation", (q) => q.eq("automationId", id))
						.collect(),
				])
			);
			expect(automation).toBeNull();
			expect(remainingAfterDrain).toHaveLength(0);
		});

		it("removeExecutionsBatch is a no-op guard when the automation still exists", async () => {
			const { asUser, orgId } = await setupUser();

			const id = await asUser.mutation(api.automations.create, {
				name: "Still alive",
				trigger: clientTrigger,
				nodes: [actionNode("act-1")],
				isActive: true,
			});

			await t.run(async (ctx) => {
				for (let i = 0; i < 5; i++) {
					await ctx.db.insert("workflowExecutions", {
						orgId,
						automationId: id,
						triggeredBy: "status_changed",
						triggeredAt: Date.now(),
						status: "completed",
						nodesExecuted: [],
					});
				}
			});

			await t.mutation(internal.automations.removeExecutionsBatch, {
				automationId: id,
			});

			const [automation, executions] = await t.run(async (ctx) =>
				Promise.all([
					ctx.db.get(id),
					ctx.db
						.query("workflowExecutions")
						.withIndex("by_automation", (q) => q.eq("automationId", id))
						.collect(),
				])
			);
			expect(automation).not.toBeNull();
			expect(executions).toHaveLength(5);
		});
	});

	describe("list / listActive", () => {
		it("lists all automations but only effective-active ones in listActive", async () => {
			const { asUser } = await setupUser();

			await asUser.mutation(api.automations.create, {
				name: "A draft",
				trigger: clientTrigger,
				nodes: [actionNode("act-1")],
			});
			await asUser.mutation(api.automations.create, {
				name: "B active",
				trigger: clientTrigger,
				nodes: [actionNode("act-1")],
				isActive: true,
			});
			const pausedId = await asUser.mutation(api.automations.create, {
				name: "C paused",
				trigger: clientTrigger,
				nodes: [actionNode("act-1")],
				isActive: true,
			});
			await asUser.mutation(api.automations.toggleActive, { id: pausedId });

			const all = await asUser.query(api.automations.list, {});
			expect(all.map((a) => a.name)).toEqual(["A draft", "B active", "C paused"]);

			const active = await asUser.query(api.automations.listActive, {});
			expect(active.map((a) => a.name)).toEqual(["B active"]);
		});
	});
});
