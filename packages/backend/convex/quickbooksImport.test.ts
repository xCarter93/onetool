import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { setupConvexTest } from "./test.setup";
import {
	addMemberToOrg,
	createPremiumTestIdentity,
	createTestOrg,
} from "./test.helpers";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

type QboCustomer = {
	Id: string;
	SyncToken?: string;
	DisplayName?: string;
	CompanyName?: string;
	GivenName?: string;
	FamilyName?: string;
	Job?: boolean;
	PrimaryEmailAddr?: { Address?: string };
	PrimaryPhone?: { FreeFormNumber?: string };
	BillAddr?: Record<string, string>;
};

describe("QuickBooks customer import", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
		// Fake timers keep the sync worker's scheduled kicks from firing into
		// the stubbed fetch; every import run here is invoked explicitly.
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	async function setupOrg(suffix: string) {
		const org = await t.run(async (ctx) =>
			createTestOrg(ctx, {
				clerkUserId: `qboimp_user_${suffix}`,
				clerkOrgId: `qboimp_org_${suffix}`,
			})
		);
		const asOwner = t.withIdentity(
			createPremiumTestIdentity(org.clerkUserId, org.clerkOrgId)
		);
		return { org, asOwner };
	}

	async function connect(orgId: Id<"organizations">) {
		await t.run(async (ctx) => {
			const organization = await ctx.db.get(orgId);
			await ctx.db.insert("quickbooksConnections", {
				orgId,
				realmId: `realm_${orgId}`,
				environment: "sandbox",
				accessToken: "access_live",
				accessTokenExpiresAt: Date.now() + 10 * HOUR,
				refreshToken: "refresh_live",
				refreshTokenExpiresAt: Date.now() + 90 * DAY,
				status: "connected",
				connectedByUserId: organization!.ownerUserId,
				syncInvoicesOn: "sent",
				syncPayments: true,
				autoDisambiguateNames: true,
			});
		});
	}

	/**
	 * Stub the Customer query. `pages[n]` answers STARTPOSITION n*100+1, so a
	 * short page ends the loop exactly like QBO does.
	 */
	function stubCustomerPages(pages: QboCustomer[][]): string[] {
		const calls: string[] = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => {
				const decoded = decodeURIComponent(String(url));
				calls.push(decoded);
				const start = Number(/STARTPOSITION (\d+)/.exec(decoded)?.[1] ?? "1");
				const customers = pages[Math.floor((start - 1) / 100)] ?? [];
				return {
					ok: true,
					status: 200,
					headers: { get: () => "tid_test" },
					json: async () => ({ QueryResponse: { Customer: customers } }),
					text: async () => "",
				} as unknown as Response;
			})
		);
		return calls;
	}

	async function clientLinks(orgId: Id<"organizations">) {
		return await t.run(async (ctx) =>
			ctx.db
				.query("quickbooksEntityLinks")
				.withIndex("by_org_entity", (q) =>
					q.eq("orgId", orgId).eq("entityType", "client")
				)
				.collect()
		);
	}

	async function orgClients(
		orgId: Id<"organizations">
	): Promise<Doc<"clients">[]> {
		return await t.run(async (ctx) =>
			ctx.db
				.query("clients")
				.withIndex("by_org", (q) => q.eq("orgId", orgId))
				.collect()
		);
	}

	async function rowsFor(runId: Id<"quickbooksImportRuns">) {
		return await t.run(async (ctx) =>
			ctx.db
				.query("quickbooksImportRows")
				.withIndex("by_run", (q) => q.eq("runId", runId))
				.collect()
		);
	}

	// ------------------------------------------------------------------
	// Matching
	// ------------------------------------------------------------------

	it("auto-links a customer whose name matches one client", async () => {
		const { org, asOwner } = await setupOrg("auto");
		await connect(org.orgId);
		const clientId = await asOwner.mutation(api.clients.create, {
			companyName: "Acme Landscaping",
			status: "active",
		});

		stubCustomerPages([
			[{ Id: "77", SyncToken: "3", DisplayName: "  acme landscaping " }],
		]);

		const { runId } = await asOwner.action(
			api.quickbooksImportActions.startImport,
			{}
		);

		const rows = await rowsFor(runId);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			outcome: "auto_linked",
			linkedClientId: clientId,
			qboId: "77",
		});

		const links = await clientLinks(org.orgId);
		expect(links).toHaveLength(1);
		expect(links[0]).toMatchObject({
			localId: clientId,
			qboId: "77",
			qboSyncToken: "3",
		});

		// No client was created for a matched customer.
		expect(await orgClients(org.orgId)).toHaveLength(1);

		const run = await asOwner.query(api.quickbooksImport.getImportRun, {});
		expect(run).toMatchObject({
			status: "completed",
			totalFetched: 1,
			autoLinked: 1,
			imported: 0,
			ambiguous: 0,
		});
		expect(run?.completedAt).toBeGreaterThan(0);
	});

	it("breaks a same-name tie on the primary contact email", async () => {
		const { org, asOwner } = await setupOrg("tie");
		await connect(org.orgId);
		const wrongId = await asOwner.mutation(api.clients.create, {
			companyName: "Acme Co",
			status: "active",
		});
		const rightId = await asOwner.mutation(api.clients.create, {
			companyName: "Acme Co",
			status: "active",
		});
		await asOwner.mutation(api.clientContacts.create, {
			clientId: wrongId,
			firstName: "Wrong",
			lastName: "Person",
			email: "other@acme.test",
			isPrimary: true,
		});
		await asOwner.mutation(api.clientContacts.create, {
			clientId: rightId,
			firstName: "Dana",
			lastName: "Reed",
			email: "dana@acme.test",
			isPrimary: true,
		});

		stubCustomerPages([
			[
				{
					Id: "88",
					DisplayName: "Acme Co",
					PrimaryEmailAddr: { Address: "Dana@Acme.TEST" },
				},
			],
		]);

		const { runId } = await asOwner.action(
			api.quickbooksImportActions.startImport,
			{}
		);

		const rows = await rowsFor(runId);
		expect(rows[0]).toMatchObject({
			outcome: "auto_linked",
			linkedClientId: rightId,
		});
		const links = await clientLinks(org.orgId);
		expect(links).toHaveLength(1);
		expect(links[0].localId).toBe(rightId);
	});

	it("creates an ambiguous row and never auto-merges", async () => {
		const { org, asOwner } = await setupOrg("amb");
		await connect(org.orgId);
		const a = await asOwner.mutation(api.clients.create, {
			companyName: "Beta Co",
			status: "active",
		});
		const b = await asOwner.mutation(api.clients.create, {
			companyName: "Beta Co",
			status: "active",
		});

		stubCustomerPages([[{ Id: "91", DisplayName: "Beta Co" }]]);

		const { runId } = await asOwner.action(
			api.quickbooksImportActions.startImport,
			{}
		);

		const rows = await rowsFor(runId);
		expect(rows[0].outcome).toBe("ambiguous");
		expect(rows[0].candidateClientIds?.sort()).toEqual([a, b].sort());
		expect(await clientLinks(org.orgId)).toHaveLength(0);

		const run = await asOwner.query(api.quickbooksImport.getImportRun, {});
		expect(run).toMatchObject({ status: "awaiting_review", ambiguous: 1 });
		expect(run?.completedAt).toBeUndefined();

		const listed = await asOwner.query(api.quickbooksImport.listAmbiguousRows, {
			runId,
		});
		expect(listed).toHaveLength(1);
		expect(listed[0]).toMatchObject({
			rowId: rows[0]._id,
			qboDisplayName: "Beta Co",
		});
		expect(listed[0].candidates.map((c) => c.companyName)).toEqual([
			"Beta Co",
			"Beta Co",
		]);

		await asOwner.mutation(api.quickbooksImport.resolveImportRow, {
			rowId: rows[0]._id,
			clientId: b,
		});

		const resolved = await rowsFor(runId);
		expect(resolved[0]).toMatchObject({
			outcome: "resolved",
			linkedClientId: b,
		});
		const links = await clientLinks(org.orgId);
		expect(links).toHaveLength(1);
		expect(links[0]).toMatchObject({ localId: b, qboId: "91" });

		const after = await asOwner.query(api.quickbooksImport.getImportRun, {});
		expect(after).toMatchObject({ status: "completed", ambiguous: 0 });
		expect(after?.completedAt).toBeGreaterThan(0);
	});

	it("rejects a resolve pick that is not a candidate", async () => {
		const { org, asOwner } = await setupOrg("amb_bad");
		await connect(org.orgId);
		await asOwner.mutation(api.clients.create, {
			companyName: "Beta Co",
			status: "active",
		});
		await asOwner.mutation(api.clients.create, {
			companyName: "Beta Co",
			status: "active",
		});
		const outsider = await asOwner.mutation(api.clients.create, {
			companyName: "Unrelated Co",
			status: "active",
		});

		stubCustomerPages([[{ Id: "92", DisplayName: "Beta Co" }]]);
		const { runId } = await asOwner.action(
			api.quickbooksImportActions.startImport,
			{}
		);
		const rows = await rowsFor(runId);

		await expect(
			asOwner.mutation(api.quickbooksImport.resolveImportRow, {
				rowId: rows[0]._id,
				clientId: outsider,
			})
		).rejects.toThrow();
		expect(await clientLinks(org.orgId)).toHaveLength(0);
	});

	it("skipImportRow closes out the run too", async () => {
		const { org, asOwner } = await setupOrg("skip");
		await connect(org.orgId);
		await asOwner.mutation(api.clients.create, {
			companyName: "Gamma Co",
			status: "active",
		});
		await asOwner.mutation(api.clients.create, {
			companyName: "Gamma Co",
			status: "active",
		});

		stubCustomerPages([[{ Id: "93", DisplayName: "Gamma Co" }]]);
		const { runId } = await asOwner.action(
			api.quickbooksImportActions.startImport,
			{}
		);
		const rows = await rowsFor(runId);

		await asOwner.mutation(api.quickbooksImport.skipImportRow, {
			rowId: rows[0]._id,
		});

		const after = await rowsFor(runId);
		expect(after[0]).toMatchObject({
			outcome: "skipped",
			skipReason: "user_skipped",
		});
		expect(await clientLinks(org.orgId)).toHaveLength(0);

		const run = await asOwner.query(api.quickbooksImport.getImportRun, {});
		expect(run).toMatchObject({ status: "completed", ambiguous: 0, skipped: 1 });
	});

	// ------------------------------------------------------------------
	// Import
	// ------------------------------------------------------------------

	it("imports an unmatched customer with contact, address, and link", async () => {
		const { org, asOwner } = await setupOrg("import");
		await connect(org.orgId);

		stubCustomerPages([
			[
				{
					Id: "55",
					SyncToken: "1",
					DisplayName: "Delta Services",
					CompanyName: "Delta Services LLC",
					GivenName: "Dana",
					FamilyName: "Reed",
					PrimaryEmailAddr: { Address: "Dana@Delta.TEST" },
					PrimaryPhone: { FreeFormNumber: "555-0100" },
					BillAddr: {
						Line1: "1 Main St",
						City: "Austin",
						CountrySubDivisionCode: "TX",
						PostalCode: "78701",
					},
				},
			],
		]);

		const { runId } = await asOwner.action(
			api.quickbooksImportActions.startImport,
			{}
		);

		const clients = await orgClients(org.orgId);
		expect(clients).toHaveLength(1);
		const client = clients[0];
		expect(client.companyName).toBe("Delta Services");
		expect(client.status).toBe("active");
		expect(client.portalAccessId).toBeTruthy();
		// Triggers ran on the raw insert: the search digest is maintained.
		expect(client.searchText).toContain("Delta Services");

		// Reachable through global search, which reads the search index.
		const found = await asOwner.query(api.search.globalSearch, {
			query: "Delta Services",
		});
		expect(found.clients.some((hit) => hit.clientId === client._id)).toBe(true);

		const contact = await t.run(async (ctx) =>
			ctx.db
				.query("clientContacts")
				.withIndex("by_client", (q) => q.eq("clientId", client._id))
				.first()
		);
		expect(contact).toMatchObject({
			firstName: "Dana",
			lastName: "Reed",
			email: "dana@delta.test",
			phone: "555-0100",
			isPrimary: true,
		});

		const property = await t.run(async (ctx) =>
			ctx.db
				.query("clientProperties")
				.withIndex("by_client", (q) => q.eq("clientId", client._id))
				.first()
		);
		expect(property).toMatchObject({
			streetAddress: "1 Main St",
			city: "Austin",
			state: "TX",
			zipCode: "78701",
			isPrimary: true,
		});

		const links = await clientLinks(org.orgId);
		expect(links).toHaveLength(1);
		expect(links[0]).toMatchObject({
			localId: client._id,
			qboId: "55",
			qboSyncToken: "1",
		});

		const rows = await rowsFor(runId);
		expect(rows[0]).toMatchObject({
			outcome: "imported",
			linkedClientId: client._id,
		});
		const run = await asOwner.query(api.quickbooksImport.getImportRun, {});
		expect(run).toMatchObject({ status: "completed", imported: 1 });
	});

	it("skips sub-customers (QBO jobs)", async () => {
		const { org, asOwner } = await setupOrg("job");
		await connect(org.orgId);

		stubCustomerPages([
			[{ Id: "60", DisplayName: "Delta Services:Backyard", Job: true }],
		]);

		const { runId } = await asOwner.action(
			api.quickbooksImportActions.startImport,
			{}
		);

		const rows = await rowsFor(runId);
		expect(rows[0]).toMatchObject({
			outcome: "skipped",
			skipReason: "sub_customer",
		});
		expect(await orgClients(org.orgId)).toHaveLength(0);
		expect(await clientLinks(org.orgId)).toHaveLength(0);
	});

	it("pages until a short page and processes every page", async () => {
		const { org, asOwner } = await setupOrg("pages");
		await connect(org.orgId);

		// Page 1 is 100 sub-customers (cheap to process), page 2 is the tail.
		const page1: QboCustomer[] = Array.from({ length: 100 }, (_, i) => ({
			Id: `job_${i}`,
			DisplayName: `Job ${i}`,
			Job: true,
		}));
		const calls = stubCustomerPages([
			page1,
			[{ Id: "500", DisplayName: "Tail Co" }],
		]);

		const { runId } = await asOwner.action(
			api.quickbooksImportActions.startImport,
			{}
		);

		expect(calls).toHaveLength(2);
		expect(calls[0]).toContain("STARTPOSITION 1 ");
		expect(calls[1]).toContain("STARTPOSITION 101 ");

		const rows = await rowsFor(runId);
		expect(rows).toHaveLength(101);
		const run = await asOwner.query(api.quickbooksImport.getImportRun, {});
		expect(run).toMatchObject({
			status: "completed",
			totalFetched: 101,
			skipped: 100,
			imported: 1,
		});
	});

	// ------------------------------------------------------------------
	// Guards
	// ------------------------------------------------------------------

	it("is idempotent across re-runs", async () => {
		const { org, asOwner } = await setupOrg("idem");
		await connect(org.orgId);

		const customers: QboCustomer[] = [
			{ Id: "70", SyncToken: "0", DisplayName: "Epsilon Co" },
		];
		stubCustomerPages([customers]);

		await asOwner.action(api.quickbooksImportActions.startImport, {});
		const afterFirst = await orgClients(org.orgId);
		expect(afterFirst).toHaveLength(1);

		const second = await asOwner.action(
			api.quickbooksImportActions.startImport,
			{}
		);

		expect(await orgClients(org.orgId)).toHaveLength(1);
		expect(await clientLinks(org.orgId)).toHaveLength(1);
		const rows = await rowsFor(second.runId);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			outcome: "auto_linked",
			linkedClientId: afterFirst[0]._id,
		});
	});

	it("refuses a second run while one is awaiting review", async () => {
		const { org, asOwner } = await setupOrg("busy");
		await connect(org.orgId);
		await asOwner.mutation(api.clients.create, {
			companyName: "Zeta Co",
			status: "active",
		});
		await asOwner.mutation(api.clients.create, {
			companyName: "Zeta Co",
			status: "active",
		});

		stubCustomerPages([[{ Id: "80", DisplayName: "Zeta Co" }]]);
		await asOwner.action(api.quickbooksImportActions.startImport, {});

		await expect(
			asOwner.action(api.quickbooksImportActions.startImport, {})
		).rejects.toThrow(/import_already_running/);
	});

	it("refuses a non-owner", async () => {
		const { org } = await setupOrg("nonowner");
		await connect(org.orgId);
		const member = await t.run(async (ctx) =>
			addMemberToOrg(ctx, org.orgId, { clerkUserId: "qboimp_member" })
		);
		const asMember = t.withIdentity(
			createPremiumTestIdentity(member.clerkUserId, org.clerkOrgId)
		);

		stubCustomerPages([[{ Id: "81", DisplayName: "Nope Co" }]]);

		await expect(
			asMember.action(api.quickbooksImportActions.startImport, {})
		).rejects.toThrow(/not_owner/);

		const runs = await t.run(async (ctx) =>
			ctx.db
				.query("quickbooksImportRuns")
				.withIndex("by_org", (q) => q.eq("orgId", org.orgId))
				.collect()
		);
		expect(runs).toHaveLength(0);
	});
});
