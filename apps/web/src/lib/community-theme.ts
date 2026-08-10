/**
 * Light or dark on the public community page.
 *
 * The owner picks and the visitor does not. The page carries the business's
 * brand, so the person accountable for what a stranger sees is the one who
 * built it. There is deliberately no "match device" option: the accent solver
 * corrects the owner's brand colour against a known background, and a page that
 * could render on either background has no single answer to correct against.
 *
 * Resolution is pure CSS. The public route is cached (`revalidate = 60`), so one
 * HTML document serves every visitor and the mode cannot be decided per request.
 * `light` and `dark` are the classes the token blocks already key off, which is
 * why a mode survives being nested inside a workspace on the opposite theme:
 * custom properties resolve at the nearest declaring ancestor. The one thing the
 * class cannot override is a `dark:` Tailwind utility, whose variant is
 * `&:is(.dark *)` and so still matches inside a forced-light page — the public
 * page deliberately contains none.
 */

export const COMMUNITY_COLOR_MODES = ["light", "dark"] as const;

export type CommunityColorMode = (typeof COMMUNITY_COLOR_MODES)[number];

export const COMMUNITY_COLOR_MODE_LABELS: Record<CommunityColorMode, string> = {
	light: "Light",
	dark: "Dark",
};

export const COMMUNITY_COLOR_MODE_DESCRIPTIONS: Record<
	CommunityColorMode,
	string
> = {
	light: "Everyone sees the light page, whatever their phone is set to.",
	dark: "Everyone sees the dark page, whatever their phone is set to.",
};

/** Light, because the page a stranger lands on should be the one the owner designed. */
export const DEFAULT_COMMUNITY_COLOR_MODE: CommunityColorMode = "light";

/**
 * The stored value is a loose string all the way to the renderer, and rows
 * written before this control existed carry nothing at all — so resolve rather
 * than trust. "system" was a third option until P4c removed it; it lands here.
 */
export function resolveColorMode(stored?: string | null): CommunityColorMode {
	return COMMUNITY_COLOR_MODES.includes(stored as CommunityColorMode)
		? (stored as CommunityColorMode)
		: DEFAULT_COMMUNITY_COLOR_MODE;
}
