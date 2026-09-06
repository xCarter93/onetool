import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Id } from "../convex/_generated/dataModel";

vi.mock("@react-pdf/renderer", () => ({
	Document: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	Page: ({ children }: React.PropsWithChildren) => <main>{children}</main>,
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
	View: ({ children }: React.PropsWithChildren) => <section>{children}</section>,
	Image: () => <div />,
	StyleSheet: { create: <T,>(styles: T) => styles },
}));

let InvoicePDF: typeof import("./InvoicePDF").InvoicePDF;

beforeAll(async () => {
	InvoicePDF = (await import("./InvoicePDF")).InvoicePDF;
});

describe("InvoicePDF recurring visit attribution", () => {
	it("renders the source, property, agreement, and exact visit totals", () => {
		const html = renderToStaticMarkup(
			<InvoicePDF
				invoice={{
					_id: "invoice-1" as Id<"invoices">,
					invoiceNumber: "INV-1042",
					issuedDate: Date.UTC(2026, 8, 6),
					dueDate: Date.UTC(2026, 9, 6),
					status: "sent",
					subtotal: 180,
					total: 190,
				}}
				items={[]}
				invoiceGroups={[{
					sourceProjectId: "project-1" as Id<"projects">,
					projectTitle: "Weekly grounds care",
					sourceQuoteId: "quote-1" as Id<"quotes">,
					quoteNumber: "Q-1042-3",
					agreementReference: "Q-1042",
					serviceDate: Date.UTC(2026, 8, 4),
					property: { name: "North shop", address: "14 Oak Street" },
					subtotal: 200,
					discountAmount: 20,
					taxAmount: 10,
					total: 190,
					sortOrder: 0,
				}]}
			/>,
		);

		expect(html).toContain("COVERED VISITS:");
		expect(html).toContain("Weekly grounds care");
		expect(html).toContain("North shop | 14 Oak Street");
		expect(html).toContain("Quote: Q-1042-3 | Agreement: Q-1042");
		expect(html).toContain("Discount -$20.00");
		expect(html).toContain("Visit total $190.00");
	});
});
