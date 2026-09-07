import { afterEach, beforeEach, describe, expect, it } from "vitest";

let original: string | undefined;

beforeEach(() => {
	original = process.env.STRIPE_APPLICATION_FEE_CENTS;
});

afterEach(() => {
	if (original === undefined) delete process.env.STRIPE_APPLICATION_FEE_CENTS;
	else process.env.STRIPE_APPLICATION_FEE_CENTS = original;
});

describe("GET /api/stripe-connect/platform-fee", () => {
	it("converts the configured cents to dollars", async () => {
		process.env.STRIPE_APPLICATION_FEE_CENTS = "100";
		const { GET } = await import("../route");
		expect(await (await GET()).json()).toEqual({ platformFeeDollars: 1 });
	});

	it("reports no fee when unset or unparseable", async () => {
		delete process.env.STRIPE_APPLICATION_FEE_CENTS;
		const { GET } = await import("../route");
		expect(await (await GET()).json()).toEqual({ platformFeeDollars: 0 });
		process.env.STRIPE_APPLICATION_FEE_CENTS = "abc";
		expect(await (await GET()).json()).toEqual({ platformFeeDollars: 0 });
	});
});
