// Plan 13-01 Wave 0 stub: failing baseline for PORTAL-05 dual auth provider.
// Implementation lands in Plan 13-02 (backend foundation: extend auth.config.ts
// with the second provider entry).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { describe, it, expect } from "vitest";

describe("portal auth provider", () => {
	it("auth.config.ts contains both Clerk and portal providers with distinct applicationIDs", () => {
		expect.fail(
			"PORTAL-05: not implemented — implemented by Wave 1 Plan 13-02 (auth.config.ts dual-provider entry)",
		);
	});
});
