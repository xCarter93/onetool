import { StyleSheet, Platform } from "react-native";

// ============================================================================
// OneTool mobile design tokens — LIGHT MODE ONLY (locked decision, PRD §5).
//
// Values are ported literally from the approved 2.0 redesign mockup
// (PRD-mobile-redesign §10, artifact 44bc71a9). Direction: tighten, don't
// rebrand — Outfit stays, radii drop (cards 28→12, controls →8), sky blue is
// demoted to primary actions + active states, chrome goes neutral.
//
// Names are semantic (`surface`/`ink`/`line`) so dark mode stays a cheap future
// option even though it is explicitly out of scope.
// ============================================================================

// Font family - Outfit, matching the web app. Names map to @expo-google-fonts/outfit.
// Only 400/500/600/700 are loaded (app/_layout.tsx) — the mockup's 550/650 weights
// round to medium/semibold.
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
// Palette — the single token source. Literal hex, mockup `--app-*` variables.
// ----------------------------------------------------------------------------
export const tokens = {
	// Brand / accent — actions and active states ONLY, never chrome decoration.
	brand: "#00a6f4",
	accent: "#00a6f4",
	primary: "#00a6f4",
	primaryInk: "#0084d1", // active-tab label, pressed states
	primaryTint: "#e6f5fd", // soft blue fill behind primary glyphs
	accentSoft: "#00a6f41A", // 10% blue
	accentMid: "#00a6f433", // 20% blue

	// "Frosted blue" primary actions — parity with web's `.cn-button-variant-default`
	// (`bg-primary/10 text-primary border-primary/30 shadow-sm backdrop-blur-sm`).
	// The label is a DEEPER blue than web's `text-primary`: #00a6f4 on the 10% tint
	// is only 2.4:1, which fails AA and is unreadable in sunlight. #0369a1 keeps the
	// same blue family at 5.35:1.
	frostedBg: "#00a6f41A", // primary @ 10%
	frostedBgPressed: "#00a6f426", // primary @ 15% (web's hover)
	frostedBorder: "#00a6f44D", // primary @ 30%
	frostedInk: "#0369a1",
	/** Solid blue fills that carry WHITE glyphs (FAB): #00a6f4 + white is 2.7:1,
	 * under the 3:1 non-text minimum. #0084d1 + white is 4.0:1. */
	primarySolid: "#0084d1",

	// Semantic
	success: "#0a9d6c",
	warning: "#b45309",
	warningBg: "#fef7ec",
	warningLine: "#f3e3c8",
	danger: "#dc2626",
	destructive: "#dc2626",
	info: "#075985",

	// Ink / text
	fg: "#17181a",
	foreground: "#17181a",
	ink: "#17181a",
	sub: "#71767d", // secondary / metadata
	muted2: "#71767d",
	faint: "#9aa0a6", // group labels, chevrons, placeholders
	mutedForeground: "#71767d",
	warningFg: "#b45309",

	// Surfaces
	bg: "#f6f7f8",
	background: "#f6f7f8",
	card: "#ffffff",
	popover: "#ffffff",
	muted: "#f6f7f8",
	secondary: "#eceef0", // segmented track
	sidebar: "#ffffff",
	surface: "#f6f7f8",

	// Lines
	line: "#e4e6e8", // card / control borders
	lineSoft: "#edeff1", // in-card row dividers (hairlines)
	border: "#e4e6e8",
	input: "#e4e6e8",
	ring: "#0084d1",
	checkbox: "#c8cdd2",

	// Chart ramp (web parity)
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
// Badge tones — soft-tint pairs, quieter than the old saturated pills.
// ----------------------------------------------------------------------------
export type BadgeTone = "ok" | "info" | "warn" | "late" | "mute";

export const badgeTone: Record<BadgeTone, { fg: string; bg: string }> = {
	ok: { fg: "#0a9d6c", bg: "#e9f6f0" },
	info: { fg: "#075985", bg: "#e6f2f9" },
	warn: { fg: "#b45309", bg: "#fef7ec" },
	late: { fg: "#dc2626", bg: "#fceded" },
	mute: { fg: "#64748b", bg: "#eef1f4" },
};

// ----------------------------------------------------------------------------
// STATUS map — canonical status → label + tone. `c` (solid color) is kept for
// back-compat with callers that tint their own glyphs.
// ----------------------------------------------------------------------------
export const STATUS = {
	active: { label: "Active", tone: "ok", c: badgeTone.ok.fg },
	lead: { label: "Lead", tone: "info", c: badgeTone.info.fg },
	inactive: { label: "Inactive", tone: "mute", c: badgeTone.mute.fg },
	archived: { label: "Archived", tone: "mute", c: badgeTone.mute.fg },
	planned: { label: "Planned", tone: "info", c: badgeTone.info.fg },
	"in-progress": { label: "In Progress", tone: "warn", c: badgeTone.warn.fg },
	completed: { label: "Completed", tone: "ok", c: badgeTone.ok.fg },
	cancelled: { label: "Cancelled", tone: "late", c: badgeTone.late.fg },
	draft: { label: "Draft", tone: "mute", c: badgeTone.mute.fg },
	sent: { label: "Sent", tone: "info", c: badgeTone.info.fg },
	approved: { label: "Approved", tone: "ok", c: badgeTone.ok.fg },
	paid: { label: "Paid", tone: "ok", c: badgeTone.ok.fg },
	overdue: { label: "Overdue", tone: "late", c: badgeTone.late.fg },
	declined: { label: "Declined", tone: "late", c: badgeTone.late.fg },
	expired: { label: "Expired", tone: "mute", c: badgeTone.mute.fg },
	pending: { label: "Pending", tone: "warn", c: badgeTone.warn.fg },
	refunded: { label: "Refunded", tone: "mute", c: badgeTone.mute.fg },
	visited: { label: "Visited", tone: "ok", c: badgeTone.ok.fg },
	skipped: { label: "Skipped", tone: "mute", c: badgeTone.mute.fg },
	saved: { label: "Saved", tone: "mute", c: badgeTone.mute.fg },
} as const satisfies Record<
	string,
	{ label: string; tone: BadgeTone; c: string }
>;

// ----------------------------------------------------------------------------
// Record-type tints — the Work list's leading type icon (bg + glyph color).
// ----------------------------------------------------------------------------
export const recordTint = {
	client: { bg: "#e7f3fb", fg: "#0369a1" },
	project: { bg: "#eef2e9", fg: "#4d7c0f" },
	quote: { bg: "#f5eefa", fg: "#7e22ce" },
	invoice: { bg: "#fdf0e7", fg: "#c2410c" },
	route: { bg: "#e9f0f4", fg: "#33566b" },
	task: { bg: "#edf1f5", fg: "#475569" },
} as const;

export type RecordKind = keyof typeof recordTint;

// Create-sheet glyph colors (legacy — the /create mega-menu is on the kill list,
// contextual header "+" replaces it).
export const createGlyph = {
	task: tokens.primary,
	quote: badgeTone.ok.fg,
	invoice: badgeTone.warn.fg,
	client: recordTint.client.fg,
	project: recordTint.project.fg,
} as const;

// ----------------------------------------------------------------------------
// Legacy export names — re-pointed at the palette so wrapped screens reskin
// automatically. KEEP these names; downstream screens import them.
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

// Spacing constants — 4px base unit; 18 is the screen gutter from the mockup.
export const spacing = {
	xs: 4,
	sm: 8,
	md: 16,
	gutter: 18,
	lg: 24,
	xl: 32,
} as const;

// ----------------------------------------------------------------------------
// Radii — the visual-tightening core. Cards 12, controls 8; nothing above 20
// except pills. The old soft 20/24/28 values are re-pointed, not deleted, so
// existing callers tighten without edits.
// ----------------------------------------------------------------------------
export const radii = {
	xs: 4,
	sm: 6,
	md: 8,
	lg: 8,
	xl: 10,
	"2xl": 12,
	"3xl": 12,
	"4xl": 14,
	// semantic aliases — prefer these in new code
	card: 12,
	ctrl: 8,
	chip: 999,
	pill: 999,
	sheet: 20, // bottom-sheet top corners
	fab: 18,
	// legacy names (were 20 / 14 / 28)
	r: 12,
	rSm: 10,
	rLg: 12,
} as const;

// Legacy radius export (kept for back-compat).
export const radius = {
	sm: 4,
	md: radii.ctrl,
	lg: radii.card,
	xl: radii.card,
	full: 9999,
} as const;

// ----------------------------------------------------------------------------
// Type scale (Outfit, px) — mockup values. Stronger hierarchy: big semibold
// titles, uppercase tracked eyebrows, dense 13.5/12 list rows.
// ----------------------------------------------------------------------------
export const type = {
	display: 34,
	h1: 24, // greeting / screen title
	h2: 20, // pane titles (iPad)
	h3: 16, // sheet titles
	h4: 14,
	body: 14,
	rowTitle: 13.5, // dense list row primary
	sm: 12.5,
	meta: 12, // row metadata
	xs: 11.5,
	eyebrow: 11.5, // uppercase + 0.1em tracking
	micro: 10.5, // badges, tab labels
} as const;

// Letter spacing for the tracked/uppercase roles.
export const tracking = {
	eyebrow: 1.2, // ~0.1em at 11.5px
	groupLabel: 1, // ~0.09em at 11.5px
	title: -0.24, // ~-0.01em at 24px
} as const;

// ----------------------------------------------------------------------------
// Shadows — use boxShadow (NEVER legacy shadow*/elevation props).
// Cards are FLAT (border only) by decision; shadow is reserved for things that
// genuinely float: the FAB, bottom sheets, floating map chips.
// ----------------------------------------------------------------------------
export const shadow = {
	xs: "0 1px 2px rgba(23,24,26,0.04)",
	sm: "0 1px 2px rgba(0,0,0,0.06)",
	md: "0 2px 10px rgba(0,0,0,0.08)",
	lg: "0 8px 20px -6px rgba(0,0,0,0.18)",
	/** Near-invisible; cards should normally carry no shadow at all. */
	card: "0 1px 2px rgba(23,24,26,0.04)",
	fab: "0 8px 20px -6px rgba(0,132,209,0.55)",
	sheet: "0 -8px 32px rgba(15,30,40,0.16)",
	floatChip: "0 2px 10px rgba(0,0,0,0.08)",
	segmented: "0 1px 2px rgba(0,0,0,0.06)",
} as const;

// Minimum tappable size (WCAG 2.1 AA / Apple HIG). Pair with hitSlop on
// anything whose painted box is smaller.
export const touch = { min: 44 } as const;

// ----------------------------------------------------------------------------
// Common styles — read the palette values.
// ----------------------------------------------------------------------------
export const styles = StyleSheet.create({
	heading: {
		fontSize: type.h2,
		fontFamily: fontFamily.semibold,
		color: colors.foreground,
	},
	cardTitle: {
		fontSize: type.body,
		fontFamily: fontFamily.semibold,
		color: colors.foreground,
	},
	text: {
		fontSize: type.body,
		fontFamily: fontFamily.regular,
		color: colors.foreground,
	},
	mutedText: {
		fontSize: type.sm,
		fontFamily: fontFamily.regular,
		color: colors.mutedForeground,
	},

	card: {
		backgroundColor: colors.card,
		borderRadius: radii.card,
		padding: spacing.md,
		borderWidth: 1,
		borderColor: tokens.line,
	},

	// Frosted-blue primary — parity with web's default button variant.
	primaryButton: {
		backgroundColor: tokens.frostedBg,
		borderWidth: 1,
		borderColor: tokens.frostedBorder,
		borderRadius: radii.ctrl,
		minHeight: 44,
		paddingVertical: 12,
		paddingHorizontal: spacing.md,
		alignItems: "center" as const,
		justifyContent: "center" as const,
	},
	primaryButtonText: {
		color: tokens.frostedInk,
		fontSize: type.body,
		fontFamily: fontFamily.semibold,
	},

	input: {
		backgroundColor: colors.card,
		borderWidth: 1,
		borderColor: tokens.line,
		borderRadius: radii.ctrl,
		paddingVertical: 11,
		paddingHorizontal: 12,
		fontSize: type.body,
		fontFamily: fontFamily.regular,
		color: colors.foreground,
	},

	/** Hairline divider between rows inside a card. */
	hairline: {
		borderTopWidth: 1,
		borderTopColor: tokens.lineSoft,
	},
});
