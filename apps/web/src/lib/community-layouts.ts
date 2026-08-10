/**
 * The three shapes a public community page can take.
 *
 * Same content, three structures — the owner picks the one that matches what
 * they actually have to show. Showcase leads with photographs; Storefront puts
 * plans and the quote form above everything; Directory is a compact listing for
 * an owner with no photography, where hours, credentials and area do the
 * selling.
 *
 * Stored in `draftTheme`/`publishedTheme`. The field kept its old name because
 * renaming it would need a migration for no gain; only the values changed. Dev
 * pages still hold the three legacy strings ("clean-professional" and friends),
 * which is why `resolvePageLayout` treats anything it does not recognise as
 * Showcase rather than trusting what is on the row.
 */

export const PAGE_LAYOUTS = ["showcase", "storefront", "directory"] as const;

export type PageLayout = (typeof PAGE_LAYOUTS)[number];

export const PAGE_LAYOUT_LABELS: Record<PageLayout, string> = {
	showcase: "Showcase",
	storefront: "Storefront",
	directory: "Directory",
};

/** One line each, in the editor's Layout picker. */
export const PAGE_LAYOUT_DESCRIPTIONS: Record<PageLayout, string> = {
	showcase: "Photos of your work lead the page.",
	storefront: "Services and pricing first, quote form pinned.",
	directory: "Compact. Hours, area and credentials up top.",
};

/** What each layout needs from the owner, so the picker can say so up front. */
export const PAGE_LAYOUT_BEST_FOR: Record<PageLayout, string> = {
	showcase: "Best if you have photos of finished jobs.",
	storefront: "Best if you sell set plans or price ranges.",
	directory: "Best if you have no photos yet.",
};

/** Showcase, because it is what every existing page already renders. */
export const DEFAULT_PAGE_LAYOUT: PageLayout = "showcase";

export function resolvePageLayout(stored?: string | null): PageLayout {
	return PAGE_LAYOUTS.includes(stored as PageLayout)
		? (stored as PageLayout)
		: DEFAULT_PAGE_LAYOUT;
}
