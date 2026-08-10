import { query, QueryCtx, MutationCtx } from "./_generated/server";
import { internalMutation, mutation } from "./lib/triggers";
import { ConvexError, v, type Infer } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import {
	getCurrentUserOrThrow,
	getCurrentUserOrgId,
} from "./lib/auth";
import { getOptionalOrgId } from "./lib/queries";
import { rateLimiter } from "./rateLimits";
import { optionalUserQuery, userMutation } from "./lib/factories";
import { emitRecordCreatedEvent } from "./eventBus";
import { isAdminRole } from "./lib/permissions";
import { FEATURE_FLAGS, isServerFlagEnabled } from "./lib/posthog";
import {
	COMMUNITY_SECTION_LAYOUTS,
	communityColorModeValidator,
	communityFaqItemsValidator,
	communityLayoutValidator,
	communitySectionConfigValidator,
	communityTeamMembersValidator,
} from "./lib/communityTypes";

/** PostHog rollout gate for editing/publishing community pages (fail-open). */
async function requireCommunityPagesAccess(
	ctx: MutationCtx,
	orgId: Id<"organizations">,
	userId: Id<"users">
): Promise<void> {
	const enabled = await isServerFlagEnabled(ctx, {
		key: FEATURE_FLAGS.COMMUNITY_PAGES,
		orgId,
		userId,
	});
	if (!enabled) {
		throw new Error("Community pages are not enabled for your organization");
	}
}

// Type definitions
type CommunityPageDocument = Doc<"communityPages">;
type CommunityPageId = Id<"communityPages">;
type PricingMode = "structured" | "richText";

// ============================================
// AUTHENTICATED QUERIES/MUTATIONS (Admin use)
// ============================================

/**
 * Get the community page for the current organization
 */
export const get = optionalUserQuery({
	args: {},
	handler: async (ctx): Promise<CommunityPageDocument | null> => {
		if (!ctx.user) return null;
		await ctx.requireLevel("community", "view");
		const userOrgId = await getOptionalOrgId(ctx);
		if (!userOrgId) return null;

		return await ctx.db
			.query("communityPages")
			.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
			.first();
	},
});

/**
 * Create or update community page (upsert pattern)
 */
export const upsert = userMutation({
	args: {
		slug: v.optional(v.string()),
		isPublic: v.optional(v.boolean()),
		bannerStorageId: v.optional(v.id("_storage")),
		avatarStorageId: v.optional(v.id("_storage")),
		draftContent: v.optional(v.any()),
		draftBioContent: v.optional(v.any()),
		draftServicesContent: v.optional(v.any()),
		pricingModeDraft: v.optional(
			v.union(v.literal("structured"), v.literal("richText"))
		),
		draftPricingContent: v.optional(v.any()),
		draftPricingTiers: v.optional(
			v.array(
				v.object({
					name: v.string(),
					price: v.string(),
					description: v.optional(v.string()),
					features: v.optional(v.array(v.string())),
					highlighted: v.optional(v.boolean()),
				})
			)
		),
		draftServiceTags: v.optional(v.array(v.string())),
		draftSectionConfig: v.optional(communitySectionConfigValidator),
		draftFaqItems: v.optional(communityFaqItemsValidator),
		draftTeamMembers: v.optional(communityTeamMembersValidator),
		galleryItemsDraft: v.optional(
			v.array(
				v.object({
					storageId: v.id("_storage"),
					sortOrder: v.number(),
				})
			)
		),
		pageTitle: v.optional(v.string()),
		metaDescription: v.optional(v.string()),
		draftOwnerInfo: v.optional(
			v.object({
				name: v.optional(v.string()),
				title: v.optional(v.string()),
			})
		),
		draftCredentials: v.optional(
			v.object({
				isLicensed: v.optional(v.boolean()),
				isBonded: v.optional(v.boolean()),
				isInsured: v.optional(v.boolean()),
				yearEstablished: v.optional(v.number()),
				licenseNumber: v.optional(v.string()),
				certifications: v.optional(v.array(v.string())),
			})
		),
		draftBusinessHours: v.optional(
			v.object({
				byAppointmentOnly: v.boolean(),
				schedule: v.optional(
					v.array(
						v.object({
							day: v.string(),
							open: v.string(),
							close: v.string(),
							isClosed: v.boolean(),
						})
					)
				),
			})
		),
		draftSocialLinks: v.optional(
			v.object({
				facebook: v.optional(v.string()),
				instagram: v.optional(v.string()),
				nextdoor: v.optional(v.string()),
				youtube: v.optional(v.string()),
				linkedin: v.optional(v.string()),
				yelp: v.optional(v.string()),
				google: v.optional(v.string()),
			})
		),
		draftTheme: v.optional(communityLayoutValidator),
		draftColorMode: v.optional(communityColorModeValidator),
		draftAccent: v.optional(v.string()),
		draftTagline: v.optional(v.string()),
	},
	handler: async (ctx, args): Promise<CommunityPageId> => {
		await ctx.requireLevel("community", "modify");
		const user = await getCurrentUserOrThrow(ctx);
		const userOrgId = await getCurrentUserOrgId(ctx);
		await requireCommunityPagesAccess(ctx, userOrgId, user._id);
		if (args.draftPricingTiers !== undefined) {
			validatePricingTiers(args.draftPricingTiers);
		}
		if (args.galleryItemsDraft !== undefined) {
			validateGalleryItems(args.galleryItemsDraft);
		}
		if (args.draftSectionConfig !== undefined) {
			validateSectionConfig(args.draftSectionConfig);
		}
		if (args.draftFaqItems !== undefined) {
			validateFaqItems(args.draftFaqItems);
		}
		if (args.draftTeamMembers !== undefined) {
			validateTeamMembers(args.draftTeamMembers);
		}
		if (args.draftAccent !== undefined) {
			validateAccent(args.draftAccent);
		}
		if (args.draftTagline !== undefined) {
			validateTagline(args.draftTagline);
		}
		const validatedServiceTags =
			args.draftServiceTags !== undefined
				? validateServiceTags(args.draftServiceTags)
				: undefined;

		const existing = await ctx.db
			.query("communityPages")
			.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
			.first();

		const now = Date.now();

		if (existing) {
			// Update existing page
			const updates: Partial<CommunityPageDocument> = {
				updatedAt: now,
			};

			if (args.slug !== undefined) {
				// Validate slug uniqueness
				await validateSlugUnique(ctx, args.slug, existing._id);
				updates.slug = args.slug;
			}
			if (args.isPublic !== undefined) updates.isPublic = args.isPublic;
			if (args.bannerStorageId !== undefined)
				updates.bannerStorageId = args.bannerStorageId;
			if (args.avatarStorageId !== undefined)
				updates.avatarStorageId = args.avatarStorageId;
			if (args.draftContent !== undefined)
				updates.draftContent = args.draftContent;
			if (args.draftBioContent !== undefined)
				updates.draftBioContent = args.draftBioContent;
			if (args.draftServicesContent !== undefined)
				updates.draftServicesContent = args.draftServicesContent;
			if (args.pricingModeDraft !== undefined)
				updates.pricingModeDraft = args.pricingModeDraft;
			if (args.draftPricingContent !== undefined)
				updates.draftPricingContent = args.draftPricingContent;
			if (args.draftPricingTiers !== undefined)
				updates.draftPricingTiers = args.draftPricingTiers;
			if (args.draftServiceTags !== undefined)
				updates.draftServiceTags = validatedServiceTags;
			if (args.galleryItemsDraft !== undefined)
				updates.galleryItemsDraft = args.galleryItemsDraft;
			if (args.draftSectionConfig !== undefined)
				updates.draftSectionConfig = args.draftSectionConfig;
			if (args.draftFaqItems !== undefined)
				updates.draftFaqItems = args.draftFaqItems;
			if (args.draftTeamMembers !== undefined)
				updates.draftTeamMembers = args.draftTeamMembers;
			if (args.pageTitle !== undefined) updates.pageTitle = args.pageTitle;
			if (args.metaDescription !== undefined)
				updates.metaDescription = args.metaDescription;
			if (args.draftOwnerInfo !== undefined)
				updates.draftOwnerInfo = args.draftOwnerInfo;
			if (args.draftCredentials !== undefined)
				updates.draftCredentials = args.draftCredentials;
			if (args.draftBusinessHours !== undefined)
				updates.draftBusinessHours = args.draftBusinessHours;
			if (args.draftSocialLinks !== undefined)
				updates.draftSocialLinks = args.draftSocialLinks;
			if (args.draftTheme !== undefined)
				updates.draftTheme = args.draftTheme;
			if (args.draftColorMode !== undefined)
				updates.draftColorMode = args.draftColorMode;
			if (args.draftAccent !== undefined)
				updates.draftAccent = args.draftAccent;
			// patch drops fields set to undefined, and the editor always sends the
			// string, so clearing the input genuinely clears the stored tagline.
			if (args.draftTagline !== undefined)
				updates.draftTagline = args.draftTagline.trim() || undefined;

			await ctx.db.patch(existing._id, updates);
			return existing._id;
		} else {
			// Create new page
			const org = await ctx.db.get(userOrgId);
			const defaultSlug =
				args.slug || generateSlugFromName(org?.name || "community-page");

			await validateSlugUnique(ctx, defaultSlug);

			return await ctx.db.insert("communityPages", {
				orgId: userOrgId,
				slug: defaultSlug,
				isPublic: args.isPublic ?? false,
				bannerStorageId: args.bannerStorageId,
				avatarStorageId: args.avatarStorageId,
				draftContent: args.draftContent,
				draftBioContent: args.draftBioContent,
				draftServicesContent: args.draftServicesContent,
				pricingModeDraft: args.pricingModeDraft,
				draftPricingContent: args.draftPricingContent,
				draftPricingTiers: args.draftPricingTiers,
				draftServiceTags: validatedServiceTags,
				galleryItemsDraft: args.galleryItemsDraft,
				draftSectionConfig: args.draftSectionConfig,
				draftFaqItems: args.draftFaqItems,
				draftTeamMembers: args.draftTeamMembers,
				pageTitle: args.pageTitle,
				metaDescription: args.metaDescription,
				draftOwnerInfo: args.draftOwnerInfo,
				draftCredentials: args.draftCredentials,
				draftBusinessHours: args.draftBusinessHours,
				draftSocialLinks: args.draftSocialLinks,
				draftTheme: args.draftTheme,
				draftColorMode: args.draftColorMode,
				draftAccent: args.draftAccent,
				draftTagline: args.draftTagline?.trim() || undefined,
				createdAt: now,
				updatedAt: now,
			});
		}
	},
});

/**
 * Draft-to-published field mapping.
 * When adding new draft fields, add the mapping here.
 * The publish mutation will automatically include them.
 */
const DRAFT_TO_PUBLISHED_MAP: Record<string, string> = {
	draftContent: "publishedContent",
	draftBioContent: "publishedBioContent",
	draftServicesContent: "publishedServicesContent",
	draftPricingContent: "publishedPricingContent",
	draftPricingTiers: "publishedPricingTiers",
	draftServiceTags: "publishedServiceTags",
	draftSectionConfig: "publishedSectionConfig",
	draftFaqItems: "publishedFaqItems",
	draftTeamMembers: "publishedTeamMembers",
	pricingModeDraft: "pricingModePublished",
	galleryItemsDraft: "galleryItemsPublished",
	draftOwnerInfo: "publishedOwnerInfo",
	draftCredentials: "publishedCredentials",
	draftBusinessHours: "publishedBusinessHours",
	draftSocialLinks: "publishedSocialLinks",
	draftTheme: "publishedTheme",
	draftColorMode: "publishedColorMode",
	draftAccent: "publishedAccent",
	draftTagline: "publishedTagline",
};

/**
 * Publish draft content to live page
 */
export const publish = userMutation({
	args: {},
	handler: async (ctx): Promise<void> => {
		await ctx.requireLevel("community", "modify");
		const user = await getCurrentUserOrThrow(ctx);
		const userOrgId = await getCurrentUserOrgId(ctx);
		await requireCommunityPagesAccess(ctx, userOrgId, user._id);

		const page = await ctx.db
			.query("communityPages")
			.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
			.first();

		if (!page) throw new Error("Community page not found");

		const hasLegacyContent = !!page.draftContent;
		const hasSectionContent =
			!!page.draftBioContent ||
			!!page.draftServicesContent ||
			!!page.draftPricingContent ||
			(page.draftPricingTiers?.length ?? 0) > 0 ||
			(page.galleryItemsDraft?.length ?? 0) > 0 ||
			(page.draftFaqItems?.length ?? 0) > 0 ||
			(page.draftTeamMembers?.length ?? 0) > 0 ||
			!!page.draftTagline;
		const hasBusinessInfoContent =
			!!page.draftOwnerInfo ||
			!!page.draftCredentials ||
			!!page.draftBusinessHours ||
			!!page.draftSocialLinks ||
			!!page.draftTheme;
		if (!hasLegacyContent && !hasSectionContent && !hasBusinessInfoContent) {
			throw new Error("No draft content to publish");
		}

		const updates: Record<string, unknown> = {
			publishedAt: Date.now(),
			updatedAt: Date.now(),
		};

		for (const [draftKey, publishedKey] of Object.entries(DRAFT_TO_PUBLISHED_MAP)) {
			updates[publishedKey] = (page as Record<string, unknown>)[draftKey];
		}

		await ctx.db.patch(page._id, updates);
	},
});

/**
 * Generate upload URL for images
 */
export const generateUploadUrl = userMutation({
	args: {},
	handler: async (ctx) => {
		await ctx.requireLevel("community", "modify");
		await getCurrentUserOrThrow(ctx);
		return await ctx.storage.generateUploadUrl();
	},
});

/**
 * Get image URL from storage (authenticated)
 */
export const getImageUrl = optionalUserQuery({
	args: { storageId: v.id("_storage") },
	handler: async (ctx, args): Promise<string | null> => {
		if (!ctx.user) throw new Error("User not authenticated");
		await ctx.requireLevel("community", "view");
		const user = await getCurrentUserOrThrow(ctx);
		if (!user) return null;
		return await ctx.storage.getUrl(args.storageId);
	},
});

export const getImageUrls = optionalUserQuery({
	args: { storageIds: v.array(v.id("_storage")) },
	handler: async (
		ctx,
		args
	): Promise<Array<{ storageId: Id<"_storage">; url: string | null }>> => {
		if (!ctx.user) throw new Error("User not authenticated");
		await ctx.requireLevel("community", "view");
		await getCurrentUserOrThrow(ctx);
		return await Promise.all(
			args.storageIds.map(async (storageId) => ({
				storageId,
				url: await ctx.storage.getUrl(storageId),
			}))
		);
	},
});

/**
 * Check if slug is available
 */
export const checkSlugAvailable = optionalUserQuery({
	args: { slug: v.string() },
	handler: async (ctx, args): Promise<boolean> => {
		if (ctx.user) {
			await ctx.requireLevel("community", "view");
		}
		const userOrgId = await getOptionalOrgId(ctx);

		const existing = await ctx.db
			.query("communityPages")
			.withIndex("by_slug", (q) => q.eq("slug", args.slug))
			.first();

		if (!existing) return true;
		if (userOrgId !== null && existing.orgId === userOrgId) return true;
		// PUB-21: unpublished slugs read as "available" to anonymous/cross-org
		// callers so this query can't enumerate unpublished orgs; upsert's
		// validateSlugUnique still enforces uniqueness at save time.
		return !existing.isPublic;
	},
});

/**
 * Delete the community page banner image
 */
export const deleteBannerImage = userMutation({
	args: {},
	handler: async (ctx): Promise<void> => {
		await ctx.requireLevel("community", "modify");
		await getCurrentUserOrThrow(ctx);
		const userOrgId = await getCurrentUserOrgId(ctx);

		const page = await ctx.db
			.query("communityPages")
			.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
			.first();

		if (!page) throw new Error("Community page not found");

		if (page.bannerStorageId) {
			await ctx.storage.delete(page.bannerStorageId);
		}

		await ctx.db.patch(page._id, {
			bannerStorageId: undefined,
			updatedAt: Date.now(),
		});
	},
});

/**
 * Delete the community page avatar image
 */
export const deleteAvatarImage = userMutation({
	args: {},
	handler: async (ctx): Promise<void> => {
		await ctx.requireLevel("community", "modify");
		await getCurrentUserOrThrow(ctx);
		const userOrgId = await getCurrentUserOrgId(ctx);

		const page = await ctx.db
			.query("communityPages")
			.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
			.first();

		if (!page) throw new Error("Community page not found");

		if (page.avatarStorageId) {
			await ctx.storage.delete(page.avatarStorageId);
		}

		await ctx.db.patch(page._id, {
			avatarStorageId: undefined,
			updatedAt: Date.now(),
		});
	},
});

// ============================================
// UNAUTHENTICATED QUERIES (Public access)
// ============================================

/**
 * Get public page by slug (for public viewing)
 */
// INTENTIONAL: raw public query — unauthenticated community-page slug access.
// Caller has no Clerk identity; org is discovered from the published page row.
export const getBySlug = query({
	args: { slug: v.string() },
	// PUB-05: enforced field allowlist — adding a field to the public payload
	// now requires touching this validator, not just the handler projection.
	returns: v.union(
		v.null(),
		v.object({
			slug: v.string(),
			pageTitle: v.string(),
			metaDescription: v.optional(v.string()),
			tagline: v.optional(v.string()),
			content: v.optional(v.any()),
			bioContent: v.optional(v.any()),
			servicesContent: v.optional(v.any()),
			pricingMode: v.union(v.literal("structured"), v.literal("richText")),
			pricingContent: v.optional(v.any()),
			pricingTiers: v.array(
				v.object({
					name: v.string(),
					price: v.string(),
					description: v.optional(v.string()),
					features: v.optional(v.array(v.string())),
					highlighted: v.optional(v.boolean()),
				})
			),
			serviceTags: v.array(v.string()),
			sectionConfig: v.optional(communitySectionConfigValidator),
			faqItems: v.array(
				v.object({
					question: v.string(),
					answer: v.string(),
				})
			),
			// Photos are projected as resolved URLs, never storage ids — a public
			// reader has nothing to do with an id it cannot fetch.
			teamMembers: v.array(
				v.object({
					name: v.string(),
					role: v.optional(v.string()),
					bio: v.optional(v.string()),
					photoUrl: v.optional(v.string()),
				})
			),
			galleryImages: v.array(
				v.object({
					storageId: v.id("_storage"),
					sortOrder: v.number(),
					url: v.string(),
				})
			),
			ownerInfo: v.optional(
				v.object({
					name: v.optional(v.string()),
					title: v.optional(v.string()),
				})
			),
			credentials: v.optional(
				v.object({
					isLicensed: v.optional(v.boolean()),
					isBonded: v.optional(v.boolean()),
					isInsured: v.optional(v.boolean()),
					yearEstablished: v.optional(v.number()),
					certifications: v.optional(v.array(v.string())),
				})
			),
			businessHours: v.optional(
				v.object({
					byAppointmentOnly: v.boolean(),
					schedule: v.optional(
						v.array(
							v.object({
								day: v.string(),
								open: v.string(),
								close: v.string(),
								isClosed: v.boolean(),
							})
						)
					),
				})
			),
			socialLinks: v.optional(
				v.object({
					facebook: v.optional(v.string()),
					instagram: v.optional(v.string()),
					nextdoor: v.optional(v.string()),
					youtube: v.optional(v.string()),
					linkedin: v.optional(v.string()),
					yelp: v.optional(v.string()),
					google: v.optional(v.string()),
				})
			),
			theme: v.optional(v.string()),
			colorMode: v.optional(communityColorModeValidator),
			accent: v.optional(v.string()),
			bannerUrl: v.union(v.string(), v.null()),
			avatarUrl: v.union(v.string(), v.null()),
			organization: v.union(
				v.null(),
				v.object({
					name: v.string(),
					email: v.optional(v.string()),
					phone: v.optional(v.string()),
					website: v.optional(v.string()),
					// Town-level location for the public credential strip ("Serving
					// <city>, <state>"). PUB-05: street/zip/lat/lng are deliberately
					// excluded — do not widen this beyond city/state.
					addressCity: v.optional(v.string()),
					addressState: v.optional(v.string()),
					// IANA zone, so "Open today" reflects the business's hours
					// rather than an out-of-area visitor's clock.
					timezone: v.optional(v.string()),
				})
			),
		})
	),
	handler: async (ctx, args) => {
		const page = await ctx.db
			.query("communityPages")
			.withIndex("by_slug", (q) => q.eq("slug", args.slug))
			.first();

		if (!page || !page.isPublic) return null;

		// Get organization details
		const org = await ctx.db.get(page.orgId);

		// Get image URLs
		const bannerUrl = page.bannerStorageId
			? await ctx.storage.getUrl(page.bannerStorageId)
			: null;
		const avatarUrl = page.avatarStorageId
			? await ctx.storage.getUrl(page.avatarStorageId)
			: org?.logoUrl || null;
		const publishedGalleryItems = [...(page.galleryItemsPublished ?? [])].sort(
			(a, b) => a.sortOrder - b.sortOrder
		);
		const galleryImages = (
			await Promise.all(
				publishedGalleryItems.map(async (item) => {
					const url = await ctx.storage.getUrl(item.storageId);
					return url
						? {
								storageId: item.storageId,
								sortOrder: item.sortOrder,
								url,
							}
						: null;
				})
			)
		).filter((item): item is NonNullable<typeof item> => item !== null);

		const teamMembers = await Promise.all(
			(page.publishedTeamMembers ?? []).map(async (member) => ({
				name: member.name,
				role: member.role,
				bio: member.bio,
				photoUrl: member.photoStorageId
					? ((await ctx.storage.getUrl(member.photoStorageId)) ?? undefined)
					: undefined,
			}))
		);

		return {
			slug: page.slug,
			pageTitle: page.pageTitle || org?.name || "Community Page",
			metaDescription: page.metaDescription,
			tagline: page.publishedTagline || undefined,
			content: page.publishedContent,
			bioContent: page.publishedBioContent ?? page.publishedContent,
			servicesContent: page.publishedServicesContent,
			pricingMode: (page.pricingModePublished ?? "richText") as PricingMode,
			pricingContent: page.publishedPricingContent,
			pricingTiers: page.publishedPricingTiers ?? [],
			serviceTags: page.publishedServiceTags ?? [],
			sectionConfig: page.publishedSectionConfig,
			faqItems: page.publishedFaqItems ?? [],
			teamMembers,
			galleryImages,
			ownerInfo: page.publishedOwnerInfo,
			// PUB-05: project credentials explicitly. licenseNumber is a sensitive
			// business identifier and must never reach the public JSON payload;
			// only the trust-bar booleans + certifications are surfaced.
			credentials: page.publishedCredentials
				? {
						isLicensed: page.publishedCredentials.isLicensed,
						isBonded: page.publishedCredentials.isBonded,
						isInsured: page.publishedCredentials.isInsured,
						yearEstablished: page.publishedCredentials.yearEstablished,
						certifications: page.publishedCredentials.certifications,
					}
				: undefined,
			businessHours: page.publishedBusinessHours,
			socialLinks: page.publishedSocialLinks,
			theme: page.publishedTheme,
			colorMode: page.publishedColorMode,
			accent: page.publishedAccent,
			bannerUrl,
			avatarUrl,
			organization: org
				? {
						name: org.name,
						email: org.email,
						phone: org.phone,
						website: org.website,
						addressCity: org.addressCity,
						addressState: org.addressState,
						timezone: org.timezone,
					}
				: null,
		};
	},
});


// PUB-16: per-IP throttle for the public REST read surface; the query itself
// cannot consume the limiter (queries cannot write).
// Stays raw — called by the unauthenticated REST route's ConvexHttpClient.
export const checkPublicReadRateLimit = mutation({
	args: { ipHash: v.string() },
	returns: v.object({ ok: v.boolean(), retryAfter: v.optional(v.number()) }),
	handler: async (
		ctx,
		args
	): Promise<{ ok: boolean; retryAfter?: number }> => {
		const rl = await rateLimiter.limit(ctx, "communityGetBySlugPerIp", {
			key: args.ipHash,
		});
		return rl.ok ? { ok: true } : { ok: false, retryAfter: rl.retryAfter };
	},
});

/**
 * List all public pages (for showcase)
 */
// INTENTIONAL: raw public query — unauthenticated public community-page index.
// Caller has no Clerk identity; rows are filtered to published pages only.
export const listPublic = query({
	args: { limit: v.optional(v.number()) },
	handler: async (ctx, args) => {
		const limit = args.limit || 12;

		const pages = await ctx.db
			.query("communityPages")
			.withIndex("by_public", (q) => q.eq("isPublic", true))
			.take(limit);

		// Enrich with org details and images
		const enrichedPages = await Promise.all(
			pages.map(async (page) => {
				const org = await ctx.db.get(page.orgId);
				const avatarUrl = page.avatarStorageId
					? await ctx.storage.getUrl(page.avatarStorageId)
					: org?.logoUrl || null;

				return {
					slug: page.slug,
					pageTitle: page.pageTitle || org?.name || "Community Page",
					avatarUrl,
					organizationName: org?.name,
				};
			})
		);

		return enrichedPages;
	},
});

/**
 * Submit interest form (creates a lead + follow-up task) — UNAUTHENTICATED.
 *
 * Internal on purpose. The only way in is the `/community/interest` httpAction,
 * which proves with a shared secret that the call came through the Next.js
 * route. That is what makes `ipHash` below trustworthy: a mutation reachable on
 * the public Convex URL would let a caller mint a fresh hash per request and
 * walk straight past the per-IP limiter.
 */
export const submitInterest = internalMutation({
	args: {
		slug: v.string(),
		name: v.string(),
		email: v.string(),
		phone: v.optional(v.string()),
		message: v.optional(v.string()),
		// Service the lead is interested in; must match a published service tag
		// on the page (see the match check below) or it is silently dropped.
		service: v.optional(v.string()),
		// PUB-18: honeypot — hidden form field, non-empty means bot
		website: v.optional(v.string()),
		// PUB-19: server-derived client IP hash from the Next.js route, for a
		// distributed per-IP limit. Required: the attested caller always has one.
		ipHash: v.string(),
	},
	handler: async (ctx, args) => {
		// PUB-18: honeypot tripped — pretend success, create nothing
		if (args.website && args.website.trim() !== "") {
			return { success: true };
		}

		// PUB-19: distributed per-IP throttle (rotating-email defense).
		await rateLimiter.limit(ctx, "communityInterestPerIp", {
			key: args.ipHash,
			throws: true,
		});

		// Rate limit per slug (org's community page)
		await rateLimiter.limit(ctx, "communityInterest", {
			key: args.slug,
			throws: true,
		});

		// Rate limit per email to prevent the same address flooding the task queue
		const normalizedEmailForLimit = args.email.toLowerCase().trim();
		await rateLimiter.limit(ctx, "communityInterestPerEmail", {
			key: normalizedEmailForLimit,
			throws: true,
		});

		// Input validation
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(args.email)) {
			throw new Error("Please provide a valid email address");
		}

		const sanitizedName = args.name.trim();
		if (sanitizedName.length < 2) {
			throw new Error("Please provide your name");
		}
		if (sanitizedName.length > 100) {
			throw new Error("Name is too long");
		}

		// Find the community page
		const page = await ctx.db
			.query("communityPages")
			.withIndex("by_slug", (q) => q.eq("slug", args.slug))
			.first();

		if (!page || !page.isPublic) {
			throw new Error("Community page not found");
		}

		const normalizedEmail = args.email.toLowerCase().trim();

		// Attacker-controlled: must match a published service tag on this page
		// (case-insensitively) or it's dropped. A mismatch is more likely a
		// stale cached form than an attack, so we drop rather than throw and
		// risk losing a real lead.
		let sanitizedService: string | undefined;
		if (args.service) {
			const trimmedService = args.service.trim().substring(0, 40);
			const publishedTags = page.publishedServiceTags ?? [];
			sanitizedService = publishedTags.find(
				(tag) => tag.toLowerCase() === trimmedService.toLowerCase()
			);
		}

		// Build task description with all form data
		const descParts: string[] = [];
		descParts.push(`Name: ${sanitizedName}`);
		descParts.push(`Email: ${normalizedEmail}`);
		let sanitizedPhone: string | undefined;
		if (args.phone) {
			// PUB-13: strip non-phone chars and cap length before interpolating
			sanitizedPhone =
				args.phone
					.replace(/[^0-9+().x\-\s]/gi, "")
					.replace(/\s+/g, " ")
					.trim()
					.substring(0, 40) || undefined;
			if (sanitizedPhone) {
				descParts.push(`Phone: ${sanitizedPhone}`);
			}
		}
		if (sanitizedService) {
			descParts.push(`Service: ${sanitizedService}`);
		}
		let sanitizedMessage: string | undefined;
		if (args.message) {
			sanitizedMessage = args.message.trim().substring(0, 2000) || undefined;
			if (sanitizedMessage) {
				descParts.push(`\nMessage:\n${sanitizedMessage}`);
			}
		}
		descParts.push(`\nSource: Community page (${args.slug})`);

		// Find org admin for task assignment
		const memberships = await ctx.db
			.query("organizationMemberships")
			.withIndex("by_org", (q) => q.eq("orgId", page.orgId))
			.collect();
		const adminMembership = memberships.find((m) => isAdminRole(m.role));

		const assigneeUserId = adminMembership?.userId;

		// Calculate next business day (skip Saturday=6, Sunday=0)
		const now = new Date();
		const nextDay = new Date(now);
		nextDay.setDate(nextDay.getDate() + 1);
		while (nextDay.getDay() === 0 || nextDay.getDay() === 6) {
			nextDay.setDate(nextDay.getDate() + 1);
		}
		nextDay.setHours(9, 0, 0, 0);

		// No acting user — createdByUserId left unset (public lead capture).
		const taskId = await ctx.db.insert("tasks", {
			orgId: page.orgId,
			title: `Follow up: ${sanitizedName}`,
			description: descParts.join("\n"),
			date: nextDay.getTime(),
			status: "pending",
			type: "internal",
			source: "public_form",
			assigneeUserId: assigneeUserId || undefined,
		});

		// The lead row is the durable record of the request; the task is the
		// follow-up nudge. Only sanitized values land here — never args.*.
		await ctx.db.insert("communityLeads", {
			orgId: page.orgId,
			communityPageId: page._id,
			slug: page.slug,
			name: sanitizedName,
			email: normalizedEmail,
			phone: sanitizedPhone,
			service: sanitizedService,
			message: sanitizedMessage,
			status: "new",
			taskId,
			submittedAt: Date.now(),
		});

		// Public submission — no actor user, but task record_created automations
		// must still fire for lead-capture follow-ups.
		await emitRecordCreatedEvent(
			ctx,
			page.orgId,
			"task",
			taskId,
			"communityPages.submitInterest"
		);

		return { success: true };
	},
});

// ============================================
// HELPER FUNCTIONS
// ============================================

function generateSlugFromName(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.substring(0, 50);
}

async function validateSlugUnique(
	ctx: QueryCtx | MutationCtx,
	slug: string,
	excludeId?: CommunityPageId
): Promise<void> {
	// Validate slug format
	if (!/^[a-z0-9-]+$/.test(slug)) {
		throw new Error(
			"Slug can only contain lowercase letters, numbers, and hyphens"
		);
	}

	if (slug.length < 3) {
		throw new Error("Slug must be at least 3 characters long");
	}

	if (slug.length > 50) {
		throw new Error("Slug must be 50 characters or less");
	}

	// Check for reserved slugs
	const reservedSlugs = [
		"new",
		"create",
		"edit",
		"delete",
		"admin",
		"api",
		"login",
		"signup",
		"signin",
		"signout",
		"logout",
		"settings",
		"profile",
		"dashboard",
		"help",
		"support",
		"terms",
		"privacy",
		"about",
		"contact",
		"home",
		"index",
		"showcase",
		"interest",
	];
	if (reservedSlugs.includes(slug)) {
		throw new Error("This slug is reserved. Please choose another.");
	}

	const existing = await ctx.db
		.query("communityPages")
		.withIndex("by_slug", (q) => q.eq("slug", slug))
		.first();

	if (existing && existing._id !== excludeId) {
		throw new Error("This URL slug is already taken. Please choose another.");
	}
}

function validatePricingTiers(
	tiers: Array<{
		name: string;
		price: string;
		description?: string;
		features?: string[];
		highlighted?: boolean;
	}>
): void {
	if (tiers.length > 10) {
		throw new Error("You can add up to 10 pricing tiers");
	}

	let highlightedCount = 0;
	for (const tier of tiers) {
		const name = tier.name.trim();
		const price = tier.price.trim();
		const description = tier.description?.trim();

		if (!name) {
			throw new Error("Each pricing tier needs a name");
		}
		if (name.length > 80) {
			throw new Error("Pricing tier name must be 80 characters or less");
		}
		if (!price) {
			throw new Error("Each pricing tier needs a price");
		}
		if (price.length > 40) {
			throw new Error("Pricing tier price must be 40 characters or less");
		}
		if (description && description.length > 240) {
			throw new Error(
				"Pricing tier description must be 240 characters or less"
			);
		}
		if (tier.features !== undefined) {
			if (tier.features.length > 6) {
				throw new Error("Each pricing tier can have up to 6 features");
			}
			for (const feature of tier.features) {
				const trimmedFeature = feature.trim();
				if (!trimmedFeature) {
					throw new Error("Pricing tier features cannot be empty");
				}
				if (trimmedFeature.length > 80) {
					throw new Error(
						"Pricing tier feature must be 80 characters or less"
					);
				}
			}
		}
		if (tier.highlighted) {
			highlightedCount++;
		}
	}
	if (highlightedCount > 1) {
		throw new Error("Only one pricing tier can be highlighted");
	}
}

/**
 * Validates and normalizes public-facing service tags. This is a security
 * boundary (values render on the public page and are matched against
 * submitInterest's service field), not just UX validation.
 */
function validateServiceTags(tags: string[]): string[] {
	if (tags.length > 8) {
		throw new ConvexError({
			code: "BAD_REQUEST",
			message: "You can add up to 8 service tags",
		});
	}

	const seen = new Set<string>();
	const result: string[] = [];
	for (const rawTag of tags) {
		const tag = rawTag.trim();
		if (!tag) continue; // drop empties
		if (tag.length > 40) {
			throw new ConvexError({
				code: "BAD_REQUEST",
				message: "Service tag must be 40 characters or less",
			});
		}
		const key = tag.toLowerCase();
		if (seen.has(key)) continue; // case-insensitive dedupe
		seen.add(key);
		result.push(tag);
	}
	return result;
}

function validateGalleryItems(
	items: Array<{ storageId: Id<"_storage">; sortOrder: number }>
): void {
	if (items.length > 5) {
		throw new Error("You can upload up to 5 gallery images");
	}
	const ids = new Set<string>();
	for (const item of items) {
		const key = String(item.storageId);
		if (ids.has(key)) {
			throw new Error("Duplicate gallery images are not allowed");
		}
		ids.add(key);
		if (!Number.isInteger(item.sortOrder) || item.sortOrder < 0) {
			throw new Error("Gallery image order is invalid");
		}
	}
}

/**
 * Section order/visibility is a permutation, not a free list: the same section
 * twice would render twice, and an unknown id would render nothing while
 * silently occupying a slot.
 */
function validateSectionConfig(
	config: Infer<typeof communitySectionConfigValidator>
): void {
	const seen = new Set<string>();
	for (const entry of config) {
		if (seen.has(entry.id)) {
			throw new Error("Each page section can only be listed once");
		}
		seen.add(entry.id);
		// The validator accepts every layout id; only this pairing check knows
		// that "carousel" is meaningless on Pricing.
		const allowed = COMMUNITY_SECTION_LAYOUTS[entry.id] ?? [];
		if (entry.layout !== undefined && !allowed.includes(entry.layout)) {
			throw new Error(
				`"${entry.layout}" is not a layout the ${entry.id} section offers`
			);
		}
	}
}

/**
 * FAQ and team rows are attacker-reachable only through the authenticated editor,
 * but they land verbatim on a public page — so length is capped here rather than
 * left to whatever the form happens to allow.
 */
function validateFaqItems(
	items: Array<{ question: string; answer: string }>
): void {
	if (items.length > 12) {
		throw new Error("You can add up to 12 questions");
	}
	for (const item of items) {
		const question = item.question.trim();
		const answer = item.answer.trim();
		if (!question) {
			throw new Error("Each question needs to be filled in");
		}
		if (question.length > 200) {
			throw new Error("A question must be 200 characters or less");
		}
		if (!answer) {
			throw new Error("Each question needs an answer");
		}
		if (answer.length > 1200) {
			throw new Error("An answer must be 1200 characters or less");
		}
	}
}

function validateTeamMembers(
	members: Array<{ name: string; role?: string; bio?: string }>
): void {
	if (members.length > 12) {
		throw new Error("You can add up to 12 team members");
	}
	for (const member of members) {
		const name = member.name.trim();
		if (!name) {
			throw new Error("Each team member needs a name");
		}
		if (name.length > 80) {
			throw new Error("A team member name must be 80 characters or less");
		}
		if (member.role && member.role.trim().length > 80) {
			throw new Error("A team member role must be 80 characters or less");
		}
		if (member.bio && member.bio.trim().length > 400) {
			throw new Error("A team member bio must be 400 characters or less");
		}
	}
}

/**
 * The accent is written into an inline `style` on a page any stranger can load,
 * so it has to be a colour and nothing else. React does not sanitize style
 * values, and `#dc2626;background:url(...)` is a valid string. Six hex digits
 * or three, nothing more — the renderer re-serializes from numbers on top of
 * this, so a bad value could never reach the attribute even if it were stored.
 */
function validateAccent(accent: string): void {
	if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(accent.trim())) {
		throw new Error("An accent colour must be a hex value like #00a6f4");
	}
}

/**
 * The tagline is a headline on a public page, so it is capped rather than left
 * to whatever the form allows. Measured after trimming — the stored value is
 * trimmed too, so whitespace can never buy extra length.
 */
function validateTagline(tagline: string): void {
	if (tagline.trim().length > 80) {
		throw new ConvexError({
			code: "BAD_REQUEST",
			message: "Tagline must be 80 characters or less",
		});
	}
}

export const __testUtils = {
	validatePricingTiers,
	validateGalleryItems,
	validateServiceTags,
	validateSectionConfig,
	validateFaqItems,
	validateTeamMembers,
	validateAccent,
	validateTagline,
};
