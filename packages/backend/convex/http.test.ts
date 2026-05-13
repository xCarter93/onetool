import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { convexTest } from "convex-test";
import { setupConvexTest } from "./test.setup";
import { createTestOrg } from "./test.helpers";
import {
	buildStripeEvent,
	buildSignedWebhookRequest,
} from "./__tests__/fixtures/stripeEvents";

const TEST_SECRET = "whsec_test_http_secret";

async function seedConnectedOrg(t: ReturnType<typeof convexTest>) {
	return await t.run(async (ctx) => {
		const { orgId, userId } = await createTestOrg(ctx, {
			clerkOrgId: `org_http_${Math.random().toString(36).slice(2)}`,
		});
		await ctx.db.patch(orgId, {
			stripeConnectAccountId: "acct_http_webhook",
		});
		return { orgId, userId };
	});
}

describe("POST /stripe-webhook (Convex httpAction)", () => {
	let t: ReturnType<typeof convexTest>;
	let originalSecret: string | undefined;

	beforeEach(() => {
		t = setupConvexTest();
		originalSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
		process.env.STRIPE_CONNECT_WEBHOOK_SECRET = TEST_SECRET;
	});

	afterEach(() => {
		if (originalSecret === undefined) {
			delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
		} else {
			process.env.STRIPE_CONNECT_WEBHOOK_SECRET = originalSecret;
		}
	});

	it("returns 400 when stripe-signature header is missing", async () => {
		const event = buildStripeEvent({
			type: "checkout.session.completed",
			account: "acct_http_webhook",
			data: { object: { id: "cs_missing_sig" } as never },
		});
		const res = await t.fetch("/stripe-webhook", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(event),
		});
		expect(res.status).toBe(400);
	});

	it("returns 400 when stripe-signature is computed with the wrong secret", async () => {
		const event = buildStripeEvent({
			type: "checkout.session.completed",
			account: "acct_http_webhook",
			data: { object: { id: "cs_wrong_secret" } as never },
		});
		const { rawBody, signature } = buildSignedWebhookRequest(
			event,
			"whsec_WRONG_secret"
		);
		const res = await t.fetch("/stripe-webhook", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"stripe-signature": signature,
			},
			body: rawBody,
		});
		expect(res.status).toBe(400);
	});

	it("returns 400 when timestamp is outside the replay tolerance window", async () => {
		const event = buildStripeEvent({
			type: "checkout.session.completed",
			account: "acct_http_webhook",
			data: { object: { id: "cs_stale_ts" } as never },
		});
		// 10 minutes ago — outside the 5-minute tolerance.
		const staleTimestamp = Math.floor(Date.now() / 1000) - 600;
		const { rawBody, signature } = buildSignedWebhookRequest(
			event,
			TEST_SECRET,
			staleTimestamp
		);
		const res = await t.fetch("/stripe-webhook", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"stripe-signature": signature,
			},
			body: rawBody,
		});
		expect(res.status).toBe(400);
	});

	it("returns 500 when STRIPE_CONNECT_WEBHOOK_SECRET is not configured", async () => {
		delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
		const event = buildStripeEvent({
			type: "checkout.session.completed",
			account: "acct_http_webhook",
			data: { object: { id: "cs_no_secret" } as never },
		});
		const { rawBody, signature } = buildSignedWebhookRequest(
			event,
			TEST_SECRET
		);
		const res = await t.fetch("/stripe-webhook", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"stripe-signature": signature,
			},
			body: rawBody,
		});
		expect(res.status).toBe(500);
	});

	it("returns 200 on valid signed payload for an unknown account (orgFound:false)", async () => {
		// No org seeded — handleEvent should resolve with orgFound:false and 200.
		const event = buildStripeEvent({
			id: "evt_http_unknown",
			type: "account.updated",
			account: "acct_unknown_in_db",
			data: {
				object: {
					id: "acct_unknown_in_db",
					charges_enabled: false,
					payouts_enabled: false,
					details_submitted: false,
					requirements: { currently_due: [], disabled_reason: null },
				} as never,
			},
		});
		const { rawBody, signature } = buildSignedWebhookRequest(
			event,
			TEST_SECRET
		);
		const res = await t.fetch("/stripe-webhook", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"stripe-signature": signature,
			},
			body: rawBody,
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { received: boolean; orgFound: boolean };
		expect(body.received).toBe(true);
		expect(body.orgFound).toBe(false);
	});

	it("returns 200 and patches the org on a signed account.updated event", async () => {
		const { orgId } = await seedConnectedOrg(t);
		const event = buildStripeEvent({
			id: "evt_http_happy",
			type: "account.updated",
			account: "acct_http_webhook",
			data: {
				object: {
					id: "acct_http_webhook",
					charges_enabled: true,
					payouts_enabled: true,
					details_submitted: true,
					requirements: { currently_due: [], disabled_reason: null },
				} as never,
			},
		});
		const { rawBody, signature } = buildSignedWebhookRequest(
			event,
			TEST_SECRET
		);
		const res = await t.fetch("/stripe-webhook", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"stripe-signature": signature,
			},
			body: rawBody,
		});
		expect(res.status).toBe(200);
		const org = await t.run((ctx) => ctx.db.get(orgId));
		expect(org?.stripeChargesEnabled).toBe(true);
		expect(org?.stripePayoutsEnabled).toBe(true);
	});

	it("returns 200 when the same event is replayed (idempotent: duplicate=true)", async () => {
		await seedConnectedOrg(t);
		const event = buildStripeEvent({
			id: "evt_http_dup",
			type: "account.updated",
			account: "acct_http_webhook",
			data: {
				object: {
					id: "acct_http_webhook",
					charges_enabled: true,
					payouts_enabled: true,
					details_submitted: true,
					requirements: { currently_due: [], disabled_reason: null },
				} as never,
			},
		});
		const { rawBody, signature } = buildSignedWebhookRequest(
			event,
			TEST_SECRET
		);

		const firstRes = await t.fetch("/stripe-webhook", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"stripe-signature": signature,
			},
			body: rawBody,
		});
		expect(firstRes.status).toBe(200);
		const firstBody = (await firstRes.json()) as { duplicate: boolean };
		expect(firstBody.duplicate).toBe(false);

		// Replay with a freshly-signed header for the same event id — same body
		// JSON so handleEvent recognizes it as the same stripeEventId.
		const replay = buildSignedWebhookRequest(event, TEST_SECRET);
		const secondRes = await t.fetch("/stripe-webhook", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"stripe-signature": replay.signature,
			},
			body: replay.rawBody,
		});
		expect(secondRes.status).toBe(200);
		const secondBody = (await secondRes.json()) as { duplicate: boolean };
		expect(secondBody.duplicate).toBe(true);
	});
});
