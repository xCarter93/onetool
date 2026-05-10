// Plan 14.1-03 Task 3: GET /api/portal/quotes/[quoteId]/pdf route tests.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/portal/cookie", () => ({
	readSessionCookie: vi.fn(),
}));
vi.mock("convex/nextjs", () => ({
	fetchQuery: vi.fn(),
}));

import { readSessionCookie } from "@/lib/portal/cookie";
import { fetchQuery } from "convex/nextjs";
import { GET } from "../route";
import type { NextRequest } from "next/server";

const mockedRead = vi.mocked(readSessionCookie);
const mockedFetchQuery = vi.mocked(fetchQuery);

function buildReq(path = "/api/portal/quotes/q1/pdf"): NextRequest {
	const url = new URL(path, "http://localhost:3000");
	return {
		url: url.toString(),
		nextUrl: url,
		headers: new Headers(),
	} as unknown as NextRequest;
}

function buildParams(quoteId = "q1") {
	return Promise.resolve({ quoteId });
}

describe("GET /api/portal/quotes/[quoteId]/pdf (Plan 14.1-03)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 401 envelope when readSessionCookie returns null", async () => {
		mockedRead.mockResolvedValue(null);
		const res = await GET(buildReq(), { params: buildParams() });
		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body).toEqual({
			code: "unauthenticated",
			message: "Portal session missing or expired",
			retryAfterSeconds: null,
		});
	});

	it("returns 200 { url } when fetchQuery returns url", async () => {
		mockedRead.mockResolvedValue("valid-token");
		mockedFetchQuery.mockResolvedValue({
			url: "https://convex.example/blob.pdf",
		});
		const res = await GET(buildReq(), { params: buildParams() });
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toEqual({ url: "https://convex.example/blob.pdf" });
	});

	it("returns 404 when fetchQuery returns null (pre-publish)", async () => {
		mockedRead.mockResolvedValue("valid-token");
		mockedFetchQuery.mockResolvedValue(null);
		const res = await GET(buildReq(), { params: buildParams() });
		expect(res.status).toBe(404);
		const body = await res.json();
		expect(body.error).toMatch(/not yet available/i);
	});
});
