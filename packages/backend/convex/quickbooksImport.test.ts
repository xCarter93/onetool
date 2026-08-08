import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { setupConvexTest } from "./test.setup";
import {
	addMemberToOrg,
	createPremiumTestIdentity,
	createTestClientProperty,
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
	FullyQualifiedName?: string;
	Job?: boolean;
	ParentRef?: { value?: string };
	PrimaryEmailAddr?: { Address?: string };
	PrimaryPhone?: { FreeFormNumber?: string };
	BillAddr?: Record<string, string>;
	ShipAddr?: Record<string, string>;
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

	async function rowByQboId(
		runId: Id<"quickbooksImportRuns">,
		qboId: string
	): Promise<Doc<"quickbooksImportRows">> {
		const rows = await rowsFor(runId);
		const row = rows.find((candidate) => candidate.qboId === qboId);
		if (!row) throw new Error(`no row for qboId ${qboId}`);
		return row;
	}

	/** Commit and drain the self-scheduling commit loop. */
	async function commit(asOwner: ReturnType<typeof t.withIdentity>) {
		await asOwner.mutation(api.quickbooksImport.commitImportRun, {});
		await t.finishAllScheduledFunctions(vi.runAllTimers);
	}

	// ------------------------------------------------------------------
	// Fetch pass — proposals only
	// ------------------------------------------------------------------

	it("proposes without writing any client or link", async () => {
		const { org, asOwner } = await setupOrg("propose");
		await connect(org.orgId);
		const matched = await asOwner.mutation(api.clients.create, {
			companyName: "Acme Landscaping",
			status: "active",
		});
		const betaA = await asOwner.mutation(api.clients.create, {
			companyName: "Beta Co",
			status: "active",
		});
		const betaB = await asOwner.mutation(api.clients.create, {
			companyName: "Beta Co",
			status: "active",
		});

		stubCustomerPages([
			[
				{ Id: "1", SyncToken: "3", DisplayName: "  acme landscaping " },
				{ Id: "2", DisplayName: "Beta Co" },
				{ Id: "3", DisplayName: "Brand New Co" },
				{ Id: "4", DisplayName: "Acme Landscaping:Yard", Job: true },
			],
		]);

		const { runId } = await asOwner.action(
			api.quickbooksImportActions.startImport,
			{}
		);

		// Nothing was written to client data.
		expect(await orgClients(org.orgId)).toHaveLength(3);
		expect(await clientLinks(org.orgId)).toHaveLength(0);

		expect(await rowByQboId(runId, "1")).toMatchObject({
			outcome: "proposed_link",
			linkedClientId: matched,
		});
		expect(await rowByQboId(runId, "2")).toMatchObject({
			outcome: "ambiguous",
		});
		expect((await rowByQboId(runId, "2")).candidateClientIds?.sort()).toEqual(
			[betaA, betaB].sort()
		);
		expect(await rowByQboId(runId, "3")).toMatchObject({
			outcome: "proposed_import",
		});
		expect(await rowByQboId(runId, "4")).toMatchObject({
			outcome: "proposed_skip",
			skipReason: "sub_customer",
		});

		const run = await asOwner.query(api.quickbooksImport.getImportRun, {});
		expect(run).toMatchObject({
			status: "reviewing",
			totalFetched: 4,
			proposedLink: 1,
			proposedImport: 1,
			proposedSkip: 1,
			ambiguous: 1,
			autoLinked: 0,
			imported: 0,
			skipped: 0,
		});
		expect(run?.completedAt).toBeUndefined();
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

		expect(await rowByQboId(runId, "88")).toMatchObject({
			outcome: "proposed_link",
			linkedClientId: rightId,
		});

		await commit(asOwner);
		const links = await clientLinks(org.orgId);
		expect(links).toHaveLength(1);
		expect(links[0].localId).toBe(rightId);
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

		expect(await rowsFor(runId)).toHaveLength(101);
		const run = await asOwner.query(api.quickbooksImport.getImportRun, {});
		expect(run).toMatchObject({
			status: "reviewing",
			totalFetched: 101,
			proposedSkip: 100,
			proposedImport: 1,
		});

		// The commit loop spans two batches (100 + 1) and still finishes.
		await commit(asOwner);
		const after = await asOwner.query(api.quickbooksImport.getImportRun, {});
		expect(after).toMatchObject({
			status: "completed",
			skipped: 100,
			imported: 1,
			committedRows: 101,
		});
		expect(await orgClients(org.orgId)).toHaveLength(1);
	});

	// ------------------------------------------------------------------
	// Commit pass
	// ------------------------------------------------------------------

	it("commits the default proposals", async () => {
		const { org, asOwner } = await setupOrg("commit");
		await connect(org.orgId);
		const matched = await asOwner.mutation(api.clients.create, {
			companyName: "Acme Landscaping",
			status: "active",
		});

		stubCustomerPages([
			[
				{ Id: "10", SyncToken: "7", DisplayName: "Acme Landscaping" },
				{
					Id: "11",
					DisplayName: "Delta Services",
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
				{ Id: "12", DisplayName: "Delta Services:Yard", Job: true },
			],
		]);

		const { runId } = await asOwner.action(
			api.quickbooksImportActions.startImport,
			{}
		);
		await commit(asOwner);

		const clients = await orgClients(org.orgId);
		expect(clients).toHaveLength(2);
		const created = clients.find((client) => client._id !== matched)!;
		expect(created.companyName).toBe("Delta Services");
		expect(created.portalAccessId).toBeTruthy();
		// Triggers ran on the raw insert: the search digest is maintained.
		expect(created.searchText).toContain("Delta Services");

		const found = await asOwner.query(api.search.globalSearch, {
			query: "Delta Services",
		});
		expect(found.clients.some((hit) => hit.clientId === created._id)).toBe(
			true
		);

		const contact = await t.run(async (ctx) =>
			ctx.db
				.query("clientContacts")
				.withIndex("by_client", (q) => q.eq("clientId", created._id))
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
				.withIndex("by_client", (q) => q.eq("clientId", created._id))
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
		expect(links).toHaveLength(2);
		const matchedLink = links.find((link) => link.localId === matched)!;
		expect(matchedLink).toMatchObject({ qboId: "10", qboSyncToken: "0" });
		expect(links.find((link) => link.localId === created._id)).toMatchObject({
			qboId: "11",
			qboSyncToken: "0",
		});

		expect(await rowByQboId(runId, "10")).toMatchObject({
			outcome: "auto_linked",
			linkedClientId: matched,
		});
		expect(await rowByQboId(runId, "11")).toMatchObject({
			outcome: "imported",
			linkedClientId: created._id,
		});
		expect(await rowByQboId(runId, "12")).toMatchObject({
			outcome: "skipped",
			skipReason: "sub_customer",
		});

		const run = await asOwner.query(api.quickbooksImport.getImportRun, {});
		expect(run).toMatchObject({
			status: "completed",
			autoLinked: 1,
			imported: 1,
			skipped: 1,
			ambiguous: 0,
			committedRows: 3,
		});
		expect(run?.completedAt).toBeGreaterThan(0);
	});

	it("honors reviewer overrides over the proposals", async () => {
		const { org, asOwner } = await setupOrg("override");
		await connect(org.orgId);
		const linkTarget = await asOwner.mutation(api.clients.create, {
			companyName: "Zeta Holdings",
			status: "active",
		});
		const proposedTarget = await asOwner.mutation(api.clients.create, {
			companyName: "Omega Co",
			status: "active",
		});
		const ambA = await asOwner.mutation(api.clients.create, {
			companyName: "Beta Co",
			status: "active",
		});
		await asOwner.mutation(api.clients.create, {
			companyName: "Beta Co",
			status: "active",
		});
		const outsider = await asOwner.mutation(api.clients.create, {
			companyName: "Not A Candidate",
			status: "active",
		});

		stubCustomerPages([
			[
				{ Id: "20", DisplayName: "Fresh Co" }, // proposed_import → link
				{ Id: "21", DisplayName: "Omega Co" }, // proposed_link → skip
				{ Id: "22", DisplayName: "Beta Co" }, // ambiguous → link
			],
		]);

		const { runId } = await asOwner.action(
			api.quickbooksImportActions.startImport,
			{}
		);

		await asOwner.mutation(api.quickbooksImport.setRowDecision, {
			rowId: (await rowByQboId(runId, "20"))._id,
			decision: "link",
			clientId: linkTarget,
		});
		await asOwner.mutation(api.quickbooksImport.setRowDecision, {
			rowId: (await rowByQboId(runId, "21"))._id,
			decision: "skip",
		});
		// Ambiguous rows accept any org client, not just the stored candidates.
		await asOwner.mutation(api.quickbooksImport.setRowDecision, {
			rowId: (await rowByQboId(runId, "22"))._id,
			decision: "link",
			clientId: outsider,
		});

		await commit(asOwner);

		// No client was created for the overridden import.
		expect(await orgClients(org.orgId)).toHaveLength(5);
		const links = await clientLinks(org.orgId);
		expect(links).toHaveLength(2);
		expect(links.find((link) => link.qboId === "20")?.localId).toBe(linkTarget);
		expect(links.find((link) => link.qboId === "22")?.localId).toBe(outsider);
		expect(links.some((link) => link.localId === proposedTarget)).toBe(false);
		expect(links.some((link) => link.localId === ambA)).toBe(false);

		expect(await rowByQboId(runId, "21")).toMatchObject({
			outcome: "skipped",
			skipReason: "user_skipped",
		});

		const run = await asOwner.query(api.quickbooksImport.getImportRun, {});
		expect(run).toMatchObject({
			status: "completed",
			autoLinked: 2,
			imported: 0,
			skipped: 1,
			ambiguous: 0,
		});
	});

	it("refuses to commit while an ambiguous row is undecided", async () => {
		const { org, asOwner } = await setupOrg("undecided");
		await connect(org.orgId);
		const a = await asOwner.mutation(api.clients.create, {
			companyName: "Beta Co",
			status: "active",
		});
		await asOwner.mutation(api.clients.create, {
			companyName: "Beta Co",
			status: "active",
		});

		stubCustomerPages([[{ Id: "30", DisplayName: "Beta Co" }]]);
		const { runId } = await asOwner.action(
			api.quickbooksImportActions.startImport,
			{}
		);

		await expect(
			asOwner.mutation(api.quickbooksImport.commitImportRun, {})
		).rejects.toThrow(/undecided_ambiguous_rows/);

		const stillReviewing = await asOwner.query(
			api.quickbooksImport.getImportRun,
			{}
		);
		expect(stillReviewing?.status).toBe("reviewing");

		await asOwner.mutation(api.quickbooksImport.setRowDecision, {
			rowId: (await rowByQboId(runId, "30"))._id,
			decision: "link",
			clientId: a,
		});
		await commit(asOwner);
		expect(await clientLinks(org.orgId)).toHaveLength(1);
	});

	it("never double-applies when the commit loop is re-kicked", async () => {
		const { org, asOwner } = await setupOrg("recommit");
		await connect(org.orgId);
		await asOwner.mutation(api.clients.create, {
			companyName: "Acme Landscaping",
			status: "active",
		});

		stubCustomerPages([
			[
				{ Id: "40", DisplayName: "Acme Landscaping" },
				{ Id: "41", DisplayName: "Novel Co" },
			],
		]);
		await asOwner.action(api.quickbooksImportActions.startImport, {});
		await commit(asOwner);

		expect(await orgClients(org.orgId)).toHaveLength(2);
		expect(await clientLinks(org.orgId)).toHaveLength(2);

		// Simulate a stalled loop being re-kicked after it already ran.
		const runId = (await asOwner.query(api.quickbooksImport.getImportRun, {}))!
			._id;
		await t.run(async (ctx) => {
			await ctx.db.patch(runId, { status: "committing" });
		});
		await t.mutation(internal.quickbooksImport.commitPage, { runId });
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		expect(await orgClients(org.orgId)).toHaveLength(2);
		expect(await clientLinks(org.orgId)).toHaveLength(2);
		const run = await asOwner.query(api.quickbooksImport.getImportRun, {});
		expect(run).toMatchObject({ status: "completed", imported: 1 });
	});

	it("skips a proposed link whose client got linked elsewhere", async () => {
		const { org, asOwner } = await setupOrg("already");
		await connect(org.orgId);
		const clientId = await asOwner.mutation(api.clients.create, {
			companyName: "Solo Co",
			status: "active",
		});

		stubCustomerPages([[{ Id: "50", DisplayName: "Solo Co" }]]);
		const { runId } = await asOwner.action(
			api.quickbooksImportActions.startImport,
			{}
		);

		// Another surface links the same client to a different QBO customer.
		await t.run(async (ctx) => {
			await ctx.db.insert("quickbooksEntityLinks", {
				orgId: org.orgId,
				entityType: "client",
				localId: clientId,
				qboId: "999",
				qboSyncToken: "0",
				lastSyncedAt: Date.now(),
			});
		});

		await commit(asOwner);

		expect(await rowByQboId(runId, "50")).toMatchObject({
			outcome: "skipped",
			skipReason: "already_linked",
		});
		const links = await clientLinks(org.orgId);
		expect(links).toHaveLength(1);
		expect(links[0].qboId).toBe("999");
		expect(await orgClients(org.orgId)).toHaveLength(1);
	});

	it("does not enqueue outbound sync jobs for imported clients", async () => {
		const { org, asOwner } = await setupOrg("nojobs");
		await connect(org.orgId);

		stubCustomerPages([[{ Id: "60", DisplayName: "Quiet Co" }]]);
		await asOwner.action(api.quickbooksImportActions.startImport, {});
		await commit(asOwner);

		expect(await orgClients(org.orgId)).toHaveLength(1);
		const jobs = await t.run(async (ctx) =>
			ctx.db
				.query("quickbooksSyncJobs")
				.withIndex("by_org_status", (q) => q.eq("orgId", org.orgId))
				.collect()
		);
		expect(jobs).toHaveLength(0);
	});

	// ------------------------------------------------------------------
	// Review surface — listing, discard, supersede
	// ------------------------------------------------------------------

	it("lists rows paginated and hydrated with client names", async () => {
		const { org, asOwner } = await setupOrg("list");
		await connect(org.orgId);
		await asOwner.mutation(api.clients.create, {
			companyName: "Acme Landscaping",
			status: "active",
		});
		await asOwner.mutation(api.clients.create, {
			companyName: "Beta Co",
			status: "active",
		});
		await asOwner.mutation(api.clients.create, {
			companyName: "Beta Co",
			status: "active",
		});

		stubCustomerPages([
			[
				{ Id: "70", DisplayName: "Acme Landscaping" },
				{ Id: "71", DisplayName: "Beta Co" },
				{ Id: "72", DisplayName: "Unknown Co" },
			],
		]);
		const { runId } = await asOwner.action(
			api.quickbooksImportActions.startImport,
			{}
		);

		const first = await asOwner.query(api.quickbooksImport.listImportRows, {
			runId,
			paginationOpts: { numItems: 2, cursor: null },
		});
		expect(first.page).toHaveLength(2);
		expect(first.isDone).toBe(false);

		const second = await asOwner.query(api.quickbooksImport.listImportRows, {
			runId,
			paginationOpts: { numItems: 2, cursor: first.continueCursor },
		});
		const all = [...first.page, ...second.page];
		expect(all).toHaveLength(3);

		const linkRow = all.find((row) => row.qboId === "70")!;
		expect(linkRow.proposedClient?.companyName).toBe("Acme Landscaping");
		const ambiguousRow = all.find((row) => row.qboId === "71")!;
		expect(ambiguousRow.candidates?.map((c) => c.companyName)).toEqual([
			"Beta Co",
			"Beta Co",
		]);
		const importRow = all.find((row) => row.qboId === "72")!;
		expect(importRow.proposedClient).toBeUndefined();
	});

	it("discardImportRun drops the rows and quietly fails the run", async () => {
		const { org, asOwner } = await setupOrg("discard");
		await connect(org.orgId);

		stubCustomerPages([[{ Id: "80", DisplayName: "Throwaway Co" }]]);
		const { runId } = await asOwner.action(
			api.quickbooksImportActions.startImport,
			{}
		);

		await asOwner.mutation(api.quickbooksImport.discardImportRun, {});
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		expect(await rowsFor(runId)).toHaveLength(0);
		expect(await orgClients(org.orgId)).toHaveLength(0);
		const run = await asOwner.query(api.quickbooksImport.getImportRun, {});
		expect(run).toMatchObject({
			status: "failed",
			lastError: "Discarded before import",
		});
	});

	it("a new run supersedes one waiting in review", async () => {
		const { org, asOwner } = await setupOrg("supersede");
		await connect(org.orgId);

		stubCustomerPages([[{ Id: "90", DisplayName: "Stale Co" }]]);
		const first = await asOwner.action(
			api.quickbooksImportActions.startImport,
			{}
		);

		stubCustomerPages([[{ Id: "91", DisplayName: "Fresh Co" }]]);
		const second = await asOwner.action(
			api.quickbooksImportActions.startImport,
			{}
		);
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		expect(second.runId).not.toBe(first.runId);
		expect(await rowsFor(first.runId)).toHaveLength(0);
		const superseded = await t.run(async (ctx) => ctx.db.get(first.runId));
		expect(superseded).toMatchObject({
			status: "failed",
			lastError: "Superseded by a new import",
		});

		const run = await asOwner.query(api.quickbooksImport.getImportRun, {});
		expect(run).toMatchObject({ status: "reviewing", _id: second.runId });
	});

	it("refuses a second run while one is committing", async () => {
		const { org, asOwner } = await setupOrg("busy");
		await connect(org.orgId);

		stubCustomerPages([[{ Id: "95", DisplayName: "Busy Co" }]]);
		await asOwner.action(api.quickbooksImportActions.startImport, {});
		// Commit without draining: the run sits in "committing".
		await asOwner.mutation(api.quickbooksImport.commitImportRun, {});

		await expect(
			asOwner.action(api.quickbooksImportActions.startImport, {})
		).rejects.toThrow(/import_already_running/);
		await t.finishAllScheduledFunctions(vi.runAllTimers);
		expect(await orgClients(org.orgId)).toHaveLength(1);
	});

	// ------------------------------------------------------------------
	// Guards
	// ------------------------------------------------------------------

	it("is idempotent across re-runs", async () => {
		const { org, asOwner } = await setupOrg("idem");
		await connect(org.orgId);

		stubCustomerPages([[{ Id: "70", SyncToken: "0", DisplayName: "Epsilon Co" }]]);

		await asOwner.action(api.quickbooksImportActions.startImport, {});
		await commit(asOwner);
		const afterFirst = await orgClients(org.orgId);
		expect(afterFirst).toHaveLength(1);

		const second = await asOwner.action(
			api.quickbooksImportActions.startImport,
			{}
		);

		// Already-linked customers are stated as fact during the fetch pass.
		const rows = await rowsFor(second.runId);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			outcome: "auto_linked",
			linkedClientId: afterFirst[0]._id,
		});

		await commit(asOwner);
		expect(await orgClients(org.orgId)).toHaveLength(1);
		expect(await clientLinks(org.orgId)).toHaveLength(1);
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

	it("rejects a decision on a sub-customer row", async () => {
		const { org, asOwner } = await setupOrg("nodecide");
		await connect(org.orgId);
		const clientId = await asOwner.mutation(api.clients.create, {
			companyName: "Anything Co",
			status: "active",
		});

		stubCustomerPages([[{ Id: "96", DisplayName: "Parent:Job", Job: true }]]);
		const { runId } = await asOwner.action(
			api.quickbooksImportActions.startImport,
			{}
		);

		await expect(
			asOwner.mutation(api.quickbooksImport.setRowDecision, {
				rowId: (await rowByQboId(runId, "96"))._id,
				decision: "link",
				clientId,
			})
		).rejects.toThrow();
		expect(await clientLinks(org.orgId)).toHaveLength(0);
	});

	// ------------------------------------------------------------------
	// Sub-customers as job-site properties (PRD 3.6.1)
	// ------------------------------------------------------------------

	const YARD = {
		Id: "31",
		DisplayName: "North Yard",
		FullyQualifiedName: "Delta Services:North Yard",
		Job: true,
		ParentRef: { value: "30" },
		BillAddr: {
			Line1: "9 Billing Rd",
			City: "Austin",
			CountrySubDivisionCode: "TX",
			PostalCode: "78701",
		},
		ShipAddr: {
			Line1: "2 Yard Ln",
			City: "Round Rock",
			CountrySubDivisionCode: "TX",
			PostalCode: "78664",
		},
	} satisfies QboCustomer;

	async function propertiesFor(clientId: Id<"clients">) {
		return await t.run(async (ctx) =>
			ctx.db
				.query("clientProperties")
				.withIndex("by_client", (q) => q.eq("clientId", clientId))
				.collect()
		);
	}

	it("proposes a sub-customer with an address as a job site", async () => {
		const { org, asOwner } = await setupOrg("subprop");
		await connect(org.orgId);

		stubCustomerPages([
			[{ Id: "30", DisplayName: "Delta Services" }, YARD],
		]);
		const { runId } = await asOwner.action(
			api.quickbooksImportActions.startImport,
			{}
		);

		const row = await rowByQboId(runId, "31");
		expect(row).toMatchObject({
			outcome: "proposed_property",
			parentQboId: "30",
			parentDisplayName: "Delta Services",
		});
		// ShipAddr wins over BillAddr for a job site.
		expect(row.qboSnapshot?.billAddr).toMatchObject({
			line1: "2 Yard Ln",
			city: "Round Rock",
			state: "TX",
			postalCode: "78664",
		});

		// Proposals only: nothing written to client data yet.
		expect(await orgClients(org.orgId)).toHaveLength(0);
		const run = await asOwner.query(api.quickbooksImport.getImportRun, {});
		expect(run).toMatchObject({ proposedImport: 1, proposedProperty: 1 });

		const listed = await asOwner.query(api.quickbooksImport.listImportRows, {
			runId,
			paginationOpts: { numItems: 10, cursor: null },
		});
		expect(
			listed.page.find((view) => view.qboId === "31")?.parentName
		).toBe("Delta Services");
	});

	it("keeps an addressless sub-customer a plain skip", async () => {
		const { org, asOwner } = await setupOrg("subnoaddr");
		await connect(org.orgId);

		stubCustomerPages([
			[
				{ Id: "30", DisplayName: "Delta Services" },
				{
					Id: "31",
					DisplayName: "North Yard",
					Job: true,
					ParentRef: { value: "30" },
				},
			],
		]);
		const { runId } = await asOwner.action(
			api.quickbooksImportActions.startImport,
			{}
		);
		expect(await rowByQboId(runId, "31")).toMatchObject({
			outcome: "proposed_skip",
			skipReason: "sub_customer",
		});
	});

	it("creates the job site on an imported parent's client", async () => {
		const { org, asOwner } = await setupOrg("subcommit");
		await connect(org.orgId);

		stubCustomerPages([
			[{ Id: "30", DisplayName: "Delta Services" }, YARD],
		]);
		const { runId } = await asOwner.action(
			api.quickbooksImportActions.startImport,
			{}
		);
		await commit(asOwner);

		const clients = await orgClients(org.orgId);
		expect(clients).toHaveLength(1);
		const properties = await propertiesFor(clients[0]._id);
		expect(properties).toHaveLength(1);
		expect(properties[0]).toMatchObject({
			propertyName: "North Yard",
			streetAddress: "2 Yard Ln",
			city: "Round Rock",
			state: "TX",
			zipCode: "78664",
			isPrimary: true,
		});

		expect(await rowByQboId(runId, "31")).toMatchObject({
			outcome: "property_created",
			linkedClientId: clients[0]._id,
		});
		const run = await asOwner.query(api.quickbooksImport.getImportRun, {});
		expect(run).toMatchObject({
			status: "completed",
			imported: 1,
			properties: 1,
		});
	});

	it("adds the job site to a linked parent without stealing primary", async () => {
		const { org, asOwner } = await setupOrg("sublink");
		await connect(org.orgId);
		const clientId = await asOwner.mutation(api.clients.create, {
			companyName: "Delta Services",
			status: "active",
		});
		await t.run(async (ctx) =>
			createTestClientProperty(ctx, org.orgId, clientId, {
				streetAddress: "1 HQ Way",
				city: "Austin",
				isPrimary: true,
			})
		);

		stubCustomerPages([
			[{ Id: "30", DisplayName: "Delta Services" }, YARD],
		]);
		const { runId } = await asOwner.action(
			api.quickbooksImportActions.startImport,
			{}
		);
		await commit(asOwner);

		const properties = await propertiesFor(clientId);
		expect(properties).toHaveLength(2);
		const jobSite = properties.find(
			(property) => property.streetAddress === "2 Yard Ln"
		)!;
		expect(jobSite.isPrimary).toBe(false);
		expect(await rowByQboId(runId, "31")).toMatchObject({
			outcome: "property_created",
			linkedClientId: clientId,
		});
	});

	it("skips a job site whose parent was not imported", async () => {
		const { org, asOwner } = await setupOrg("subnoparent");
		await connect(org.orgId);

		stubCustomerPages([
			[{ Id: "30", DisplayName: "Delta Services" }, YARD],
		]);
		const { runId } = await asOwner.action(
			api.quickbooksImportActions.startImport,
			{}
		);
		await asOwner.mutation(api.quickbooksImport.setRowDecision, {
			rowId: (await rowByQboId(runId, "30"))._id,
			decision: "skip",
		});
		await commit(asOwner);

		expect(await orgClients(org.orgId)).toHaveLength(0);
		expect(await rowByQboId(runId, "31")).toMatchObject({
			outcome: "skipped",
			skipReason: "parent_not_imported",
		});
	});

	it("honors skip and restore on a job-site row and rejects link", async () => {
		const { org, asOwner } = await setupOrg("subskip");
		await connect(org.orgId);
		const clientId = await asOwner.mutation(api.clients.create, {
			companyName: "Somebody Else",
			status: "active",
		});

		stubCustomerPages([
			[{ Id: "30", DisplayName: "Delta Services" }, YARD],
		]);
		const { runId } = await asOwner.action(
			api.quickbooksImportActions.startImport,
			{}
		);
		const rowId = (await rowByQboId(runId, "31"))._id;

		await expect(
			asOwner.mutation(api.quickbooksImport.setRowDecision, {
				rowId,
				decision: "link",
				clientId,
			})
		).rejects.toThrow();
		// "import" restores a skipped job site to its proposal, so skip → import
		// → skip must round-trip; only the final decision counts at commit.
		await asOwner.mutation(api.quickbooksImport.setRowDecision, {
			rowId,
			decision: "skip",
		});
		await asOwner.mutation(api.quickbooksImport.setRowDecision, {
			rowId,
			decision: "import",
		});
		await asOwner.mutation(api.quickbooksImport.setRowDecision, {
			rowId,
			decision: "skip",
		});
		await commit(asOwner);

		const created = (await orgClients(org.orgId)).find(
			(client) => client.companyName === "Delta Services"
		)!;
		expect(await propertiesFor(created._id)).toHaveLength(0);
		expect(await rowByQboId(runId, "31")).toMatchObject({
			outcome: "skipped",
			skipReason: "user_skipped",
		});
	});

	it("does not duplicate the job site when the same data is re-imported", async () => {
		const { org, asOwner } = await setupOrg("subidem");
		await connect(org.orgId);

		stubCustomerPages([
			[{ Id: "30", DisplayName: "Delta Services" }, YARD],
		]);
		await asOwner.action(api.quickbooksImportActions.startImport, {});
		await commit(asOwner);

		const clientId = (await orgClients(org.orgId))[0]._id;
		expect(await propertiesFor(clientId)).toHaveLength(1);

		const { runId: secondRunId } = await asOwner.action(
			api.quickbooksImportActions.startImport,
			{}
		);
		await commit(asOwner);

		expect(await orgClients(org.orgId)).toHaveLength(1);
		expect(await propertiesFor(clientId)).toHaveLength(1);
		expect(await rowByQboId(secondRunId, "31")).toMatchObject({
			outcome: "property_created",
			linkedClientId: clientId,
		});
	});

	// ------------------------------------------------------------------
	// Legacy awaiting_review runs (pre-rework)
	// ------------------------------------------------------------------

	it("still resolves a legacy awaiting_review run", async () => {
		const { org, asOwner } = await setupOrg("legacy");
		await connect(org.orgId);
		const a = await asOwner.mutation(api.clients.create, {
			companyName: "Legacy Co",
			status: "active",
		});
		const b = await asOwner.mutation(api.clients.create, {
			companyName: "Legacy Co",
			status: "active",
		});

		const { runId, rowIds } = await t.run(async (ctx) => {
			const organization = await ctx.db.get(org.orgId);
			const runId = await ctx.db.insert("quickbooksImportRuns", {
				orgId: org.orgId,
				realmId: `realm_${org.orgId}`,
				status: "awaiting_review",
				startedByUserId: organization!.ownerUserId,
				startedAt: Date.now(),
				totalFetched: 2,
				autoLinked: 0,
				imported: 0,
				ambiguous: 2,
				skipped: 0,
			});
			const rowIds = [] as Id<"quickbooksImportRows">[];
			for (const qboId of ["L1", "L2"]) {
				rowIds.push(
					await ctx.db.insert("quickbooksImportRows", {
						orgId: org.orgId,
						runId,
						qboId,
						qboDisplayName: "Legacy Co",
						outcome: "ambiguous",
						candidateClientIds: [a, b],
					})
				);
			}
			return { runId, rowIds };
		});

		const listed = await asOwner.query(api.quickbooksImport.listAmbiguousRows, {
			runId,
		});
		expect(listed).toHaveLength(2);

		await asOwner.mutation(api.quickbooksImport.resolveImportRow, {
			rowId: rowIds[0],
			clientId: b,
		});
		await asOwner.mutation(api.quickbooksImport.skipImportRow, {
			rowId: rowIds[1],
		});

		const rows = await rowsFor(runId);
		expect(rows.find((row) => row._id === rowIds[0])).toMatchObject({
			outcome: "resolved",
			linkedClientId: b,
		});
		expect(rows.find((row) => row._id === rowIds[1])).toMatchObject({
			outcome: "skipped",
			skipReason: "user_skipped",
		});

		const links = await clientLinks(org.orgId);
		expect(links).toHaveLength(1);
		expect(links[0]).toMatchObject({ localId: b, qboId: "L1" });

		const run = await t.run(async (ctx) => ctx.db.get(runId));
		expect(run).toMatchObject({ status: "completed", ambiguous: 0, skipped: 1 });
	});
});
