import { describe, it, expect, beforeEach, vi } from "vitest";
import Stripe from "stripe";

// Inline copies of Plan 14.2-01 fixtures (packages/backend/convex/__tests__/
// fixtures/stripeEvents.ts). Duplicated rather than imported because the
// @onetool/backend package.json `exports` map intentionally does not expose
// test fixtures to consumers. Both versions sign via the same Stripe SDK
// helper — drift between them would surface immediately as signature
// mismatches against constructEventAsync.
function buildStripeEvent(
	overrides: Partial<Stripe.Event> & { type: Stripe.Event["type"] }
): Stripe.Event {
	const now = Math.floor(Date.now() / 1000);
	return {
		id: overrides.id ?? `evt_test_${Math.random().toString(36).slice(2, 10)}`,
		object: "event",
		api_version: "2026-04-22.dahlia",
		created: overrides.created ?? now,
		livemode: false,
		pending_webhooks: 0,
		request: { id: null, idempotency_key: null },
		account: overrides.account,
		data: overrides.data ?? { object: {} as Stripe.Event.Data["object"] },
		...overrides,
	} as Stripe.Event;
}

function buildSignedWebhookRequest(
	event: Stripe.Event,
	secret: string,
	timestamp: number = Math.floor(Date.now() / 1000)
): { rawBody: string; signature: string; timestamp: number } {
	const rawBody = JSON.stringify(event);
	const signature = Stripe.webhooks.generateTestHeaderString({
		payload: rawBody,
		secret,
		timestamp,
	});
	return { rawBody, signature, timestamp };
}

// Hoisted mocks --------------------------------------------------------------
// `convex/nextjs` fetchAction is mocked per-test to control success / throw.
const fetchActionMock = vi.fn();

vi.mock("convex/nextjs", () => ({
	fetchAction: (...args: unknown[]) => fetchActionMock(...args),
	fetchMutation: vi.fn(),
	fetchQuery: vi.fn(),
}));

// `@/env` is mocked so tests do not require a real STRIPE_CONNECT_WEBHOOK_SECRET
// in the test runner shell. The secret value here is what every test's signer
// matches against — proving the route uses env.STRIPE_CONNECT_WEBHOOK_SECRET as
// the verification key (no test backdoor).
vi.mock("@/env", () => ({
	env: {
		STRIPE_CONNECT_WEBHOOK_SECRET: "whsec_test_secret",
		STRIPE_SECRET_KEY: "sk_test_dummy",
	},
}));

// Lazy `getStripeClient` — only assertion on the Stripe.webhooks namespace.
// We use the REAL Stripe SDK here so constructEventAsync exercises the same
// crypto path that production hits. STRIPE_SECRET_KEY is set via the env mock
// (but the value is not actually used by webhook verification, only the
// signing secret matters).
vi.mock("@/lib/stripe", async () => {
	const Stripe = (await import("stripe")).default;
	return {
		getStripeClient: () => new Stripe("sk_test_dummy"),
	};
});

const TEST_SECRET = "whsec_test_secret";

function makeRequest(opts: { rawBody: string; signature?: string }): Request {
	const headers: Record<string, string> = {
		"content-type": "application/json",
	};
	if (opts.signature) headers["stripe-signature"] = opts.signature;
	return new Request("https://app.onetool.biz/api/stripe-webhook", {
		method: "POST",
		headers,
		body: opts.rawBody,
	});
}

beforeEach(() => {
	fetchActionMock.mockReset();
});

describe("POST /api/stripe-webhook", () => {
	it("Test 1: returns 400 when stripe-signature header is missing", async () => {
		const { POST } = await import("../route");
		const event = buildStripeEvent({
			type: "checkout.session.completed",
			account: "acct_test",
			data: { object: { id: "cs_test_1" } },
		});
		const { rawBody } = buildSignedWebhookRequest(event, TEST_SECRET);

		const res = await POST(makeRequest({ rawBody }) as never);
		expect(res.status).toBe(400);
		// fetchAction must NOT have been invoked when sig is missing.
		expect(fetchActionMock).not.toHaveBeenCalled();
	});

	it("Test 2: returns 400 when stripe-signature is computed with the wrong secret", async () => {
		const { POST } = await import("../route");
		const event = buildStripeEvent({
			type: "checkout.session.completed",
			account: "acct_test",
			data: { object: { id: "cs_test_2" } },
		});
		// Sign with a DIFFERENT secret than env.STRIPE_CONNECT_WEBHOOK_SECRET.
		const { rawBody, signature } = buildSignedWebhookRequest(
			event,
			"whsec_WRONG_secret"
		);

		const res = await POST(
			makeRequest({ rawBody, signature }) as never
		);
		expect(res.status).toBe(400);
		// fetchAction must NOT have been invoked when sig is invalid — proves
		// constructEventAsync is the only event-construction path (no backdoor).
		expect(fetchActionMock).not.toHaveBeenCalled();
	});

	it("Test 3: returns 200 on valid signed payload and dispatches to internal.stripeWebhookActions.handleEvent", async () => {
		fetchActionMock.mockResolvedValue({ duplicate: false, orgFound: true });
		const { POST } = await import("../route");
		const event = buildStripeEvent({
			id: "evt_happy_1",
			type: "checkout.session.completed",
			account: "acct_test",
			data: { object: { id: "cs_test_3" } },
		});
		const { rawBody, signature } = buildSignedWebhookRequest(
			event,
			TEST_SECRET
		);

		const res = await POST(
			makeRequest({ rawBody, signature }) as never
		);
		expect(res.status).toBe(200);
		expect(fetchActionMock).toHaveBeenCalledTimes(1);
		const [funcRef, payload] = fetchActionMock.mock.calls[0];
		// We can't easily compare the api FunctionReference object, but we
		// can assert payload shape matches the contract.
		expect(funcRef).toBeDefined();
		expect(payload).toMatchObject({
			eventId: "evt_happy_1",
			eventType: "checkout.session.completed",
			account: "acct_test",
		});
	});

	it("Test 4 (FINDINGS W-2): returns 500 when fetchAction rejects (so Stripe retries)", async () => {
		fetchActionMock.mockRejectedValue(new Error("Convex transient blip"));
		const { POST } = await import("../route");
		const event = buildStripeEvent({
			type: "payment_intent.payment_failed",
			account: "acct_test",
			data: { object: { id: "pi_test_4" } },
		});
		const { rawBody, signature } = buildSignedWebhookRequest(
			event,
			TEST_SECRET
		);

		const res = await POST(
			makeRequest({ rawBody, signature }) as never
		);
		expect(res.status).toBe(500);
	});

	it("Test 5 (FINDINGS W-2): returns 200 when handleEvent resolves with { duplicate: true }", async () => {
		fetchActionMock.mockResolvedValue({ duplicate: true });
		const { POST } = await import("../route");
		const event = buildStripeEvent({
			type: "checkout.session.completed",
			account: "acct_test",
			data: { object: { id: "cs_test_5" } },
		});
		const { rawBody, signature } = buildSignedWebhookRequest(
			event,
			TEST_SECRET
		);

		const res = await POST(
			makeRequest({ rawBody, signature }) as never
		);
		expect(res.status).toBe(200);
	});

	it("Test 6 (FINDINGS W-2): returns 200 when handleEvent resolves with { orgFound: false }", async () => {
		fetchActionMock.mockResolvedValue({
			duplicate: false,
			orgFound: false,
		});
		const { POST } = await import("../route");
		const event = buildStripeEvent({
			type: "account.updated",
			account: "acct_unknown",
			data: { object: { id: "acct_unknown" } },
		});
		const { rawBody, signature } = buildSignedWebhookRequest(
			event,
			TEST_SECRET
		);

		const res = await POST(
			makeRequest({ rawBody, signature }) as never
		);
		expect(res.status).toBe(200);
	});
});
