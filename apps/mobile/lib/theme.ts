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
	/** @deprecated Decoration-era aliases. New code should reach for `frosted*`,
	 * `primarySolid` or `primaryInk` — a bare `accent*` tint is how sky blue got
	 * back into the chrome in the first place. ~30 pre-P1 screen call sites still
	 * bind to these; they get cleaned up as P2 rewrites each screen. */
	accentSoft: "#00a6f41A", // 10% blue
	accentMid: "#00a6f433", // 20% blue

	// "Frosted blue" primary actions — parity with web's `.cn-button-variant-default`
	// (`bg-primary/10 text-primary border-primary/30 shadow-sm backdrop-blur-sm`).
	// The label is a DEEPER blue than web's `text-primary`: #00a6f4 on the 10% tint
	// is only 2.4:1, which fails AA and is unreadable in sunlight. #0369a1 keeps the
	// same blue family at 5.35:1.
	// OPAQUE since Slice 8: the old alpha values (#00a6f4 @ 10/15/30%) let the dot
	// grid and anything underneath ghost through every frosted button. These are
	// those same tints pre-composited over `bg` #f6f7f8 — identical hue, no
	// see-through. The translucent originals live on as `frostedGlass*`, ONLY for
	// elements over a BlurView (the floating quote CTA), where alpha IS the glass.
	frostedBg: "#ddeff8", // primary @ 10% over bg
	frostedBgPressed: "#d1ebf7", // primary @ 15% over bg (web's hover)
	frostedBorder: "#acdff7", // primary @ 30% over bg
	frostedGlassBg: "#00a6f41A",
	frostedGlassBgPressed: "#00a6f426",
	frostedGlassBorder: "#00a6f44D",
	frostedInk: "#0369a1",
	/** Solid blue fills that carry WHITE content. #00a6f4 + white is 2.7:1 (under
	 * even the 3:1 non-text floor) and #0084d1 is 4.0:1 — fine for a glyph but
	 * short of the 4.5:1 a solid button's label needs. #0072b5 is 5.15:1, so one
	 * token covers both the FAB and text-bearing solids. */
	primarySolid: "#0072b5",

	// Semantic
	success: "#0a9d6c",
	warning: "#b45309",
	warningBg: "#fef7ec",
	warningLine: "#f3e3c8",
	danger: "#dc2626",
	destructive: "#dc2626",
	info: "#075985",

	// Ink / text — the whole ramp is AA-verified against BOTH `card` (#fff) and
	// `bg` (#f6f7f8). The mockup's grays (#71767d / #9aa0a6) measured 4.27:1 and
	// 2.64:1, i.e. two of the three text tiers failed AA and dissolved in
	// sunlight. These are the darkened equivalents; hierarchy is preserved.
	fg: "#17181a",
	foreground: "#17181a",
	ink: "#17181a", // 17.8:1 — primary
	sub: "#5f646b", // 5.96 / 5.56 — secondary, metadata
	muted2: "#5f646b",
	faint: "#6b7075", // 5.00 / 4.66 — tertiary: eyebrows, group labels
	mutedForeground: "#5f646b",
	warningFg: "#b45309",
	/** NON-TEXT decoration only (chevrons redundant with a labelled row). Never
	 * put text in this color — it is 2.6:1. */
	faintDecor: "#9aa0a6",

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
	// Control boundaries and information-carrying dots need 3:1. The mockup's
	// #c8cdd2 is 1.6:1 — an effectively invisible checkbox.
	checkbox: "#8b9096", // 3.22 / 3.00
	// Workload dots encode load, so 3:1 applies. #8b9096 measured exactly 3.00 on
	// `bg` — no margin at all — so `dot` is a step darker than `checkbox`.
	dot: "#82878d", // 3.38 on bg

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
// 3.0 premium chrome — ink command hero + floating glass dock. Values are the
// design canvas's literals (Mobile App Redesign 1a/1m); components must bind
// these, never inline the hex. White-on-heroInk text tiers are AA-checked:
// .92 white 15.2:1, .75 10.1:1, .55 5.5:1, .5 4.6:1 (all pass at their sizes).
// ----------------------------------------------------------------------------
export const hero = {
	/** Deep-ink band + sign-in root — the dark counterpart of the brand blue. */
	ink: "#0a1c26",
	/** Radial brand glow painted top-right of the ink band. */
	glow: "rgba(0,166,244,.22)",
	/** White dot-grid on ink (same 22px pitch as the light canvas). */
	dotGrid: "rgba(255,255,255,.07)",
	/** Frosted stat/utility fills on ink. */
	cellBg: "rgba(255,255,255,.08)",
	cellBorder: "rgba(255,255,255,.10)",
	buttonBg: "rgba(255,255,255,.10)",
	buttonBorder: "rgba(255,255,255,.12)",
	avatarBg: "rgba(255,255,255,.14)",
	/** Text tiers on ink. */
	text: "#ffffff",
	textStrong: "rgba(255,255,255,.92)",
	textMid: "rgba(255,255,255,.75)",
	textSub: "rgba(255,255,255,.55)",
	textDim: "rgba(255,255,255,.5)",
	textFaint: "rgba(255,255,255,.45)",
	/** Money/stat accent — readable sky blue on ink (7.5:1). */
	statAccent: "#4cc4ff",
	/** Week-strip load bars on ink (decor, not text). */
	barStrong: "rgba(255,255,255,.45)",
	barMid: "rgba(255,255,255,.3)",
	barSoft: "rgba(255,255,255,.22)",
	/** Notification dot (bordered with `ink` so it reads on the frosted tile). */
	alertDot: "#ff5d5d",
	/** Bottom corner radius of the band. */
	radius: 28,
	/** Sign-in glass card fill — lighter ink so the glass lifts off the scrim. */
	glassBg: "rgba(14,30,40,.55)",
	glassBorder: "rgba(255,255,255,.14)",
	/** Sign-in scrim stops (top → foot). */
	scrim: [
		"rgba(10,28,38,.42)",
		"rgba(10,28,38,.06)",
		"rgba(10,28,38,.16)",
		"rgba(8,22,30,.9)",
	],
} as const;

export const dock = {
	/** Floating white glass pill. */
	bg: "rgba(255,255,255,.86)",
	border: "rgba(23,24,26,.08)",
	shadow: "0 12px 32px rgba(15,30,40,.16)",
	height: 60,
	radius: 30,
	sideInset: 16,
	bottomInset: 14,
	blur: 18,
	/** Orb: 50px gradient squircle, risen 16px above the pill's top edge. */
	orbSize: 50,
	orbRise: 16,
	orbRadius: 18,
	orbRing: "#ffffff",
	orbGradient: ["#00a6f4", "#0072b5"] as [string, string],
} as const;

/**
 * Scroll clearance for content that runs under the floating dock:
 * bottomInset + height + orb rise + slack. Screens inside (tabs) add this to
 * their scroll padding instead of hardcoding.
 */
export const DOCK_CLEARANCE =
	dock.bottomInset + dock.height + dock.orbRise + 12;

// ----------------------------------------------------------------------------
// Badge tones — soft-tint pairs, quieter than the old saturated pills.
// ----------------------------------------------------------------------------
export type BadgeTone = "ok" | "info" | "warn" | "late" | "mute";

// Backgrounds are the mockup's; three foregrounds are darkened because the
// mockup pairs failed AA at 10.5px (ok 3.12, late 4.25, mute 4.20).
export const badgeTone: Record<BadgeTone, { fg: string; bg: string }> = {
	ok: { fg: "#0a7d57", bg: "#e9f6f0" }, // 4.63
	info: { fg: "#075985", bg: "#e6f2f9" }, // 6.64
	warn: { fg: "#b45309", bg: "#fef7ec" }, // 4.72
	late: { fg: "#b91c1c", bg: "#fceded" }, // 5.69
	mute: { fg: "#4b5563", bg: "#eef1f4" }, // 6.67
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

// Legacy `radius` export — now a pure alias of `radii` so the two maps can
// never disagree on a shared key name again.
export const radius = {
	sm: radii.sm,
	md: radii.ctrl,
	lg: radii.card,
	xl: radii.card,
	full: radii.pill,
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
	/** @deprecated Cards are flat now (border only) — `ui/card.tsx` no longer uses
	 * this. Six pre-P1 screens still do; they lose it as P2 rewrites them. */
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

	// Padding matches ui/card.tsx — the same "card" concept must not have two values.
	card: {
		backgroundColor: colors.card,
		borderRadius: radii.card,
		padding: 14,
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
