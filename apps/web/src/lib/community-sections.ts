/**
 * The four reorderable sections of a public community page. Everything else on
 * that page (hero, credentials, hours, quote form) is fixed chrome — the quote
 * form in particular is always last by rule, so it is deliberately not a row
 * here where a future config write could move or hide it.
 */
export const COMMUNITY_SECTION_IDS = [
	"bio",
	"services",
	"pricing",
	"gallery",
] as const;

export type CommunitySectionId = (typeof COMMUNITY_SECTION_IDS)[number];

/**
 * The presentation choices a section offers. Order matters: the first entry is
 * what a page with no stored layout renders, so it must stay the presentation
 * that shipped before this field existed.
 *
 * A section with no entries has one way to look; the editor shows no chips for
 * it rather than a control with a single option.
 */
export const COMMUNITY_SECTION_LAYOUTS = {
	bio: [],
	services: [],
	pricing: ["tiers", "compact"],
	gallery: ["carousel", "grid"],
} as const satisfies Record<CommunitySectionId, readonly string[]>;

export type CommunitySectionLayout =
	(typeof COMMUNITY_SECTION_LAYOUTS)[CommunitySectionId][number];

/** Every layout id across every section — the storage-level allowlist. */
export const COMMUNITY_LAYOUT_IDS = [
	"tiers",
	"compact",
	"carousel",
	"grid",
] as const satisfies readonly CommunitySectionLayout[];

export const COMMUNITY_LAYOUT_LABELS: Record<CommunitySectionLayout, string> = {
	tiers: "Cards",
	compact: "Price list",
	carousel: "Carousel",
	grid: "Grid",
};

export interface CommunitySectionSetting {
	id: CommunitySectionId;
	visible: boolean;
	/** Absent for sections that offer no choice. */
	layout?: CommunitySectionLayout;
}

/**
 * The layout a section actually renders in. Anything unrecognised — a value
 * from a future release, a section that lost its variants — falls back to the
 * default rather than rendering nothing.
 */
export function resolveSectionLayout(
	id: CommunitySectionId,
	layout?: string | null,
): CommunitySectionLayout | undefined {
	const options: readonly string[] = COMMUNITY_SECTION_LAYOUTS[id];
	if (options.length === 0) return undefined;
	return (
		options.includes(layout ?? "") ? layout : options[0]
	) as CommunitySectionLayout;
}

/** Headings as they read on the public page, so the editor can name them the same. */
export const COMMUNITY_SECTION_LABELS: Record<CommunitySectionId, string> = {
	bio: "About us",
	services: "What we do",
	pricing: "Plans & pricing",
	gallery: "Our work",
};

function isKnownSectionId(id: string): id is CommunitySectionId {
	return (COMMUNITY_SECTION_IDS as readonly string[]).includes(id);
}

/**
 * Normalizes stored config into the full list, in display order.
 *
 * Absent or partial config is the common case, not an error: pages authored
 * before this control existed have none, and a section added in a later release
 * will be missing from every config written before it. Anything unlisted lands
 * at the end, visible — so the default is always "renders exactly as it did".
 */
export function resolveSectionConfig(
	config?: ReadonlyArray<{
		id: string;
		visible: boolean;
		layout?: string;
	}> | null,
): CommunitySectionSetting[] {
	const resolved: CommunitySectionSetting[] = [];
	const seen = new Set<CommunitySectionId>();

	for (const entry of config ?? []) {
		if (!isKnownSectionId(entry.id) || seen.has(entry.id)) continue;
		seen.add(entry.id);
		resolved.push(withLayout(entry.id, entry.visible, entry.layout));
	}

	for (const id of COMMUNITY_SECTION_IDS) {
		if (!seen.has(id)) resolved.push(withLayout(id, true));
	}

	return resolved;
}

function withLayout(
	id: CommunitySectionId,
	visible: boolean,
	layout?: string,
): CommunitySectionSetting {
	const resolved = resolveSectionLayout(id, layout);
	return resolved ? { id, visible, layout: resolved } : { id, visible };
}

/** Resolved layout per section, for a renderer that reads them all at once. */
export function sectionLayoutMap(
	config?: ReadonlyArray<{
		id: string;
		visible: boolean;
		layout?: string;
	}> | null,
): Record<CommunitySectionId, CommunitySectionLayout | undefined> {
	const map = {} as Record<
		CommunitySectionId,
		CommunitySectionLayout | undefined
	>;
	for (const entry of resolveSectionConfig(config)) {
		map[entry.id] = entry.layout;
	}
	return map;
}

/** Ids in display order, hidden ones dropped. */
export function visibleSectionIds(
	config?: ReadonlyArray<{
		id: string;
		visible: boolean;
		layout?: string;
	}> | null,
): CommunitySectionId[] {
	return resolveSectionConfig(config)
		.filter((entry) => entry.visible)
		.map((entry) => entry.id);
}

/**
 * TipTap docs are never "absent" once the editor has been focused — an empty
 * body is still `{type:"doc",content:[{type:"paragraph"}]}`. Truthiness would
 * publish a heading over nothing, so emptiness is a text question.
 */
export function hasRichTextContent(doc: unknown): boolean {
	if (!doc || typeof doc !== "object") return false;
	const node = doc as { type?: string; text?: string; content?: unknown[] };
	if (node.type === "text") return !!node.text?.trim();
	if (node.type === "image") return true;
	return Array.isArray(node.content) && node.content.some(hasRichTextContent);
}
