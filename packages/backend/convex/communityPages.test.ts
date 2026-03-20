import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { setupConvexTest } from "./test.setup";
import { createTestIdentity, createTestOrg } from "./test.helpers";
import { __testUtils } from "./communityPages";

describe("Community Pages", () => {
	let t: ReturnType<typeof convexTest>;
	let clerkUserId = "";
	let clerkOrgId = "";

	beforeEach(async () => {
		t = setupConvexTest();
		const ids = await t.run(async (ctx) => createTestOrg(ctx));
		clerkUserId = ids.clerkUserId;
		clerkOrgId = ids.clerkOrgId;
	});

	it("upsert stores sectioned draft fields", async () => {
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

		await asUser.mutation(api.communityPages.upsert, {
			slug: "test-community-page",
			isPublic: false,
			draftBioContent: { type: "doc", content: [{ type: "paragraph" }] },
			draftServicesContent: {
				type: "doc",
				content: [{ type: "paragraph", content: [{ type: "text", text: "Lawn care" }] }],
			},
			pricingModeDraft: "structured",
			draftPricingTiers: [
				{ name: "Starter", price: "$99", description: "Basic package" },
			],
		});

		const page = await asUser.query(api.communityPages.get, {});
		expect(page).toBeTruthy();
		expect(page?.draftBioContent).toBeTruthy();
		expect(page?.draftServicesContent).toBeTruthy();
		expect(page?.pricingModeDraft).toBe("structured");
		expect(page?.draftPricingTiers).toHaveLength(1);
	});

	it("publish copies new section fields from draft to published", async () => {
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

		await asUser.mutation(api.communityPages.upsert, {
			slug: "publish-community-page",
			isPublic: true,
			draftBioContent: {
				type: "doc",
				content: [{ type: "paragraph", content: [{ type: "text", text: "Bio" }] }],
			},
			draftServicesContent: {
				type: "doc",
				content: [{ type: "paragraph", content: [{ type: "text", text: "Services" }] }],
			},
			pricingModeDraft: "richText",
			draftPricingContent: {
				type: "doc",
				content: [{ type: "paragraph", content: [{ type: "text", text: "Call for pricing" }] }],
			},
		});
		await asUser.mutation(api.communityPages.publish, {});

		const page = await asUser.query(api.communityPages.get, {});
		expect(page?.publishedBioContent).toBeTruthy();
		expect(page?.publishedServicesContent).toBeTruthy();
		expect(page?.pricingModePublished).toBe("richText");
		expect(page?.publishedPricingContent).toBeTruthy();
	});

	it("getBySlug includes section payload for public page", async () => {
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

		await asUser.mutation(api.communityPages.upsert, {
			slug: "public-community-page",
			isPublic: true,
			draftBioContent: {
				type: "doc",
				content: [{ type: "paragraph", content: [{ type: "text", text: "Public bio" }] }],
			},
			pricingModeDraft: "structured",
			draftPricingTiers: [{ name: "Starter", price: "$100", description: "Good fit" }],
		});
		await asUser.mutation(api.communityPages.publish, {});

		const publicPage = await t.query(api.communityPages.getBySlug, {
			slug: "public-community-page",
		});

		expect(publicPage).toBeTruthy();
		expect(publicPage?.bioContent).toBeTruthy();
		expect(publicPage?.pricingMode).toBe("structured");
		expect(publicPage?.pricingTiers).toHaveLength(1);
		expect(publicPage?.galleryImages).toEqual([]);
	});

	it("publish mutation copies all DRAFT_TO_PUBLISHED_MAP fields", async () => {
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

		await asUser.mutation(api.communityPages.upsert, {
			slug: "publish-all-fields",
			isPublic: true,
			draftBioContent: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Bio" }] }] },
			draftServicesContent: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Services" }] }] },
			pricingModeDraft: "structured",
			draftPricingContent: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Pricing" }] }] },
			draftPricingTiers: [{ name: "Basic", price: "$50", description: "Basic plan" }],
			galleryItemsDraft: [],
		});

		await asUser.mutation(api.communityPages.publish, {});

		const page = await asUser.query(api.communityPages.get, {});
		expect(page?.publishedBioContent).toBeTruthy();
		expect(page?.publishedServicesContent).toBeTruthy();
		expect(page?.pricingModePublished).toBe("structured");
		expect(page?.publishedPricingContent).toBeTruthy();
		expect(page?.publishedPricingTiers).toEqual([{ name: "Basic", price: "$50", description: "Basic plan" }]);
		expect(page?.galleryItemsPublished).toEqual([]);
	});

	it("validates gallery item cap at five images", () => {
		const items = Array.from({ length: 6 }).map((_, index) => ({
			storageId: (`storage_${index}` as unknown) as Id<"_storage">,
			sortOrder: index,
		}));

		expect(() => __testUtils.validateGalleryItems(items)).toThrow(
			"You can upload up to 5 gallery images"
		);
	});
});
