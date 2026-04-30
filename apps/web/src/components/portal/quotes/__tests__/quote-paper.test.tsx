// @vitest-environment jsdom
//
// Plan 14-11 Gap 8: portal monetary unit regression.
//
// Pre-fix, portal `formatMoney` divided by 100, treating stored values as
// cents. In practice the workspace stores monetary values as dollars (see
// `apps/web/src/app/(workspace)/quotes/page.tsx:146` formatCurrency, which
// formats inputs without dividing). Result: a $11,000 quote rendered as $110
// in the portal — off by a factor of 100.
//
// This test pins the post-fix invariant: portal helpers format stored values
// as-is. If a future regression reintroduces /100 division, this fails.

import { describe, it, expect, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { QuotePaper } from "../quote-paper";

afterEach(cleanup);

describe("QuotePaper monetary rendering (Gap 8)", () => {
	it("renders quote.total=11000 as $11,000.00 (not $110.00)", () => {
		render(
			<QuotePaper
				businessName="Acme Field Co."
				quote={{
					quoteNumber: "Q-000001",
					title: "Driveway sealcoat",
					subtotal: 10000,
					taxAmount: 1000,
					total: 11000,
					terms: undefined,
				}}
				lineItems={[
					{
						description: "Sealcoat application",
						quantity: 1,
						unit: undefined,
						rate: 10000,
						amount: 10000,
						sortOrder: 0,
					},
				]}
			/>
		);

		expect(screen.getByText("$11,000.00")).toBeInTheDocument();
		expect(screen.getAllByText("$10,000.00").length).toBeGreaterThan(0);
		expect(screen.getByText("$1,000.00")).toBeInTheDocument();
		expect(screen.queryByText("$110.00")).not.toBeInTheDocument();
		expect(screen.queryByText("$100.00")).not.toBeInTheDocument();
	});

	it("renders fractional dollar amounts faithfully (no /100 coercion)", () => {
		render(
			<QuotePaper
				businessName="Acme"
				quote={{
					quoteNumber: "Q-000002",
					title: "Tune-up",
					subtotal: 49.5,
					taxAmount: 0,
					total: 49.5,
					terms: undefined,
				}}
				lineItems={[
					{
						description: "Inspection",
						quantity: 1,
						rate: 49.5,
						amount: 49.5,
						sortOrder: 0,
					},
				]}
			/>
		);

		expect(screen.getAllByText("$49.50").length).toBeGreaterThan(0);
		expect(screen.queryByText("$0.50")).not.toBeInTheDocument();
	});
});
