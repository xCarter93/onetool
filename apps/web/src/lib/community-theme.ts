/**
 * Light and dark on the public community page.
 *
 * The owner picks; the visitor does not. The page carries the business's brand,
 * so the person accountable for what a stranger sees is the one who built it —
 * and "system" is how they hand that choice back to the visitor's device.
 *
 * The resolution is pure CSS. The public route is cached (`revalidate = 60`), so
 * one HTML document serves every visitor and the mode cannot be decided per
 * request. `light`/`dark` are the classes the token blocks already key off, which
 * means a mode survives being nested inside a workspace on the opposite theme.
 */

export const COMMUNITY_COLOR_MODES = ["light", "dark", "system"] as const;

export type CommunityColorMode = (typeof COMMUNITY_COLOR_MODES)[number];

export const COMMUNITY_COLOR_MODE_LABELS: Record<CommunityColorMode, string> = {
	light: "Light",
	dark: "Dark",
	system: "Match device",
};

export const COMMUNITY_COLOR_MODE_DESCRIPTIONS: Record<
	CommunityColorMode,
	string
> = {
	light: "Everyone sees the light page, whatever their phone is set to.",
	dark: "Everyone sees the dark page, whatever their phone is set to.",
	system: "Follows each visitor's device setting.",
};

/** Light, because the page a stranger lands on should be the one the owner designed. */
export const DEFAULT_COMMUNITY_COLOR_MODE: CommunityColorMode = "light";

export function resolveColorMode(stored?: string | null): CommunityColorMode {
	return COMMUNITY_COLOR_MODES.includes(stored as CommunityColorMode)
		? (stored as CommunityColorMode)
		: DEFAULT_COMMUNITY_COLOR_MODE;
}

/**
 * The class that pins the tokens for a mode. `system` returns nothing on
 * purpose: with no class, the page inherits whatever the document already
 * resolved, which is the visitor's own preference.
 *
 * Nesting works because the token blocks are declared on `:root, .light` and
 * `.dark`, and custom properties resolve at the nearest declaring ancestor. The
 * one thing it cannot override is a `dark:` Tailwind utility, whose variant is
 * `&:is(.dark *)` and so still matches inside a forced-light page — the public
 * page deliberately contains none.
 */
export function communityColorModeClass(
	mode: CommunityColorMode,
): string | undefined {
	return mode === "system" ? undefined : mode;
}

/**
 * Native controls — the contact form's inputs, scrollbars, autofill — read
 * `color-scheme`, not our tokens, so a pinned page has to say which it is.
 */
export function communityColorScheme(
	mode: CommunityColorMode,
): "light" | "dark" | "light dark" {
	return mode === "system" ? "light dark" : mode;
}
