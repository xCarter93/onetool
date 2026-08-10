import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import { addMemberToOrg, createTestIdentity, createTestOrg } from "./test.helpers";
import { Id } from "./_generated/dataModel";

/** Stands in for the IP hash the Next.js route derives and attests. */
const TEST_IP_HASH = "test-community-ip-hash";

describe("Community leads", () => {
	let t: ReturnType<typeof convexTest>;
	let clerkUserId = "";
	let clerkOrgId = "";
	let orgId: Id<"organizations">;

	/** Publishes a page and submits one request through the public mutation. */
	async function publishAndSubmit(
		slug: string,
		submission: {
			name: string;
			email: string;
			phone?: string;
			message?: string;
			service?: string;
			website?: string;
		}
	) {
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		await asUser.mutation(api.communityPages.upsert, {
			slug,
			isPublic: true,
			draftServiceTags: ["Lawn Care"],
			draftBioContent: {
				type: "doc",
				content: [{ type: "paragraph", content: [{ type: "text", text: "Bio" }] }],
			},
		});
		await asUser.mutation(api.communityPages.publish, {});
		await t.mutation(internal.communityPages.submitInterest, { ipHash: TEST_IP_HASH, slug, ...submission });
	}

	beforeEach(async () => {
		t = setupConvexTest();
		const ids = await t.run(async (ctx) => createTestOrg(ctx));
		clerkUserId = ids.clerkUserId;
		clerkOrgId = ids.clerkOrgId;
		orgId = ids.orgId;
	});

	it("submitInterest stores a lead alongside the follow-up task", async () => {
		await publishAndSubmit("lead-row-test", {
			name: "John Smith",
			email: "John@Example.com",
			phone: "555-1234",
			message: "I need lawn care",
			service: "lawn care",
		});

		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const result = await asUser.query(api.communityLeads.list, {});

		expect(result.total).toBe(1);
		expect(result.newCount).toBe(1);
		const [lead] = result.leads;
		expect(lead.name).toBe("John Smith");
		// Sanitized, never the raw arg.
		expect(lead.email).toBe("john@example.com");
		expect(lead.phone).toBe("555-1234");
		expect(lead.message).toBe("I need lawn care");
		// Matched case-insensitively against the published tag, stored canonically.
		expect(lead.service).toBe("Lawn Care");
		expect(lead.status).toBe("new");
		expect(lead.slug).toBe("lead-row-test");
		expect(lead.taskId).toBeTruthy();
	});

	it("submitInterest drops a service that is not a published tag", async () => {
		await publishAndSubmit("lead-service-drop", {
			name: "Mismatch Person",
			email: "mismatch@example.com",
			service: "Roof Repair",
		});

		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const result = await asUser.query(api.communityLeads.list, {});
		expect(result.leads[0].service).toBeUndefined();
	});

	it("honeypot submission creates neither a lead nor a task", async () => {
		await publishAndSubmit("lead-honeypot", {
			name: "Bot",
			email: "bot@example.com",
			website: "http://spam.example.com",
		});

		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const result = await asUser.query(api.communityLeads.list, {});
		expect(result.total).toBe(0);

		const tasks = await t.run(async (ctx) => ctx.db.query("tasks").collect());
		expect(tasks).toHaveLength(0);
	});

	it("list filters by status and keeps counts org-wide", async () => {
		await publishAndSubmit("lead-filter-test", {
			name: "First Person",
			email: "first@example.com",
		});
		await t.mutation(internal.communityPages.submitInterest, { ipHash: TEST_IP_HASH,
			slug: "lead-filter-test",
			name: "Second Person",
			email: "second@example.com",
		});

		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const before = await asUser.query(api.communityLeads.list, {});
		const target = before.leads.find((l) => l.name === "First Person")!;

		await asUser.mutation(api.communityLeads.updateStatus, {
			leadId: target._id,
			status: "contacted",
		});

		const newOnly = await asUser.query(api.communityLeads.list, { status: "new" });
		expect(newOnly.leads).toHaveLength(1);
		expect(newOnly.leads[0].name).toBe("Second Person");
		// Counts describe the whole inbox, not the filtered slice.
		expect(newOnly.total).toBe(2);
		expect(newOnly.newCount).toBe(1);
	});

	it("promoteToClient creates a linked client with a primary contact", async () => {
		await publishAndSubmit("lead-promote-test", {
			name: "Marisol Ruiz",
			email: "marisol@example.com",
			phone: "555-9876",
			message: "Weekly mowing please",
			service: "lawn care",
		});

		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const before = await asUser.query(api.communityLeads.list, {});
		const leadId = before.leads[0]._id;

		const clientId = await asUser.mutation(api.communityLeads.promoteToClient, {
			leadId,
		});

		const { client, contacts, lead } = await t.run(async (ctx) => ({
			client: await ctx.db.get(clientId),
			contacts: await ctx.db
				.query("clientContacts")
				.filter((q) => q.eq(q.field("clientId"), clientId))
				.collect(),
			lead: await ctx.db.get(leadId),
		}));

		expect(client?.companyName).toBe("Marisol Ruiz");
		expect(client?.status).toBe("lead");
		expect(client?.leadSource).toBe("community-page");
		// Every client-creation path mints a portal id; a bare insert would not.
		expect(client?.portalAccessId).toBeTruthy();
		expect(contacts).toHaveLength(1);
		expect(contacts[0].firstName).toBe("Marisol");
		expect(contacts[0].lastName).toBe("Ruiz");
		expect(contacts[0].email).toBe("marisol@example.com");
		expect(contacts[0].isPrimary).toBe(true);

		expect(lead?.clientId).toBe(clientId);
		expect(lead?.status).toBe("converted");
	});

	it("promoteToClient is idempotent", async () => {
		await publishAndSubmit("lead-promote-twice", {
			name: "Dev Patel",
			email: "dev@example.com",
		});

		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const before = await asUser.query(api.communityLeads.list, {});
		const leadId = before.leads[0]._id;

		const first = await asUser.mutation(api.communityLeads.promoteToClient, { leadId });
		const second = await asUser.mutation(api.communityLeads.promoteToClient, { leadId });

		expect(second).toBe(first);
		const clients = await t.run(async (ctx) => ctx.db.query("clients").collect());
		expect(clients).toHaveLength(1);
	});

	it("a member without the community grant cannot read or move leads", async () => {
		await publishAndSubmit("lead-rbac-test", {
			name: "Angela Nkemelu",
			email: "angela@example.com",
		});

		const asAdmin = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const leadId = (await asAdmin.query(api.communityLeads.list, {})).leads[0]._id;

		const member = await t.run(async (ctx) =>
			addMemberToOrg(ctx, orgId, { clerkUserId: "member_leads_rbac" })
		);
		const asMember = t.withIdentity(
			createTestIdentity(member.clerkUserId, clerkOrgId)
		);

		await expect(asMember.query(api.communityLeads.list, {})).rejects.toThrow();
		await expect(
			asMember.mutation(api.communityLeads.updateStatus, {
				leadId,
				status: "contacted",
			})
		).rejects.toThrow();
		await expect(
			asMember.mutation(api.communityLeads.promoteToClient, { leadId })
		).rejects.toThrow();
	});
});

describe("Community analytics", () => {
	let t: ReturnType<typeof convexTest>;
	let clerkUserId = "";
	let clerkOrgId = "";

	async function publishPage(slug: string) {
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		await asUser.mutation(api.communityPages.upsert, {
			slug,
			isPublic: true,
			draftBioContent: {
				type: "doc",
				content: [{ type: "paragraph", content: [{ type: "text", text: "Bio" }] }],
			},
		});
		await asUser.mutation(api.communityPages.publish, {});
	}

	beforeEach(async () => {
		t = setupConvexTest();
		const ids = await t.run(async (ctx) => createTestOrg(ctx));
		clerkUserId = ids.clerkUserId;
		clerkOrgId = ids.clerkOrgId;
	});

	it("recordView buckets repeat views into one day row", async () => {
		await publishPage("views-bucket-test");

		await t.mutation(internal.communityAnalytics.recordView, { ipHash: TEST_IP_HASH,
			slug: "views-bucket-test",
		});
		await t.mutation(internal.communityAnalytics.recordView, { ipHash: TEST_IP_HASH,
			slug: "views-bucket-test",
		});
		await t.mutation(internal.communityAnalytics.recordView, { ipHash: TEST_IP_HASH,
			slug: "views-bucket-test",
		});

		const rows = await t.run(async (ctx) =>
			ctx.db.query("communityPageViews").collect()
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].count).toBe(3);

		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const stats = await asUser.query(api.communityAnalytics.dashboard, {
			days: 30,
		});
		expect(stats.views).toBe(3);
		expect(stats.series).toHaveLength(30);
		expect(stats.series[29].views).toBe(3);
	});

	it("recordView ignores an unpublished page", async () => {
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		await asUser.mutation(api.communityPages.upsert, {
			slug: "views-draft-test",
			isPublic: false,
		});

		await t.mutation(internal.communityAnalytics.recordView, { ipHash: TEST_IP_HASH,
			slug: "views-draft-test",
		});
		await t.mutation(internal.communityAnalytics.recordView, { ipHash: TEST_IP_HASH, slug: "no-such-page" });

		const rows = await t.run(async (ctx) =>
			ctx.db.query("communityPageViews").collect()
		);
		expect(rows).toHaveLength(0);
	});

	it("recordView skips the owner's own visits", async () => {
		await publishPage("views-owner-test");

		// The beacon route passes the signed-in viewer's active Clerk org.
		await t.mutation(internal.communityAnalytics.recordView, { ipHash: TEST_IP_HASH,
			slug: "views-owner-test",
			viewerClerkOrgId: clerkOrgId,
		});
		// A signed-in user from some other org is a real visitor.
		await t.mutation(internal.communityAnalytics.recordView, { ipHash: TEST_IP_HASH,
			slug: "views-owner-test",
			viewerClerkOrgId: "org_somebody_else",
		});

		const rows = await t.run(async (ctx) =>
			ctx.db.query("communityPageViews").collect()
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].count).toBe(1);
	});

	it("classifies view sources and ranks them in the dashboard", async () => {
		await publishPage("views-sources-test");
		const record = (extra: { src?: string; referrer?: string }) =>
			t.mutation(internal.communityAnalytics.recordView, { ipHash: TEST_IP_HASH,
				slug: "views-sources-test",
				...extra,
			});

		await record({ src: "qr" });
		await record({ src: "qr" });
		// A share-kit tag wins over whatever referrer rode along.
		await record({ src: "link", referrer: "https://www.google.com/" });
		await record({ referrer: "https://www.google.com/search?q=lawn+care" });
		await record({ referrer: "https://m.facebook.com/some/post" });
		await record({ referrer: "https://chamber.example.com/members" });
		await record({});

		const rows = await t.run(async (ctx) =>
			ctx.db.query("communityPageViews").collect()
		);
		expect(rows).toHaveLength(6);

		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const stats = await asUser.query(api.communityAnalytics.dashboard, {
			days: 7,
		});
		expect(stats.views).toBe(7);
		expect(stats.sources).toEqual([
			{ source: "qr", views: 2 },
			{ source: "link", views: 1 },
			{ source: "search", views: 1 },
			{ source: "social", views: 1 },
			{ source: "referral", views: 1 },
			{ source: "direct", views: 1 },
		]);
	});

	it("rows from before channels existed read as direct", async () => {
		await publishPage("views-legacy-test");
		await t.mutation(internal.communityAnalytics.recordView, { ipHash: TEST_IP_HASH,
			slug: "views-legacy-test",
			src: "qr",
		});
		// A pre-P5b row: same page and day, no source field at all.
		await t.run(async (ctx) => {
			const page = (await ctx.db.query("communityPages").collect()).find(
				(row) => row.slug === "views-legacy-test"
			);
			await ctx.db.insert("communityPageViews", {
				orgId: page!.orgId,
				communityPageId: page!._id,
				day: new Date().toISOString().slice(0, 10),
				count: 3,
			});
		});

		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const stats = await asUser.query(api.communityAnalytics.dashboard, {
			days: 7,
		});
		expect(stats.views).toBe(4);
		expect(stats.sources).toEqual([
			{ source: "direct", views: 3 },
			{ source: "qr", views: 1 },
		]);
	});

	it("views bucket on the org's calendar day, not UTC", async () => {
		await publishPage("views-timezone-test");
		await t.run(async (ctx) => {
			const org = await ctx.db.query("organizations").first();
			await ctx.db.patch(org!._id, { timezone: "America/New_York" });
		});

		vi.useFakeTimers();
		try {
			// 01:00 UTC is 9pm the previous evening in New York.
			vi.setSystemTime(new Date("2026-08-10T01:00:00.000Z"));
			await t.mutation(internal.communityAnalytics.recordView, { ipHash: TEST_IP_HASH,
				slug: "views-timezone-test",
			});

			const rows = await t.run(async (ctx) =>
				ctx.db.query("communityPageViews").collect()
			);
			expect(rows).toHaveLength(1);
			expect(rows[0].day).toBe("2026-08-09");

			const asUser = t.withIdentity(
				createTestIdentity(clerkUserId, clerkOrgId)
			);
			const stats = await asUser.query(api.communityAnalytics.dashboard, {
				days: 7,
			});
			// It is still Aug 9 in New York, so the view sits on the chart's
			// last point rather than showing up under "tomorrow".
			expect(stats.series[6].day).toBe("2026-08-09");
			expect(stats.series[6].views).toBe(1);
			expect(stats.views).toBe(1);
		} finally {
			vi.useRealTimers();
		}
	});

	it("dashboard divides requests by views and counts what is waiting", async () => {
		await publishPage("views-conversion-test");
		await t.mutation(internal.communityAnalytics.recordView, { ipHash: TEST_IP_HASH,
			slug: "views-conversion-test",
		});
		await t.mutation(internal.communityAnalytics.recordView, { ipHash: TEST_IP_HASH,
			slug: "views-conversion-test",
		});
		await t.mutation(internal.communityPages.submitInterest, { ipHash: TEST_IP_HASH,
			slug: "views-conversion-test",
			name: "Converting Visitor",
			email: "converting@example.com",
		});

		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const stats = await asUser.query(api.communityAnalytics.dashboard, {
			days: 7,
		});

		expect(stats.views).toBe(2);
		expect(stats.requests).toBe(1);
		expect(stats.conversionPct).toBe(50);
		expect(stats.waitingCount).toBe(1);
		// Nothing has been picked up yet, so there is no response time to report.
		expect(stats.medianFirstResponseMs).toBeNull();
	});

	it("first response time is stamped once, on the move off new", async () => {
		await publishPage("views-response-test");
		await t.mutation(internal.communityPages.submitInterest, { ipHash: TEST_IP_HASH,
			slug: "views-response-test",
			name: "Waiting Person",
			email: "waiting@example.com",
		});

		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const leadId = (await asUser.query(api.communityLeads.list, {})).leads[0]._id;

		await asUser.mutation(api.communityLeads.updateStatus, {
			leadId,
			status: "contacted",
		});
		const stamped = await t.run(async (ctx) => ctx.db.get(leadId));
		expect(stamped?.firstRespondedAt).toBeTruthy();

		// A later move must not restate when it was first picked up.
		await asUser.mutation(api.communityLeads.updateStatus, {
			leadId,
			status: "quoted",
		});
		const after = await t.run(async (ctx) => ctx.db.get(leadId));
		expect(after?.firstRespondedAt).toBe(stamped?.firstRespondedAt);

		const stats = await asUser.query(api.communityAnalytics.dashboard, {
			days: 7,
		});
		expect(stats.medianFirstResponseMs).not.toBeNull();
		expect(stats.waitingCount).toBe(0);
	});
});

describe("Community public write endpoints", () => {
	let t: ReturnType<typeof convexTest>;
	let clerkUserId = "";
	let clerkOrgId = "";
	let originalCommunitySecret: string | undefined;
	let originalPortalSecret: string | undefined;

	const SECRET = "community-endpoint-test-secret";

	async function publishPage(slug: string) {
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		await asUser.mutation(api.communityPages.upsert, {
			slug,
			isPublic: true,
			draftBioContent: {
				type: "doc",
				content: [{ type: "paragraph", content: [{ type: "text", text: "Bio" }] }],
			},
		});
		await asUser.mutation(api.communityPages.publish, {});
	}

	function post(path: string, body: unknown, secret?: string) {
		return t.fetch(path, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				...(secret === undefined ? {} : { "x-community-secret": secret }),
			},
			body: JSON.stringify(body),
		});
	}

	beforeEach(async () => {
		t = setupConvexTest();
		const ids = await t.run(async (ctx) => createTestOrg(ctx));
		clerkUserId = ids.clerkUserId;
		clerkOrgId = ids.clerkOrgId;
		originalCommunitySecret = process.env.COMMUNITY_PUBLIC_SECRET;
		originalPortalSecret = process.env.PORTAL_OTP_REQUEST_SECRET;
		process.env.COMMUNITY_PUBLIC_SECRET = SECRET;
		delete process.env.PORTAL_OTP_REQUEST_SECRET;
	});

	afterEach(() => {
		if (originalCommunitySecret === undefined) {
			delete process.env.COMMUNITY_PUBLIC_SECRET;
		} else {
			process.env.COMMUNITY_PUBLIC_SECRET = originalCommunitySecret;
		}
		if (originalPortalSecret === undefined) {
			delete process.env.PORTAL_OTP_REQUEST_SECRET;
		} else {
			process.env.PORTAL_OTP_REQUEST_SECRET = originalPortalSecret;
		}
	});

	it("rejects an interest submission with no secret and writes nothing", async () => {
		await publishPage("gate-interest-test");

		const res = await post("/community/interest", {
			slug: "gate-interest-test",
			name: "Spam Bot",
			email: "bot@example.com",
			ipHash: "forged-hash",
		});

		expect(res.status).toBe(401);
		const leads = await t.run(async (ctx) =>
			ctx.db.query("communityLeads").collect()
		);
		expect(leads).toHaveLength(0);
	});

	it("rejects an interest submission with the wrong secret", async () => {
		await publishPage("gate-interest-wrong-test");

		const res = await post(
			"/community/interest",
			{
				slug: "gate-interest-wrong-test",
				name: "Spam Bot",
				email: "bot@example.com",
				ipHash: "forged-hash",
			},
			"not-the-secret"
		);

		expect(res.status).toBe(401);
		const leads = await t.run(async (ctx) =>
			ctx.db.query("communityLeads").collect()
		);
		expect(leads).toHaveLength(0);
	});

	it("accepts an attested interest submission", async () => {
		await publishPage("gate-interest-ok-test");

		const res = await post(
			"/community/interest",
			{
				slug: "gate-interest-ok-test",
				name: "Real Person",
				email: "real@example.com",
				ipHash: "server-derived-hash",
			},
			SECRET
		);

		expect(res.status).toBe(200);
		const leads = await t.run(async (ctx) =>
			ctx.db.query("communityLeads").collect()
		);
		expect(leads).toHaveLength(1);
		expect(leads[0].email).toBe("real@example.com");
	});

	it("rejects an unattested view beacon and counts nothing", async () => {
		await publishPage("gate-view-test");

		const res = await post("/community/view", {
			slug: "gate-view-test",
			ipHash: "forged-hash",
		});

		expect(res.status).toBe(401);
		const rows = await t.run(async (ctx) =>
			ctx.db.query("communityPageViews").collect()
		);
		expect(rows).toHaveLength(0);
	});

	it("counts an attested view beacon", async () => {
		await publishPage("gate-view-ok-test");

		const res = await post(
			"/community/view",
			{ slug: "gate-view-ok-test", ipHash: "server-derived-hash" },
			SECRET
		);

		expect(res.status).toBe(200);
		const rows = await t.run(async (ctx) =>
			ctx.db.query("communityPageViews").collect()
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].count).toBe(1);
	});

	it("falls back to the portal secret so no new env var is required", async () => {
		delete process.env.COMMUNITY_PUBLIC_SECRET;
		process.env.PORTAL_OTP_REQUEST_SECRET = "portal-fallback-secret";
		await publishPage("gate-fallback-test");

		const res = await post(
			"/community/view",
			{ slug: "gate-fallback-test", ipHash: "server-derived-hash" },
			"portal-fallback-secret"
		);

		expect(res.status).toBe(200);
		const rows = await t.run(async (ctx) =>
			ctx.db.query("communityPageViews").collect()
		);
		expect(rows).toHaveLength(1);
	});

	it("rejects everything when neither secret is configured", async () => {
		delete process.env.COMMUNITY_PUBLIC_SECRET;
		delete process.env.PORTAL_OTP_REQUEST_SECRET;
		await publishPage("gate-unconfigured-test");

		const res = await post(
			"/community/view",
			{ slug: "gate-unconfigured-test", ipHash: "server-derived-hash" },
			""
		);

		expect(res.status).toBe(401);
	});
});
