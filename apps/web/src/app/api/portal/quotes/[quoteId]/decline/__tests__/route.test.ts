import { describe, it, expect, beforeEach, vi } from "vitest";
import { ConvexError } from "convex/values";

// Hoisted mocks --------------------------------------------------------------
const cookieHolder: { value: string | null } = { value: "test-cookie-jwt" };
const fetchMutationMock = vi.fn();
const getRequestIpMock = vi.fn(() => "203.0.113.5");

vi.mock("@/lib/portal/cookie", () => ({
	readSessionCookie: async () => cookieHolder.value,
}));

vi.mock("@/lib/portal/ip", () => ({
	getRequestIp: (req: unknown) => getRequestIpMock(req),
}));

vi.mock("convex/nextjs", () => ({
	fetchMutation: (...args: unknown[]) => fetchMutationMock(...args),
	fetchAction: vi.fn(),
}));

function makeReq(opts: {
	body?: unknown;
	host?: string | null;
	origin?: string | null;
	referer?: string | null;
}) {
	const headers: Record<string, string> = {
		"content-type": "application/json",
		"user-agent": "vitest-ua",
		host: "example.com",
	};
	if (opts.host !== undefined) {
		if (opts.host === null) delete headers["host"];
		else headers["host"] = opts.host;
	}
	if (opts.origin === undefined) headers["origin"] = "https://example.com";
	else if (opts.origin !== null) headers["origin"] = opts.origin;
	if (opts.referer) headers["referer"] = opts.referer;

	return new Request("https://example.com/api/portal/quotes/q1/decline", {
		method: "POST",
		headers,
		body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
	}) as unknown as import("next/server").NextRequest;
}

const params = Promise.resolve({ quoteId: "q1" });

beforeEach(() => {
	cookieHolder.value = "test-cookie-jwt";
	fetchMutationMock.mockReset();
	getRequestIpMock.mockReset();
	getRequestIpMock.mockReturnValue("203.0.113.5");
});

describe("POST /api/portal/quotes/[quoteId]/decline", () => {
	it("zod-rejects body without expectedDocumentId returns 400", async () => {
		const { POST } = await import("../route");
		const res = await POST(
			makeReq({ body: { declineReason: "no thanks" } }),
			{ params },
		);
		expect(res.status).toBe(400);
	});

	it("happy path: forwards declineReason (optional) to mutation, returns 200 with receipt payload", async () => {
		const receipt = {
			auditId: "a-1",
			action: "declined" as const,
			createdAt: 100,
			documentVersion: 1,
			lineItemsCount: 2,
			total: 500,
		};
		fetchMutationMock.mockResolvedValue(receipt);

		const { POST } = await import("../route");
		const res = await POST(
			makeReq({
				body: {
					expectedDocumentId: "doc-1",
					declineReason: "  too expensive  ",
				},
			}),
			{ params },
		);
		expect(res.status).toBe(200);
		const json = (await res.json()) as { ok: boolean; receipt: typeof receipt };
		expect(json).toEqual({ ok: true, receipt });
		const args = fetchMutationMock.mock.calls[0];
		expect(args[1]).toMatchObject({
			declineReason: "too expensive", // trimmed
			ipAddress: "203.0.113.5",
			userAgent: "vitest-ua",
		});
		expect(args[2]).toEqual({ token: "test-cookie-jwt" });
	});

	it("converts QUOTE_VERSION_STALE to HTTP 409", async () => {
		fetchMutationMock.mockRejectedValue(
			new ConvexError({ code: "QUOTE_VERSION_STALE" }),
		);
		const { POST } = await import("../route");
		const res = await POST(
			makeReq({ body: { expectedDocumentId: "doc-1" } }),
			{ params },
		);
		expect(res.status).toBe(409);
		const json = (await res.json()) as { code: string };
		expect(json.code).toBe("stale");
	});

	it("converts RATE_LIMITED to HTTP 429", async () => {
		fetchMutationMock.mockRejectedValue(
			new ConvexError({ code: "RATE_LIMITED" }),
		);
		const { POST } = await import("../route");
		const res = await POST(
			makeReq({ body: { expectedDocumentId: "doc-1" } }),
			{ params },
		);
		expect(res.status).toBe(429);
		const json = (await res.json()) as { code: string };
		expect(json.code).toBe("rate_limited");
	});
});
