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

describe("rate column header (Finding 1)", () => {
	const baseQuote = {
		quoteNumber: "Q-001",
		title: "Test",
		subtotal: 125,
		taxAmount: 0,
		total: 125,
		terms: undefined,
	} as const;

	it("renders 'Rate' as the unit-price column header (not 'Unit')", () => {
		render(
			<QuotePaper
				quote={baseQuote}
				lineItems={[
					{ description: "Item A", quantity: 1, rate: 125, amount: 125, sortOrder: 0 },
				]}
				businessName="Acme"
			/>,
		);
		expect(screen.getByRole("columnheader", { name: /^rate$/i })).toBeInTheDocument();
		expect(screen.queryByRole("columnheader", { name: /^unit$/i })).not.toBeInTheDocument();
	});

	it("renders the rate cell value alongside the Rate column", () => {
		render(
			<QuotePaper
				quote={baseQuote}
				lineItems={[
					{ description: "Item A", quantity: 1, rate: 125, amount: 125, sortOrder: 0 },
				]}
				businessName="Acme"
			/>,
		);
		// $125.00 appears in: rate cell, amount cell, subtotal, total — multiple matches expected.
		expect(screen.getAllByText("$125.00").length).toBeGreaterThan(0);
	});
});

describe("recurring agreement presentation", () => {
	it("prints the contract total when the schedule ends after a visit count", () => {
		render(
			<QuotePaper
				businessName="Pine Street Grounds"
				quote={{
					quoteNumber: "Q-1042",
					title: "Weekly grounds care",
					subtotal: 125.1,
					taxAmount: 0,
					total: 125.1,
					recurringAgreementTerms: {
						schemaVersion: 1,
						revisionId: "revision-1" as never,
						seriesId: "series-1" as never,
						revisionNumber: 1,
						agreementReference: "Q-1042",
						client: { id: "client-1" as never, name: "North Shop" },
						scope: { title: "Weekly grounds care" },
						schedule: { rule: { frequency: "weekly", interval: 1, end: { kind: "count", count: 12 } }, anchorDateKey: "2026-09-07", timezone: "America/New_York" },
						billingMode: "monthly",
						paymentRule: { type: "percentage", installments: [{ percentage: 100, dayOffset: 30 }] },
					},
				}}
				lineItems={[]}
			/>
		);

		expect(screen.getByText("$125.10 per visit")).toBeVisible();
		expect(screen.getByText("For 12 visits")).toBeVisible();
		expect(screen.getByText("Billed monthly for completed visits")).toBeVisible();
	});

	it("hides the agreement commitment on a visit override", () => {
		render(
			<QuotePaper
				businessName="Pine Street Grounds"
				quote={{
					quoteNumber: "Q-1044",
					title: "September visit",
					subtotal: 180,
					taxAmount: 0,
					total: 180,
					recurringQuoteOverride: true,
					recurringAgreementTerms: {
						schemaVersion: 1,
						revisionId: "revision-1" as never,
						seriesId: "series-1" as never,
						revisionNumber: 1,
						agreementReference: "Q-1042",
						client: { id: "client-1" as never, name: "North Shop" },
						scope: { title: "Weekly grounds care" },
						schedule: { rule: { frequency: "weekly", interval: 1, end: { kind: "count", count: 12 } }, anchorDateKey: "2026-09-07", timezone: "America/New_York" },
						billingMode: "per_visit",
						paymentRule: { type: "percentage", installments: [{ percentage: 100, dayOffset: 30 }] },
					},
				}}
				lineItems={[]}
			/>
		);

		expect(screen.queryByText("$180.00 per visit")).not.toBeInTheDocument();
		expect(screen.queryByText("For 12 visits")).not.toBeInTheDocument();
	});

	it("shows inherited approval and the customer-facing agreement terms", () => {
		render(
			<QuotePaper
				businessName="Pine Street Grounds"
				quote={{
					quoteNumber: "Q-1043",
					title: "September visit",
					subtotal: 125,
					taxAmount: 0,
					total: 125,
					recurringInheritedAt: 1,
					recurringAgreementTerms: {
						schemaVersion: 1,
						revisionId: "revision-1" as never,
						seriesId: "series-1" as never,
						revisionNumber: 1,
						agreementReference: "Q-1042",
						client: { id: "client-1" as never, name: "North Shop" },
						scope: { title: "Weekly grounds care" },
						schedule: { rule: { frequency: "weekly", interval: 1, weekdays: [1] }, anchorDateKey: "2026-09-07", timezone: "America/New_York" },
						billingMode: "per_visit",
						paymentRule: { type: "percentage", installments: [{ percentage: 100, dayOffset: 30 }] },
						paymentChangeActivation: "next_full_month_after_all_approvals",
					},
				}}
				lineItems={[]}
			/>
		);

		expect(screen.getByText("Approved under recurring agreement Q-1042")).toBeVisible();
		expect(screen.getByText("Weekly grounds care")).toBeVisible();
		expect(screen.getByText("$125.00 per visit")).toBeVisible();
		expect(screen.getByText("Ongoing until cancelled")).toBeVisible();
		expect(screen.getByText("Per-visit total")).toBeVisible();
		expect(screen.getByText("100% due 30 days after issue")).toBeVisible();
		expect(screen.getByText("This payment change starts on the first full calendar month after you approve this agreement and any other recurring agreements it affects. Your current payment terms apply until then.")).toBeVisible();
	});
});
