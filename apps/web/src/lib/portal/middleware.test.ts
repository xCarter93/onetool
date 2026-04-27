// Plan 13-01 Wave 0 stub: failing baseline for PORTAL-03 sliding refresh and
// PORTAL-05 middleware isolation. Implementations land in Plan 13-04 (web
// jwt/middleware) and Plan 13-05 (portal API routes/provider).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { describe, it, expect } from "vitest";

describe("portal middleware refresh", () => {
	it("reissues cookie when remaining lifetime < 23h", () => {
		expect.fail(
			"PORTAL-03: not implemented — implemented by Wave 3 Plan 13-04 (portalMiddleware sliding refresh)",
		);
	});
});

describe("portal middleware isolation", () => {
	it("Clerk middleware delegates to portalMiddleware for /portal and /api/portal routes", () => {
		expect.fail(
			"PORTAL-05: not implemented — implemented by Wave 4 Plan 13-05 (Clerk/portal middleware split)",
		);
	});
});
