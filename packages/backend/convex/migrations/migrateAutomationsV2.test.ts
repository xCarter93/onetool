import { describe, it, expect, beforeEach } from "vitest";
import { setupConvexTest } from "../test.setup";
import { createTestOrg } from "../test.helpers";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";

type AutomationNodes = Doc<"workflowAutomations">["nodes"];
type AutomationTrigger = Doc<"workflowAutomations">["trigger"];

describe("migrateAutomationsV2", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	/** Seed a test org and return ids for direct-inserting automation rows. */
	async function seedOrg(): Promise<{
		orgId: Id<"organizations">;
		userId: Id<"users">;
	}> {
		return await t.run(async (ctx) => {
			const { orgId, userId } = await createTestOrg(ctx);
			return { orgId, userId };
		});
	}

	async function insertAutomation(
		orgId: Id<"organizations">,
		userId: Id<"users">,
		fields: {
			name?: string;
			isActive?: boolean;
			trigger: AutomationTrigger;
			nodes: AutomationNodes;
		}
	): Promise<Id<"workflowAutomations">> {
		return await t.run(async (ctx) => {
			return await ctx.db.insert("workflowAutomations", {
				orgId,
				name: fields.name ?? "Test automation",
				...(fields.isActive !== undefined
					? { isActive: fields.isActive }
					: {}),
				trigger: fields.trigger,
				nodes: fields.nodes,
				createdBy: userId,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
		});
	}

	/** Drive the migration one batch at a time until it reports done. */
	async function runMigration(): Promise<void> {
		let cursor: string | null = null;
		for (let i = 0; i < 20; i++) {
			// Annotated to break the _generated/api type cycle (TS7022).
			const result: {
				isDone: boolean;
				continueCursor: string;
				processed: number;
			} = await t.mutation(
				internal.migrations.migrateAutomationsV2.migrateAutomationsV2,
				{ cursor, dryRun: false }
			);
			if (result.isDone) {
				return;
			}
			cursor = result.continueCursor;
		}
		throw new Error("Migration did not finish within 20 batches");
	}

	async function getAutomation(
		id: Id<"workflowAutomations">
	): Promise<Doc<"workflowAutomations">> {
		const doc = await t.run((ctx) => ctx.db.get(id));
		if (!doc) throw new Error("automation not found");
		return doc;
	}

	it("migrates a legacy row: trigger, node configs, active status + snapshot", async () => {
		const { orgId, userId } = await seedOrg();
		const id = await insertAutomation(orgId, userId, {
			isActive: true,
			trigger: { objectType: "quote", fromStatus: "draft", toStatus: "sent" },
			nodes: [
				{
					id: "node-1",
					type: "condition",
					condition: { field: "total", operator: "greater_than", value: 100 },
					nextNodeId: "node-2",
				},
				{
					id: "node-2",
					type: "action",
					action: {
						targetType: "project",
						actionType: "update_status",
						newStatus: "in-progress",
					},
				},
			],
		});

		await runMigration();
		const doc = await getAutomation(id);

		expect(doc.trigger).toEqual({
			type: "status_changed",
			objectType: "quote",
			fromStatus: "draft",
			toStatus: "sent",
		});

		expect(doc.nodes[0].config).toEqual({
			kind: "condition",
			logic: "and",
			groups: [
				{
					logic: "and",
					rules: [
						{
							field: "total",
							operator: "greater_than",
							value: { kind: "static", value: 100 },
						},
					],
				},
			],
		});
		expect(doc.nodes[1].config).toEqual({
			kind: "action",
			action: {
				type: "update_field",
				target: { related: "project" },
				field: "status",
				value: { kind: "static", value: "in-progress" },
			},
		});

		// Legacy fields stay in place (schema tightening drops them later).
		expect(doc.nodes[0].condition).toBeDefined();
		expect(doc.nodes[1].action).toBeDefined();
		expect(doc.nodes[0].nextNodeId).toBe("node-2");

		// Lifecycle: isActive true => active + published snapshot v1.
		expect(doc.status).toBe("active");
		expect(doc.publishedSnapshot).toBeDefined();
		expect(doc.publishedSnapshot?.version).toBe(1);
		expect(typeof doc.publishedSnapshot?.publishedAt).toBe("number");
		expect(doc.publishedSnapshot?.trigger).toEqual(doc.trigger);
		expect(doc.publishedSnapshot?.nodes).toEqual(doc.nodes);

		// Scheduling is a later slice.
		expect(doc.nextRunAt).toBeUndefined();
	});

	it("migrates v1.2 record_updated field => fields array; inactive => draft, no snapshot", async () => {
		const { orgId, userId } = await seedOrg();
		const id = await insertAutomation(orgId, userId, {
			isActive: false,
			trigger: {
				type: "record_updated",
				objectType: "client",
				field: "status",
			},
			nodes: [],
		});

		await runMigration();
		const doc = await getAutomation(id);

		expect(doc.trigger).toEqual({
			type: "record_updated",
			objectType: "client",
			field: "status", // legacy field kept
			fields: ["status"],
		});
		expect(doc.status).toBe("draft");
		expect(doc.publishedSnapshot).toBeUndefined();
	});

	it("is idempotent: a second run changes nothing", async () => {
		const { orgId, userId } = await seedOrg();
		await insertAutomation(orgId, userId, {
			isActive: true,
			trigger: { objectType: "project", toStatus: "completed" },
			nodes: [
				{
					id: "node-1",
					type: "action",
					action: {
						targetType: "self",
						actionType: "update_status",
						newStatus: "archived",
					},
				},
			],
		});
		await insertAutomation(orgId, userId, {
			isActive: false,
			trigger: {
				type: "record_updated",
				objectType: "invoice",
				field: "total",
			},
			nodes: [{ id: "end-1", type: "end" }],
		});

		await runMigration();
		const afterFirst = await t.run((ctx) =>
			ctx.db.query("workflowAutomations").collect()
		);

		await runMigration();
		const afterSecond = await t.run((ctx) =>
			ctx.db.query("workflowAutomations").collect()
		);

		expect(afterSecond).toEqual(afterFirst);
	});

	it("converts fetch_records, loop, and end nodes", async () => {
		const { orgId, userId } = await seedOrg();
		const id = await insertAutomation(orgId, userId, {
			isActive: false,
			trigger: { type: "record_created", objectType: "client" },
			nodes: [
				{
					id: "fetch-1",
					type: "fetch_records",
					fetchConfig: {
						entityType: "task",
						filters: [
							{ field: "status", operator: "equals", value: "pending" },
							{ field: "assignee", operator: "exists", value: null },
							{ field: "priority", operator: "some_unknown_op", value: 3 },
						],
						limit: 25,
					},
					nextNodeId: "loop-1",
				},
				{
					id: "loop-1",
					type: "loop",
					loopConfig: { sourceNodeId: "fetch-1", batchSize: 10 },
					nextNodeId: "end-1",
				},
				{ id: "end-1", type: "end" },
			],
		});

		await runMigration();
		const doc = await getAutomation(id);

		expect(doc.nodes[0].config).toEqual({
			kind: "fetch_records",
			objectType: "task",
			filters: [
				{
					logic: "and",
					rules: [
						{
							field: "status",
							operator: "equals",
							value: { kind: "static", value: "pending" },
						},
						// exists => is_not_empty (valueless: no value ref)
						{ field: "assignee", operator: "is_not_empty" },
						// unknown operator strings fall back to equals
						{
							field: "priority",
							operator: "equals",
							value: { kind: "static", value: 3 },
						},
					],
				},
			],
			limit: 25,
		});

		// Loop: legacy bodies were edge-only; bodyStartNodeId stays unset.
		expect(doc.nodes[1].config).toEqual({
			kind: "loop",
			sourceNodeId: "fetch-1",
			maxIterations: 10,
		});
		expect(doc.nodes[1].bodyStartNodeId).toBeUndefined();

		expect(doc.nodes[2].config).toEqual({ kind: "end" });
	});

	it("converts all four legacy action types", async () => {
		const { orgId, userId } = await seedOrg();
		const id = await insertAutomation(orgId, userId, {
			isActive: false,
			trigger: { objectType: "task", toStatus: "completed" },
			nodes: [
				{
					id: "a-1",
					type: "action",
					action: {
						targetType: "self",
						actionType: "update_status",
						newStatus: "archived",
					},
				},
				{
					id: "a-2",
					type: "action",
					action: {
						targetType: "client",
						actionType: "update_field",
						newStatus: "unused",
						field: "leadSource",
						value: "automation",
					},
				},
				{
					id: "a-3",
					type: "action",
					action: {
						targetType: "self",
						actionType: "send_notification",
						newStatus: "unused",
						notificationRecipient: "admins",
						notificationMessage: "Task {{trigger.record.title}} completed",
					},
				},
				{
					id: "a-4",
					type: "action",
					action: {
						targetType: "self",
						actionType: "create_record",
						newStatus: "unused",
						createRecordType: "task",
						createRecordFields: { title: "Follow up with client" },
					},
				},
			],
		});

		await runMigration();
		const doc = await getAutomation(id);

		expect(doc.nodes[0].config).toEqual({
			kind: "action",
			action: {
				type: "update_field",
				target: "self",
				field: "status",
				value: { kind: "static", value: "archived" },
			},
		});
		expect(doc.nodes[1].config).toEqual({
			kind: "action",
			action: {
				type: "update_field",
				target: { related: "client" },
				field: "leadSource",
				value: { kind: "static", value: "automation" },
			},
		});
		expect(doc.nodes[2].config).toEqual({
			kind: "action",
			action: {
				type: "send_notification",
				recipient: "org_admins",
				message: "Task {{trigger.record.title}} completed",
			},
		});
		expect(doc.nodes[3].config).toEqual({
			kind: "action",
			action: {
				type: "create_task",
				title: { kind: "static", value: "Follow up with client" },
				linkToRecord: true,
			},
		});
	});

	it("leaves rows that already have v2 shape untouched", async () => {
		const { orgId, userId } = await seedOrg();
		const id = await t.run(async (ctx) => {
			return await ctx.db.insert("workflowAutomations", {
				orgId,
				name: "Already v2",
				status: "paused",
				trigger: { type: "record_created", objectType: "project" },
				nodes: [
					{
						id: "node-1",
						type: "end",
						config: { kind: "end" },
					},
				],
				createdBy: userId,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
		});

		const before = await getAutomation(id);
		await runMigration();
		const after = await getAutomation(id);

		expect(after).toEqual(before);
		expect(after.status).toBe("paused");
		expect(after.publishedSnapshot).toBeUndefined();
	});
});
