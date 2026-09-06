import { describe, it, expect } from "vitest";
import { resolveInvoicePricingMode } from "./invoiceTotals";

describe("resolveInvoicePricingMode", () => {
	it("is legacy when none of the quote-style fields is set", () => {
		expect(resolveInvoicePricingMode({})).toBe("legacy");
		expect(
			resolveInvoicePricingMode({
				discountEnabled: undefined,
				discountType: undefined,
				taxEnabled: undefined,
				taxRate: undefined,
			})
		).toBe("legacy");
	});

	it("is quote as soon as any one quote-style field is set", () => {
		expect(resolveInvoicePricingMode({ discountEnabled: true })).toBe("quote");
		expect(resolveInvoicePricingMode({ discountType: "fixed" })).toBe("quote");
		expect(resolveInvoicePricingMode({ taxEnabled: true })).toBe("quote");
		expect(resolveInvoicePricingMode({ taxRate: 8.25 })).toBe("quote");
	});

	it("treats falsy-but-present values as set", () => {
		expect(resolveInvoicePricingMode({ discountEnabled: false })).toBe("quote");
		expect(resolveInvoicePricingMode({ taxRate: 0 })).toBe("quote");
	});
});
