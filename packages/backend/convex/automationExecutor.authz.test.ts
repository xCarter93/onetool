import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import {
	addMemberToOrg,
	createTestClient,
	createTestIdentity,
	createTestOrg,
} from "./test.helpers";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

/**
 * SEC-9: `startTestRun` / `startManualRun` accept a caller-chosen entityId and
 * gated only on `automations:modify`. `getObject` compares orgId and nothing
 * else, so that one grant conferred org-wide read of every record type — and,
 * because `executeAutomation` runs as a systemMutation with no user identity,
 * write as well.
 *
 * These tests MUST run as a member with an explicit grant: the rest of the
 * automation suite runs as the `createTestOrg` admin, who resolves to "all"
 * grants and is immune to the entire model, so it passes either way.
 */
describe("automation run entry points — per-object authorization", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	// startTestRun schedules executeAutomation, and a test run then steps through
	// its nodes on a TEST_STEP_INTERVAL_MS timer. Anything still queued when
	// `beforeEach` swaps the convex-test instance fires against the OLD db inside
	// the NEW instance's transaction and throws "Write outside of transaction" —
	// an unhandled rejection that fails the whole vitest run with every test green.
	// Cancel the queue rather than wait it out (waiting costs the step interval per
	// test), then let anything already mid-flight land.
	afterEach(async () => {
		for (let i = 0; i < 3; i++) {
			await t.run(async (ctx) => {
				const jobs = await ctx.db.system.query("_scheduled_functions").collect();
				for (const job of jobs) {
					if (job.state.kind === "pending") {
						await ctx.scheduler.cancel(job._id);
					}
				}
			});
			await t.finishInProgressScheduledFunctions();
		}
	});

	function forbidden(caught: unknown): Record<string, unknown> {
		let data: unknown = (caught as ConvexError<string>).data;
		while (typeof data === "string") data = JSON.parse(data);
		return (data ?? {}) as Record<string, unknown>;
	}

	/** Run `fn`, returning the thrown error (or null if it resolved). */
	async function attempt(fn: () => Promise<unknown>): Promise<unknown> {
		return await fn().then(
			() => null,
			(error: unknown) => error
		);
	}

	async function grant(
		orgId: Id<"organizations">,
		userId: Id<"users">,
		permissions: Record<
			string,
			{ level: "none" | "view" | "modify" | "delete"; allRecords?: boolean }
		>
	) {
		await t.run(async (ctx: { db: MutationCtx["db"] }) => {
			const membership = await ctx.db
				.query("organizationMemberships")
				.withIndex("by_org_user", (q) =>
					q.eq("orgId", orgId).eq("userId", userId)
				)
				.unique();
			if (!membership) throw new Error("membership not found");
			await ctx.db.patch(membership._id, { permissions });
		});
	}

	async function seed() {
		return await t.run(seedFixture);
	}

	async function seedFixture(ctx: {
		db: MutationCtx["db"];
	}): Promise<{
		org: Awaited<ReturnType<typeof createTestOrg>>;
		member: Awaited<ReturnType<typeof addMemberToOrg>>;
		clientId: Id<"clients">;
		automationId: Id<"workflowAutomations">;
	}> {
		const org = await createTestOrg(ctx, {
			clerkUserId: "user_owner",
			clerkOrgId: "org_authz",
		});
		const member = await addMemberToOrg(ctx, org.orgId, {
			clerkUserId: "user_member",
			userName: "Automation Editor",
			userEmail: "editor@example.com",
		});
		const clientId = await createTestClient(ctx, org.orgId, {
			companyName: "Confidential Client",
		});

		const trigger = {
			type: "status_changed" as const,
			objectType: "client" as const,
			toStatus: "active",
		};
		const nodes: [] = [];
		const now = Date.now();
		const automationId = await ctx.db.insert("workflowAutomations", {
			orgId: org.orgId,
			name: "Client automation",
			status: "active" as const,
			trigger,
			nodes,
			publishedSnapshot: { trigger, nodes, version: 1, publishedAt: now },
			createdBy: org.userId,
			createdAt: now,
			updatedAt: now,
		});

		return { org, member, clientId, automationId };
	}

	it("startTestRun refuses a record type the caller has no grant on", async () => {
		const { org, member, clientId, automationId } = await seed();
		// The escalation precondition: "may edit automations", nothing else.
		await grant(org.orgId, member.userId, {
			automations: { level: "modify" },
		});

		const asMember = t.withIdentity(
			createTestIdentity(member.clerkUserId, org.clerkOrgId)
		);

		const caught = await asMember
			.mutation(api.automationExecutor.startTestRun, {
				automationId,
				record: { entityType: "client", entityId: clientId },
			})
			.then(
				() => null,
				(error: unknown) => error
			);

		expect(caught).not.toBeNull();
		expect(forbidden(caught).code).toBe("FORBIDDEN");
	});

	it("startManualRun refuses a record type the caller has no grant on", async () => {
		const { org, member, clientId, automationId } = await seed();
		await grant(org.orgId, member.userId, {
			automations: { level: "modify" },
		});

		const asMember = t.withIdentity(
			createTestIdentity(member.clerkUserId, org.clerkOrgId)
		);

		const caught = await asMember
			.mutation(api.automationExecutor.startManualRun, {
				automationId,
				record: { entityType: "client", entityId: clientId },
			})
			.then(
				() => null,
				(error: unknown) => error
			);

		expect(caught).not.toBeNull();
		expect(forbidden(caught).code).toBe("FORBIDDEN");
	});

	it("startManualRun refuses a record for a scheduled automation", async () => {
		// A scheduled trigger has no record type, so an update_field target:"self"
		// node adds nothing to requireDefinitionObjectAccess's write set — the
		// definition gate passes on automations:modify alone. startTestRun rejects a
		// record for scheduled triggers; startManualRun must too, or clients:view
		// (allRecords) + this automation writes any client's status.
		const { org, member } = await seed();
		await grant(org.orgId, member.userId, {
			automations: { level: "modify" },
			clients: { level: "view", allRecords: true },
		});

		const schedule = {
			frequency: "daily" as const,
			timezone: "UTC",
			time: "09:00",
		};
		const trigger = { type: "scheduled" as const, schedule };
		const nodes = [
			{
				id: "act-1",
				type: "action" as const,
				config: {
					kind: "action" as const,
					action: {
						type: "update_field" as const,
						target: "self" as const,
						field: "status",
						value: { kind: "static" as const, value: "completed" },
					},
				},
			},
		];
		const { automationId, clientId } = await t.run(async (ctx) => {
			const now = Date.now();
			const victimClientId = await createTestClient(ctx, org.orgId, {
				companyName: "Victim Client",
			});
			const id = await ctx.db.insert("workflowAutomations", {
				orgId: org.orgId,
				name: "Scheduled self-write",
				status: "active" as const,
				trigger,
				nodes,
				publishedSnapshot: { trigger, nodes, version: 1, publishedAt: now },
				createdBy: org.userId,
				createdAt: now,
				updatedAt: now,
			});
			return { automationId: id, clientId: victimClientId };
		});

		const asMember = t.withIdentity(
			createTestIdentity(member.clerkUserId, org.clerkOrgId)
		);

		await expect(
			asMember.mutation(api.automationExecutor.startManualRun, {
				automationId,
				record: { entityType: "client", entityId: clientId },
			})
		).rejects.toThrow(/without a triggering record/);
	});

	it("startTestRun refuses a record outside the caller's record scope", async () => {
		const { org, member, clientId, automationId } = await seed();
		// clients:view, but scoped — and the member is assigned to no project of
		// this client, so the record itself is out of reach.
		await grant(org.orgId, member.userId, {
			automations: { level: "modify" },
			clients: { level: "view" },
		});

		const asMember = t.withIdentity(
			createTestIdentity(member.clerkUserId, org.clerkOrgId)
		);

		const caught = await asMember
			.mutation(api.automationExecutor.startTestRun, {
				automationId,
				record: { entityType: "client", entityId: clientId },
			})
			.then(
				() => null,
				(error: unknown) => error
			);

		expect(caught).not.toBeNull();
		expect(forbidden(caught).code).toBe("FORBIDDEN");
	});

	// SEC-9 disclosure leg: the condition-node snapshot embedded the raw
	// document, which is persisted on workflowExecutions and served by
	// getExecution behind `automations:view` alone. clients.portalAccessId is
	// the portal URL secret and has no field-registry entry at all.
	it("does not persist unregistered fields in the run snapshot", async () => {
		const { org, clientId, automationId } = await t.run(async (ctx) => {
			const seeded = await seedFixture(ctx);
			await ctx.db.patch(seeded.clientId, {
				portalAccessId: "11111111-2222-3333-4444-555555555555",
			});
			// One condition node so the raw-record embed path actually runs.
			const trigger = {
				type: "status_changed" as const,
				objectType: "client" as const,
				toStatus: "active",
			};
			const nodes = [
				{
					id: "n1",
					type: "condition" as const,
					config: {
						kind: "condition" as const,
						logic: "and" as const,
						groups: [
							{
								logic: "and" as const,
								rules: [
									{
										field: "status",
										operator: "equals" as const,
										value: { kind: "static" as const, value: "active" },
									},
								],
							},
						],
					},
					position: { x: 0, y: 0 },
				},
			];
			await ctx.db.patch(seeded.automationId, { trigger, nodes });
			return seeded;
		});

		const asOwner = t.withIdentity(
			createTestIdentity(org.clerkUserId, org.clerkOrgId)
		);
		const executionId = await asOwner.mutation(
			api.automationExecutor.startTestRun,
			{ automationId, record: { entityType: "client", entityId: clientId } }
		);

		const execution = await t.run(async (ctx) => await ctx.db.get(executionId));
		const serialized = JSON.stringify(execution);
		expect(serialized).not.toContain("portalAccessId");
		expect(serialized).not.toContain("11111111-2222-3333-4444-555555555555");
	});

	// SEC-9 read leg the entry gates do NOT cover: a fetch_records node walks
	// by_org for an arbitrary object type, so authoring one must be gated on that
	// type — otherwise automations:modify is still an org-wide read primitive.
	describe("definition authoring gate", () => {
		const trigger = {
			type: "status_changed" as const,
			objectType: "client" as const,
			toStatus: "active",
		};
		const fetchInvoicesNode = {
			id: "fetch-1",
			type: "fetch_records" as const,
			config: {
				kind: "fetch_records" as const,
				objectType: "invoice" as const,
				filters: [],
			},
		};

		it("refuses a definition that fetches a record type the caller cannot view", async () => {
			const { org, member } = await seed();
			await grant(org.orgId, member.userId, {
				automations: { level: "modify" },
				clients: { level: "view", allRecords: true },
			});

			const asMember = t.withIdentity(
				createTestIdentity(member.clerkUserId, org.clerkOrgId)
			);

			const caught = await asMember
				.mutation(api.automations.create, {
					name: "Exfiltrate invoices",
					trigger,
					nodes: [fetchInvoicesNode],
				})
				.then(
					() => null,
					(error: unknown) => error
				);

			expect(caught).not.toBeNull();
			expect(forbidden(caught).code).toBe("FORBIDDEN");
		});

		// A formula is a second route to a relation, and the live executor hydrates
		// formula relation refs at run time. If the gate scans nodes but not
		// formulas it is asymmetric: the same payload written inline in a message
		// is caught, routed through `{{formula.f1}}` it is not.
		it("refuses a definition whose formula reaches an ungranted relation", async () => {
			const { org, member } = await seed();
			await grant(org.orgId, member.userId, {
				automations: { level: "modify" },
				tasks: { level: "modify", allRecords: true },
			});

			const asMember = t.withIdentity(
				createTestIdentity(member.clerkUserId, org.clerkOrgId)
			);

			const caught = await attempt(() =>
				asMember.mutation(api.automations.create, {
					name: "Exfiltrate via formula indirection",
					trigger: {
						type: "status_changed" as const,
						objectType: "task" as const,
						toStatus: "completed",
					},
					nodes: [],
					formulas: [
						{
							id: "f1",
							name: "Leaked",
							returnType: "text" as const,
							expression: "{trigger.record.client.portalAccessId}",
						},
					],
				})
			);

			expect(forbidden(caught)).toMatchObject({
				code: "FORBIDDEN",
				object: "clients",
			});
		});

		it("allows it once the caller can view that record type", async () => {
			const { org, member } = await seed();
			await grant(org.orgId, member.userId, {
				automations: { level: "modify" },
				clients: { level: "view", allRecords: true },
				invoices: { level: "view", allRecords: true },
			});

			const asMember = t.withIdentity(
				createTestIdentity(member.clerkUserId, org.clerkOrgId)
			);

			const automationId = await asMember.mutation(api.automations.create, {
				name: "Legitimate invoice report",
				trigger,
				nodes: [fetchInvoicesNode],
			});
			expect(automationId).toBeTruthy();
		});
	});

	// The gate must require allRecords, not merely a level. An automation is
	// org-wide by construction — findMatchingAutomations fires it for every
	// matching record in the org and fetch_records walks by_org with no record
	// filter — so an assigned-only grant must not be enough to author one.
	// This matters most for projects/tasks, which DEFAULT_MEMBER_PERMISSIONS
	// already grants at `modify` (assigned-only) to every member.
	it("refuses a definition writing a type the caller only holds assigned-only", async () => {
		const { org, member } = await seed();
		await grant(org.orgId, member.userId, {
			automations: { level: "modify" },
			// Exactly the default member grant: modify, but not allRecords.
			projects: { level: "modify" },
		});

		const asMember = t.withIdentity(
			createTestIdentity(member.clerkUserId, org.clerkOrgId)
		);

		const caught = await attempt(() =>
			asMember.mutation(api.automations.create, {
				name: "Rewrite every project in the org",
				trigger: {
					type: "status_changed" as const,
					objectType: "project" as const,
					toStatus: "in-progress",
				},
				nodes: [
					{
						id: "act-1",
						type: "action" as const,
						config: {
							kind: "action" as const,
							action: {
								type: "update_field" as const,
								target: "self" as const,
								field: "status",
								value: { kind: "static" as const, value: "completed" },
							},
						},
					},
				],
			})
		);

		expect(forbidden(caught)).toMatchObject({
			code: "FORBIDDEN",
			object: "projects",
			scope: true,
		});
	});

	// ENTITY_PERMISSION_OBJECT is keyed by activity entity type and has no entry
	// for the two fetch-only line-item types, so a naive `if (permObj)` guard
	// skips them — leaving fetch+aggregate over invoice_line_item as an ungated
	// read of org-wide revenue.
	it("refuses a definition fetching a line-item type without the parent grant", async () => {
		const { org, member } = await seed();
		await grant(org.orgId, member.userId, {
			automations: { level: "modify" },
			clients: { level: "view", allRecords: true },
		});

		const asMember = t.withIdentity(
			createTestIdentity(member.clerkUserId, org.clerkOrgId)
		);

		const caught = await attempt(() =>
			asMember.mutation(api.automations.create, {
				name: "Sum every invoice line item",
				trigger: {
					type: "status_changed" as const,
					objectType: "client" as const,
					toStatus: "active",
				},
				nodes: [
					{
						id: "fetch-1",
						type: "fetch_records" as const,
						config: {
							kind: "fetch_records" as const,
							objectType: "invoice_line_item" as const,
							filters: [],
						},
					},
				],
			})
		);

		expect(forbidden(caught)).toMatchObject({
			code: "FORBIDDEN",
			object: "invoices",
		});
	});

	// The authoring gate does not protect definitions saved before it existed,
	// or authored by an admin. Running one must re-check it.
	it("startTestRun re-checks the definition, not just the chosen record", async () => {
		const { org, member, clientId, automationId } = await seed();

		// An admin authors an invoice-fetching automation (allowed for them).
		await t.run(async (ctx) => {
			await ctx.db.patch(automationId, {
				nodes: [
					{
						id: "fetch-1",
						type: "fetch_records" as const,
						config: {
							kind: "fetch_records" as const,
							objectType: "invoice" as const,
							filters: [],
						},
					},
				],
			});
		});

		await grant(org.orgId, member.userId, {
			automations: { level: "modify" },
			clients: { level: "view", allRecords: true },
		});

		const asMember = t.withIdentity(
			createTestIdentity(member.clerkUserId, org.clerkOrgId)
		);

		const caught = await attempt(() =>
			asMember.mutation(api.automationExecutor.startTestRun, {
				automationId,
				record: { entityType: "client", entityId: clientId },
			})
		);

		expect(forbidden(caught)).toMatchObject({
			code: "FORBIDDEN",
			object: "invoices",
		});
	});

	// SEC-9 disclosure leg. Run rows carry per-node input/output snapshots
	// interpolated from the records the automation touched, so every surface
	// that serves them needs the definition's object grants — not
	// `automations:view` alone. There are three such surfaces.
	describe("run-detail read gate", () => {
		async function seedInvoiceRunAndViewer() {
			const { org, member, clientId, automationId } = await seed();

			// Admin authors an invoice-touching automation and runs it.
			await t.run(async (ctx) => {
				await ctx.db.patch(automationId, {
					nodes: [
						{
							id: "fetch-1",
							type: "fetch_records" as const,
							config: {
								kind: "fetch_records" as const,
								objectType: "invoice" as const,
								filters: [],
							},
						},
					],
				});
			});

			const asOwner = t.withIdentity(
				createTestIdentity(org.clerkUserId, org.clerkOrgId)
			);
			const executionId = await asOwner.mutation(
				api.automationExecutor.startTestRun,
				{ automationId, record: { entityType: "client", entityId: clientId } }
			);

			// The viewer may see automations, but holds no invoices grant.
			await grant(org.orgId, member.userId, {
				automations: { level: "view" },
				clients: { level: "view", allRecords: true },
			});
			const asViewer = t.withIdentity(
				createTestIdentity(member.clerkUserId, org.clerkOrgId)
			);
			return { asViewer, executionId, automationId };
		}

		it("getExecution refuses a run whose definition the caller lacks grants on", async () => {
			const { asViewer, executionId } = await seedInvoiceRunAndViewer();

			const caught = await attempt(() =>
				asViewer.query(api.automationExecutor.getExecution, { executionId })
			);
			expect(forbidden(caught)).toMatchObject({
				code: "FORBIDDEN",
				object: "invoices",
			});
		});

		it("getExecutions refuses the same rows", async () => {
			const { asViewer, automationId } = await seedInvoiceRunAndViewer();

			const caught = await attempt(() =>
				asViewer.query(api.automations.getExecutions, { automationId })
			);
			expect(forbidden(caught)).toMatchObject({
				code: "FORBIDDEN",
				object: "invoices",
			});
		});

		it("listRuns keeps the row but strips its per-node snapshots", async () => {
			const { asViewer, executionId } = await seedInvoiceRunAndViewer();

			// A test run inserts `nodesExecuted: []` and reveals entries via
			// scheduled steps convex-test does not run, so asserting only on
			// nodesExecuted would pass against the unfixed code. Seed a revealed
			// entry and an error, then assert every carrier is stripped.
			await t.run(async (ctx) => {
				await ctx.db.patch(executionId, {
					nodesExecuted: [
						{
							nodeId: "fetch-1",
							result: "success" as const,
							startedAt: Date.now(),
							output: { secret: "INV-4021 total 9500" },
						},
					],
					error: 'Invalid status "CONFIDENTIAL"',
				});
			});

			const result = await asViewer.query(api.automations.listRuns, {
				paginationOpts: { numItems: 10, cursor: null },
			});

			// The row stays visible — status and timing are fine under
			// automations:view — but everything record-derived is gone.
			expect(result.page.length).toBeGreaterThan(0);
			const serialized = JSON.stringify(result.page);
			expect(serialized).not.toContain("INV-4021");
			expect(serialized).not.toContain("CONFIDENTIAL");
			for (const row of result.page) {
				expect(row.nodesExecuted).toEqual([]);
				expect(row.testCursor).toBeUndefined();
				expect(row.triggerRecord?.label).toBeUndefined();
			}
		});

		it("getExecution fails closed when the automation row is gone", async () => {
			const { asViewer, executionId, automationId } = await seedInvoiceRunAndViewer();
			// `remove` deletes executions in scheduled batches, so rows outlive
			// their automation across that window.
			await t.run(async (ctx) => {
				await ctx.db.delete(automationId);
			});

			expect(
				await asViewer.query(api.automationExecutor.getExecution, {
					executionId,
				})
			).toBeNull();
		});
	});

	it("startTestRun allows a record the caller can actually see", async () => {
		const { org, member, clientId, automationId } = await seed();
		await grant(org.orgId, member.userId, {
			automations: { level: "modify" },
			clients: { level: "view", allRecords: true },
		});

		const asMember = t.withIdentity(
			createTestIdentity(member.clerkUserId, org.clerkOrgId)
		);

		const executionId = await asMember.mutation(
			api.automationExecutor.startTestRun,
			{ automationId, record: { entityType: "client", entityId: clientId } }
		);
		expect(executionId).toBeTruthy();
	});
});
