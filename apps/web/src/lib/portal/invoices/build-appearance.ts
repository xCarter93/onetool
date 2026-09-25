import type { Appearance } from "@stripe/stripe-js";

// Stripe Elements cannot resolve the page's CSS custom properties inside its iframe.
export function buildPortalAppearance(isDark: boolean): Appearance {
	const primary = isDark ? "#38bdf8" : "#0073ad";
	const background = isDark ? "#2d2d2d" : "#ffffff";
	const foreground = isDark ? "#ededed" : "#202e37";
	const secondary = isDark ? "#b8b8b8" : "#65717b";
	const inputBorder = isDark ? "#787878" : "#c2c8dd";

	return {
		theme: "stripe",
		variables: {
			colorPrimary: primary,
			colorBackground: background,
			colorText: foreground,
			colorTextSecondary: secondary,
			colorDanger: isDark ? "#fa7e8d" : "#cf263c",
			colorSuccess: isDark ? "#64ca80" : "#24813e",
			fontFamily:
				'"Outfit", system-ui, -apple-system, "Segoe UI", sans-serif',
			fontSizeBase: "16px",
			spacingUnit: "4px",
			borderRadius: "4px",
		},
		rules: {
			".Input": { border: `1px solid ${inputBorder}` },
			".Input:focus": { boxShadow: `0 0 0 2px ${primary}` },
			".Label": { fontSize: "14px", fontWeight: "600", color: foreground },
			".Tab--selected": {
				borderColor: primary,
				boxShadow: `0 0 0 1px ${primary}`,
			},
		},
	};
}
