// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrandHeader } from "@/components/portal/brand-header";
import { PoweredByOneTool } from "@/components/portal/powered-by-onetool";

describe("portal layout", () => {
	it("renders business logo, business name, and 'Powered by OneTool' footer from getPortalBranding result", () => {
		const branding = {
			clientPortalId: "abc",
			logoUrl: "https://example.com/logo.png",
			logoInvertInDarkMode: false,
			name: "Acme Co",
		};

		render(
			<div>
				<BrandHeader
					logoUrl={branding.logoUrl}
					businessName={branding.name}
					logoInvertInDarkMode={branding.logoInvertInDarkMode}
				/>
				<PoweredByOneTool />
			</div>,
		);

		expect(screen.getByAltText("Acme Co logo")).toBeTruthy();
		expect(screen.getByText("Acme Co")).toBeTruthy();
		expect(screen.getByLabelText("Powered by OneTool")).toBeTruthy();
	});
});
