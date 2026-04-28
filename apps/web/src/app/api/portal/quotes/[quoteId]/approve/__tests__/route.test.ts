import { describe, it, expect, beforeEach, vi } from "vitest";
import { ConvexError } from "convex/values";

// Hoisted mocks --------------------------------------------------------------
const cookieHolder: { value: string | null } = { value: "test-cookie-jwt" };
const fetchActionMock = vi.fn();
const getRequestIpMock = vi.fn(() => "203.0.113.5");

vi.mock("@/lib/portal/cookie", () => ({
	readSessionCookie: async () => cookieHolder.value,
}));

vi.mock("@/lib/portal/ip", () => ({
	getRequestIp: (req: unknown) => getRequestIpMock(req),
}));

vi.mock("convex/nextjs", () => ({
	fetchAction: (...args: unknown[]) => fetchActionMock(...args),
	fetchMutation: vi.fn(),
}));

// Helpers --------------------------------------------------------------------
type HeaderInit = Record<string, string>;

function makeReq(opts: {
	body?: unknown;
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

	return new Request("https://example.com/api/portal/quotes/q1/approve", {
		method: "POST",
		headers,
		body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
	}) as unknown as import("next/server").NextRequest;
}

function validBody(overrides: Record<string, unknown> = {}) {
	return {
		expectedDocumentId: "doc-1",
		signatureMode: "drawn" as const,
		signatureBase64:
			"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4//8/AwAI/AL+I72k1QAAAABJRU5ErkJggg==",
		signatureRawData: "[]",
		termsAccepted: true as const,
		intentAffirmed: true,
		...overrides,
	};
}

const params = Promise.resolve({ quoteId: "q1" });

beforeEach(() => {
	cookieHolder.value = "test-cookie-jwt";
	fetchActionMock.mockReset();
	getRequestIpMock.mockReset();
	getRequestIpMock.mockReturnValue("203.0.113.5");
});

describe("POST /api/portal/quotes/[quoteId]/approve", () => {
	it("zod-rejects body without expectedDocumentId returns 400", async () => {
		const { POST } = await import("../route");
		const body = validBody();
		// biome-ignore lint/performance/noDelete: deleting key for negative test
		delete (body as Record<string, unknown>).expectedDocumentId;
		const res = await POST(makeReq({ body }), { params });
		expect(res.status).toBe(400);
	});

	it("typed mode without intentAffirmed=true returns 400", async () => {
		const { POST } = await import("../route");
		const body = validBody({ signatureMode: "typed", intentAffirmed: false });
		const res = await POST(makeReq({ body }), { params });
		expect(res.status).toBe(400);
	});

	it("happy path: forwards signatureBase64 to single approve action, returns 200 with receipt payload", async () => {
		const receipt = {
			auditId: "audit-1",
			action: "approved" as const,
			createdAt: 123,
			documentVersion: 2,
			lineItemsCount: 3,
			total: 1000,
			signatureStorageId: "stor-1",
		};
		fetchActionMock.mockResolvedValue(receipt);

		const { POST } = await import("../route");
		const res = await POST(makeReq({ body: validBody() }), { params });
		expect(res.status).toBe(200);
		const json = (await res.json()) as { ok: boolean; receipt: typeof receipt };
		expect(json).toEqual({ ok: true, receipt });
		expect(fetchActionMock).toHaveBeenCalledTimes(1);
		const args = fetchActionMock.mock.calls[0];
		// args = [api.portal.quotes.approve, payload, { token }]
		expect(args[1]).toMatchObject({
			signatureBase64: expect.stringMatching(/^data:image\/png;base64,/),
			signatureMode: "drawn",
			ipAddress: "203.0.113.5",
			userAgent: "vitest-ua",
			termsAccepted: true,
		});
		expect(args[2]).toEqual({ token: "test-cookie-jwt" });
	});

	it("converts ConvexError code=QUOTE_VERSION_STALE to HTTP 409", async () => {
		fetchActionMock.mockRejectedValue(
			new ConvexError({ code: "QUOTE_VERSION_STALE" }),
		);
		const { POST } = await import("../route");
		const res = await POST(makeReq({ body: validBody() }), { params });
		expect(res.status).toBe(409);
		const json = (await res.json()) as { code: string };
		expect(json.code).toBe("stale");
	});

	it("converts ConvexError code=QUOTE_NOT_PENDING to HTTP 409", async () => {
		fetchActionMock.mockRejectedValue(
			new ConvexError({ code: "QUOTE_NOT_PENDING" }),
		);
		const { POST } = await import("../route");
		const res = await POST(makeReq({ body: validBody() }), { params });
		expect(res.status).toBe(409);
		const json = (await res.json()) as { code: string };
		expect(json.code).toBe("not_pending");
	});

	it("converts ConvexError code=RATE_LIMITED to HTTP 429 with code=rate_limited", async () => {
		fetchActionMock.mockRejectedValue(
			new ConvexError({ code: "RATE_LIMITED", retryAfter: 15000 }),
		);
		const { POST } = await import("../route");
		const res = await POST(makeReq({ body: validBody() }), { params });
		expect(res.status).toBe(429);
		const json = (await res.json()) as {
			code: string;
			retryAfterSeconds: number;
		};
		expect(json.code).toBe("rate_limited");
		expect(json.retryAfterSeconds).toBe(15);
	});

	it("converts ConvexError code=UNAUTHENTICATED to HTTP 401", async () => {
		fetchActionMock.mockRejectedValue(
			new ConvexError({ code: "UNAUTHENTICATED" }),
		);
		const { POST } = await import("../route");
		const res = await POST(makeReq({ body: validBody() }), { params });
		expect(res.status).toBe(401);
	});

	it("captures raw IP via getRequestIp helper (not hashed)", async () => {
		getRequestIpMock.mockReturnValue("198.51.100.7");
		fetchActionMock.mockResolvedValue({
			auditId: "a",
			action: "approved",
			createdAt: 1,
			documentVersion: 1,
			lineItemsCount: 1,
			total: 1,
		});

		const { POST } = await import("../route");
		await POST(makeReq({ body: validBody() }), { params });
		expect(getRequestIpMock).toHaveBeenCalled();
		const args = fetchActionMock.mock.calls[0];
		expect(args[1].ipAddress).toBe("198.51.100.7");
	});

	it("rejects request with malformed Origin header (returns 403)", async () => {
		const { POST } = await import("../route");
		const res = await POST(
			makeReq({ body: validBody(), origin: "not-a-url" }),
			{ params },
		);
		expect(res.status).toBe(403);
	});

	it("accepts request when Origin is missing but Referer matches host (returns 200)", async () => {
		fetchActionMock.mockResolvedValue({
			auditId: "a",
			action: "approved",
			createdAt: 1,
			documentVersion: 1,
			lineItemsCount: 1,
			total: 1,
		});
		const { POST } = await import("../route");
		const res = await POST(
			makeReq({
				body: validBody(),
				origin: null,
				referer: "https://example.com/portal/quote/q1",
			}),
			{ params },
		);
		expect(res.status).toBe(200);
	});

	it("rejects request when both Origin AND Referer are missing (returns 403)", async () => {
		const { POST } = await import("../route");
		const res = await POST(
			makeReq({ body: validBody(), origin: null, referer: null }),
			{ params },
		);
		expect(res.status).toBe(403);
	});
});
