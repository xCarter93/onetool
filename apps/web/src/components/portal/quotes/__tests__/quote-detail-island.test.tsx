// @vitest-environment jsdom
//
// Plan 14-10: Gap 6 fallback gate. When a quote is already resolved
// (status='approved' or 'declined') but the portal `latestApproval` audit row
// is null OR stale (CR-02 documentVersion mismatch), the rail must render the
// new ResolvedStatusPanel — never the approve/decline form.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";

if (!window.matchMedia) {
	Object.defineProperty(window, "matchMedia", {
		writable: true,
		value: vi.fn().mockImplementation((query: string) => ({
			matches: false,
			media: query,
			onchange: null,
			addListener: vi.fn(),
			removeListener: vi.fn(),
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			dispatchEvent: vi.fn(),
		})),
	});
}

vi.mock("next/navigation", () => ({
	useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
	useParams: () => ({ clientPortalId: "abc", quoteId: "q1" }),
	usePathname: () => "/portal/c/abc/quotes/q1",
}));
vi.mock("next/link", () => ({
	__esModule: true,
	default: ({ children, ...rest }: any) => <a {...rest}>{children}</a>,
}));
// Force desktop branch (rail) so we exercise the rail render path.
vi.mock("@/hooks/use-media-query", () => ({ useMediaQuery: () => true }));

const useQueryMock = vi.fn();
vi.mock("convex/react", () => ({
	useQuery: (...args: any[]) => useQueryMock(...args),
	useMutation: () => vi.fn(),
	useAction: () => vi.fn(),
}));
vi.mock("@onetool/backend/convex/_generated/api", () => ({
	api: {
		portal: {
			quotes: {
				get: "portal.quotes.get",
				approve: "portal.quotes.approve",
				decline: "portal.quotes.decline",
			},
		},
	},
}));

import { QuoteDetailIsland } from "../quote-detail-island";

const baseQuote = {
	_id: "q1",
	orgId: "o1",
	clientId: "c1",
	quoteNumber: "Q-000009",
	title: "Lawn",
	total: 92000,
	validUntil: undefined,
	sentAt: 1699000000000,
};
const baseDoc = { _id: "d1", version: 2, storageId: "s1" };

beforeEach(() => {
	useQueryMock.mockReset();
});
afterEach(() => {
	cleanup();
});

describe("QuoteDetailIsland — Gap 6 fallback gate", () => {
	it("Test A: status=approved + latestApproval=null renders ResolvedStatusPanel, not the form", () => {
		useQueryMock.mockReturnValue({
			quote: { ...baseQuote, status: "approved", approvedAt: 1700000000000 },
			lineItems: [],
			latestDocument: baseDoc,
			businessName: "Acme",
			clientName: "Jane",
			clientEmail: "jane@example.com",
			latestApproval: null,
		});
		render(<QuoteDetailIsland quoteId={"q1" as any} />);
		// Resolved panel role=status with "Approved" label inside.
		const statusRegion = screen.getByRole("status");
		expect(statusRegion).toHaveTextContent(/Approved/i);
		// Form not rendered
		expect(
			screen.queryByRole("button", { name: /Approve quote/i }),
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: /Decline this quote/i }),
		).not.toBeInTheDocument();
	});

	it("Test B: status=declined + latestApproval=null renders declined fallback, not form", () => {
		useQueryMock.mockReturnValue({
			quote: { ...baseQuote, status: "declined", declinedAt: 1700000001000 },
			lineItems: [],
			latestDocument: baseDoc,
			businessName: "Acme",
			clientName: "Jane",
			clientEmail: "jane@example.com",
			latestApproval: null,
		});
		render(<QuoteDetailIsland quoteId={"q1" as any} />);
		const statusRegion = screen.getByRole("status");
		expect(statusRegion).toHaveTextContent(/Declined/i);
		expect(
			screen.queryByRole("button", { name: /Approve quote/i }),
		).not.toBeInTheDocument();
	});

	it("Test C: matching latestApproval renders full ApprovalReceipt, not the fallback", () => {
		useQueryMock.mockReturnValue({
			quote: { ...baseQuote, status: "approved", approvedAt: 1700000000000 },
			lineItems: [],
			latestDocument: baseDoc,
			businessName: "Acme",
			clientName: "Jane",
			clientEmail: "jane@example.com",
			latestApproval: {
				auditId: "a1",
				action: "approved",
				createdAt: 1700000000000,
				documentVersion: 2,
				lineItemsCount: 2,
				total: 92000,
				signatureUrl: "https://example.com/sig.png",
			},
		});
		render(<QuoteDetailIsland quoteId={"q1" as any} />);
		// ApprovalReceipt-specific text — "Approved by Jane" is rendered in the
		// always-visible header (clientEmail is collapsed behind the expandable
		// receipt view; we don't depend on that detail here).
		expect(screen.getByText(/Approved by/i)).toBeInTheDocument();
		expect(screen.getByText("Jane")).toBeInTheDocument();
		// And the SignatureCard form should NOT be present (receipt path wins).
		expect(
			screen.queryByRole("button", { name: /Approve quote/i }),
		).not.toBeInTheDocument();
	});

	it("Test D: status=approved + STALE latestApproval (documentVersion mismatch) renders ResolvedStatusPanel, not the form", () => {
		// CR-02 marks the audit row stale because documentVersion (1) !== latestDocument.version (2).
		// effectiveInitialReceipt is null → resolvedFallback must fire because quote.status === "approved".
		useQueryMock.mockReturnValue({
			quote: { ...baseQuote, status: "approved", approvedAt: 1700000000000 },
			lineItems: [],
			latestDocument: baseDoc, // version: 2
			businessName: "Acme",
			clientName: "Jane",
			clientEmail: "jane@example.com",
			latestApproval: {
				auditId: "a-stale",
				action: "approved",
				createdAt: 1699000000000,
				documentVersion: 1, // STALE — mismatches latestDocument.version=2
				lineItemsCount: 2,
				total: 92000,
				signatureUrl: "https://example.com/sig.png",
			},
		});
		render(<QuoteDetailIsland quoteId={"q1" as any} />);
		const statusRegion = screen.getByRole("status");
		expect(statusRegion).toHaveTextContent(/Approved/i);
		expect(
			screen.queryByRole("button", { name: /Approve quote/i }),
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: /Decline this quote/i }),
		).not.toBeInTheDocument();
		// ResolvedStatusPanel does NOT render clientEmail (this is fallback, not full receipt).
		expect(screen.queryByText(/jane@example\.com/i)).not.toBeInTheDocument();
	});
});
