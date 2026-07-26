// Must be set before email/durableResend.ts loads — its client captures the
// key at construction and sendEmail throws "API key is not set" on "".
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY ?? "re_test_dummy_key";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setupConvexTest } from "./test.setup";
import {
	createTestOrg,
	createTestIdentity,
	createTestClientContact,
} from "./test.helpers";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

/**
 * Coverage for the D1 send_email automation action
 * (lib/workflowTypes.ts sendEmailActionValidator, lib/automationExec/actions.ts
 * executeSendEmailAction, lib/automationExec/dryRun.ts, automations.ts save
 * validation).
 *
 * The durable @convex-dev/resend component is registered in test.setup.ts;
 * its internal delivery loop doesn't run under convex-test, but sendEmail
 * enqueues into component tables and returns an id — enough to exercise the
 * full app contract (emailMessages rows, threads, idempotency keys).
 */

function sendEmailNode(
	id: string,
	recipient:
		| { kind: "primary_contact" }
		| { kind: "custom"; addresses: string[] },
	subject: string,
	body: string,
	opts: { nextNodeId?: string } = {}
) {
	return {
		id,
		type: "action" as const,
		config: {
			kind: "action" as const,
			action: {
				type: "send_email" as const,
				recipient,
				subject,
				body,
			},
		},
		nextNodeId: opts.nextNodeId,
	};
}

const clientCreatedTrigger = {
	type: "record_created" as const,
	objectType: "client" as const,
};

describe("send_email automation action (D1)", () => {
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

	/** Marks the org as premium via the paid-plan pair (same fields the scheduled-dispatch premium gate tests use). */
	async function makeOrgPremium(orgId: Id<"organizations">) {
		await t.run(async (ctx) =>
			ctx.db.patch(orgId, {
				clerkPlanSlug: "onetool_business_plan_org",
				subscriptionStatus: "active",
			})
		);
	}

	/** Drains the domainEvents queue and every scheduled function it fans out to. */
	async function drainEvents() {
		for (let i = 0; i < 10; i++) {
			await t.mutation(internal.eventBus.processEvents, {});
			await t.finishAllScheduledFunctions(vi.runAllTimers);
			const pending = await t.run(async (ctx) => {
				return await ctx.db
					.query("domainEvents")
					.withIndex("by_status", (q) => q.eq("status", "pending"))
					.first();
			});
			if (!pending) break;
		}
	}

	async function drainScheduled() {
		await t.finishAllScheduledFunctions(vi.runAllTimers);
	}

	async function getExecutions() {
		return t.run(async (ctx) => ctx.db.query("workflowExecutions").collect());
	}

	async function getEmailMessages() {
		return t.run(async (ctx) => ctx.db.query("emailMessages").collect());
	}

	async function getEmailThreads() {
		return t.run(async (ctx) => ctx.db.query("emailThreads").collect());
	}

	// -------------------------------------------------------------------
	// Delivery guards — none of these reach the resend component, so they
	// are fully testable under this harness.
	// -------------------------------------------------------------------

	describe("delivery guards", () => {
		it("communicationPreference 'phone' skips the send with zero rows written", async () => {
			const { asUser, orgId } = await setupUser();
			await makeOrgPremium(orgId);

			await asUser.mutation(api.automations.create, {
				name: "Email on new client",
				trigger: clientCreatedTrigger,
				nodes: [
					sendEmailNode(
						"email-1",
						{ kind: "primary_contact" },
						"Hello",
						"Body"
					),
				],
				isActive: true,
			});

			const clientId = await asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "Acme Co",
				status: "lead",
				communicationPreference: "phone",
			});
			await t.run(async (ctx) =>
				createTestClientContact(ctx, orgId, clientId, {
					isPrimary: true,
					email: "primary@example.com",
				})
			);

			await drainEvents();

			const executions = await getExecutions();
			expect(executions).toHaveLength(1);
			const entry = executions[0].nodesExecuted.find(
				(n) => n.nodeId === "email-1"
			);
			expect(entry?.result).toBe("skipped");
			expect(entry?.error).toMatch(/communication preference is phone/i);
			expect(await getEmailMessages()).toHaveLength(0);
		});

		it("no primary-contact email skips the send with zero rows written", async () => {
			const { asUser, orgId } = await setupUser();
			await makeOrgPremium(orgId);

			await asUser.mutation(api.automations.create, {
				name: "Email on new client",
				trigger: clientCreatedTrigger,
				nodes: [
					sendEmailNode(
						"email-1",
						{ kind: "primary_contact" },
						"Hello",
						"Body"
					),
				],
				isActive: true,
			});

			const clientId = await asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "Acme Co",
				status: "lead",
			});
			// Primary contact row exists but has no email address.
			await t.run(async (ctx) =>
				createTestClientContact(ctx, orgId, clientId, {
					isPrimary: true,
					email: "",
				})
			);

			await drainEvents();

			const executions = await getExecutions();
			const entry = executions[0].nodesExecuted.find(
				(n) => n.nodeId === "email-1"
			);
			expect(entry?.result).toBe("skipped");
			expect(entry?.error).toMatch(/no email address/i);
			expect(await getEmailMessages()).toHaveLength(0);
		});

		it("a non-premium org skips the send, citing the plan requirement", async () => {
			const { asUser, orgId } = await setupUser();
			// No premium fields set on the org, no override on the creator user.

			await asUser.mutation(api.automations.create, {
				name: "Email on new client",
				trigger: clientCreatedTrigger,
				nodes: [
					sendEmailNode(
						"email-1",
						{ kind: "primary_contact" },
						"Hello",
						"Body"
					),
				],
				isActive: true,
			});

			const clientId = await asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "Acme Co",
				status: "lead",
			});
			await t.run(async (ctx) =>
				createTestClientContact(ctx, orgId, clientId, {
					isPrimary: true,
					email: "primary@example.com",
				})
			);

			await drainEvents();

			const executions = await getExecutions();
			const entry = executions[0].nodesExecuted.find(
				(n) => n.nodeId === "email-1"
			);
			expect(entry?.result).toBe("skipped");
			expect(entry?.error).toMatch(/premium/i);
			expect(await getEmailMessages()).toHaveLength(0);
		});
	});

	// -------------------------------------------------------------------
	// Suppression resolution — filtering happens before any send attempt,
	// so it's independently verifiable via the node's `output`.
	// -------------------------------------------------------------------

	describe("delivery", () => {
		it("primary_contact happy path: interpolated send with thread + idempotency key", async () => {
			const { asUser, orgId } = await setupUser();
			await makeOrgPremium(orgId);

			await asUser.mutation(api.automations.create, {
				name: "Welcome email",
				trigger: clientCreatedTrigger,
				nodes: [
					sendEmailNode(
						"email-1",
						{ kind: "primary_contact" },
						"Welcome {{trigger.record.companyName}}",
						"Hi from the team, {{trigger.record.companyName}}!"
					),
				],
				isActive: true,
			});

			const clientId = await asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "Acme Co",
				status: "lead",
			});
			await t.run(async (ctx) =>
				createTestClientContact(ctx, orgId, clientId, {
					isPrimary: true,
					email: "primary@example.com",
				})
			);

			await drainEvents();

			const executions = await getExecutions();
			expect(executions).toHaveLength(1);
			expect(executions[0].status).toBe("completed");
			const entry = executions[0].nodesExecuted.find(
				(n) => n.nodeId === "email-1"
			);
			expect(entry?.result).toBe("success");
			expect(
				(entry?.output as { emailsSent?: number } | undefined)?.emailsSent
			).toBe(1);

			const messages = await getEmailMessages();
			expect(messages).toHaveLength(1);
			const message = messages[0];
			expect(message.toEmail).toBe("primary@example.com");
			expect(message.subject).toBe("Welcome Acme Co");
			expect(message.messageBody).toBe("Hi from the team, Acme Co!");
			expect(message.direction).toBe("outbound");
			expect(message.status).toBe("sent");
			expect(message.clientId).toBe(clientId);
			expect(message.resendEmailId).toBeTruthy();
			expect(message.idempotencyKey).toMatch(/^automation-.+-email-1-r0$/);
			expect(message.threadDocId).toBeDefined();

			const threads = await getEmailThreads();
			expect(threads).toHaveLength(1);
			expect(threads[0].clientId).toBe(clientId);
			expect(threads[0].messageCount).toBe(1);
		});
	});

	describe("suppression resolution", () => {
		async function suppress(orgId: Id<"organizations">, email: string) {
			await t.run(async (ctx) =>
				ctx.db.insert("emailSuppressions", {
					orgId,
					email: email.toLowerCase(),
					reason: "manual",
					source: "test",
					createdAt: Date.now(),
				})
			);
		}

		it("custom addresses: filters out a suppressed address before the send attempt", async () => {
			const { asUser, orgId } = await setupUser();
			await makeOrgPremium(orgId);
			await suppress(orgId, "blocked@example.com");

			await asUser.mutation(api.automations.create, {
				name: "Email custom addresses",
				trigger: clientCreatedTrigger,
				nodes: [
					sendEmailNode(
						"email-1",
						{
							kind: "custom",
							addresses: ["blocked@example.com", "clean@example.com"],
						},
						"Hello",
						"Body"
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

			const executions = await getExecutions();
			const entry = executions[0].nodesExecuted.find(
				(n) => n.nodeId === "email-1"
			);
			const output = entry?.output as
				| {
						emailsSent?: number;
						recipientsSuppressed?: string[];
						recipientsFailed?: { email: string; reason: string }[];
				  }
				| undefined;
			// Suppression filtering ran correctly: the blocked address never
			// reaches the send attempt; the clean one sends.
			expect(entry?.result).toBe("success");
			expect(output?.recipientsSuppressed).toEqual(["blocked@example.com"]);
			expect(output?.recipientsFailed).toBeUndefined();
			const messages = await getEmailMessages();
			expect(messages).toHaveLength(1);
			expect(messages[0].toEmail).toBe("clean@example.com");
			expect(messages[0].direction).toBe("outbound");
		});

		it("all recipients suppressed: skips with no thread and no message rows", async () => {
			const { asUser, orgId } = await setupUser();
			await makeOrgPremium(orgId);
			await suppress(orgId, "blocked-a@example.com");
			await suppress(orgId, "blocked-b@example.com");

			await asUser.mutation(api.automations.create, {
				name: "Email custom addresses",
				trigger: clientCreatedTrigger,
				nodes: [
					sendEmailNode(
						"email-1",
						{
							kind: "custom",
							addresses: ["blocked-a@example.com", "blocked-b@example.com"],
						},
						"Hello",
						"Body"
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

			const executions = await getExecutions();
			const entry = executions[0].nodesExecuted.find(
				(n) => n.nodeId === "email-1"
			);
			expect(entry?.result).toBe("skipped");
			expect(entry?.error).toMatch(/suppressed/i);
			// The implementation pre-checks suppression before creating a thread
			// (actions.ts executeSendEmailAction: resolveEmailRecipients runs, and
			// an empty `recipients` list returns before getOrCreateOutboundThread
			// is ever called) — so unlike the partial-suppression case above, no
			// thread should exist here either.
			expect(await getEmailThreads()).toHaveLength(0);
			expect(await getEmailMessages()).toHaveLength(0);
		});
	});

	// -------------------------------------------------------------------
	// Interpolation failure — fails before any send attempt; fully testable.
	// -------------------------------------------------------------------

	describe("interpolation", () => {
		it("an empty interpolated subject fails the node and the run", async () => {
			const { asUser, orgId } = await setupUser();
			await makeOrgPremium(orgId);

			await asUser.mutation(api.automations.create, {
				name: "Email with bad token",
				trigger: clientCreatedTrigger,
				nodes: [
					sendEmailNode(
						"email-1",
						{ kind: "custom", addresses: ["clean@example.com"] },
						"{{trigger.record.nonexistentfield}}",
						"Body"
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

			const executions = await getExecutions();
			expect(executions).toHaveLength(1);
			expect(executions[0].status).toBe("failed");
			const entry = executions[0].nodesExecuted.find(
				(n) => n.nodeId === "email-1"
			);
			expect(entry?.result).toBe("failed");
			expect(entry?.error).toMatch(/subject resolved to an empty value/i);
			expect(await getEmailMessages()).toHaveLength(0);
		});
	});

	// -------------------------------------------------------------------
	// Premium override — org non-premium, creator user carries the override.
	// -------------------------------------------------------------------

	describe("premium override", () => {
		it("a user-level override on the automation's creator passes the premium gate", async () => {
			const { asUser, orgId, userId } = await setupUser();
			// Org itself stays non-premium; only the creator user is flagged.
			await t.run(async (ctx) =>
				ctx.db.patch(userId, { hasPremiumFeatureAccess: true })
			);

			await asUser.mutation(api.automations.create, {
				name: "Email with creator override",
				trigger: clientCreatedTrigger,
				nodes: [
					sendEmailNode(
						"email-1",
						{ kind: "primary_contact" },
						"Hello",
						"Body"
					),
				],
				isActive: true,
			});

			const clientId = await asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "Acme Co",
				status: "lead",
			});
			await t.run(async (ctx) =>
				createTestClientContact(ctx, orgId, clientId, {
					isPrimary: true,
					email: "primary@example.com",
				})
			);

			await drainEvents();

			const executions = await getExecutions();
			const entry = executions[0].nodesExecuted.find(
				(n) => n.nodeId === "email-1"
			);
			// The creator-level override passes the gate and the send completes.
			expect(entry?.result).toBe("success");
			expect(await getEmailMessages()).toHaveLength(1);
			const threads = await getEmailThreads();
			expect(threads).toHaveLength(1);
			expect(threads[0].clientId).toBe(clientId);
		});
	});

	// -------------------------------------------------------------------
	// Save validation (automations.ts validateWorkflowDefinition send_email arm).
	// -------------------------------------------------------------------

	describe("save validation", () => {
		it("rejects an empty subject", async () => {
			const { asUser } = await setupUser();
			await expect(
				asUser.mutation(api.automations.create, {
					name: "Bad email node",
					trigger: clientCreatedTrigger,
					nodes: [
						sendEmailNode(
							"email-1",
							{ kind: "primary_contact" },
							"   ",
							"Body"
						),
					],
				})
			).rejects.toThrow(/subject is required/i);
		});

		it("rejects an empty body", async () => {
			const { asUser } = await setupUser();
			await expect(
				asUser.mutation(api.automations.create, {
					name: "Bad email node",
					trigger: clientCreatedTrigger,
					nodes: [
						sendEmailNode(
							"email-1",
							{ kind: "primary_contact" },
							"Subject",
							"   "
						),
					],
				})
			).rejects.toThrow(/body is required/i);
		});

		it("rejects custom addresses with an empty list", async () => {
			const { asUser } = await setupUser();
			await expect(
				asUser.mutation(api.automations.create, {
					name: "Bad email node",
					trigger: clientCreatedTrigger,
					nodes: [
						sendEmailNode(
							"email-1",
							{ kind: "custom", addresses: [] },
							"Subject",
							"Body"
						),
					],
				})
			).rejects.toThrow(/at least one recipient address/i);
		});

		it("rejects custom addresses over the 10-recipient cap", async () => {
			const { asUser } = await setupUser();
			const addresses = Array.from(
				{ length: 11 },
				(_, i) => `r${i}@example.com`
			);
			await expect(
				asUser.mutation(api.automations.create, {
					name: "Bad email node",
					trigger: clientCreatedTrigger,
					nodes: [
						sendEmailNode(
							"email-1",
							{ kind: "custom", addresses },
							"Subject",
							"Body"
						),
					],
				})
			).rejects.toThrow(/at most 10 recipient addresses/i);
		});

		it("rejects a malformed custom address", async () => {
			const { asUser } = await setupUser();
			await expect(
				asUser.mutation(api.automations.create, {
					name: "Bad email node",
					trigger: clientCreatedTrigger,
					nodes: [
						sendEmailNode(
							"email-1",
							{ kind: "custom", addresses: ["not-an-email"] },
							"Subject",
							"Body"
						),
					],
				})
			).rejects.toThrow(/not a valid email address/i);
		});

		it("rejects primary_contact on a scheduled (no-record-scope) trigger", async () => {
			const { asUser } = await setupUser();
			await expect(
				asUser.mutation(api.automations.create, {
					name: "Scheduled email, no scope",
					trigger: {
						type: "scheduled",
						schedule: {
							frequency: "daily",
							timezone: "UTC",
							time: "09:00",
						},
					},
					nodes: [
						sendEmailNode(
							"email-1",
							{ kind: "primary_contact" },
							"Subject",
							"Body"
						),
					],
				})
			).rejects.toThrow(/needs a record in scope/i);
		});

		it("accepts a scheduled trigger with custom addresses (no record scope needed)", async () => {
			const { asUser } = await setupUser();
			const id = await asUser.mutation(api.automations.create, {
				name: "Scheduled email, custom addresses",
				trigger: {
					type: "scheduled",
					schedule: {
						frequency: "daily",
						timezone: "UTC",
						time: "09:00",
					},
				},
				nodes: [
					sendEmailNode(
						"email-1",
						{ kind: "custom", addresses: ["ops@example.com"] },
						"Subject",
						"Body"
					),
				],
			});
			await asUser.mutation(api.automations.publish, { id });
			const automation = await asUser.query(api.automations.get, { id });
			expect(automation?.publishedSnapshot).toBeDefined();
		});
	});

	// -------------------------------------------------------------------
	// Dry run (startTestRun) — dryRun.ts never touches the resend component
	// or writes emailMessages, so this is fully testable.
	// -------------------------------------------------------------------

	describe("dry run", () => {
		it("reveals a 'Would email' summary and writes no emailMessages row", async () => {
			const { asUser, orgId } = await setupUser();
			await makeOrgPremium(orgId);

			const clientId = await asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName: "Acme Co",
				status: "lead",
			});
			await t.run(async (ctx) =>
				createTestClientContact(ctx, orgId, clientId, {
					isPrimary: true,
					email: "primary@example.com",
				})
			);

			const automationId = await asUser.mutation(api.automations.create, {
				name: "Dry run email",
				trigger: clientCreatedTrigger,
				nodes: [
					sendEmailNode(
						"email-1",
						{ kind: "primary_contact" },
						"Hello {{trigger.record.companyName}}",
						"Body"
					),
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
			const entry = done?.nodesExecuted.find((n) => n.nodeId === "email-1");
			const output = entry?.output as { summary?: string } | undefined;
			expect(output?.summary).toMatch(/^Would email 1 recipient\(s\): "/);
			expect(output?.summary).toContain("Hello Acme Co");

			expect(await getEmailMessages()).toHaveLength(0);
		});
	});
});
