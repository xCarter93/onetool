import { describe, it, expect, beforeEach, vi } from "vitest";
import { ConvexError } from "convex/values";

const cookieHolder: { value: string | null } = { value: "test-cookie-jwt" };
const fetchActionMock = vi.fn();

vi.mock("@/lib/portal/cookie", () => ({
	readSessionCookie: async () => cookieHolder.value,
}));

vi.mock("convex/nextjs", () => ({
	fetchAction: (...args: unknown[]) => fetchActionMock(...args),
	fetchMutation: vi.fn(),
}));

type HeaderInit = Record<string, string>;

function makeReq(opts: {
	headers?: HeaderInit;
	host?: string | null;
	origin?: string | null;
	referer?: string | null;
}) {
	const headers: Record<string, string> = {
		"content-type": "application/json",
		"user-agent": "vitest-ua",
		...(opts.headers ?? {}),
	};
	if (opts.host !== null && opts.host !== undefined)
		headers["host"] = opts.host;
	else if (opts.host === undefined) headers["host"] = "example.com";
	if (opts.origin !== null && opts.origin !== undefined)
		headers["origin"] = opts.origin;
	else if (opts.origin === undefined) headers["origin"] = "https://example.com";
	if (opts.referer !== null && opts.referer !== undefined)
		headers["referer"] = opts.referer;

	return new Request(
		"https://example.com/api/portal/invoices/inv1/payment-intent",
		{
			method: "POST",
			headers,
		},
	) as unknown as import("next/server").NextRequest;
}

const params = Promise.resolve({ invoiceId: "inv1" });

beforeEach(() => {
	cookieHolder.value = "test-cookie-jwt";
	fetchActionMock.mockReset();
});

describe("POST /api/portal/invoices/[invoiceId]/payment-intent", () => {
	it("returns 401 when session cookie is missing", async () => {
		cookieHolder.value = null;
		const { POST } = await import("../route");
		const res = await POST(makeReq({}), { params });
		expect(res.status).toBe(401);
		const json = (await res.json()) as { code: string };
		expect(json.code).toBe("unauthenticated");
		expect(fetchActionMock).not.toHaveBeenCalled();
	});

	it("returns 403 when same-origin guard fails", async () => {
		const { POST } = await import("../route");
		const res = await POST(
			makeReq({ origin: "https://attacker.com" }),
			{ params },
		);
		expect(res.status).toBe(403);
		expect(fetchActionMock).not.toHaveBeenCalled();
	});

	it("happy path: returns 200 with clientSecret + publishableKey + stripeAccountId + paymentId + amount", async () => {
		const payload = {
			clientSecret: "pi_route_secret_xyz",
			publishableKey: "pk_test_xyz",
			stripeAccountId: "acct_route_1",
			paymentId: "pay_route_1",
			amount: 125,
		};
		fetchActionMock.mockResolvedValue(payload);
		const { POST } = await import("../route");
		const res = await POST(makeReq({}), { params });
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual(payload);
		expect(fetchActionMock).toHaveBeenCalledTimes(1);
		expect(fetchActionMock.mock.calls[0]![1]).toEqual({ invoiceId: "inv1" });
		expect(fetchActionMock.mock.calls[0]![2]).toEqual({
			token: "test-cookie-jwt",
		});
	});

	it("converts ConvexError code=RATE_LIMITED to HTTP 429 with retryAfterSeconds", async () => {
		fetchActionMock.mockRejectedValue(
			new ConvexError({ code: "RATE_LIMITED", retryAfter: 12000 }),
		);
		const { POST } = await import("../route");
		const res = await POST(makeReq({}), { params });
		expect(res.status).toBe(429);
		const json = (await res.json()) as {
			code: string;
			retryAfterSeconds: number;
		};
		expect(json.code).toBe("rate_limited");
		expect(json.retryAfterSeconds).toBe(12);
	});

	it("converts ConvexError code=PAYMENTS_NOT_ENABLED to HTTP 422 with code=payments_not_enabled", async () => {
		fetchActionMock.mockRejectedValue(
			new ConvexError({ code: "PAYMENTS_NOT_ENABLED" }),
		);
		const { POST } = await import("../route");
		const res = await POST(makeReq({}), { params });
		expect(res.status).toBe(422);
		const json = (await res.json()) as { code: string };
		expect(json.code).toBe("payments_not_enabled");
	});

	it("converts ConvexError code=LEGACY_INVOICE_NOT_PAYABLE to HTTP 422 with code=legacy_invoice", async () => {
		fetchActionMock.mockRejectedValue(
			new ConvexError({ code: "LEGACY_INVOICE_NOT_PAYABLE" }),
		);
		const { POST } = await import("../route");
		const res = await POST(makeReq({}), { params });
		expect(res.status).toBe(422);
		const json = (await res.json()) as { code: string };
		expect(json.code).toBe("legacy_invoice");
	});

	it("converts ConvexError code=FORBIDDEN to HTTP 404", async () => {
		fetchActionMock.mockRejectedValue(
			new ConvexError({ code: "FORBIDDEN" }),
		);
		const { POST } = await import("../route");
		const res = await POST(makeReq({}), { params });
		expect(res.status).toBe(404);
	});
});
