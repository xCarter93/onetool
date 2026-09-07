import { describe, it, expect, afterEach, vi } from "vitest";
import { setupConvexTest } from "./test.setup";
import { api } from "./_generated/api";
import { createTestOrg, createTestIdentity } from "./test.helpers";

async function readFee() {
	const t = setupConvexTest();
	const setup = await t.run(async (ctx) => await createTestOrg(ctx));
	const asUser = t.withIdentity(
		createTestIdentity(setup.clerkUserId, setup.clerkOrgId)
	);
	return await asUser.query(api.platformFee.get, {});
}

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("platformFee.get", () => {
	it("reports the configured fee in dollars", async () => {
		vi.stubEnv("STRIPE_APPLICATION_FEE_CENTS", "150");
		expect(await readFee()).toEqual({ platformFeeDollars: 1.5 });
	});

	it("reports no fee when the value is unset or unparseable", async () => {
		vi.stubEnv("STRIPE_APPLICATION_FEE_CENTS", "abc");
		expect(await readFee()).toEqual({ platformFeeDollars: 0 });
	});

	it("rejects fractional or unsafe cent values Stripe would refuse", async () => {
		vi.stubEnv("STRIPE_APPLICATION_FEE_CENTS", "150.5");
		expect(await readFee()).toEqual({ platformFeeDollars: 0 });
		vi.stubEnv("STRIPE_APPLICATION_FEE_CENTS", "1e21");
		expect(await readFee()).toEqual({ platformFeeDollars: 0 });
	});
});
