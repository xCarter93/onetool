import { describe, it, expect } from "vitest";
import {
	formatCurrency,
	parseCurrencyInput,
	roundCents,
	dollarsToCents,
} from "./money";

describe("money", () => {
	it("treats input as dollars — never cents (100x regression guard)", () => {
		expect(formatCurrency(150)).toBe("$150.00");
		expect(formatCurrency(150)).not.toBe("$1.50");
		expect(formatCurrency(1750.5)).toBe("$1,750.50");
	});

	it("supports whole and compact display for stats", () => {
		expect(formatCurrency(1234.56, { whole: true })).toBe("$1,235");
		expect(formatCurrency(1234.56, { compact: true })).toBe("$1.2K");
	});

	it("parses user input as dollars", () => {
		expect(parseCurrencyInput("$1,234.50")).toBe(1234.5);
		expect(parseCurrencyInput("99.999")).toBe(100);
		expect(parseCurrencyInput("")).toBe(0);
		expect(parseCurrencyInput("abc")).toBe(0);
	});

	it("converts to Stripe cents only via dollarsToCents", () => {
		expect(dollarsToCents(19.99)).toBe(1999);
		expect(dollarsToCents(0.1 + 0.2)).toBe(30);
	});

	it("rounds to cents, half-cents up regardless of binary representation", () => {
		expect(roundCents(0.1 + 0.2)).toBe(0.3);
		expect(roundCents(10.005)).toBe(10.01);
		// 1.005 * 100 === 100.49999999999999 — naive rounding gives 1.00
		expect(roundCents(1.005)).toBe(1.01);
		expect(dollarsToCents(1.005)).toBe(101);
	});
});
