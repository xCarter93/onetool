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
	CompanyName?: string;
	GivenName?: string;
	FamilyName?: string;
	Job?: boolean;
	PrimaryEmailAddr?: { Address?: string };
	PrimaryPhone?: { FreeFormNumber?: string };
	BillAddr?: QboBillAddr;
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

function toImportCustomer(customer: QboCustomer) {
	const addr = customer.BillAddr;
	const hasAddr =
		addr &&
		(addr.Line1 || addr.City || addr.CountrySubDivisionCode || addr.PostalCode);
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
		isJob: customer.Job === true,
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
				if (fresh.length > 0) {
					await ctx.runMutation(internal.quickbooksImport.processCustomerPage, {
						orgId,
						runId,
						customers: fresh.map(toImportCustomer),
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
