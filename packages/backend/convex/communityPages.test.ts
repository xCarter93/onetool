import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { setupConvexTest } from "./test.setup";
import { createTestIdentity, createTestOrg, createTestOrgWithAddress } from "./test.helpers";
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
			draftTheme: "storefront",
		});

		const page = await asUser.query(api.communityPages.get, {});
		expect(page).toBeTruthy();
		expect(page?.draftTheme).toBe("storefront");
	});

	it("publish copies draftTheme to publishedTheme", async () => {
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

		await asUser.mutation(api.communityPages.upsert, {
			slug: "theme-publish-test",
			isPublic: true,
			draftTheme: "directory",
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
		expect(page?.publishedTheme).toBe("directory");
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
		expect(tasks[0].source).toBe("public_form");
	});

	it("submitInterest emits entity.record_created for the follow-up task", async () => {
		// Public, unauthenticated submission \u2014 the lead-capture task still has to
		// reach record_created automations. It used to be inserted silently.
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

		await asUser.mutation(api.communityPages.upsert, {
			slug: "lead-event-test",
			isPublic: true,
			draftBioContent: {
				type: "doc",
				content: [{ type: "paragraph", content: [{ type: "text", text: "Bio" }] }],
			},
		});
		await asUser.mutation(api.communityPages.publish, {});

		await t.mutation(api.communityPages.submitInterest, {
			slug: "lead-event-test",
			name: "Lead Eventson",
			email: "lead@example.com",
		});

		const taskId = await t.run(async (ctx) => {
			const tasks = await ctx.db.query("tasks").collect();
			return tasks[0]._id;
		});

		const events = await t.run(async (ctx) =>
			ctx.db
				.query("domainEvents")
				.filter((q) => q.eq(q.field("eventType"), "entity.record_created"))
				.collect()
		);
		const taskEvents = events.filter((e) => e.payload.entityId === taskId);
		expect(taskEvents).toHaveLength(1);
		expect(taskEvents[0].payload.entityType).toBe("task");
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

	it("submitInterest assigns to an admin stored with Clerk's org:admin role", async () => {
		// Regression: the webhook stores Clerk's verbatim "org:admin"; the old
		// bare-"admin" DB filter never matched it, silently leaving leads unassigned.
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

		const adminUserId = await t.run(async (ctx) => {
			const memberships = await ctx.db.query("organizationMemberships").collect();
			await ctx.db.patch(memberships[0]._id, { role: "org:admin" });
			return memberships[0].userId;
		});

		await asUser.mutation(api.communityPages.upsert, {
			slug: "org-admin-lead-test",
			isPublic: true,
			draftBioContent: {
				type: "doc",
				content: [{ type: "paragraph", content: [{ type: "text", text: "Bio" }] }],
			},
		});
		await asUser.mutation(api.communityPages.publish, {});

		await t.mutation(api.communityPages.submitInterest, {
			slug: "org-admin-lead-test",
			name: "Lead Person",
			email: "lead@example.com",
		});

		const task = await t.run(async (ctx) => {
			const tasks = await ctx.db.query("tasks").collect();
			return tasks.find((row) => row.title === "Follow up: Lead Person");
		});
		expect(task).toBeTruthy();
		expect(task?.assigneeUserId).toBe(adminUserId);
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

	it("serviceTags round-trip through upsert, publish, and getBySlug", async () => {
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

		await asUser.mutation(api.communityPages.upsert, {
			slug: "service-tags-page",
			isPublic: true,
			draftBioContent: {
				type: "doc",
				content: [{ type: "paragraph", content: [{ type: "text", text: "Bio" }] }],
			},
			draftServiceTags: ["Lawn Care", "Snow Removal", "lawn care"],
		});

		const draft = await asUser.query(api.communityPages.get, {});
		expect(draft?.draftServiceTags).toEqual(["Lawn Care", "Snow Removal"]);

		await asUser.mutation(api.communityPages.publish, {});

		const publicPage = await t.query(api.communityPages.getBySlug, {
			slug: "service-tags-page",
		});
		expect(publicPage?.serviceTags).toEqual(["Lawn Care", "Snow Removal"]);
	});

	it("validateServiceTags rejects more than 8 tags", () => {
		const tags = Array.from({ length: 9 }).map((_, index) => `Tag ${index}`);
		expect(() => __testUtils.validateServiceTags(tags)).toThrow(
			"You can add up to 8 service tags"
		);
	});

	it("validateServiceTags rejects over-length tags", () => {
		const tags = ["a".repeat(41)];
		expect(() => __testUtils.validateServiceTags(tags)).toThrow(
			"Service tag must be 40 characters or less"
		);
	});

	it("validateServiceTags dedupes case-insensitively and drops empties", () => {
		const result = __testUtils.validateServiceTags([
			"Lawn Care",
			"  ",
			"LAWN CARE",
			"Snow Removal",
		]);
		expect(result).toEqual(["Lawn Care", "Snow Removal"]);
	});

	it("validatePricingTiers rejects more than 6 features per tier", () => {
		const tiers = [
			{
				name: "Starter",
				price: "$99",
				features: Array.from({ length: 7 }).map((_, i) => `Feature ${i}`),
			},
		];
		expect(() => __testUtils.validatePricingTiers(tiers)).toThrow(
			"Each pricing tier can have up to 6 features"
		);
	});

	it("validatePricingTiers rejects over-length features", () => {
		const tiers = [
			{ name: "Starter", price: "$99", features: ["a".repeat(81)] },
		];
		expect(() => __testUtils.validatePricingTiers(tiers)).toThrow(
			"Pricing tier feature must be 80 characters or less"
		);
	});

	it("validatePricingTiers rejects more than one highlighted tier", () => {
		const tiers = [
			{ name: "Starter", price: "$99", highlighted: true },
			{ name: "Pro", price: "$199", highlighted: true },
		];
		expect(() => __testUtils.validatePricingTiers(tiers)).toThrow(
			"Only one pricing tier can be highlighted"
		);
	});

	it("submitInterest stores service when it matches a published tag", async () => {
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

		await asUser.mutation(api.communityPages.upsert, {
			slug: "service-match-test",
			isPublic: true,
			draftBioContent: {
				type: "doc",
				content: [{ type: "paragraph", content: [{ type: "text", text: "Bio" }] }],
			},
			draftServiceTags: ["Lawn Care", "Snow Removal"],
		});
		await asUser.mutation(api.communityPages.publish, {});

		await t.mutation(api.communityPages.submitInterest, {
			slug: "service-match-test",
			name: "Match Person",
			email: "match@example.com",
			service: "lawn care",
		});

		const tasks = await t.run(async (ctx) => {
			return await ctx.db.query("tasks").collect();
		});
		const task = tasks.find((row) => row.title === "Follow up: Match Person");
		expect(task).toBeTruthy();
		expect(task?.description).toContain("Service: Lawn Care");
	});

	it("submitInterest drops a non-matching service but still creates the lead", async () => {
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

		await asUser.mutation(api.communityPages.upsert, {
			slug: "service-mismatch-test",
			isPublic: true,
			draftBioContent: {
				type: "doc",
				content: [{ type: "paragraph", content: [{ type: "text", text: "Bio" }] }],
			},
			draftServiceTags: ["Lawn Care"],
		});
		await asUser.mutation(api.communityPages.publish, {});

		await t.mutation(api.communityPages.submitInterest, {
			slug: "service-mismatch-test",
			name: "Mismatch Person",
			email: "mismatch@example.com",
			service: "Roof Repair",
		});

		const tasks = await t.run(async (ctx) => {
			return await ctx.db.query("tasks").collect();
		});
		const task = tasks.find((row) => row.title === "Follow up: Mismatch Person");
		expect(task).toBeTruthy();
		expect(task?.description).not.toContain("Service:");
	});

	it("getBySlug surfaces org addressCity/addressState and excludes street/zip/geo fields", async () => {
		const addressedOrg = await t.run(async (ctx) =>
			createTestOrgWithAddress(ctx, {
				orgName: "Beverly Landscaping",
				clerkUserId: "user_address_test",
				clerkOrgId: "org_address_test",
				addressStreet: "123 Main St",
				addressCity: "Beverly",
				addressState: "MA",
				addressZip: "01915",
				addressCountry: "US",
				latitude: 42.5584,
				longitude: -70.8801,
			})
		);
		const asAddressedUser = t.withIdentity(
			createTestIdentity(addressedOrg.clerkUserId, addressedOrg.clerkOrgId)
		);

		await asAddressedUser.mutation(api.communityPages.upsert, {
			slug: "address-city-state-page",
			isPublic: true,
			draftBioContent: {
				type: "doc",
				content: [{ type: "paragraph", content: [{ type: "text", text: "Bio" }] }],
			},
		});
		await asAddressedUser.mutation(api.communityPages.publish, {});

		const publicPage = await t.query(api.communityPages.getBySlug, {
			slug: "address-city-state-page",
		});

		expect(publicPage?.organization?.addressCity).toBe("Beverly");
		expect(publicPage?.organization?.addressState).toBe("MA");
		const orgKeys = Object.keys(publicPage?.organization ?? {});
		expect(orgKeys).not.toContain("addressStreet");
		expect(orgKeys).not.toContain("addressZip");
		expect(orgKeys).not.toContain("addressCountry");
		expect(orgKeys).not.toContain("latitude");
		expect(orgKeys).not.toContain("longitude");
	});

	it("sectionConfig round-trips through upsert, publish, and getBySlug", async () => {
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

		await asUser.mutation(api.communityPages.upsert, {
			slug: "section-config-page",
			isPublic: true,
			draftBioContent: {
				type: "doc",
				content: [{ type: "paragraph", content: [{ type: "text", text: "Bio" }] }],
			},
			draftSectionConfig: [
				{ id: "gallery", visible: true },
				{ id: "bio", visible: false },
			],
		});

		const draft = await asUser.query(api.communityPages.get, {});
		expect(draft?.draftSectionConfig).toEqual([
			{ id: "gallery", visible: true },
			{ id: "bio", visible: false },
		]);

		await asUser.mutation(api.communityPages.publish, {});

		const publicPage = await t.query(api.communityPages.getBySlug, {
			slug: "section-config-page",
		});
		expect(publicPage?.sectionConfig).toEqual([
			{ id: "gallery", visible: true },
			{ id: "bio", visible: false },
		]);
	});

	it("colorMode round-trips, and an unset page publishes without one", async () => {
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

		await asUser.mutation(api.communityPages.upsert, {
			slug: "color-mode-page",
			isPublic: true,
			draftBioContent: {
				type: "doc",
				content: [{ type: "paragraph", content: [{ type: "text", text: "Bio" }] }],
			},
			draftColorMode: "dark",
		});

		await asUser.mutation(api.communityPages.publish, {});

		const publicPage = await t.query(api.communityPages.getBySlug, {
			slug: "color-mode-page",
		});
		expect(publicPage?.colorMode).toBe("dark");

		// A page that predates the field must still publish; the renderer, not the
		// stored value, is what supplies the default.
		await asUser.mutation(api.communityPages.upsert, {
			slug: "color-mode-page",
			isPublic: true,
		});
		const stillDark = await t.query(api.communityPages.getBySlug, {
			slug: "color-mode-page",
		});
		expect(stillDark?.colorMode).toBe("dark");
	});

	it("the page layout round-trips to the public payload", async () => {
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

		await asUser.mutation(api.communityPages.upsert, {
			slug: "layout-page",
			isPublic: true,
			draftBioContent: {
				type: "doc",
				content: [{ type: "paragraph", content: [{ type: "text", text: "Bio" }] }],
			},
			draftTheme: "storefront",
		});

		await asUser.mutation(api.communityPages.publish, {});

		const publicPage = await t.query(api.communityPages.getBySlug, {
			slug: "layout-page",
		});
		expect(publicPage?.theme).toBe("storefront");

		// Legacy rows still hold the Phase 8 theme names. They stay readable — the
		// renderer resolves anything it does not recognise to Showcase — so a
		// publish that omits the field must not disturb what is stored.
		await asUser.mutation(api.communityPages.upsert, {
			slug: "layout-page",
			isPublic: true,
		});
		const unchanged = await t.query(api.communityPages.getBySlug, {
			slug: "layout-page",
		});
		expect(unchanged?.theme).toBe("storefront");
	});

	it("the accent colour round-trips to the public payload", async () => {
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

		await asUser.mutation(api.communityPages.upsert, {
			slug: "accent-page",
			isPublic: true,
			draftBioContent: {
				type: "doc",
				content: [{ type: "paragraph", content: [{ type: "text", text: "Bio" }] }],
			},
			draftAccent: "#7c3aed",
		});

		await asUser.mutation(api.communityPages.publish, {});

		const publicPage = await t.query(api.communityPages.getBySlug, {
			slug: "accent-page",
		});
		expect(publicPage?.accent).toBe("#7c3aed");
	});

	it("refuses an accent that is not a colour", async () => {
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

		// The value lands in an inline style on a page anyone can load.
		await expect(
			asUser.mutation(api.communityPages.upsert, {
				slug: "accent-reject",
				draftAccent: "#7c3aed;background:url(https://evil.example)",
			})
		).rejects.toThrow(/hex value/);
	});

	it("faq and team round-trip through upsert, publish, and getBySlug", async () => {
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

		await asUser.mutation(api.communityPages.upsert, {
			slug: "faq-team-page",
			isPublic: true,
			draftFaqItems: [
				{ question: "Do you work weekends?", answer: "Saturdays until 2pm." },
			],
			draftTeamMembers: [
				{ name: "Dana Reyes", role: "Crew lead" },
				{ name: "Sam Okoye" },
			],
			draftSectionConfig: [
				{ id: "faq", visible: true },
				{ id: "team", visible: true },
			],
		});

		await asUser.mutation(api.communityPages.publish, {});

		const publicPage = await t.query(api.communityPages.getBySlug, {
			slug: "faq-team-page",
		});
		expect(publicPage?.faqItems).toEqual([
			{ question: "Do you work weekends?", answer: "Saturdays until 2pm." },
		]);
		// Photos are absent here, so no member carries a URL — and no member ever
		// carries the storage id it was uploaded under.
		expect(publicPage?.teamMembers).toEqual([
			{ name: "Dana Reyes", role: "Crew lead", bio: undefined, photoUrl: undefined },
			{ name: "Sam Okoye", role: undefined, bio: undefined, photoUrl: undefined },
		]);
		expect(publicPage?.sectionConfig).toEqual([
			{ id: "faq", visible: true },
			{ id: "team", visible: true },
		]);
	});

	it("a page with only FAQ content is publishable", async () => {
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

		await asUser.mutation(api.communityPages.upsert, {
			slug: "faq-only-page",
			isPublic: true,
			draftFaqItems: [{ question: "Weekends?", answer: "Saturdays." }],
		});

		await expect(
			asUser.mutation(api.communityPages.publish, {})
		).resolves.not.toThrow();
	});

	it("a page with no sectionConfig publishes without one", async () => {
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

		await asUser.mutation(api.communityPages.upsert, {
			slug: "no-section-config-page",
			isPublic: true,
			draftBioContent: {
				type: "doc",
				content: [{ type: "paragraph", content: [{ type: "text", text: "Bio" }] }],
			},
		});
		await asUser.mutation(api.communityPages.publish, {});

		const publicPage = await t.query(api.communityPages.getBySlug, {
			slug: "no-section-config-page",
		});
		expect(publicPage?.sectionConfig).toBeUndefined();
	});

	it("validateAccent accepts only hex colours", () => {
		expect(() => __testUtils.validateAccent("#00a6f4")).not.toThrow();
		expect(() => __testUtils.validateAccent("#abc")).not.toThrow();
		expect(() => __testUtils.validateAccent("blue")).toThrow();
		expect(() => __testUtils.validateAccent("rgb(0,0,0)")).toThrow();
		expect(() => __testUtils.validateAccent("#00a6f4;color:red")).toThrow();
	});

	it("validateSectionConfig rejects a section listed twice", () => {
		expect(() =>
			__testUtils.validateSectionConfig([
				{ id: "bio", visible: true },
				{ id: "bio", visible: false },
			])
		).toThrow("Each page section can only be listed once");
	});

	it("validateFaqItems and validateTeamMembers cap what lands on a public page", () => {
		expect(() =>
			__testUtils.validateFaqItems([{ question: "  ", answer: "Yes" }])
		).toThrow("Each question needs to be filled in");
		expect(() =>
			__testUtils.validateFaqItems([{ question: "Weekends?", answer: "  " }])
		).toThrow("Each question needs an answer");
		expect(() =>
			__testUtils.validateFaqItems([
				{ question: "a".repeat(201), answer: "Yes" },
			])
		).toThrow("200 characters or less");
		expect(() =>
			__testUtils.validateFaqItems(
				Array.from({ length: 13 }, () => ({ question: "q", answer: "a" }))
			)
		).toThrow("up to 12 questions");

		expect(() => __testUtils.validateTeamMembers([{ name: " " }])).toThrow(
			"Each team member needs a name"
		);
		expect(() =>
			__testUtils.validateTeamMembers([
				{ name: "Dana", bio: "b".repeat(401) },
			])
		).toThrow("400 characters or less");
		expect(() =>
			__testUtils.validateTeamMembers([
				{ name: "Dana", role: "Crew lead", bio: "Twelve years on the job." },
			])
		).not.toThrow();
	});

	it("validateSectionConfig rejects a layout the section does not offer", () => {
		expect(() =>
			__testUtils.validateSectionConfig([
				{ id: "pricing", visible: true, layout: "carousel" },
			])
		).toThrow("is not a layout the pricing section offers");
		expect(() =>
			__testUtils.validateSectionConfig([
				{ id: "gallery", visible: true, layout: "grid" },
				{ id: "pricing", visible: true, layout: "compact" },
				{ id: "bio", visible: true },
			])
		).not.toThrow();
	});
});
