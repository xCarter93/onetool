import { describe, it, expect, beforeEach } from "vitest";
import { setupConvexTest } from "./test.setup";
import { createTestOrg, createTestIdentity } from "./test.helpers";
import { api } from "./_generated/api";

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
			expect(automation?.isActive).toBe(false);
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
			expect(automation?.isActive).toBe(true);
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

	describe("update", () => {
		it("republishes when nodes change while active", async () => {
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
			expect(automation?.status).toBe("active");
			expect(automation?.publishedSnapshot?.version).toBe(2);
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

		it("pauses a published automation on isActive:false, keeping the snapshot", async () => {
			const { asUser } = await setupUser();

			const id = await asUser.mutation(api.automations.create, {
				name: "To pause",
				trigger: clientTrigger,
				nodes: [actionNode("act-1")],
				isActive: true,
			});

			await asUser.mutation(api.automations.update, { id, isActive: false });

			const automation = await asUser.query(api.automations.get, { id });
			expect(automation?.status).toBe("paused");
			expect(automation?.isActive).toBe(false);
			expect(automation?.publishedSnapshot?.version).toBe(1);
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
		it("cycles active -> paused -> active, incrementing the snapshot version", async () => {
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

			await asUser.mutation(api.automations.toggleActive, { id });
			automation = await asUser.query(api.automations.get, { id });
			expect(automation?.status).toBe("active");
			expect(automation?.publishedSnapshot?.version).toBe(2);
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
