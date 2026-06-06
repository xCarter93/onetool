// @vitest-environment jsdom
//
// Plan 14.1-03 Task 4: Download PDF button in portal quote-detail header chrome.
// User decision D-1 (2026-05-10): client uses window.open(url, "_blank",
// "noopener,noreferrer") to preserve portal context and sidestep JSDOM
// window.location brittleness. Tests spy on window.open as a clean mock surface.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

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
vi.mock("@/hooks/use-media-query", () => ({ useMediaQuery: () => true }));

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
	useToast: () => ({
		error: toastError,
		success: vi.fn(),
		warning: vi.fn(),
		info: vi.fn(),
		loading: vi.fn(),
		addToast: vi.fn(),
		removeToast: vi.fn(),
		updateToast: vi.fn(),
		toasts: [],
	}),
}));

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
	status: "sent" as const,
	total: 92000,
	validUntil: undefined,
	sentAt: 1699000000000,
};
const baseDoc = { _id: "d1", version: 2, storageId: "s1" };

beforeEach(() => {
	useQueryMock.mockReset();
	toastError.mockReset();
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("QuoteDetailIsland — Download PDF button (Plan 14.1-03)", () => {
	it("Test 1 — shows button when latestDocument is set; click opens new tab via window.open [user decision D-1]", async () => {
		useQueryMock.mockReturnValue({
			quote: baseQuote,
			lineItems: [],
			latestDocument: baseDoc,
			businessName: "Acme",
			clientName: "Jane",
			clientEmail: "jane@example.com",
			latestApproval: null,
		});

		const openSpy = vi
			.spyOn(window, "open")
			.mockImplementation(() => null);

		const mockFetch = vi.fn(
			async () =>
				({
					ok: true,
					status: 200,
					json: async () => ({ url: "https://convex.example/x.pdf" }),
				}) as unknown as Response,
		);
		vi.stubGlobal("fetch", mockFetch);

		render(<QuoteDetailIsland quoteId={"q1" as any} />);
		const btn = await screen.findByRole("button", {
			name: /Download PDF/i,
		});
		expect(btn).toBeInTheDocument();
		fireEvent.click(btn);

		await waitFor(() => {
			expect(mockFetch).toHaveBeenCalledWith("/api/portal/quotes/q1/pdf");
			expect(openSpy).toHaveBeenCalledWith(
				"https://convex.example/x.pdf",
				"_blank",
				"noopener,noreferrer",
			);
		});
		expect(toastError).not.toHaveBeenCalled();

		openSpy.mockRestore();
	});

	it("Test 2 — hides button when latestDocument is null (pre-publish)", async () => {
		useQueryMock.mockReturnValue({
			quote: baseQuote,
			lineItems: [],
			latestDocument: null,
			businessName: "Acme",
			clientName: "Jane",
			clientEmail: "jane@example.com",
			latestApproval: null,
		});

		render(<QuoteDetailIsland quoteId={"q1" as any} />);
		expect(
			screen.queryByRole("button", { name: /Download PDF/i }),
		).not.toBeInTheDocument();
	});

	it("Test 3 — shows toast.error on fetch !ok response with verbatim copy [REVIEWS MEDIUM]", async () => {
		useQueryMock.mockReturnValue({
			quote: baseQuote,
			lineItems: [],
			latestDocument: baseDoc,
			businessName: "Acme",
			clientName: "Jane",
			clientEmail: "jane@example.com",
			latestApproval: null,
		});

		const openSpy = vi
			.spyOn(window, "open")
			.mockImplementation(() => null);
		const mockFetch = vi.fn(
			async () =>
				({
					ok: false,
					status: 500,
					json: async () => ({}),
				}) as unknown as Response,
		);
		vi.stubGlobal("fetch", mockFetch);

		render(<QuoteDetailIsland quoteId={"q1" as any} />);
		const btn = await screen.findByRole("button", {
			name: /Download PDF/i,
		});
		fireEvent.click(btn);

		await waitFor(() => {
			expect(toastError).toHaveBeenCalledWith(
				"Couldn't open PDF. Please try again.",
			);
		});
		expect(openSpy).not.toHaveBeenCalled();

		openSpy.mockRestore();
	});
});
