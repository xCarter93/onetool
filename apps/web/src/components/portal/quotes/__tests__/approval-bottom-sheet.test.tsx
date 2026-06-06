// @vitest-environment jsdom
//
// Plan 14-08 Gap 4 regression suite: ensures the docked Approve CTA is
// reachable on viewports below 768px (where the portal MobileTabBar would
// otherwise paint over it at the same z-index).
//
// Test A: at iPhone-XR-class viewport (<768px), ApprovalBottomSheet renders
//         a docked Approve CTA element.
// Test B: the docked wrapper has a stacking context above z-30 (z-40 or
//         higher) so even if the MobileTabBar leaks through, the sheet wins.
// Test C: quote-detail-island uses the (min-width: 768px) breakpoint so the
//         desktop/mobile split aligns with PortalShell's md boundary —
//         removing the 256px no-mans-land at 768-1023px.
// Test D: PortalShell either route-suppresses the MobileTabBar on the
//         /portal/c/{id}/quotes/{quoteId} route OR the sheet uses z>=40
//         (defense-in-depth contract; either implementation passes).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
	describe,
	it,
	expect,
	vi,
	afterEach,
} from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";

// jsdom does not implement matchMedia. Stub before any render.
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

// Force the mobile branch (sheet, not rail) — the sheet is what we render
// directly anyway, but if any transitive import touches the hook, this keeps
// it honest at <768px.
vi.mock("@/hooks/use-media-query", () => ({
	useMediaQuery: () => false,
}));

afterEach(() => {
	cleanup();
});

import { ApprovalBottomSheet } from "../approval-bottom-sheet";

const baseQuote = {
	_id: "q1",
	quoteNumber: "Q-001",
	title: "Lawn Care",
	status: "sent",
	total: 92000,
};
const baseDoc = { _id: "d1", version: 2 };

function renderSheet() {
	return render(
		<ApprovalBottomSheet
			quote={baseQuote}
			latestDocument={baseDoc}
			businessName="Acme Landscape"
			clientName="Jane Client"
			clientEmail="jane@example.com"
		/>,
	);
}

describe("ApprovalBottomSheet — Gap 4 regression (sub-768px)", () => {
	it("Test A (Gap 4): docked Approve CTA renders at <768px viewport", () => {
		renderSheet();
		expect(
			screen.getByRole("button", { name: /Approve quote/i }),
		).toBeInTheDocument();
	});

	it("Test B (Gap 4): docked sheet wrapper has z-index above the MobileTabBar (z-30)", () => {
		const { container } = renderSheet();
		// Outermost docked wrapper: a `fixed inset-x-0 bottom-0` element marked
		// with the stable `data-sheet-docked` attribute.
		const docked =
			container.querySelector("[data-sheet-docked]") ??
			container.querySelector(".fixed.inset-x-0.bottom-0");
		expect(docked).toBeTruthy();
		const className = docked?.getAttribute("class") ?? "";
		// Must be z-40, z-50, or arbitrary z-[4x|5x].
		expect(className).toMatch(/z-(40|50|\[4\d\]|\[5\d\])/);
	});

	it("Test C (Gap 4): quote-detail-island uses md (768px) breakpoint to match PortalShell", () => {
		const src = readFileSync(
			resolve(__dirname, "../quote-detail-island.tsx"),
			"utf8",
		);
		expect(src).toMatch(/useMediaQuery\(['"]\(min-width:\s*768px\)['"]\)/);
		expect(src).not.toMatch(
			/useMediaQuery\(['"]\(min-width:\s*1024px\)['"]\)/,
		);
	});

	it("Test D (Gap 4): PortalShell suppresses MobileTabBar on the quote-detail route OR sheet uses z>=40", () => {
		const shellSrc = readFileSync(
			resolve(__dirname, "../../portal-shell.tsx"),
			"utf8",
		);
		const sheetSrc = readFileSync(
			resolve(__dirname, "../approval-bottom-sheet.tsx"),
			"utf8",
		);
		const shellSuppressesTabBar =
			/hideMobileTabBar|hideTabBar|suppressTabBar|isQuoteDetail/.test(
				shellSrc,
			);
		// Pin the DOCKED wrapper specifically (not the expanded modal which
		// already uses z-40). The data-sheet-docked attribute is the stable
		// selector added by the fix.
		const sheetDockedUsesHighZ = /data-sheet-docked[\s\S]{0,400}z-(40|50|\[4\d\]|\[5\d\])|z-(40|50|\[4\d\]|\[5\d\])[\s\S]{0,400}data-sheet-docked/.test(
			sheetSrc,
		);
		expect(shellSuppressesTabBar || sheetDockedUsesHighZ).toBe(true);
	});
});
