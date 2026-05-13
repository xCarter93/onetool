import { describe, it, expect, beforeEach, vi } from "vitest";
import { ConvexError } from "convex/values";

const cookieHolder: { value: string | null } = { value: "test-cookie-jwt" };
const fetchQueryMock = vi.fn();

vi.mock("@/lib/portal/cookie", () => ({
	readSessionCookie: async () => cookieHolder.value,
}));

vi.mock("convex/nextjs", () => ({
	fetchQuery: (...args: unknown[]) => fetchQueryMock(...args),
}));

function makeReq() {
	return new Request("https://example.com/api/portal/invoices/inv1/pdf", {
		method: "GET",
		headers: { host: "example.com" },
	}) as unknown as import("next/server").NextRequest;
}

const params = Promise.resolve({ invoiceId: "inv1" });

beforeEach(() => {
	cookieHolder.value = "test-cookie-jwt";
	fetchQueryMock.mockReset();
});

describe("GET /api/portal/invoices/[invoiceId]/pdf", () => {
	it("returns 401 when session cookie is missing", async () => {
		cookieHolder.value = null;
		const { GET } = await import("../route");
		const res = await GET(makeReq(), { params });
		expect(res.status).toBe(401);
		const json = (await res.json()) as { code: string };
		expect(json.code).toBe("unauthenticated");
		expect(fetchQueryMock).not.toHaveBeenCalled();
	});

	it("returns 200 with { url } when getDownloadUrl resolves", async () => {
		fetchQueryMock.mockResolvedValue({ url: "https://storage.convex/abc" });
		const { GET } = await import("../route");
		const res = await GET(makeReq(), { params });
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ url: "https://storage.convex/abc" });
	});

	it("returns 404 with 'PDF is not yet available' copy when getDownloadUrl resolves to null (Decision B)", async () => {
		fetchQueryMock.mockResolvedValue(null);
		const { GET } = await import("../route");
		const res = await GET(makeReq(), { params });
		expect(res.status).toBe(404);
		const json = (await res.json()) as { error: string };
		expect(json.error).toBe("PDF is not yet available for this invoice.");
	});

	it("forwards invoiceId and token to api.portal.invoices.getDownloadUrl", async () => {
		fetchQueryMock.mockResolvedValue({ url: "https://x" });
		const { GET } = await import("../route");
		await GET(makeReq(), { params });
		expect(fetchQueryMock).toHaveBeenCalledTimes(1);
		expect(fetchQueryMock.mock.calls[0]![1]).toEqual({ invoiceId: "inv1" });
		expect(fetchQueryMock.mock.calls[0]![2]).toEqual({
			token: "test-cookie-jwt",
		});
	});

	it("maps ConvexError code=FORBIDDEN to HTTP 404 via mapConvexError", async () => {
		fetchQueryMock.mockRejectedValue(
			new ConvexError({ code: "FORBIDDEN" }),
		);
		const { GET } = await import("../route");
		const res = await GET(makeReq(), { params });
		expect(res.status).toBe(404);
	});
});
