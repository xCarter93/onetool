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

	it("upsert stores draftOwnerInfo", async () => {
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

		await asUser.mutation(api.communityPages.upsert, {
			slug: "owner-info-page",
			isPublic: false,
			draftOwnerInfo: { name: "Jane Doe", title: "Owner" },
		});

		const page = await asUser.query(api.communityPages.get, {});
		expect(page).toBeTruthy();
		expect(page?.draftOwnerInfo).toEqual({ name: "Jane Doe", title: "Owner" });
	});

	it("upsert stores draftCredentials", async () => {
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

		await asUser.mutation(api.communityPages.upsert, {
			slug: "credentials-page",
			isPublic: false,
			draftCredentials: {
				isLicensed: true,
				isBonded: false,
				isInsured: true,
				yearEstablished: 2015,
				licenseNumber: "ABC-123",
				certifications: ["EPA Certified", "NATE"],
			},
		});

		const page = await asUser.query(api.communityPages.get, {});
		expect(page).toBeTruthy();
		expect(page?.draftCredentials).toEqual({
			isLicensed: true,
			isBonded: false,
			isInsured: true,
			yearEstablished: 2015,
			licenseNumber: "ABC-123",
			certifications: ["EPA Certified", "NATE"],
		});
	});

	it("upsert stores draftBusinessHours", async () => {
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

		await asUser.mutation(api.communityPages.upsert, {
			slug: "hours-page",
			isPublic: false,
			draftBusinessHours: {
				byAppointmentOnly: false,
				schedule: [
					{ day: "Monday", open: "09:00", close: "17:00", isClosed: false },
				],
			},
		});

		const page = await asUser.query(api.communityPages.get, {});
		expect(page).toBeTruthy();
		expect(page?.draftBusinessHours).toEqual({
			byAppointmentOnly: false,
			schedule: [
				{ day: "Monday", open: "09:00", close: "17:00", isClosed: false },
			],
		});
	});

	it("upsert stores draftSocialLinks", async () => {
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

		await asUser.mutation(api.communityPages.upsert, {
			slug: "social-page",
			isPublic: false,
			draftSocialLinks: {
				facebook: "https://facebook.com/test",
				instagram: "https://instagram.com/test",
			},
		});

		const page = await asUser.query(api.communityPages.get, {});
		expect(page).toBeTruthy();
		expect(page?.draftSocialLinks).toEqual({
			facebook: "https://facebook.com/test",
			instagram: "https://instagram.com/test",
		});
	});

	it("publish copies business info fields to published", async () => {
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

		await asUser.mutation(api.communityPages.upsert, {
			slug: "publish-biz-info",
			isPublic: true,
			draftBioContent: {
				type: "doc",
				content: [{ type: "paragraph", content: [{ type: "text", text: "Bio" }] }],
			},
			draftOwnerInfo: { name: "Jane Doe", title: "Owner" },
			draftCredentials: { isLicensed: true },
			draftBusinessHours: { byAppointmentOnly: true },
			draftSocialLinks: { facebook: "https://facebook.com/test" },
		});

		await asUser.mutation(api.communityPages.publish, {});

		const page = await asUser.query(api.communityPages.get, {});
		expect(page?.publishedOwnerInfo).toEqual({ name: "Jane Doe", title: "Owner" });
		expect(page?.publishedCredentials).toEqual({ isLicensed: true });
		expect(page?.publishedBusinessHours).toEqual({ byAppointmentOnly: true });
		expect(page?.publishedSocialLinks).toEqual({ facebook: "https://facebook.com/test" });
	});

	it("page with only business info can publish", async () => {
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

		await asUser.mutation(api.communityPages.upsert, {
			slug: "biz-info-only",
			isPublic: true,
			draftOwnerInfo: { name: "Jane Doe", title: "Owner" },
		});

		// Should not throw - business info alone is enough to publish
		await asUser.mutation(api.communityPages.publish, {});

		const page = await asUser.query(api.communityPages.get, {});
		expect(page?.publishedOwnerInfo).toEqual({ name: "Jane Doe", title: "Owner" });
		expect(page?.publishedAt).toBeTruthy();
	});

	it("upsert stores draftTheme field", async () => {
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

		await asUser.mutation(api.communityPages.upsert, {
			slug: "theme-test",
			isPublic: false,
			draftTheme: "bold-expressive",
		});

		const page = await asUser.query(api.communityPages.get, {});
		expect(page).toBeTruthy();
		expect(page?.draftTheme).toBe("bold-expressive");
	});

	it("publish copies draftTheme to publishedTheme", async () => {
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

		await asUser.mutation(api.communityPages.upsert, {
			slug: "theme-publish-test",
			isPublic: true,
			draftTheme: "warm-approachable",
			draftBioContent: {
				type: "doc",
				content: [{ type: "paragraph", content: [{ type: "text", text: "Bio" }] }],
			},
		});

		await asUser.mutation(api.communityPages.publish, {});

		const page = await t.run(async (ctx) => {
			const pages = await ctx.db.query("communityPages").collect();
			return pages.find((p) => p.slug === "theme-publish-test");
		});
		expect(page).toBeTruthy();
		expect(page?.publishedTheme).toBe("warm-approachable");
	});

	it("submitInterest creates follow-up task instead of client", async () => {
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

		await asUser.mutation(api.communityPages.upsert, {
			slug: "lead-task-test",
			isPublic: true,
			draftBioContent: {
				type: "doc",
				content: [{ type: "paragraph", content: [{ type: "text", text: "Bio" }] }],
			},
		});
		await asUser.mutation(api.communityPages.publish, {});

		await t.mutation(api.communityPages.submitInterest, {
			slug: "lead-task-test",
			name: "John Smith",
			email: "john@example.com",
			phone: "555-1234",
			message: "I need lawn care services",
		});

		const tasks = await t.run(async (ctx) => {
			return await ctx.db.query("tasks").collect();
		});
		expect(tasks).toHaveLength(1);
		expect(tasks[0].title).toBe("Follow up: John Smith");
		expect(tasks[0].description).toContain("john@example.com");
		expect(tasks[0].description).toContain("555-1234");
		expect(tasks[0].description).toContain("I need lawn care services");
		expect(tasks[0].status).toBe("pending");
		expect(tasks[0].type).toBe("internal");
	});

	it("submitInterest assigns task to org admin", async () => {
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

		await asUser.mutation(api.communityPages.upsert, {
			slug: "admin-assign-test",
			isPublic: true,
			draftBioContent: {
				type: "doc",
				content: [{ type: "paragraph", content: [{ type: "text", text: "Bio" }] }],
			},
		});
		await asUser.mutation(api.communityPages.publish, {});

		await t.mutation(api.communityPages.submitInterest, {
			slug: "admin-assign-test",
			name: "Jane Doe",
			email: "jane@example.com",
		});

		const tasks = await t.run(async (ctx) => {
			return await ctx.db.query("tasks").collect();
		});
		const task = tasks.find((t) => t.title === "Follow up: Jane Doe");
		expect(task).toBeTruthy();
		expect(task?.assigneeUserId).toBeTruthy();
	});

	it("submitInterest task due date is a weekday", async () => {
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

		await asUser.mutation(api.communityPages.upsert, {
			slug: "weekday-test",
			isPublic: true,
			draftBioContent: {
				type: "doc",
				content: [{ type: "paragraph", content: [{ type: "text", text: "Bio" }] }],
			},
		});
		await asUser.mutation(api.communityPages.publish, {});

		await t.mutation(api.communityPages.submitInterest, {
			slug: "weekday-test",
			name: "Bob Wilson",
			email: "bob@example.com",
		});

		const tasks = await t.run(async (ctx) => {
			return await ctx.db.query("tasks").collect();
		});
		const task = tasks.find((t) => t.title === "Follow up: Bob Wilson");
		expect(task).toBeTruthy();
		const dayOfWeek = new Date(task!.date).getDay();
		expect(dayOfWeek).toBeGreaterThanOrEqual(1);
		expect(dayOfWeek).toBeLessThanOrEqual(5);
	});

	it("submitInterest duplicate email creates another task", async () => {
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

		await asUser.mutation(api.communityPages.upsert, {
			slug: "dup-email-test",
			isPublic: true,
			draftBioContent: {
				type: "doc",
				content: [{ type: "paragraph", content: [{ type: "text", text: "Bio" }] }],
			},
		});
		await asUser.mutation(api.communityPages.publish, {});

		await t.mutation(api.communityPages.submitInterest, {
			slug: "dup-email-test",
			name: "Alice Brown",
			email: "alice@example.com",
		});

		await t.mutation(api.communityPages.submitInterest, {
			slug: "dup-email-test",
			name: "Alice Brown",
			email: "alice@example.com",
			message: "Following up again",
		});

		const tasks = await t.run(async (ctx) => {
			return await ctx.db.query("tasks").collect();
		});
		const aliceTasks = tasks.filter((t) => t.title === "Follow up: Alice Brown");
		expect(aliceTasks).toHaveLength(2);
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
