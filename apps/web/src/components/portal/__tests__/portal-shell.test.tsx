// @vitest-environment jsdom
//
// PortalShell sign-out teardown coverage.
//
// Regression: signing out deletes the portalSessions row server-side. Any live
// useQuery subscription (e.g. invoice-detail-island's api.portal.invoices.get)
// reactively re-runs against the now-missing row, hits getPortalSessionOrThrow's
// `if (!row) throw UNAUTHENTICATED`, and the error is pushed to the still-open
// socket — flashing the portal error boundary before navigation completes.
//
// Fix: tear down the Convex client (clearing all query listeners) BEFORE issuing
// the revoke, so the reactive transition has no subscriber to notify.

import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const order: string[] = [];
const closeSpy = vi.fn(() => {
	order.push("close");
	return Promise.resolve();
});

vi.mock("convex/react", () => ({
	useConvex: () => ({ close: closeSpy }),
}));

vi.mock("next/navigation", () => ({
	usePathname: () => "/portal/c/abc/invoices/inv_1",
}));

// Keep the shell light: stub presentational children that pull next-themes /
// next/image / next/link so the test focuses on sign-out behavior.
vi.mock("../brand-header", () => ({ BrandHeader: () => <div /> }));
vi.mock("../powered-by-onetool", () => ({
	PoweredByOneTool: () => <div data-testid="powered-by" />,
}));
vi.mock("../mobile-tab-bar", () => ({ MobileTabBar: () => <div /> }));
vi.mock("../portal-theme-switcher", () => ({
	PortalThemeSwitcher: () => <div />,
	PortalThemeIconButton: () => <div />,
}));

import { PortalShell } from "../portal-shell";

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	order.length = 0;
});

function renderShell(props: { showPoweredByBadge?: boolean } = {}) {
	return render(
		<PortalShell
			clientPortalId="abc"
			logoUrl={null}
			businessName="Acme"
			{...props}
		>
			<div>child</div>
		</PortalShell>,
	);
}

describe("PortalShell sign-out", () => {
	it("closes the Convex client before navigating away", () => {
		const assignSpy = vi.fn(() => order.push("assign"));
		Object.defineProperty(window, "location", {
			value: { assign: assignSpy },
			writable: true,
		});
		const fetchSpy = vi
			.fn(() => {
				order.push("fetch");
				return Promise.resolve({ ok: true });
			})
			.mockName("fetch");
		vi.stubGlobal("fetch", fetchSpy);

		renderShell();
		fireEvent.click(screen.getByRole("button", { name: /sign out/i }));

		expect(closeSpy).toHaveBeenCalledTimes(1);
		expect(assignSpy).toHaveBeenCalledWith(
			"/portal/c/abc/signed-out",
		);
		// Listeners must be cleared before the revoke fetch can delete the row.
		expect(order.indexOf("close")).toBeLessThan(order.indexOf("fetch"));
	});
});

// Free-plan portals carry the badge at every viewport. jsdom ignores media
// queries, so both the desktop sidebar and the mobile footer copy are in the DOM.
describe("PortalShell powered-by badge", () => {
	it("renders on mobile as well as in the desktop sidebar", () => {
		renderShell({ showPoweredByBadge: true });

		const badges = screen.getAllByTestId("powered-by");
		expect(badges).toHaveLength(2);
		// One copy must live outside the desktop-only sidebar.
		expect(
			badges.some((badge) => !badge.closest("[data-portal-sidebar]")),
		).toBe(true);
	});

	it("renders nowhere when the badge is suppressed", () => {
		renderShell({ showPoweredByBadge: false });

		expect(screen.queryAllByTestId("powered-by")).toHaveLength(0);
	});
});
