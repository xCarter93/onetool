import { query, mutation, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
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
				})
			)
		),
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
		draftTheme: v.optional(v.string()),
	},
	handler: async (ctx, args): Promise<CommunityPageId> => {
		await ctx.requireLevel("community", "modify");
		await getCurrentUserOrThrow(ctx);
		const userOrgId = await getCurrentUserOrgId(ctx);
		if (args.draftPricingTiers !== undefined) {
			validatePricingTiers(args.draftPricingTiers);
		}
		if (args.galleryItemsDraft !== undefined) {
			validateGalleryItems(args.galleryItemsDraft);
		}

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
			if (args.galleryItemsDraft !== undefined)
				updates.galleryItemsDraft = args.galleryItemsDraft;
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
				galleryItemsDraft: args.galleryItemsDraft,
				pageTitle: args.pageTitle,
				metaDescription: args.metaDescription,
				draftOwnerInfo: args.draftOwnerInfo,
				draftCredentials: args.draftCredentials,
				draftBusinessHours: args.draftBusinessHours,
				draftSocialLinks: args.draftSocialLinks,
				draftTheme: args.draftTheme,
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
	pricingModeDraft: "pricingModePublished",
	galleryItemsDraft: "galleryItemsPublished",
	draftOwnerInfo: "publishedOwnerInfo",
	draftCredentials: "publishedCredentials",
	draftBusinessHours: "publishedBusinessHours",
	draftSocialLinks: "publishedSocialLinks",
	draftTheme: "publishedTheme",
};

/**
 * Publish draft content to live page
 */
export const publish = userMutation({
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

		const hasLegacyContent = !!page.draftContent;
		const hasSectionContent =
			!!page.draftBioContent ||
			!!page.draftServicesContent ||
			!!page.draftPricingContent ||
			(page.draftPricingTiers?.length ?? 0) > 0 ||
			(page.galleryItemsDraft?.length ?? 0) > 0;
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
			bannerUrl: v.union(v.string(), v.null()),
			avatarUrl: v.union(v.string(), v.null()),
			organization: v.union(
				v.null(),
				v.object({
					name: v.string(),
					email: v.optional(v.string()),
					phone: v.optional(v.string()),
					website: v.optional(v.string()),
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

		return {
			slug: page.slug,
			pageTitle: page.pageTitle || org?.name || "Community Page",
			metaDescription: page.metaDescription,
			content: page.publishedContent,
			bioContent: page.publishedBioContent ?? page.publishedContent,
			servicesContent: page.publishedServicesContent,
			pricingMode: (page.pricingModePublished ?? "richText") as PricingMode,
			pricingContent: page.publishedPricingContent,
			pricingTiers: page.publishedPricingTiers ?? [],
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
			bannerUrl,
			avatarUrl,
			organization: org
				? {
						name: org.name,
						email: org.email,
						phone: org.phone,
						website: org.website,
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
 * Submit interest form (creates lead client) - UNAUTHENTICATED
 * This is called from public pages without user authentication
 */
// INTENTIONAL: raw public mutation — unauthenticated lead capture from a public page.
// Org is discovered from the published page row, not the actor.
export const submitInterest = mutation({
	args: {
		slug: v.string(),
		name: v.string(),
		email: v.string(),
		phone: v.optional(v.string()),
		message: v.optional(v.string()),
		// PUB-18: honeypot — hidden form field, non-empty means bot
		website: v.optional(v.string()),
		// PUB-19: server-derived client IP hash from the Next.js route, for a
		// distributed per-IP limit. Optional so a direct caller still hits the
		// slug/email limits.
		ipHash: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		// PUB-18: honeypot tripped — pretend success, create nothing
		if (args.website && args.website.trim() !== "") {
			return { success: true };
		}

		// PUB-19: distributed per-IP throttle (rotating-email defense).
		if (args.ipHash) {
			await rateLimiter.limit(ctx, "communityInterestPerIp", {
				key: args.ipHash,
				throws: true,
			});
		}

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

		// Build task description with all form data
		const descParts: string[] = [];
		descParts.push(`Name: ${sanitizedName}`);
		descParts.push(`Email: ${normalizedEmail}`);
		if (args.phone) {
			// PUB-13: strip non-phone chars and cap length before interpolating
			const sanitizedPhone = args.phone
				.replace(/[^0-9+().x\-\s]/gi, "")
				.replace(/\s+/g, " ")
				.trim()
				.substring(0, 40);
			if (sanitizedPhone) {
				descParts.push(`Phone: ${sanitizedPhone}`);
			}
		}
		if (args.message) {
			const sanitizedMessage = args.message.trim().substring(0, 2000);
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
			assigneeUserId: assigneeUserId || undefined,
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
	tiers: Array<{ name: string; price: string; description?: string }>
): void {
	if (tiers.length > 10) {
		throw new Error("You can add up to 10 pricing tiers");
	}

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
	}
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

export const __testUtils = {
	validatePricingTiers,
	validateGalleryItems,
};
