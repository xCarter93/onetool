import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { setupConvexTest } from "../test.setup";
import {
	addMemberToOrg,
	createTestOrg,
	createTestIdentity,
} from "../test.helpers";

const pauseMigration =
	internal.migrations.pausePublishedAutomationsOnFreeOrgs
		.pausePublishedAutomationsOnFreeOrgs;

/**
 * Slice A one-shot pause migration. The contract under test is the plan
 * resolution it shares with the executor: only automations whose (org, creator)
 * pair resolves free are flipped to `paused_plan`, and nothing is destroyed.
 */
describe("pausePublishedAutomationsOnFreeOrgs", () => {
	let t: ReturnType<typeof setupConvexTest>;
	let orgSeq = 0;

	beforeEach(() => {
		// Publishing schedules nothing, but the resume case drains event-driven
		// runs; freezing timers keeps that work inside the test transaction.
		vi.useFakeTimers();
		t = setupConvexTest();
		orgSeq = 0;
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	const scheduledTrigger = {
		type: "scheduled" as const,
		schedule: {
			frequency: "daily" as const,
			timezone: "UTC",
			time: "09:00",
		},
	};

	const notifyNode = {
		id: "notify-1",
		type: "action" as const,
		config: {
			kind: "action" as const,
			action: {
				type: "send_notification" as const,
				recipient: "org_admins" as const,
				message: "Nightly",
			},
		},
	};

	/**
	 * An org holding one ACTIVE published automation. It is always published
	 * while premium (publishing is Business-only), then moved onto `plan` —
	 * the only way production reaches "free org with a published automation".
	 */
	async function seedOrgWithPublishedAutomation(
		plan: Record<string, unknown> = {}
	) {
		// Frozen clock: createTestOrg's default ids are Date.now()-derived and
		// would collide between orgs in one test.
		const suffix = `${++orgSeq}`;
		const setup = await t.run(async (ctx) => {
			const created = await createTestOrg(ctx, {
				clerkUserId: `user_pause_${suffix}`,
				clerkOrgId: `org_pause_${suffix}`,
			});
			await ctx.db.patch(created.orgId, { hasPremiumFeatureAccess: true });
			return created;
		});
		const asUser = t.withIdentity(
			createTestIdentity(setup.clerkUserId, setup.clerkOrgId)
		);
		const automationId = await asUser.mutation(api.automations.create, {
			name: "Nightly",
			trigger: scheduledTrigger,
			nodes: [notifyNode],
			isActive: true,
		});
		await t.run(async (ctx) =>
			ctx.db.patch(setup.orgId, {
				hasPremiumFeatureAccess: false,
				...plan,
			})
		);
		return { ...setup, asUser, automationId };
	}

	async function getAutomation(id: Id<"workflowAutomations">) {
		return await t.run(async (ctx) => ctx.db.get(id));
	}

	it("pauses a free org's active automation and clears its dispatch pointer", async () => {
		const { automationId } = await seedOrgWithPublishedAutomation();
		expect((await getAutomation(automationId))?.nextRunAt).toBeGreaterThan(0);

		const result = await t.mutation(pauseMigration, {});

		expect(result).toMatchObject({
			scanned: 1,
			paused: 1,
			keptBusiness: 0,
			dryRun: false,
			isDone: true,
			continueCursor: null,
		});
		const automation = await getAutomation(automationId);
		expect(automation?.status).toBe("paused_plan");
		expect(automation?.nextRunAt).toBeUndefined();
		// Nothing is destroyed: the row stays resumable on its published version.
		expect(automation?.publishedSnapshot).toBeDefined();
	});

	const premiumStates: Array<[string, Record<string, unknown>]> = [
		[
			"a paid subscription",
			{
				clerkPlanSlug: "onetool_business_plan_org",
				subscriptionStatus: "active",
			},
		],
		["an org-level override", { hasPremiumFeatureAccess: true }],
		["an unlapsed trial", { trialEndsAt: Date.now() + 60_000 }],
		["the post-cancel grace window", { planGraceUntil: Date.now() + 60_000 }],
	];

	for (const [label, plan] of premiumStates) {
		it(`leaves an org on ${label} untouched`, async () => {
			const { automationId } = await seedOrgWithPublishedAutomation(plan);
			const before = await getAutomation(automationId);

			const result = await t.mutation(pauseMigration, {});

			expect(result).toMatchObject({ scanned: 1, paused: 0, keptBusiness: 1 });
			const after = await getAutomation(automationId);
			expect(after?.status).toBe("active");
			expect(after?.nextRunAt).toBe(before?.nextRunAt);
			expect(after?.updatedAt).toBe(before?.updatedAt);
		});
	}

	it("leaves an automation whose creator holds a user-level override untouched", async () => {
		const { orgId, automationId } = await seedOrgWithPublishedAutomation();
		const overrideAutomationId = await t.run(async (ctx) => {
			const member = await addMemberToOrg(ctx, orgId, {
				clerkUserId: "user_override_creator",
				userEmail: "override@example.com",
			});
			await ctx.db.patch(member.userId, { hasPremiumFeatureAccess: true });
			const template = await ctx.db.get(automationId);
			if (!template) throw new Error("seed automation missing");
			const { _id, _creationTime, ...rest } = template;
			void _id;
			void _creationTime;
			return await ctx.db.insert("workflowAutomations", {
				...rest,
				name: "Override-creator nightly",
				createdBy: member.userId,
			});
		});

		const result = await t.mutation(pauseMigration, {});

		expect(result).toMatchObject({ scanned: 2, paused: 1, keptBusiness: 1 });
		expect((await getAutomation(automationId))?.status).toBe("paused_plan");
		expect((await getAutomation(overrideAutomationId))?.status).toBe("active");
	});

	it("dryRun reports the same counts and writes nothing", async () => {
		const { automationId } = await seedOrgWithPublishedAutomation();
		const before = await getAutomation(automationId);

		const result = await t.mutation(pauseMigration, { dryRun: true });

		expect(result).toMatchObject({ scanned: 1, paused: 1, dryRun: true });
		const after = await getAutomation(automationId);
		expect(after?.status).toBe("active");
		expect(after?.nextRunAt).toBe(before?.nextRunAt);
		expect(after?.updatedAt).toBe(before?.updatedAt);
	});

	it("is idempotent: a second run finds nothing left to pause", async () => {
		const { automationId } = await seedOrgWithPublishedAutomation();
		await t.mutation(pauseMigration, {});
		const afterFirst = await getAutomation(automationId);

		const second = await t.mutation(pauseMigration, {});

		// `paused_plan` rows are outside the "active" index range entirely.
		expect(second).toMatchObject({ scanned: 0, paused: 0, keptBusiness: 0 });
		const afterSecond = await getAutomation(automationId);
		expect(afterSecond?.status).toBe("paused_plan");
		expect(afterSecond?.updatedAt).toBe(afterFirst?.updatedAt);
	});

	it("never touches drafts or manual pauses", async () => {
		const { asUser, orgId, automationId } = await seedOrgWithPublishedAutomation();
		const [draftId, pausedId] = await t.run(async (ctx) => {
			const template = await ctx.db.get(automationId);
			if (!template) throw new Error("seed automation missing");
			const { _id, _creationTime, ...rest } = template;
			void _id;
			void _creationTime;
			const draft = await ctx.db.insert("workflowAutomations", {
				...rest,
				name: "Draft",
				status: "draft" as const,
				publishedSnapshot: undefined,
				nextRunAt: undefined,
			});
			const paused = await ctx.db.insert("workflowAutomations", {
				...rest,
				name: "Manually paused",
				status: "paused" as const,
				nextRunAt: undefined,
			});
			return [draft, paused] as const;
		});
		void asUser;
		void orgId;

		const result = await t.mutation(pauseMigration, {});

		expect(result).toMatchObject({ scanned: 1, paused: 1 });
		expect((await getAutomation(draftId))?.status).toBe("draft");
		expect((await getAutomation(pausedId))?.status).toBe("paused");
	});

	it("a cursor-driven re-run over the same page is still a no-op", async () => {
		// The migration pages 200 rows per call and returns continueCursor only
		// while more remain; a fixture that large costs more than it proves, so
		// the contract pinned here is the single-page terminal shape.
		const { automationId } = await seedOrgWithPublishedAutomation();
		const first = await t.mutation(pauseMigration, {});
		expect(first.isDone).toBe(true);
		expect(first.continueCursor).toBeNull();

		const rerun = await t.mutation(pauseMigration, {});
		expect(rerun.isDone).toBe(true);
		expect((await getAutomation(automationId))?.status).toBe("paused_plan");
	});

	it("resume path: after upgrading, toggleActive puts a paused_plan automation back to work", async () => {
		const suffix = "resume";
		const setup = await t.run(async (ctx) => {
			const created = await createTestOrg(ctx, {
				clerkUserId: `user_${suffix}`,
				clerkOrgId: `org_${suffix}`,
			});
			await ctx.db.patch(created.orgId, { hasPremiumFeatureAccess: true });
			return created;
		});
		const asUser = t.withIdentity(
			createTestIdentity(setup.clerkUserId, setup.clerkOrgId)
		);
		const automationId = await asUser.mutation(api.automations.create, {
			name: "Welcome note",
			trigger: { type: "record_created", objectType: "client" },
			nodes: [
				{
					id: "act-1",
					type: "action" as const,
					config: {
						kind: "action" as const,
						action: {
							type: "update_field" as const,
							target: "self" as const,
							field: "notes",
							value: { kind: "static" as const, value: "Welcomed!" },
						},
					},
				},
			],
			isActive: true,
		});

		await t.run(async (ctx) =>
			ctx.db.patch(setup.orgId, { hasPremiumFeatureAccess: false })
		);
		await t.mutation(pauseMigration, {});
		expect((await getAutomation(automationId))?.status).toBe("paused_plan");

		// Upgrading alone doesn't resume — reactivation is an explicit user act.
		await t.run(async (ctx) =>
			ctx.db.patch(setup.orgId, {
				clerkPlanSlug: "onetool_business_plan_org",
				subscriptionStatus: "active",
			})
		);
		await asUser.mutation(api.automations.toggleActive, { id: automationId });
		expect((await getAutomation(automationId))?.status).toBe("active");

		const clientId = await asUser.mutation(api.clients.create, {
			portalAccessId: crypto.randomUUID(),
			companyName: "Post-upgrade Co",
			status: "lead",
		});
		for (let i = 0; i < 10; i++) {
			await t.mutation(internal.eventBus.processEvents, {});
			await t.finishAllScheduledFunctions(vi.runAllTimers);
			const pending = await t.run(async (ctx) =>
				ctx.db
					.query("domainEvents")
					.withIndex("by_status", (q) => q.eq("status", "pending"))
					.first()
			);
			if (!pending) break;
		}

		expect((await t.run(async (ctx) => ctx.db.get(clientId)))?.notes).toBe(
			"Welcomed!"
		);
		const executions = await t.run(async (ctx) =>
			ctx.db.query("workflowExecutions").collect()
		);
		expect(executions).toHaveLength(1);
		expect(executions[0].status).toBe("completed");
	});
});
