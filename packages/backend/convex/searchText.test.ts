import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach } from "vitest";
import { api } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import { createTestOrg, createTestIdentity } from "./test.helpers";
import {
	numberVariants,
	clientSearchText,
	quoteSearchText,
	invoiceSearchText,
	projectSearchText,
} from "./lib/searchText";

/**
 * Coverage for the search digest: the pure builders in lib/searchText.ts and
 * the lib/triggers.ts maintainers that keep `searchText` in step with every
 * write path (search.ts reads nothing else).
 */

describe("numberVariants", () => {
	it("emits the raw identifier plus each alphanumeric run", () => {
		expect(numberVariants("Q-9931")?.split(" ").sort()).toEqual([
			"9931",
			"Q",
			"Q-9931",
		]);
		expect(numberVariants("INV-7742")?.split(" ").sort()).toEqual([
			"7742",
			"INV",
			"INV-7742",
		]);
	});

	it("dedupes when the raw value is already a single run", () => {
		expect(numberVariants("9931")).toBe("9931");
	});

	it("splits multi-segment identifiers", () => {
		expect(numberVariants("Q-ACME-A")?.split(" ").sort()).toEqual([
			"A",
			"ACME",
			"Q",
			"Q-ACME-A",
		]);
	});

	it("returns undefined for empty/blank/absent input", () => {
		expect(numberVariants(undefined)).toBeUndefined();
		expect(numberVariants(null)).toBeUndefined();
		expect(numberVariants("")).toBeUndefined();
		expect(numberVariants("   ")).toBeUndefined();
	});
});

describe("digest builders", () => {
	it("joins the client fields and flattens tags", () => {
		expect(
			clientSearchText({
				companyName: "Zenith Corp",
				notes: "prefers email",
				tags: ["vip", "north"],
			})
		).toBe("Zenith Corp prefers email vip north");
	});

	it("skips absent and blank fields", () => {
		expect(clientSearchText({ companyName: "Zenith Corp", notes: "  " })).toBe(
			"Zenith Corp"
		);
		expect(projectSearchText({ title: "Deck" })).toBe("Deck");
	});

	it("expands identifier fields into number variants", () => {
		expect(quoteSearchText({ title: "Plain quote", quoteNumber: "Q-9931" })).toContain(
			"9931"
		);
		expect(invoiceSearchText({ invoiceNumber: "INV-7742" })).toContain("7742");
	});
});

describe("searchText triggers", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	async function seedOrg() {
		const { clerkUserId, clerkOrgId } = await t.run((ctx) =>
			createTestOrg(ctx, {
				clerkUserId: "user_digest",
				clerkOrgId: "org_digest",
			})
		);
		return t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
	}

	it("sets the digest on rows created through the public API", async () => {
		const asUser = await seedOrg();
		const clientId = await asUser.mutation(api.clients.create, {
			companyName: "Digest Works",
			status: "active",
			notes: "roof replacement lead",
			tags: ["priority"],
			portalAccessId: crypto.randomUUID(),
		});

		const stored = await t.run((ctx) => ctx.db.get(clientId));
		expect(stored?.searchText).toBe(
			"Digest Works roof replacement lead priority"
		);

		const found = await asUser.query(api.search.globalSearch, {
			query: "priority",
		});
		expect(found.clients.map((c) => c.label)).toEqual(["Digest Works"]);
	});

	it("recomputes the digest on update — new name matches, old one does not", async () => {
		const asUser = await seedOrg();
		const clientId = await asUser.mutation(api.clients.create, {
			companyName: "Oldname Roofing",
			status: "active",
			portalAccessId: crypto.randomUUID(),
		});

		await asUser.mutation(api.clients.update, {
			id: clientId,
			companyName: "Newname Roofing",
		});

		const stored = await t.run((ctx) => ctx.db.get(clientId));
		expect(stored?.searchText).toBe("Newname Roofing");

		const byNew = await asUser.query(api.search.globalSearch, {
			query: "newname",
		});
		expect(byNew.clients.map((c) => c.label)).toEqual(["Newname Roofing"]);

		const byOld = await asUser.query(api.search.globalSearch, {
			query: "oldname",
		});
		expect(byOld.clients).toHaveLength(0);
	});

	it("maintains digests for projects and quotes written through the API", async () => {
		const asUser = await seedOrg();
		const clientId = await asUser.mutation(api.clients.create, {
			companyName: "Trigger Co",
			status: "active",
			portalAccessId: crypto.randomUUID(),
		});
		const projectId = await asUser.mutation(api.projects.create, {
			clientId,
			title: "Peregrine Roof",
			status: "planned",
			projectType: "one-off",
		});
		await asUser.mutation(api.quotes.create, {
			clientId,
			title: "Peregrine Quote",
			quoteNumber: "Q-5150",
			status: "draft",
			subtotal: 100,
			taxAmount: 0,
			total: 100,
		});

		const storedProject = await t.run((ctx) => ctx.db.get(projectId));
		expect(storedProject?.searchText).toContain("Peregrine Roof");

		const byNumber = await asUser.query(api.search.globalSearch, {
			query: "5150",
		});
		expect(byNumber.quotes.map((q) => q.label)).toEqual(["Peregrine Quote"]);
	});
});
