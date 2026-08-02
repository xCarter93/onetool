/**
 * OneTool design tokens mirrored from `app/globals.css` + `workspace-theme.css`
 * as plain values so compositions render identically in the embedded <Player>,
 * Remotion Studio, and headless renders (where no app CSS cascade exists).
 * Keep in sync with globals.css when the palette changes.
 */

export type ThemeName = "light" | "dark";

export interface Theme {
	name: ThemeName;
	bg: string;
	canvas: string;
	canvasDot: string;
	fg: string;
	card: string;
	cardFg: string;
	border: string;
	input: string;
	muted: string;
	mutedFg: string;
	secondary: string;
	accent: string;
	primary: string;
	primaryFg: string;
	sidebar: string;
	sidebarBorder: string;
	sidebarAccent: string;
	navbar: string;
	success: string;
	successFg: string;
	warning: string;
	warningFg: string;
	danger: string;
	dangerFg: string;
	info: string;
	infoFg: string;
	chart1: string;
	chart2: string;
	chart3: string;
	chart4: string;
	chart6: string;
	shadow: string;
}

export const LIGHT: Theme = {
	name: "light",
	bg: "oklch(0.97 0 0)",
	canvas: "oklch(0.995 0 0)",
	canvasDot: "color-mix(in oklch, oklch(0.141 0.005 285.823) 16%, transparent)",
	fg: "oklch(0.141 0.005 285.823)",
	card: "oklch(1 0 0)",
	cardFg: "oklch(0.141 0.005 285.823)",
	border: "oklch(0.911 0.006 286.286)",
	input: "oklch(0.871 0.006 286.286)",
	muted: "oklch(0.967 0.001 286.375)",
	mutedFg: "oklch(0.552 0.016 285.938)",
	secondary: "oklch(0.92 0.004 286.32)",
	accent: "oklch(0.92 0.004 286.32)",
	primary: "rgb(0, 166, 244)",
	primaryFg: "oklch(1 0 0)",
	sidebar: "oklch(0.94 0.005 265)",
	sidebarBorder: "oklch(0.88 0.008 265)",
	sidebarAccent: "oklch(0.895 0.008 265)",
	navbar: "oklch(0.995 0 0)",
	success: "oklch(0.596 0.145 163.225)",
	successFg: "oklch(0.262 0.051 172.552)",
	warning: "oklch(0.828 0.189 84.429)",
	warningFg: "oklch(0.279 0.077 45.635)",
	danger: "oklch(0.577 0.245 27.325)",
	dangerFg: "oklch(0.396 0.141 25.723)",
	info: "oklch(0.685 0.169 237.323)",
	infoFg: "oklch(0.391 0.09 240.876)",
	chart1: "oklch(0.588 0.158 241.966)",
	chart2: "oklch(0.746 0.16 232.661)",
	chart3: "oklch(0.828 0.111 230.318)",
	chart4: "oklch(0.901 0.058 230.902)",
	chart6: "oklch(0.65 0.12 160)",
	shadow: "rgba(24, 24, 27, 0.08)",
};

export const DARK: Theme = {
	name: "dark",
	bg: "oklch(0.168 0.019 264.665)",
	canvas: "oklch(0.15 0.018 264)",
	canvasDot: "color-mix(in oklch, oklch(0.985 0 0) 16%, transparent)",
	fg: "oklch(0.985 0 0)",
	card: "oklch(0.15 0.005 285.823)",
	cardFg: "oklch(0.985 0 0)",
	border: "oklch(0.27 0.013 285.805)",
	input: "oklch(0.32 0.013 285.805)",
	muted: "oklch(0.21 0.006 285.885)",
	mutedFg: "oklch(0.705 0.015 286.067)",
	secondary: "oklch(0.244 0.006 286.033)",
	accent: "oklch(0.274 0.006 286.033)",
	primary: "oklch(0.685 0.169 237.323)",
	primaryFg: "oklch(1 0 0)",
	sidebar: "oklch(0.215 0.01 275)",
	sidebarBorder: "oklch(0.28 0.01 275)",
	sidebarAccent: "oklch(0.265 0.008 275)",
	navbar: "oklch(0.19 0.006 285.885)",
	success: "oklch(0.596 0.145 163.225)",
	successFg: "oklch(0.696 0.17 162.48)",
	warning: "oklch(0.828 0.189 84.429)",
	warningFg: "oklch(0.769 0.188 70.08)",
	danger: "oklch(0.577 0.245 27.325)",
	dangerFg: "oklch(0.704 0.191 22.216)",
	info: "oklch(0.685 0.169 237.323)",
	infoFg: "oklch(0.746 0.16 232.661)",
	chart1: "oklch(0.5 0.134 242.749)",
	chart2: "oklch(0.685 0.169 237.323)",
	chart3: "oklch(0.746 0.16 232.661)",
	chart4: "oklch(0.828 0.111 230.318)",
	chart6: "oklch(0.55 0.10 160)",
	shadow: "rgba(0, 0, 0, 0.35)",
};

export const themeFor = (name: ThemeName): Theme =>
	name === "dark" ? DARK : LIGHT;

/** Soft status-badge recipe matching reui/badge.tsx `*-light` variants. */
export const softBadge = (t: Theme, role: StatusRole) => {
	const map = {
		success: { color: t.success, fg: t.successFg },
		warning: { color: t.warning, fg: t.warningFg },
		danger: { color: t.danger, fg: t.dangerFg },
		info: { color: t.info, fg: t.infoFg },
		neutral: { color: t.mutedFg, fg: t.mutedFg },
	} as const;
	const { color, fg } = map[role];
	const alpha = t.name === "dark" ? "15%" : "10%";
	const borderAlpha = t.name === "dark" ? "25%" : "15%";
	return {
		backgroundColor: `color-mix(in oklch, ${color} ${alpha}, transparent)`,
		border: `1px solid color-mix(in oklch, ${color} ${borderAlpha}, transparent)`,
		color: fg,
	};
};

export type StatusRole = "success" | "warning" | "danger" | "info" | "neutral";

/** Mirrors components/domain/status-badge.tsx STATUS_ROLE. */
export const STATUS_ROLE: Record<string, StatusRole> = {
	active: "success",
	completed: "success",
	approved: "success",
	paid: "success",
	"in-progress": "warning",
	pending: "warning",
	paused: "warning",
	signed: "warning",
	cancelled: "danger",
	overdue: "danger",
	declined: "danger",
	lead: "info",
	planned: "info",
	scheduled: "info",
	sent: "info",
	prospect: "info",
	viewed: "info",
	inactive: "neutral",
	archived: "neutral",
	draft: "neutral",
	refunded: "neutral",
};

export const FONT_STACK =
	'Outfit, "Outfit Fallback", ui-sans-serif, system-ui, sans-serif';

export const RADIUS = {
	xs: 4,
	sm: 6,
	md: 7,
	lg: 8,
	xl: 10,
	"2xl": 12,
	"3xl": 16,
	"4xl": 24,
};
