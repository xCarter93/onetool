import { StyleSheet, Platform } from "react-native";

// ============================================================================
// Field Kit design tokens — LIGHT MODE ONLY.
// Web globals.css OKLCH→hex wins where a web token exists; the prototype's aTok
// fills the gaps. Dark mode is deferred (MOBILE-F01) — no dark branches here.
// ============================================================================

// Font family - Outfit, matching the web app. Names map to @expo-google-fonts/outfit.
export const fontFamily = {
	regular: Platform.select({
		ios: "Outfit_400Regular",
		android: "Outfit_400Regular",
		default: "Outfit_400Regular",
	}),
	medium: Platform.select({
		ios: "Outfit_500Medium",
		android: "Outfit_500Medium",
		default: "Outfit_500Medium",
	}),
	semibold: Platform.select({
		ios: "Outfit_600SemiBold",
		android: "Outfit_600SemiBold",
		default: "Outfit_600SemiBold",
	}),
	bold: Platform.select({
		ios: "Outfit_700Bold",
		android: "Outfit_700Bold",
		default: "Outfit_700Bold",
	}),
};

// ----------------------------------------------------------------------------
// Field Kit palette — the single token source. Literal hex.
// ----------------------------------------------------------------------------
export const tokens = {
	// Brand / accent (web wins)
	brand: "#00a6f4",
	accent: "#00a6f4",
	primary: "#00a6f4",
	accentSoft: "#00a6f41A", // 10% blue
	accentMid: "#00a6f433", // 20% blue

	// Semantic (web wins over aTok)
	success: "#009966", // web; aTok had #1f9d57
	warning: "#ffb900", // web; aTok had #e8930c
	danger: "#e7000b", // web; aTok had #e23b3b
	destructive: "#e7000b",

	// Ink / text
	fg: "#09090b", // web; aTok had #10151c
	foreground: "#09090b",
	ink: "#09090b",
	sub: "#5b6675", // gap (aTok)
	faint: "#8a94a3", // gap (aTok)
	mutedForeground: "#71717b",
	warningFg: "#461901", // gap (aTok)

	// Surfaces
	bg: "#f5f5f5",
	background: "#f5f5f5",
	card: "#ffffff",
	popover: "#ffffff",
	muted: "#f4f4f5",
	secondary: "#e4e4e7",
	sidebar: "#fafafa",
	surface: "#f5f7f9", // gap (aTok) — cool elevation canvas behind cards
	line: "#e9edf2", // gap (aTok) — cool card border

	// Lines / inputs
	border: "#e1e1e5",
	input: "#d4d4d8",
	ring: "#0084d1",

	// Chart ramp (web)
	chart1: "#0084d1",
	chart2: "#00bcff",
	chart3: "#74d4ff",
	chart4: "#b8e6fe",
	chart5: "#dff2fe",
	chart6: "#3ea576",
} as const;

// Static return is fine — CONTEXT allows hook OR static import; satisfies the
// "no prop-threading" decision without a real provider.
export function useTokens() {
	return tokens;
}

// ----------------------------------------------------------------------------
// STATUS pill color map — copied verbatim from direction-a.jsx (aTok colors
// intentionally retained here). Pill background = color + '18'.
// ----------------------------------------------------------------------------
export const STATUS = {
	active: { label: "Active", c: "#1f9d57" },
	lead: { label: "Lead", c: "#00a6f4" },
	inactive: { label: "Inactive", c: "#8a94a3" },
	archived: { label: "Archived", c: "#8a94a3" },
	planned: { label: "Planned", c: "#00a6f4" },
	"in-progress": { label: "In Progress", c: "#e8930c" },
	completed: { label: "Completed", c: "#1f9d57" },
	cancelled: { label: "Cancelled", c: "#e23b3b" },
	draft: { label: "Draft", c: "#8a94a3" },
	sent: { label: "Sent", c: "#00a6f4" },
	approved: { label: "Approved", c: "#1f9d57" },
	paid: { label: "Paid", c: "#1f9d57" },
	overdue: { label: "Overdue", c: "#e23b3b" },
	declined: { label: "Declined", c: "#e23b3b" },
	expired: { label: "Expired", c: "#8a94a3" },
} as const;

// Create-sheet glyph colors (gap — consumed by P24's create sheet).
export const createGlyph = {
	task: "#00a6f4",
	quote: "#1f9d57",
	invoice: "#e8930c",
	client: "#7c5cff",
	project: "#e23b3b",
} as const;

// ----------------------------------------------------------------------------
// Legacy export names — re-pointed at the Field Kit palette so wrapped screens
// reskin automatically. KEEP these names; downstream screens import them.
// ----------------------------------------------------------------------------
export const colors = {
	primary: tokens.primary,
	primaryForeground: "#ffffff",

	background: tokens.background,
	foreground: tokens.foreground,

	card: tokens.card,
	cardForeground: tokens.foreground,

	muted: tokens.muted,
	mutedForeground: tokens.mutedForeground,

	border: tokens.border,

	success: tokens.success,
	warning: tokens.warning,
	danger: tokens.danger,
	destructive: tokens.destructive,
} as const;

// Spacing constants
export const spacing = {
	xs: 4,
	sm: 8,
	md: 16,
	lg: 24,
	xl: 32,
} as const;

// Legacy radius export (kept for back-compat).
export const radius = {
	sm: 4,
	md: 8,
	lg: 12,
	xl: 16,
	full: 9999,
} as const;

// Field Kit radii scale — mobile favors the softer prototype values (r/rSm/rLg).
export const radii = {
	xs: 4,
	sm: 6,
	md: 7,
	lg: 8,
	xl: 10,
	"2xl": 12,
	"3xl": 16,
	"4xl": 24,
	r: 20,
	rSm: 14,
	rLg: 28,
} as const;

// Type scale (Outfit, px). eyebrow is UPPERCASE +0.06em; headings semibold -0.02em.
export const type = {
	display: 63,
	h1: 28,
	h2: 21,
	h3: 18,
	h4: 14,
	body: 13,
	sm: 12,
	xs: 11,
	eyebrow: 11,
} as const;

// Shadow strings — use boxShadow (NEVER legacy shadow*/elevation props).
export const shadow = {
	xs: "0 1px 2px rgba(0,0,0,0.04)",
	sm: "0 1px 2px rgba(0,0,0,0.05)",
	md: "0 4px 12px -2px rgba(0,0,0,0.08)",
	lg: "0 10px 30px -5px rgba(0,0,0,0.1)",
	card: "0 1px 2px rgba(15,23,42,0.04), 0 8px 24px -16px rgba(15,23,42,0.18)",
	fab: "0 10px 22px -6px rgba(0,166,244,0.8), 0 0 0 5px #fff",
} as const;

// ----------------------------------------------------------------------------
// Common styles — read the new palette values (color-only change).
// ----------------------------------------------------------------------------
export const styles = StyleSheet.create({
	heading: {
		fontSize: 21,
		fontFamily: fontFamily.bold,
		color: colors.foreground,
	},
	cardTitle: {
		fontSize: 14,
		fontFamily: fontFamily.semibold,
		color: colors.foreground,
	},
	text: {
		fontSize: 13,
		fontFamily: fontFamily.regular,
		color: colors.foreground,
	},
	mutedText: {
		fontSize: 13,
		fontFamily: fontFamily.regular,
		color: colors.mutedForeground,
	},

	card: {
		backgroundColor: colors.card,
		borderRadius: radius.lg,
		padding: spacing.md,
		borderWidth: 1,
		borderColor: colors.border,
	},

	primaryButton: {
		backgroundColor: colors.primary,
		borderRadius: radius.md,
		paddingVertical: spacing.sm + 4,
		paddingHorizontal: spacing.md,
		alignItems: "center" as const,
		justifyContent: "center" as const,
	},
	primaryButtonText: {
		color: colors.primaryForeground,
		fontSize: 14,
		fontWeight: "600",
	},

	input: {
		backgroundColor: colors.background,
		borderWidth: 1,
		borderColor: colors.border,
		borderRadius: radius.md,
		paddingVertical: spacing.sm + 4,
		paddingHorizontal: spacing.md,
		fontSize: 14,
		color: colors.foreground,
	},
});
