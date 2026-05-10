// @vitest-environment jsdom
//
// Plan 14.1-02 — ApprovalAuditTab RTL tests covering five behaviors:
//   1. Empty state (no portal approval, no boldsign)
//   2. Empty state (no portal rows + boldsign Completed → "Approved via BoldSign")
//   3. Most-recent row renders all audit fields + line-items snapshot + audit-pinned PDF link
//   4. Empty/null lineItemsSnapshot renders the "Snapshot not captured" placeholder
//   5. 2+ rows: older rows collapse into <details> with strict descending DOM order

import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import {
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";

vi.mock("convex/react", () => ({
	useQuery: vi.fn(),
}));

import { useQuery } from "convex/react";
import { ApprovalAuditTab } from "../approval-audit-tab";

const mockedUseQuery = vi.mocked(useQuery);

afterEach(() => {
	cleanup();
	mockedUseQuery.mockReset();
});

describe("ApprovalAuditTab (Plan 14.1-02)", () => {
	it("Test 1 — renders 'no portal approval' empty state when no rows AND no boldsign", () => {
		mockedUseQuery.mockReturnValue([]);
		render(
			<ApprovalAuditTab
				quoteId={"q1" as never}
				documentsWithSignatures={[]}
			/>,
		);
		expect(
			screen.getByText(/No portal approval recorded yet/i),
		).toBeInTheDocument();
	});

	it("Test 2 — renders 'approved via BoldSign' empty state when no rows AND boldsign completed", () => {
		mockedUseQuery.mockReturnValue([]);
		render(
			<ApprovalAuditTab
				quoteId={"q1" as never}
				documentsWithSignatures={[
					{ boldsign: { status: "Completed" } },
				]}
			/>,
		);
		// Heading + description both match the substring; assert at least one
		// rendered occurrence (getAllByText returns ≥1).
		expect(
			screen.getAllByText(/approved via BoldSign/i).length,
		).toBeGreaterThanOrEqual(1);
	});

	it("Test 3 — renders most-recent row with full audit fields, line-items snapshot, and audit-pinned PDF link", () => {
		const row = {
			auditId: "a1",
			action: "approved",
			createdAt: 1700000000000,
			documentVersion: 2,
			ipAddress: "1.2.3.4",
			userAgent: "Mozilla/5.0 (full UA string with no truncation)",
			declineReason: null,
			signatureUrl: "https://example.com/sig.png",
			signatureMode: "drawn",
			contactEmail: "client@example.com",
			documentId: "doc-v2",
			auditPinnedPdfUrl: "https://example.com/v2.pdf",
			lineItemsSnapshot: [
				{
					description: "Cleaning",
					quantity: 2,
					unit: "hr",
					rate: 50,
					amount: 100,
					sortOrder: 0,
				},
			],
			subtotalSnapshot: 100,
			taxSnapshot: 0,
			totalSnapshot: 100,
		};
		mockedUseQuery.mockReturnValue([row]);
		render(
			<ApprovalAuditTab
				quoteId={"q1" as never}
				documentsWithSignatures={[]}
			/>,
		);

		expect(screen.getByText("client@example.com")).toBeInTheDocument();
		expect(screen.getByText("1.2.3.4")).toBeInTheDocument();
		expect(
			screen.getByText(
				/Mozilla\/5\.0 \(full UA string with no truncation\)/,
			),
		).toBeInTheDocument();
		expect(screen.getByText(/Version 2/)).toBeInTheDocument();
		expect(screen.getByText("Approved")).toBeInTheDocument();

		const sig = screen.getByAltText("Client signature") as HTMLImageElement;
		expect(sig.src).toBe("https://example.com/sig.png");

		const link = screen.getByRole("link", {
			name: /Download approved-version PDF/i,
		}) as HTMLAnchorElement;
		expect(link.href).toBe("https://example.com/v2.pdf");

		const summaries = screen.getAllByText(/Line items snapshot/i);
		expect(summaries.length).toBeGreaterThanOrEqual(1);
		fireEvent.click(summaries[0]);
		expect(screen.getByText("Cleaning")).toBeInTheDocument();
		expect(screen.getByText("hr")).toBeInTheDocument();
	});

	it("Test 4 — line-items snapshot null renders 'Snapshot not captured for this approval' placeholder", () => {
		const row = {
			auditId: "a1",
			action: "approved",
			createdAt: 1700000000000,
			documentVersion: 1,
			ipAddress: "1.2.3.4",
			userAgent: "UA",
			declineReason: null,
			signatureUrl: null,
			signatureMode: null,
			contactEmail: "c@x.com",
			documentId: "doc-v1",
			auditPinnedPdfUrl: null,
			lineItemsSnapshot: null,
			subtotalSnapshot: 0,
			taxSnapshot: 0,
			totalSnapshot: 0,
		};
		mockedUseQuery.mockReturnValue([row]);
		render(
			<ApprovalAuditTab
				quoteId={"q1" as never}
				documentsWithSignatures={[]}
			/>,
		);

		const summary = screen.getByText(/Line items snapshot/i);
		fireEvent.click(summary);
		expect(
			screen.getByText(/Snapshot not captured for this approval/i),
		).toBeInTheDocument();
	});

	it("Test 5 — renders 'Show N earlier audit events' for 2+ rows with strict descending DOM order", () => {
		const newest = {
			auditId: "a3",
			action: "declined",
			createdAt: 3000,
			documentVersion: 3,
			ipAddress: "3.3.3.3",
			userAgent: "UA-3",
			declineReason: "too expensive",
			signatureUrl: null,
			signatureMode: null,
			contactEmail: "c@x.com",
			documentId: "doc-v3",
			auditPinnedPdfUrl: "https://example.com/v3.pdf",
			lineItemsSnapshot: null,
			subtotalSnapshot: 0,
			taxSnapshot: 0,
			totalSnapshot: 0,
		};
		const mid = {
			...newest,
			auditId: "a2",
			action: "approved" as const,
			createdAt: 2000,
			documentVersion: 2,
			ipAddress: "2.2.2.2",
			userAgent: "UA-2",
			declineReason: null,
			signatureUrl: "https://example.com/s2.png",
			documentId: "doc-v2",
			auditPinnedPdfUrl: "https://example.com/v2.pdf",
		};
		const old = {
			...newest,
			auditId: "a1",
			action: "approved" as const,
			createdAt: 1000,
			documentVersion: 1,
			ipAddress: "1.1.1.1",
			userAgent: "UA-1",
			declineReason: null,
			signatureUrl: "https://example.com/s1.png",
			documentId: "doc-v1",
			auditPinnedPdfUrl: "https://example.com/v1.pdf",
		};
		mockedUseQuery.mockReturnValue([newest, mid, old]);
		render(
			<ApprovalAuditTab
				quoteId={"q1" as never}
				documentsWithSignatures={[]}
			/>,
		);

		const olderSummary = screen.getByText(/Show 2 earlier audit events/i);
		expect(olderSummary).toBeInTheDocument();
		fireEvent.click(olderSummary);

		const ua2 = screen.getByText("UA-2");
		const ua1 = screen.getByText("UA-1");
		expect(
			ua2.compareDocumentPosition(ua1) &
				Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();

		const links = screen
			.getAllByRole("link", { name: /Download approved-version PDF/i })
			.map((a) => (a as HTMLAnchorElement).href);
		expect(links).toContain("https://example.com/v1.pdf");
		expect(links).toContain("https://example.com/v2.pdf");
		expect(links).toContain("https://example.com/v3.pdf");
	});
});
