import { describe, it, expect } from "vitest";
import {
	roundCents,
	sumMoney,
	dollarsToCents,
	centsToDollars,
	calculateLineItemAmount,
	calculateTax,
	applyDiscount,
	computeQuoteTotals,
	computeInvoiceTotals,
	formatCurrency,
} from "./money";

describe("money", () => {
	describe("unit convention", () => {
		// Regression guard for the historical 100x bug class: values are dollars
		// and must never be divided by 100 outside the Stripe boundary.
		it("treats inputs as dollars, never cents", () => {
			expect(formatCurrency(150)).toBe("$150.00");
			expect(formatCurrency(150)).not.toBe("$1.50");
			expect(computeInvoiceTotals({ lineTotals: [1750.5] }).total).toBe(1750.5);
		});
	});

	describe("roundCents", () => {
		it("rounds to the nearest cent", () => {
			expect(roundCents(10.005)).toBe(10.01);
			expect(roundCents(10.004)).toBe(10.0);
			expect(roundCents(0.1 + 0.2)).toBe(0.3);
		});

		it("rounds half-cents up regardless of binary representation", () => {
			// 1.005 * 100 === 100.49999999999999 — naive rounding gives 1.00
			expect(roundCents(1.005)).toBe(1.01);
			expect(roundCents(0.075)).toBe(0.08);
		});
	});

	describe("sumMoney", () => {
		it("sums without float drift", () => {
			// Classic drift case: 0.1 * 10 !== 1 with naive float accumulation
			expect(sumMoney(Array(10).fill(0.1))).toBe(1);
			expect(sumMoney([0.1, 0.2])).toBe(0.3);
		});

		it("handles empty and large lists", () => {
			expect(sumMoney([])).toBe(0);
			expect(sumMoney(Array(1000).fill(19.99))).toBe(19990);
		});

		it("rounds half-cent values up per element", () => {
			expect(sumMoney([1.005])).toBe(1.01);
		});
	});

	describe("Stripe boundary", () => {
		it("converts dollars to integer cents and back", () => {
			expect(dollarsToCents(19.99)).toBe(1999);
			expect(dollarsToCents(0.1 + 0.2)).toBe(30);
			expect(dollarsToCents(1.005)).toBe(101);
			expect(centsToDollars(1999)).toBe(19.99);
		});
	});

	describe("calculateLineItemAmount", () => {
		it("multiplies and cent-rounds", () => {
			expect(calculateLineItemAmount(10, 150)).toBe(1500);
			expect(calculateLineItemAmount(3, 33.333)).toBe(100);
			expect(calculateLineItemAmount(0.5, 99.99)).toBe(50);
		});
	});

	describe("calculateTax", () => {
		it("applies a percentage rate, cent-rounded", () => {
			expect(calculateTax(100, 8.25)).toBe(8.25);
			expect(calculateTax(99.99, 7)).toBe(7);
		});
	});

	describe("applyDiscount", () => {
		it("applies percentage discounts", () => {
			expect(applyDiscount(200, 10, true)).toBe(180);
			expect(applyDiscount(99.99, 12.5, true)).toBe(87.49);
		});

		it("applies fixed discounts, floored at zero", () => {
			expect(applyDiscount(200, 50, false)).toBe(150);
			expect(applyDiscount(30, 50, false)).toBe(0);
		});

		it("floors percentage discounts over 100% at zero", () => {
			expect(applyDiscount(200, 150, true)).toBe(0);
		});
	});

	describe("computeQuoteTotals", () => {
		it("rolls up subtotal → discount → tax → total", () => {
			const totals = computeQuoteTotals({
				lineAmounts: [1000, 500],
				discountEnabled: true,
				discountAmount: 10,
				discountType: "percentage",
				taxEnabled: true,
				taxRate: 8,
			});
			// 1500 → 1350 after 10% discount → +108 tax
			expect(totals).toEqual({ subtotal: 1500, taxAmount: 108, total: 1458 });
		});

		it("ignores discount/tax when disabled", () => {
			const totals = computeQuoteTotals({
				lineAmounts: [100.1, 200.2],
				discountAmount: 50,
				taxRate: 10,
			});
			expect(totals).toEqual({ subtotal: 300.3, taxAmount: 0, total: 300.3 });
		});

		it("applies fixed discounts as dollars", () => {
			const totals = computeQuoteTotals({
				lineAmounts: [100],
				discountEnabled: true,
				discountAmount: 25,
				discountType: "fixed",
			});
			expect(totals.total).toBe(75);
		});

		it("never drifts on many fractional line items", () => {
			const totals = computeQuoteTotals({
				lineAmounts: Array(100).fill(0.1),
			});
			expect(totals.subtotal).toBe(10);
			expect(totals.total).toBe(10);
		});
	});

	describe("computeInvoiceTotals", () => {
		it("subtracts dollar discount and adds dollar tax", () => {
			const totals = computeInvoiceTotals({
				lineTotals: [1000, 500],
				discountAmount: 150,
				taxAmount: 108,
			});
			expect(totals).toEqual({ subtotal: 1500, total: 1458 });
		});

		it("matches the quote roll-up for a converted quote", () => {
			// Quote: 10% percentage discount + 8% tax on [1000, 500]
			const quote = computeQuoteTotals({
				lineAmounts: [1000, 500],
				discountEnabled: true,
				discountAmount: 10,
				discountType: "percentage",
				taxEnabled: true,
				taxRate: 8,
			});
			// Invoice created from that quote stores discount/tax in dollars
			const invoice = computeInvoiceTotals({
				lineTotals: [1000, 500],
				discountAmount: 150, // 10% of 1500, as converted by createFromQuote
				taxAmount: quote.taxAmount,
			});
			expect(invoice.total).toBe(quote.total);
		});

		it("never drifts on many fractional line items", () => {
			const totals = computeInvoiceTotals({
				lineTotals: Array(100).fill(0.1),
			});
			expect(totals).toEqual({ subtotal: 10, total: 10 });
		});

		it("floors an over-large stale discount at zero before adding tax", () => {
			// e.g. a $200 fixed discount left behind after line items shrank to $50
			const totals = computeInvoiceTotals({
				lineTotals: [50],
				discountAmount: 200,
				taxAmount: 10,
			});
			expect(totals).toEqual({ subtotal: 50, total: 10 });
		});
	});
});
