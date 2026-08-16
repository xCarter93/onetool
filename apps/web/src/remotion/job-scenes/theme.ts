import { createContext, useContext } from "react";
import type { ThemeName } from "../lib/tokens";

/**
 * OneTool tokens for the "What's inside" job scenes. Both palettes are the
 * landing comp's own values verbatim (landing.css `.dc-landing` / `.dark
 * .dc-landing`), scaled for video frames — the card slot paints `--sheet`, so a
 * scene rendered in the wrong scheme reads as a hole in the card.
 *
 * `color-mix` can't reach a CSS var from inside a composition, so every wash
 * bakes its own base literal per palette.
 */
export interface JobPalette {
	paper: string;
	sheet: string;
	ink: string;
	ink2: string;
	ink3: string;
	rule: string;
	rule2: string;
	/** Neutral bar/plate fill — the quiet sibling of accentWash. */
	block: string;
	accent: string;
	accentInk: string;
	accentWash: string;
	paid: string;
	paidWash: string;
	danger: string;
	shadow: string;
}

const LIGHT: JobPalette = {
	paper: "oklch(0.975 0.002 286)",
	sheet: "oklch(1 0 0)",
	ink: "oklch(0.16 0.008 285.8)",
	ink2: "oklch(0.47 0.016 285.9)",
	ink3: "oklch(0.62 0.014 285.9)",
	rule: "color-mix(in oklch, oklch(0.16 0.008 285.8) 11%, transparent)",
	rule2: "color-mix(in oklch, oklch(0.16 0.008 285.8) 20%, transparent)",
	block: "color-mix(in oklch, oklch(0.16 0.008 285.8) 9%, transparent)",
	accent: "rgb(0, 166, 244)",
	accentInk: "oklch(0.5 0.134 242.749)",
	accentWash: "color-mix(in srgb, rgb(0, 166, 244) 9%, oklch(0.975 0.002 286))",
	paid: "oklch(0.52 0.13 163.2)",
	paidWash: "color-mix(in oklch, oklch(0.596 0.145 163.225) 12%, oklch(0.975 0.002 286))",
	danger: "oklch(0.577 0.245 27.325)",
	shadow: "0 1px 2px rgba(16,24,40,.04), 0 8px 24px -12px rgba(16,24,40,.12)",
};

const DARK: JobPalette = {
	paper: "oklch(0.168 0.019 264.665)",
	sheet: "oklch(0.208 0.014 265)",
	ink: "oklch(0.985 0 0)",
	ink2: "oklch(0.705 0.015 286.067)",
	ink3: "oklch(0.6 0.015 286)",
	rule: "color-mix(in oklch, oklch(0.985 0 0) 12%, transparent)",
	rule2: "color-mix(in oklch, oklch(0.985 0 0) 20%, transparent)",
	block: "color-mix(in oklch, oklch(0.985 0 0) 8%, transparent)",
	accent: "oklch(0.685 0.169 237.323)",
	accentInk: "oklch(0.746 0.16 232.661)",
	accentWash: "color-mix(in srgb, oklch(0.685 0.169 237.323) 14%, oklch(0.168 0.019 264.665))",
	paid: "oklch(0.696 0.17 162.48)",
	paidWash: "color-mix(in oklch, oklch(0.596 0.145 163.225) 18%, oklch(0.168 0.019 264.665))",
	danger: "oklch(0.704 0.191 22.216)",
	shadow: "0 2px 4px rgba(0,0,0,.3), 0 24px 64px -24px rgba(0,0,0,.7)",
};

/** Composition props of every card cut — mirrors lib/themed's contract, so a
 * Player can pass `inputProps={{ theme }}` to either scene system. */
export interface JobSceneProps {
	theme?: ThemeName;
	[key: string]: unknown;
}

export const paletteFor = (theme: ThemeName): JobPalette =>
	theme === "dark" ? DARK : LIGHT;

const JobThemeContext = createContext<JobPalette>(LIGHT);

export const JobThemeProvider = JobThemeContext.Provider;

/** The palette of the scheme the page is in — see `paletteFor`. */
export const useJobTheme = () => useContext(JobThemeContext);

/** Card geometry — one shape for all three scenes, so the set reads as a set. */
export const CARD = { width: 1180, radius: 30, pad: 44 } as const;
