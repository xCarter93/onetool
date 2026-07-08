import { convexTest } from "convex-test";
import type { EmailId } from "@convex-dev/resend";
import { describe, it, expect, beforeEach } from "vitest";
import { internal } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import { createTestOrg, createTestClient } from "./test.helpers";
import { Id } from "./_generated/dataModel";

/**
 * Lifecycle-event handling (handleEmailEvent, invoked by the @convex-dev/resend
 * component's onEmailEvent callback). Regression suite for the id-correlation
 * bug: rows are keyed by the COMPONENT EmailId returned from sendEmail(), and
 * the handler must correlate on exactly that id.
 */
describe("resendWebhook.handleEmailEvent", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	const COMPONENT_EMAIL_ID = "k57abc123componentid" as EmailId;

	function eventData(overrides: Partial<{ to: string }> = {}) {
		return {
			created_at: "2026-07-08T12:00:00.000Z",
			email_id: "8f6e3d2c-real-resend-id",
			from: "Org <org@inbound.onetool.biz>",
			to: overrides.to ?? "jane@client.com",
			subject: "Quote",
		};
	}

	async function outboundSetup() {
		return await t.run(async (ctx) => {
			const org = await createTestOrg(ctx, {
				clerkUserId: "user_webhook_1",
				clerkOrgId: "org_webhook_1",
			});
			const clientId = await createTestClient(ctx, org.orgId);
			const messageId = await ctx.db.insert("emailMessages", {
				orgId: org.orgId,
				clientId,
				// What sendOutbound stores: the durable component's EmailId.
				resendEmailId: COMPONENT_EMAIL_ID,
				direction: "outbound",
				subject: "Quote",
				messageBody: "body",
				fromEmail: "org@inbound.onetool.biz",
				fromName: "Org",
				toEmail: "jane@client.com",
				toName: "Jane",
				status: "sent",
				sentAt: Date.now(),
				sentBy: org.userId,
			});
			return { ...org, clientId, messageId };
		});
	}

	it("correlates a bounce by component EmailId and records a suppression", async () => {
		const { orgId, messageId } = await outboundSetup();

		const result = await t.mutation(internal.resendWebhook.handleEmailEvent, {
			id: COMPONENT_EMAIL_ID,
			event: {
				type: "email.bounced" as const,
				created_at: "2026-07-08T12:00:00.000Z",
				data: {
					...eventData(),
					bounce: {
						message: "mailbox unavailable",
						subType: "General",
						type: "Permanent",
					},
				},
			},
		});
		expect(result.success).toBe(true);

		const { message, suppressions } = await t.run(async (ctx) => ({
			message: await ctx.db.get(messageId),
			suppressions: (await ctx.db.query("emailSuppressions").collect()).filter(
				(sup) => sup.email === "jane@client.com"
			),
		}));
		expect(message?.status).toBe("bounced");
		expect(suppressions).toHaveLength(1);
		expect(suppressions[0].orgId).toBe(orgId);
		expect(suppressions[0].reason).toBe("hard_bounce");
	});

	it("returns not-found instead of throwing for an unknown id", async () => {
		await outboundSetup();

		const result = await t.mutation(internal.resendWebhook.handleEmailEvent, {
			id: "some-other-id" as EmailId,
			event: {
				type: "email.delivered" as const,
				created_at: "2026-07-08T12:00:00.000Z",
				data: eventData(),
			},
		});
		expect(result.success).toBe(false);
	});

	it("marks delivery idempotently (no duplicate activity on redelivery)", async () => {
		const { messageId } = await outboundSetup();

		const deliveredEvent = {
			type: "email.delivered" as const,
			created_at: "2026-07-08T12:00:00.000Z",
			data: eventData(),
		};
		await t.mutation(internal.resendWebhook.handleEmailEvent, {
			id: COMPONENT_EMAIL_ID,
			event: deliveredEvent,
		});
		await t.mutation(internal.resendWebhook.handleEmailEvent, {
			id: COMPONENT_EMAIL_ID,
			event: deliveredEvent,
		});

		const { message, activities } = await t.run(async (ctx) => {
			const message = await ctx.db.get(messageId);
			const all = await ctx.db.query("activities").collect();
			return {
				message,
				activities: all.filter(
					(a) =>
						a.activityType === "email_delivered" &&
						a.metadata?.emailId === messageId
				),
			};
		});
		expect(message?.status).toBe("delivered");
		expect(activities).toHaveLength(1);
	});

	it("marks a permanent failure as failed", async () => {
		const { messageId } = await outboundSetup();

		await t.mutation(internal.resendWebhook.handleEmailEvent, {
			id: COMPONENT_EMAIL_ID,
			event: {
				type: "email.failed" as const,
				created_at: "2026-07-08T12:00:00.000Z",
				data: { ...eventData(), failed: { reason: "policy rejection" } },
			},
		});

		const message = await t.run(async (ctx) => ctx.db.get(messageId));
		expect(message?.status).toBe("failed");
		expect(message?.failedAt).toBeDefined();
	});

	it("suppresses the recipient on a complaint", async () => {
		const { messageId } = await outboundSetup();

		await t.mutation(internal.resendWebhook.handleEmailEvent, {
			id: COMPONENT_EMAIL_ID,
			event: {
				type: "email.complained" as const,
				created_at: "2026-07-08T12:00:00.000Z",
				data: eventData(),
			},
		});

		const { message, suppressions } = await t.run(async (ctx) => ({
			message: await ctx.db.get(messageId),
			suppressions: (await ctx.db.query("emailSuppressions").collect()).filter(
				(sup) => sup.email === "jane@client.com"
			),
		}));
		expect(message?.status).toBe("complained");
		expect(suppressions[0]?.reason).toBe("complaint");
	});
});
