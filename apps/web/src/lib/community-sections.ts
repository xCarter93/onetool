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

export interface CommunitySectionSetting {
	id: CommunitySectionId;
	visible: boolean;
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
	config?: ReadonlyArray<{ id: string; visible: boolean }> | null,
): CommunitySectionSetting[] {
	const resolved: CommunitySectionSetting[] = [];
	const seen = new Set<CommunitySectionId>();

	for (const entry of config ?? []) {
		if (!isKnownSectionId(entry.id) || seen.has(entry.id)) continue;
		seen.add(entry.id);
		resolved.push({ id: entry.id, visible: entry.visible });
	}

	for (const id of COMMUNITY_SECTION_IDS) {
		if (!seen.has(id)) resolved.push({ id, visible: true });
	}

	return resolved;
}

/** Ids in display order, hidden ones dropped. */
export function visibleSectionIds(
	config?: ReadonlyArray<{ id: string; visible: boolean }> | null,
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
