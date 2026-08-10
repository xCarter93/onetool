import { v } from "convex/values";

/**
 * Shared shape for the public community page's section list. The same object is
 * the stored schema, the editor mutation's argument, and part of `getBySlug`'s
 * public allowlist — four places that must agree, so they read from one
 * definition rather than four copies.
 *
 * `layout` is the union of every layout id across every section; which ones are
 * legal for a given section is enforced by `validateSectionConfig`, because that
 * pairing is a rule about the value, not a shape a validator can express.
 */
export const communitySectionIdValidator = v.union(
	v.literal("bio"),
	v.literal("services"),
	v.literal("pricing"),
	v.literal("gallery"),
	v.literal("faq"),
	v.literal("team")
);

export const communitySectionLayoutValidator = v.union(
	v.literal("tiers"),
	v.literal("compact"),
	v.literal("carousel"),
	v.literal("grid")
);

export const communitySectionConfigValidator = v.array(
	v.object({
		id: communitySectionIdValidator,
		visible: v.boolean(),
		layout: v.optional(communitySectionLayoutValidator),
	})
);

/**
 * Which layouts each section accepts. The first entry is the default, so it must
 * stay the presentation that shipped before the field existed — a page with no
 * stored layout has to keep looking the way its owner last saw it.
 *
 * Mirrors `COMMUNITY_SECTION_LAYOUTS` in the web app's `lib/community-sections`.
 */
export const COMMUNITY_SECTION_LAYOUTS: Record<string, readonly string[]> = {
	bio: [],
	services: [],
	pricing: ["tiers", "compact"],
	gallery: ["carousel", "grid"],
	faq: [],
	team: [],
};

export const communityFaqItemsValidator = v.array(
	v.object({
		question: v.string(),
		answer: v.string(),
	})
);

export const communityTeamMembersValidator = v.array(
	v.object({
		name: v.string(),
		role: v.optional(v.string()),
		bio: v.optional(v.string()),
		photoStorageId: v.optional(v.id("_storage")),
	})
);

/**
 * How the public page resolves light and dark. The owner decides, because the
 * page carries their brand and they are the one accountable for what a stranger
 * sees — "system" hands that back to the visitor's device.
 */
export const communityColorModeValidator = v.union(
	v.literal("light"),
	v.literal("dark"),
	v.literal("system")
);
