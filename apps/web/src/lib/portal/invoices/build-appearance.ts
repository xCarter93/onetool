import type { Appearance } from "@stripe/stripe-js";

// Stripe iframe cannot resolve CSS variables or OKLCH strings — these must be
// concrete hex/rgb. Values mirror the OKLCH tokens from 15-UI-SPEC §Color.
export function buildPortalAppearance(): Appearance {
	return {
		theme: "stripe",
		variables: {
			colorPrimary: "#157a3a",
			colorBackground: "#ffffff",
			colorText: "#0a0a0c",
			colorTextSecondary: "#737380",
			colorDanger: "#d4163a",
			colorSuccess: "#147a4d",
			fontFamily:
				'"Outfit", system-ui, -apple-system, "Segoe UI", sans-serif',
			fontSizeBase: "14px",
			spacingUnit: "4px",
			borderRadius: "8px",
		},
		rules: {
			".Input": { border: "1px solid #d8d8df" },
			".Input:focus": { boxShadow: "0 0 0 3px rgba(21, 122, 58, 0.25)" },
			".Label": { fontSize: "12px", fontWeight: "600", color: "#0a0a0c" },
			".Tab--selected": {
				borderColor: "#157a3a",
				boxShadow: "0 0 0 1px #157a3a",
			},
		},
	};
}
