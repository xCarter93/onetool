import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { convexTest } from "convex-test";
import { internal } from "./_generated/api";
import { setupConvexTest } from "./test.setup";

describe("stripeWebhookEvents lifecycle", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	it("fresh event: startProcessingEvent inserts row with status processing + attemptCount 1", async () => {
		const result = await t.mutation(
			internal.stripeWebhookEvents.startProcessingEvent,
			{
				stripeEventId: "evt_fresh_1",
				eventType: "checkout.session.completed",
				accountId: "acct_test",
				receivedAt: Date.now(),
			}
		);

		expect(result.proceed).toBe(true);
		expect(result.eventDocId).toBeDefined();

		const rows = await t.run((ctx) =>
			ctx.db.query("stripeWebhookEvents").collect()
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].status).toBe("processing");
		expect(rows[0].attemptCount).toBe(1);
		expect(rows[0].stripeEventId).toBe("evt_fresh_1");
		expect(rows[0].accountId).toBe("acct_test");
	});

	it("true duplicate: second call on processed event returns proceed=false and does not increment", async () => {
		const first = await t.mutation(
			internal.stripeWebhookEvents.startProcessingEvent,
			{
				stripeEventId: "evt_dup_1",
				eventType: "checkout.session.completed",
				receivedAt: Date.now(),
			}
		);
		expect(first.proceed).toBe(true);
		await t.mutation(internal.stripeWebhookEvents.markEventProcessed, {
			eventDocId: first.eventDocId!,
		});

		const second = await t.mutation(
			internal.stripeWebhookEvents.startProcessingEvent,
			{
				stripeEventId: "evt_dup_1",
				eventType: "checkout.session.completed",
				receivedAt: Date.now(),
			}
		);

		expect(second.proceed).toBe(false);

		const rows = await t.run((ctx) =>
			ctx.db.query("stripeWebhookEvents").collect()
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].status).toBe("processed");
		expect(rows[0].attemptCount).toBe(1);
	});

	it("failed event becomes retryable on Stripe replay (W-1 regression pin)", async () => {
		const first = await t.mutation(
			internal.stripeWebhookEvents.startProcessingEvent,
			{
				stripeEventId: "evt_retry_1",
				eventType: "checkout.session.completed",
				receivedAt: Date.now(),
			}
		);
		await t.mutation(internal.stripeWebhookEvents.markEventFailed, {
			eventDocId: first.eventDocId!,
			failureReason: "amount mismatch",
		});

		const second = await t.mutation(
			internal.stripeWebhookEvents.startProcessingEvent,
			{
				stripeEventId: "evt_retry_1",
				eventType: "checkout.session.completed",
				receivedAt: Date.now(),
			}
		);

		expect(second.proceed).toBe(true);
		expect(second.eventDocId).toBe(first.eventDocId);

		const rows = await t.run((ctx) =>
			ctx.db.query("stripeWebhookEvents").collect()
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].status).toBe("processing");
		expect(rows[0].attemptCount).toBe(2);
		// Prior failure metadata cleared so retry isn't tainted by the previous miss.
		expect(rows[0].failureReason).toBeUndefined();
	});

	it("markEventProcessed: sets status=processed and processedAt", async () => {
		const start = await t.mutation(
			internal.stripeWebhookEvents.startProcessingEvent,
			{
				stripeEventId: "evt_proc_1",
				eventType: "charge.refunded",
				receivedAt: Date.now(),
			}
		);

		await t.mutation(internal.stripeWebhookEvents.markEventProcessed, {
			eventDocId: start.eventDocId!,
		});

		const rows = await t.run((ctx) =>
			ctx.db.query("stripeWebhookEvents").collect()
		);
		expect(rows[0].status).toBe("processed");
		expect(rows[0].processedAt).toBeGreaterThan(0);
	});

	it("markEventFailed: sets status=failed, failedAt non-null, failureReason captured", async () => {
		const start = await t.mutation(
			internal.stripeWebhookEvents.startProcessingEvent,
			{
				stripeEventId: "evt_fail_1",
				eventType: "charge.dispute.created",
				receivedAt: Date.now(),
			}
		);

		await t.mutation(internal.stripeWebhookEvents.markEventFailed, {
			eventDocId: start.eventDocId!,
			failureReason: "boom",
		});

		const rows = await t.run((ctx) =>
			ctx.db.query("stripeWebhookEvents").collect()
		);
		expect(rows[0].status).toBe("failed");
		expect(rows[0].failedAt).toBeGreaterThan(0);
		expect(rows[0].failureReason).toBe("boom");
	});

	it("distinct events: two stripeEventIds both proceed and produce two rows", async () => {
		const a = await t.mutation(
			internal.stripeWebhookEvents.startProcessingEvent,
			{
				stripeEventId: "evt_a",
				eventType: "checkout.session.completed",
				receivedAt: Date.now(),
			}
		);
		const b = await t.mutation(
			internal.stripeWebhookEvents.startProcessingEvent,
			{
				stripeEventId: "evt_b",
				eventType: "payment_intent.payment_failed",
				receivedAt: Date.now(),
			}
		);

		expect(a.proceed).toBe(true);
		expect(b.proceed).toBe(true);
		expect(a.eventDocId).not.toBe(b.eventDocId);

		const rows = await t.run((ctx) =>
			ctx.db.query("stripeWebhookEvents").collect()
		);
		expect(rows).toHaveLength(2);
	});
});

describe("stripeWebhookEvents retention sweep", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	async function record(
		stripeEventId: string,
		outcome: "processed" | "failed"
	) {
		const { eventDocId } = await t.mutation(
			internal.stripeWebhookEvents.startProcessingEvent,
			{
				stripeEventId,
				eventType: "checkout.session.completed",
				receivedAt: Date.now(),
			}
		);
		if (!eventDocId) throw new Error("event row not created");
		if (outcome === "processed") {
			await t.mutation(internal.stripeWebhookEvents.markEventProcessed, {
				eventDocId,
			});
		} else {
			await t.mutation(internal.stripeWebhookEvents.markEventFailed, {
				eventDocId,
				failureReason: "boom",
			});
		}
	}

	it("deletes processed events past the replay window and keeps everything else", async () => {
		const now = Date.now();
		vi.setSystemTime(now - 40 * 24 * 60 * 60 * 1000);
		await record("evt_old_processed", "processed");
		await record("evt_old_failed", "failed");

		vi.setSystemTime(now);
		await record("evt_recent_processed", "processed");

		await t.mutation(internal.stripeWebhookEvents.cleanupProcessedEvents, {});

		const remaining = await t.run((ctx) =>
			ctx.db.query("stripeWebhookEvents").collect()
		);
		expect(remaining.map((r) => r.stripeEventId).sort()).toEqual([
			"evt_old_failed",
			"evt_recent_processed",
		]);
	});

	it("resumes past retained rows when a page is full", async () => {
		const now = Date.now();
		vi.setSystemTime(now - 40 * 24 * 60 * 60 * 1000);
		await record("evt_keep", "failed");
		await record("evt_drop", "processed");

		const kept = await t.run((ctx) =>
			ctx.db
				.query("stripeWebhookEvents")
				.withIndex("by_stripe_event_id", (q) =>
					q.eq("stripeEventId", "evt_keep")
				)
				.unique()
		);
		vi.setSystemTime(now);
		await t.mutation(internal.stripeWebhookEvents.cleanupProcessedEvents, {
			after: kept!._creationTime,
		});

		const remaining = await t.run((ctx) =>
			ctx.db.query("stripeWebhookEvents").collect()
		);
		expect(remaining.map((r) => r.stripeEventId)).toEqual(["evt_keep"]);
	});
});
