import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Id } from "../convex/_generated/dataModel";

vi.mock("@react-pdf/renderer", () => ({
	Document: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	Page: ({ children }: React.PropsWithChildren) => <main>{children}</main>,
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
	View: ({ children }: React.PropsWithChildren) => (
		<section>{children}</section>
	),
	Image: () => <div />,
	StyleSheet: { create: <T,>(styles: T) => styles },
}));

let QuotePDF: typeof import("./QuotePDF").QuotePDF;
let formatRecurringPaymentRule: typeof import("./QuotePDF").formatRecurringPaymentRule;

beforeAll(async () => {
	const module = await import("./QuotePDF");
	QuotePDF = module.QuotePDF;
	formatRecurringPaymentRule = module.formatRecurringPaymentRule;
});

const baseQuote = {
	_id: "quote-1" as Id<"quotes">,
	_creationTime: Date.UTC(2026, 8, 6),
	quoteNumber: "Q-1042",
	subtotal: 125,
	total: 125,
	recurringAgreementTerms: {
		schemaVersion: 1 as const,
		revisionId: "revision-1" as Id<"projectSeriesAgreementRevisions">,
		seriesId: "series-1" as Id<"projectSeries">,
		revisionNumber: 2,
		agreementReference: "Q-1042",
		client: { id: "client-1" as Id<"clients">, name: "Pine Street Market" },
		property: {
			id: "property-1" as Id<"clientProperties">,
			name: "North shop",
			address: "14 Oak Street",
		},
		scope: {
			title: "Weekly grounds care",
			description: "Mow and edge the front lot.",
		},
		schedule: {
			rule: { frequency: "weekly" as const, interval: 1, weekdays: [1] },
			anchorDateKey: "2026-09-07",
			timezone: "America/New_York",
		},
		billingMode: "per_visit" as const,
		paymentRule: {
			type: "percentage" as const,
			installments: [{ percentage: 100, dayOffset: 30 }],
		},
	},
};

describe("QuotePDF recurring agreements", () => {
	it("renders the agreement terms and keeps signature fields on the source", () => {
		const html = renderToStaticMarkup(
			<QuotePDF quote={baseQuote} items={[]} />,
		);

		expect(html).toContain("RECURRING AGREEMENT");
		expect(html).toContain("Q-1042 (revision 2)");
		expect(html).toContain("Weekly grounds care");
		expect(html).toContain("Weekly on Mon");
		expect(html).toContain("100% due 30 days after issue");
		expect(html).toContain("Client Signature:");
	});

	it("labels inherited approval without rendering another signature request", () => {
		const html = renderToStaticMarkup(
			<QuotePDF
				quote={{ ...baseQuote, recurringInheritedAt: Date.UTC(2026, 8, 7) }}
				items={[]}
				countersigner={{ name: "Morgan Lee", email: "morgan@example.com" }}
			/>,
		);

		expect(html).toContain("Approved under recurring agreement Q-1042");
		expect(html).not.toContain("Client Signature:");
		expect(html).not.toContain("Authorized by");
		expect(html).not.toContain("client_signature");
	});

	it("describes percentage installments", () => {
		expect(
			formatRecurringPaymentRule({
				type: "percentage",
				installments: [
					{ percentage: 40, dayOffset: 0 },
					{ percentage: 60, dayOffset: 30 },
				],
			}),
		).toBe("40% due when issued; 60% due 30 days after issue");
	});

	it("states when a coordinated monthly payment change begins", () => {
		const html = renderToStaticMarkup(
			<QuotePDF
				quote={{
					...baseQuote,
					recurringAgreementTerms: {
						...baseQuote.recurringAgreementTerms,
						paymentChangeActivation:
							"next_full_month_after_all_approvals" as const,
					},
				}}
				items={[]}
			/>,
		);
		expect(html).toContain(
			"This payment arrangement starts with the next full calendar month after all affected recurring agreements are approved. Existing terms apply until then.",
		);
	});
});
