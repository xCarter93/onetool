"use node";

import { ConvexError } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { qboFetch, type QboEnvironment } from "./lib/quickbooks";
import { ensureFreshAccessToken } from "./quickbooksActions";

/**
 * One-time QBO→OneTool customer import (PRD §7), Intuit side.
 * All matching and writing lives in quickbooksImport.ts.
 */

const PAGE_SIZE = 100;
// Hard stop so a misbehaving page cursor can't loop forever.
const MAX_PAGES = 200;

type QboBillAddr = {
	Line1?: string;
	City?: string;
	CountrySubDivisionCode?: string;
	PostalCode?: string;
	Country?: string;
};

type QboCustomer = {
	Id: string;
	SyncToken?: string;
	DisplayName?: string;
	FullyQualifiedName?: string;
	CompanyName?: string;
	GivenName?: string;
	FamilyName?: string;
	Job?: boolean;
	ParentRef?: { value?: string };
	PrimaryEmailAddr?: { Address?: string };
	PrimaryPhone?: { FreeFormNumber?: string };
	BillAddr?: QboBillAddr;
	ShipAddr?: QboBillAddr;
};

type QboCustomerQueryResponse = {
	QueryResponse?: { Customer?: QboCustomer[] };
};

type QboRef = {
	accessToken: string;
	realmId: string;
	environment: QboEnvironment;
};

async function queryCustomers(
	tokens: QboRef,
	startPosition: number
): Promise<QboCustomer[]> {
	const statement = `SELECT * FROM Customer WHERE Active = true STARTPOSITION ${startPosition} MAXRESULTS ${PAGE_SIZE}`;
	const result = await qboFetch<QboCustomerQueryResponse>({
		accessToken: tokens.accessToken,
		realmId: tokens.realmId,
		environment: tokens.environment,
		path: `/query?query=${encodeURIComponent(statement)}`,
	});
	return result.QueryResponse?.Customer ?? [];
}

/** A QBO address is worth capturing only when it carries some location. */
function hasLocation(addr: QboBillAddr | undefined): boolean {
	return Boolean(
		addr &&
			(addr.Line1 || addr.City || addr.CountrySubDivisionCode || addr.PostalCode)
	);
}

/**
 * A sub-customer's parent display name. `namesById` carries every customer seen
 * so far in the run (parents are created before their jobs, so they normally
 * arrive first); FullyQualifiedName ("Parent:Job") is the fallback when the
 * parent lands on a later page. For a multi-level job ("A:B:C") the fallback
 * yields the parent's fully-qualified name, which is still what a reviewer
 * expects to read.
 */
function parentDisplayName(
	customer: QboCustomer,
	namesById: Map<string, string>
): string | undefined {
	const parentId = customer.ParentRef?.value;
	if (parentId) {
		const known = namesById.get(parentId);
		if (known) return known;
	}
	const fqn = customer.FullyQualifiedName;
	if (fqn && fqn.includes(":")) {
		return fqn.slice(0, fqn.lastIndexOf(":"));
	}
	return undefined;
}

function toImportCustomer(
	customer: QboCustomer,
	namesById: Map<string, string> = new Map()
) {
	// Sub-customers are job sites: QBO's Automated Sales Tax and every field
	// crew care about the SHIP-to address, so it wins over BillAddr (Jobber's
	// rule). Top-level customers keep BillAddr as their billing property.
	const isJob = customer.Job === true;
	const addr =
		isJob && hasLocation(customer.ShipAddr)
			? customer.ShipAddr
			: customer.BillAddr;
	const hasAddr = hasLocation(addr);
	return {
		qboId: customer.Id,
		syncToken: customer.SyncToken,
		// DisplayName is required by QBO; fall back defensively.
		displayName: customer.DisplayName ?? customer.CompanyName ?? "(unnamed)",
		companyName: customer.CompanyName,
		email: customer.PrimaryEmailAddr?.Address,
		phone: customer.PrimaryPhone?.FreeFormNumber,
		givenName: customer.GivenName,
		familyName: customer.FamilyName,
		isJob,
		parentQboId: isJob ? customer.ParentRef?.value : undefined,
		parentDisplayName: isJob
			? parentDisplayName(customer, namesById)
			: undefined,
		billAddr: hasAddr
			? {
					line1: addr?.Line1,
					city: addr?.City,
					state: addr?.CountrySubDivisionCode,
					postalCode: addr?.PostalCode,
					country: addr?.Country,
				}
			: undefined,
	};
}

/**
 * Start (and run to completion) the customer import. Owner + premium gated via
 * the shared connect pre-flight; identity propagates into the mutations.
 */
export const startImport = action({
	args: {},
	handler: async (ctx): Promise<{ runId: Id<"quickbooksImportRuns"> }> => {
		const { orgId } = await ctx.runQuery(
			internal.quickbooks.authorizeConnectionSetup,
			{}
		);

		const tokens = await ensureFreshAccessToken(ctx, orgId);
		if (!tokens) {
			throw new ConvexError("not_connected");
		}

		const runId: Id<"quickbooksImportRuns"> = await ctx.runMutation(
			internal.quickbooksImport.startRun,
			{ orgId, realmId: tokens.realmId }
		);

		try {
			const seen = new Set<string>();
			// Display names of every customer seen so far, so a sub-customer can
			// carry its parent's name without a second query.
			const namesById = new Map<string, string>();
			for (let page = 0; page < MAX_PAGES; page++) {
				const customers = await queryCustomers(
					tokens,
					page * PAGE_SIZE + 1
				);
				const fresh = customers.filter((customer) => {
					if (seen.has(customer.Id)) return false;
					seen.add(customer.Id);
					return true;
				});
				for (const customer of fresh) {
					const name = customer.DisplayName ?? customer.CompanyName;
					if (name) namesById.set(customer.Id, name);
				}
				if (fresh.length > 0) {
					await ctx.runMutation(internal.quickbooksImport.processCustomerPage, {
						orgId,
						runId,
						customers: fresh.map((customer) =>
							toImportCustomer(customer, namesById)
						),
					});
				}
				if (customers.length < PAGE_SIZE) break;
			}
			await ctx.runMutation(internal.quickbooksImport.finishRun, { runId });
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "QuickBooks import failed";
			await ctx.runMutation(internal.quickbooksImport.failRun, {
				runId,
				error: message,
			});
			throw error;
		}

		return { runId };
	},
});
