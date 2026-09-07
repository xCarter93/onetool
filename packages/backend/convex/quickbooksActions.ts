"use node";

import { ConvexError, v } from "convex/values";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
	exchangeAuthCode,
	qboEnvironment,
	qboFetch,
	QboInvalidGrantError,
	QboRequestError,
	refreshTokens,
	revokeToken,
	type QboEnvironment,
} from "./lib/quickbooks";
import { encryptToken, decryptToken } from "./lib/quickbooksCrypto";
import {
	buildQboCustomer,
	buildQboInvoice,
	buildQboPayment,
	buildQboRefundReceipt,
	deriveInvoiceAmounts,
	escapeQboQueryValue,
	type QboCustomerPayload,
} from "./lib/quickbooksMappers";
import { formatCurrency, roundCents } from "./lib/money";

/**
 * QuickBooks OAuth + token lifecycle actions (PRD §6.2).
 * DB access lives in quickbooks.ts; this file only talks to Intuit.
 */

// Refresh when the access token is inside this window of expiry.
const ACCESS_TOKEN_REFRESH_WINDOW_MS = 10 * 60 * 1000;
// Cron sweep: refresh connections whose last health check is older than this.
const HEALTH_CHECK_STALE_MS = 12 * 60 * 60 * 1000;

type CompanyInfoResponse = {
	CompanyInfo?: { CompanyName?: string; LegalName?: string };
};

/**
 * Finish the OAuth handshake. Called from the Next.js callback route via
 * fetchAction with the caller's Convex token, so identity propagates into the
 * internal query/mutation that do the real authorization.
 */
export const completeConnection = action({
	args: {
		code: v.string(),
		realmId: v.string(),
		redirectUri: v.string(),
	},
	handler: async (
		ctx,
		args
	): Promise<{ ok: true; companyName: string | null }> => {
		// Authorize BEFORE the exchange — auth codes are single-use.
		await ctx.runQuery(internal.quickbooks.authorizeConnectionSetup, {});

		const environment = qboEnvironment();

		let tokens;
		try {
			tokens = await exchangeAuthCode(args.code, args.redirectUri);
		} catch (error) {
			console.error("QuickBooks code exchange failed", error);
			throw new ConvexError("exchange_failed");
		}

		// Display-only; a CompanyInfo hiccup must not lose the tokens we just got.
		let companyName: string | null = null;
		try {
			const info = await qboFetch<CompanyInfoResponse>({
				accessToken: tokens.accessToken,
				realmId: args.realmId,
				environment,
				path: `/companyinfo/${args.realmId}`,
			});
			companyName =
				info.CompanyInfo?.CompanyName ?? info.CompanyInfo?.LegalName ?? null;
		} catch (error) {
			console.warn("QuickBooks CompanyInfo fetch failed", error);
		}

		await ctx.runMutation(internal.quickbooks.storeConnection, {
			realmId: args.realmId,
			environment,
			accessToken: await encryptToken(tokens.accessToken),
			accessTokenExpiresAt: tokens.accessTokenExpiresAt,
			refreshToken: await encryptToken(tokens.refreshToken),
			refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
			refreshTokenHardExpiresAt: tokens.refreshTokenHardExpiresAt,
			companyName: companyName ?? undefined,
		});

		return { ok: true, companyName };
	},
});

/**
 * Returns a usable access token for the org, refreshing first when it is
 * within the expiry window. Null when there is no live connection or the
 * refresh token has been revoked (connection flipped to needs_reauth).
 */
export async function ensureFreshAccessToken(
	ctx: ActionCtx,
	orgId: Id<"organizations">
): Promise<{
	accessToken: string;
	/** The stored (possibly encrypted) form, for compare-and-set guards. */
	storedAccessToken: string;
	/** Generation fence: the connection these tokens and realm belong to. */
	connectionId: Id<"quickbooksConnections">;
	realmId: string;
	environment: "sandbox" | "production";
} | null> {
	const connection: Doc<"quickbooksConnections"> | null = await ctx.runQuery(
		internal.quickbooks.getConnection,
		{ orgId }
	);
	if (!connection || connection.status !== "connected") {
		return null;
	}

	if (connection.accessTokenExpiresAt > Date.now() + ACCESS_TOKEN_REFRESH_WINDOW_MS) {
		return {
			accessToken: await decryptToken(connection.accessToken),
			storedAccessToken: connection.accessToken,
			connectionId: connection._id,
			realmId: connection.realmId,
			environment: connection.environment,
		};
	}

	const refreshed = await refreshConnection(ctx, connection);
	if (!refreshed) {
		return null;
	}
	return {
		accessToken: refreshed.accessToken,
		storedAccessToken: refreshed.storedAccessToken,
		connectionId: connection._id,
		realmId: connection.realmId,
		environment: refreshed.environment,
	};
}

/** Refresh + persist rotated tokens. Null when the grant is dead (needs_reauth). */
async function refreshConnection(
	ctx: ActionCtx,
	connection: Doc<"quickbooksConnections">
): Promise<{
	accessToken: string;
	storedAccessToken: string;
	environment: "sandbox" | "production";
} | null> {
	try {
		const tokens = await refreshTokens(
			await decryptToken(connection.refreshToken)
		);
		// Rotation is also the lazy-migration point: legacy plaintext rows come
		// back encrypted on their first refresh after the key is set.
		const storedAccessToken = await encryptToken(tokens.accessToken);
		const applied: boolean = await ctx.runMutation(
			internal.quickbooks.updateTokens,
			{
				orgId: connection.orgId,
				connectionId: connection._id,
				previousRefreshToken: connection.refreshToken,
				accessToken: storedAccessToken,
				accessTokenExpiresAt: tokens.accessTokenExpiresAt,
				refreshToken: await encryptToken(tokens.refreshToken),
				refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
				refreshTokenHardExpiresAt: tokens.refreshTokenHardExpiresAt,
			}
		);
		if (applied) {
			return {
				accessToken: tokens.accessToken,
				storedAccessToken,
				environment: connection.environment,
			};
		}

		// Lost the rotation race: use the stored tokens, unless a reconnect replaced the row.
		const current: Doc<"quickbooksConnections"> | null = await ctx.runQuery(
			internal.quickbooks.getConnection,
			{ orgId: connection.orgId }
		);
		if (!current || current.status !== "connected" || current._id !== connection._id) {
			return null;
		}
		// A reconnect can flip environment in place, so read it off the live row.
		return {
			accessToken: await decryptToken(current.accessToken),
			storedAccessToken: current.accessToken,
			environment: current.environment,
		};
	} catch (error) {
		if (error instanceof QboInvalidGrantError) {
			// Refresh race (worker vs cron): if another caller already rotated the
			// token, this failure is stale — leave the connection alone.
			await ctx.runMutation(internal.quickbooks.markNeedsReauth, {
				orgId: connection.orgId,
				ifRefreshTokenMatches: connection.refreshToken,
			});
			return null;
		}
		throw error;
	}
}

/** Cron safety net: keep idle connections' tokens warm (PRD §6.2). */
export const refreshStaleConnections = internalAction({
	args: {},
	handler: async (ctx): Promise<{ checked: number; refreshed: number }> => {
		const connections: Doc<"quickbooksConnections">[] = await ctx.runQuery(
			internal.quickbooks.listConnectionsForHealthCheck,
			{}
		);
		const cutoff = Date.now() - HEALTH_CHECK_STALE_MS;
		let checked = 0;
		let refreshed = 0;

		// Sequential: each iteration writes, and Intuit rate-limits per realm.
		for (const connection of connections) {
			if (
				connection.lastHealthCheckAt != null &&
				connection.lastHealthCheckAt > cutoff
			) {
				continue;
			}
			checked++;
			try {
				const result = await refreshConnection(ctx, connection);
				if (result) refreshed++;
			} catch (error) {
				console.error(
					`QuickBooks health refresh failed for org ${connection.orgId}`,
					error
				);
			}
		}

		return { checked, refreshed };
	},
});

// ============================================================================
// Setup flow (PRD §7.1) — resolve the QBO accounts the sync writes into
// ============================================================================

const ONETOOL_SERVICE_ITEM_NAME = "OneTool Service";

type QboAccount = { Id: string; Name: string };
type QboItem = {
	Id: string;
	Name: string;
	SyncToken?: string;
	Type?: string;
	IncomeAccountRef?: { value: string };
};
type QboQueryResponse<T> = {
	QueryResponse?: {
		Account?: T[];
		Item?: T[];
		Customer?: T[];
		maxResults?: number;
	};
};

type QboRef = { accessToken: string; realmId: string; environment: QboEnvironment };

async function qboQuery<T>(
	tokens: QboRef,
	statement: string
): Promise<QboQueryResponse<T>> {
	return await qboFetch<QboQueryResponse<T>>({
		accessToken: tokens.accessToken,
		realmId: tokens.realmId,
		environment: tokens.environment,
		path: `/query?query=${encodeURIComponent(statement)}`,
	});
}

async function findUndepositedFundsAccount(
	tokens: QboRef
): Promise<QboAccount | null> {
	const result = await qboQuery<QboAccount>(
		tokens,
		"SELECT * FROM Account WHERE AccountSubType = 'UndepositedFunds'"
	);
	return result.QueryResponse?.Account?.[0] ?? null;
}

/** Income accounts + the Undeposited Funds account, for the setup picker. */
export const listSetupAccounts = action({
	args: {},
	handler: async (
		ctx
	): Promise<{
		incomeAccounts: Array<{ qboId: string; name: string }>;
		depositAccount: { qboId: string; name: string } | null;
	}> => {
		const { orgId } = await ctx.runQuery(
			internal.quickbooks.authorizeConnectionSetup,
			{}
		);
		const tokens = await ensureFreshAccessToken(ctx, orgId);
		if (!tokens) {
			throw new ConvexError("not_connected");
		}

		// QBO caps query pages at 1000 rows; page until a short page. The page
		// cap is a backstop against a server that ignores STARTPOSITION.
		const PAGE_SIZE = 1000;
		const MAX_PAGES = 10;
		const incomeAccounts: QboAccount[] = [];
		for (let start = 1, pages = 0; pages < MAX_PAGES; start += PAGE_SIZE, pages++) {
			const page = await qboQuery<QboAccount>(
				tokens,
				`SELECT * FROM Account WHERE AccountType = 'Income' STARTPOSITION ${start} MAXRESULTS ${PAGE_SIZE}`
			);
			const accounts = page.QueryResponse?.Account ?? [];
			incomeAccounts.push(...accounts);
			if (accounts.length < PAGE_SIZE) break;
		}
		const deposit = await findUndepositedFundsAccount(tokens);

		return {
			incomeAccounts: incomeAccounts.map((account) => ({
				qboId: account.Id,
				name: account.Name,
			})),
			depositAccount: deposit
				? { qboId: deposit.Id, name: deposit.Name }
				: null,
		};
	},
});

/** Find-or-create the single generic Service item every synced line references. */
async function resolveServiceItem(
	tokens: QboRef,
	incomeAccountQboId: string
): Promise<string> {
	const found = await findItemByName(tokens, ONETOOL_SERVICE_ITEM_NAME);
	if (found) return await adoptServiceItem(tokens, found, incomeAccountQboId);

	try {
		const created = await qboFetch<{ Item: QboItem }>({
			accessToken: tokens.accessToken,
			realmId: tokens.realmId,
			environment: tokens.environment,
			path: "/item",
			method: "POST",
			body: {
				Name: ONETOOL_SERVICE_ITEM_NAME,
				Type: "Service",
				IncomeAccountRef: { value: incomeAccountQboId },
			},
		});
		return created.Item.Id;
	} catch (error) {
		// 6240: something already owns the name; re-query and adopt it.
		if (error instanceof QboRequestError && error.isDuplicateName) {
			const adopted = await findItemByName(tokens, ONETOOL_SERVICE_ITEM_NAME);
			if (adopted) return await adoptServiceItem(tokens, adopted, incomeAccountQboId);
		}
		throw error;
	}
}

/**
 * "OneTool Service" is our own item, so a stale income account is repointed
 * to the one the user just picked rather than reported as a conflict.
 */
async function adoptServiceItem(
	tokens: QboRef,
	item: QboItem,
	incomeAccountQboId: string
): Promise<string> {
	if (item.Type !== "Service") {
		throw new ConvexError(
			`QuickBooks already has an item named "${ONETOOL_SERVICE_ITEM_NAME}" that is not a Service item. Rename it in QuickBooks, then finish setup again.`
		);
	}
	if (item.IncomeAccountRef?.value === incomeAccountQboId) return item.Id;
	const updated = await qboPost<{ Item: QboItem }>(tokens, "/item", {
		Id: item.Id,
		SyncToken: item.SyncToken ?? "0",
		sparse: true,
		IncomeAccountRef: { value: incomeAccountQboId },
	});
	return updated.Item.Id;
}

/**
 * Persist the account mappings and provision the service item. Releases any
 * jobs the worker parked while setup was incomplete.
 */
export const completeSetup = action({
	args: {
		incomeAccountQboId: v.string(),
		incomeAccountName: v.string(),
	},
	handler: async (ctx, args): Promise<{ ok: true }> => {
		const { orgId } = await ctx.runQuery(
			internal.quickbooks.authorizeConnectionSetup,
			{}
		);
		const tokens = await ensureFreshAccessToken(ctx, orgId);
		if (!tokens) {
			throw new ConvexError("not_connected");
		}

		const serviceItemId = await resolveServiceItem(
			tokens,
			args.incomeAccountQboId
		);
		const deposit = await findUndepositedFundsAccount(tokens);

		await ctx.runMutation(internal.quickbooks.saveAccountMappings, {
			orgId,
			incomeAccountQboId: args.incomeAccountQboId,
			incomeAccountName: args.incomeAccountName,
			depositAccountQboId: deposit?.Id,
			defaultServiceItemQboId: serviceItemId,
		});

		await ctx.scheduler.runAfter(
			0,
			internal.quickbooksActions.processOrgJobs,
			{ orgId }
		);
		return { ok: true };
	},
});

// ============================================================================
// Sync worker (PRD §6.4)
// ============================================================================

const MAX_JOB_ATTEMPTS = 5;
const JOB_BATCH_SIZE = 10;
/** Setup incomplete: park the job, do not burn an attempt. */
const SETUP_HOLD_MS = 15 * 60 * 1000;
/** Waiting on a dependency (invoice not yet in QBO). */
const DEPENDENCY_HOLD_MS = 60 * 1000;

type SyncJob = Doc<"quickbooksSyncJobs">;
type Connection = Doc<"quickbooksConnections">;

/** A job either completed, or could not be attempted yet and must be parked. */
type SyncOutcome =
	| { kind: "done" }
	| { kind: "hold"; delayMs: number }
	// Superseded by a state change since the job was queued; parks as ignored.
	| { kind: "ignored"; reason: string };

const CANCELLED_BEFORE_EXPORT =
	"Superseded: the invoice was cancelled before it reached QuickBooks";

class TerminalSyncError extends Error {
	constructor(
		message: string,
		public readonly code?: string
	) {
		super(message);
		this.name = "TerminalSyncError";
	}
}

type QboEntityResponse<K extends string> = Record<
	K,
	{
		Id: string;
		SyncToken: string;
		TotalAmt?: number;
		TxnTaxDetail?: { TotalTax?: number };
	}
>;

function differsByACent(a: number, b: number): boolean {
	return Math.round(Math.abs(a - b) * 100) >= 1;
}

async function qboPost<T>(
	tokens: QboRef,
	path: string,
	body: unknown
): Promise<T> {
	return await qboFetch<T>({
		accessToken: tokens.accessToken,
		realmId: tokens.realmId,
		environment: tokens.environment,
		path,
		method: "POST",
		body,
	});
}

/**
 * Sparse-update an entity, refreshing the SyncToken once if QBO says ours is
 * stale (5010). Two tries total, matching PRD §6.4.
 */
async function sparseUpdate<K extends string>(
	ctx: ActionCtx,
	tokens: QboRef,
	connection: Connection,
	entityType: "client" | "invoice" | "sku",
	localId: string,
	resource: K,
	payload: Record<string, unknown>,
	qboId: string,
	syncToken: string
): Promise<QboEntityResponse<K>[K]> {
	// resource is the capitalized response key ("Customer"); QBO URL paths must
	// be lowercase or it answers 400 "Unsupported Operation".
	const path = `/${resource.toLowerCase()}`;
	try {
		const response = await qboPost<QboEntityResponse<K>>(tokens, path, {
			...payload,
			Id: qboId,
			SyncToken: syncToken,
			sparse: true,
		});
		return response[resource];
	} catch (error) {
		if (!(error instanceof QboRequestError) || !error.isStaleSyncToken) {
			throw error;
		}
		const fresh = await qboFetch<QboEntityResponse<K>>({
			accessToken: tokens.accessToken,
			realmId: tokens.realmId,
			environment: tokens.environment,
			path: `/${resource.toLowerCase()}/${qboId}`,
		});
		const freshToken = fresh[resource].SyncToken;
		await ctx.runMutation(internal.quickbooks.upsertEntityLink, {
			orgId: connection.orgId,
			connectionId: connection._id,
			entityType,
			localId,
			qboId,
			qboSyncToken: freshToken,
		});
		const retried = await qboPost<QboEntityResponse<K>>(tokens, path, {
			...payload,
			Id: qboId,
			SyncToken: freshToken,
			sparse: true,
		});
		return retried[resource];
	}
}

/**
 * Push a client to QBO and return its Customer id. Used both for client jobs
 * and inline, as the invoice job's dependency step.
 */
async function syncClient(
	ctx: ActionCtx,
	connection: Connection,
	tokens: QboRef,
	clientId: Id<"clients">
): Promise<string> {
	const payload = await ctx.runQuery(internal.quickbooks.getSyncJobPayload, {
		orgId: connection.orgId,
		entityType: "client",
		localId: clientId,
	});
	if (!payload || payload.kind !== "client") {
		throw new TerminalSyncError(
			"This client no longer exists in OneTool, so it cannot be synced."
		);
	}

	const link = await ctx.runQuery(internal.quickbooks.getEntityLinkInternal, {
		orgId: connection.orgId,
		entityType: "client",
		localId: clientId,
	});

	const customer = buildQboCustomer({
		client: payload.client,
		primaryContact: payload.primaryContact,
		billingAddress: payload.billingAddress,
	});

	if (link) {
		const updated = await sparseUpdate(
			ctx,
			tokens,
			connection,
			"client",
			clientId,
			"Customer",
			customer as unknown as Record<string, unknown>,
			link.qboId,
			link.qboSyncToken
		);
		await ctx.runMutation(internal.quickbooks.upsertEntityLink, {
			orgId: connection.orgId,
			connectionId: connection._id,
			entityType: "client",
			localId: clientId,
			qboId: updated.Id,
			qboSyncToken: updated.SyncToken,
		});
		return updated.Id;
	}

	let created: { Id: string; SyncToken: string };
	try {
		// requestid: same idempotency contract as the item/invoice/payment
		// creates — concurrent or crash-retried creates for the same client
		// collapse to one QBO Customer instead of duplicating.
		const response = await qboPost<QboEntityResponse<"Customer">>(
			tokens,
			`/customer?requestid=${clientId}`,
			customer
		);
		created = response.Customer;
	} catch (error) {
		if (!(error instanceof QboRequestError) || !error.isDuplicateName) {
			throw error;
		}
		created = await resolveDuplicateCustomer(
			ctx,
			tokens,
			connection,
			clientId,
			customer,
			error
		);
	}

	const { created: firstLink } = await ctx.runMutation(
		internal.quickbooks.upsertEntityLink,
		{
			orgId: connection.orgId,
			connectionId: connection._id,
			entityType: "client",
			localId: clientId,
			qboId: created.Id,
			qboSyncToken: created.SyncToken,
		}
	);
	// Activity entry on first link only — renames must not spam the feed.
	if (firstLink) {
		await ctx.runMutation(internal.quickbooks.recordClientSyncActivity, {
			orgId: connection.orgId,
			clientId,
			qboDisplayName: customer.DisplayName,
			qboId: created.Id,
		});
	}
	return created.Id;
}

/**
 * 6240 on create: adopt an existing Customer with the same DisplayName unless
 * another local client already owns it (a shared name is not a shared
 * accounting identity), else disambiguate when the org allows it, else
 * surface it in the error center.
 */
async function resolveDuplicateCustomer(
	ctx: ActionCtx,
	tokens: QboRef,
	connection: Connection,
	localId: Id<"clients">,
	payload: QboCustomerPayload,
	original: QboRequestError
): Promise<{ Id: string; SyncToken: string }> {
	const displayName = payload.DisplayName;
	const match = await qboQuery<{ Id: string; SyncToken: string; DisplayName: string }>(
		tokens,
		`SELECT * FROM Customer WHERE DisplayName = '${escapeQboQueryValue(displayName)}'`
	);
	const existing = match.QueryResponse?.Customer?.find(
		(candidate) => candidate.DisplayName === displayName
	);
	const owner = existing
		? await ctx.runQuery(internal.lib.quickbooksEnqueue.getEntityLinkByQboId, {
				orgId: connection.orgId,
				entityType: "client",
				qboId: existing.Id,
			})
		: null;
	if (existing && (!owner || owner.link.localId === localId)) {
		return { Id: existing.Id, SyncToken: existing.SyncToken };
	}

	if (!connection.autoDisambiguateNames) {
		throw new TerminalSyncError(
			owner
				? `QuickBooks already has a customer named "${displayName}", and it is linked to ${owner.label} in OneTool. Rename one of the clients, or link this one to the right QuickBooks customer, then retry.`
				: `QuickBooks already has a different record named "${displayName}". Rename the client in OneTool or the record in QuickBooks, then retry.`,
			original.faults[0]?.code ?? "6240"
		);
	}

	// Distinct requestid: the disambiguated payload must not replay the
	// original create attempt's cached response.
	const retryResponse = await qboPost<QboEntityResponse<"Customer">>(
		tokens,
		`/customer?requestid=${localId}-2`,
		{ ...payload, DisplayName: `${displayName} - 2` }
	);
	return retryResponse.Customer;
}

/** Name lookup for Items. QBO Item names are unique per company. */
async function findItemByName(
	tokens: QboRef,
	name: string
): Promise<QboItem | null> {
	const result = await qboQuery<QboItem>(
		tokens,
		`SELECT * FROM Item WHERE Name = '${escapeQboQueryValue(name)}'`
	);
	return result.QueryResponse?.Item?.find((item) => item.Name === name) ?? null;
}

/**
 * Resolve the QBO Item for a SKU, creating it on first use (Jobber's lazy
 * catalog sync). Adoption by name is the normal path: the user's QuickBooks
 * usually already has an item called "Lawn Mowing".
 *
 * Returns null when the Item cannot be provisioned (no income account mapped);
 * the caller then falls back to the generic service item rather than failing
 * the invoice.
 */
async function ensureItemForSku(
	ctx: ActionCtx,
	connection: Connection,
	tokens: QboRef,
	sku: Doc<"skus">,
	operationId: string
): Promise<string | null> {
	const link = await ctx.runQuery(internal.quickbooks.getEntityLinkInternal, {
		orgId: connection.orgId,
		entityType: "sku",
		localId: sku._id,
	});
	if (link) return link.qboId;

	const linkItem = async (item: QboItem): Promise<string> => {
		await ctx.runMutation(internal.quickbooks.upsertEntityLink, {
			orgId: connection.orgId,
			connectionId: connection._id,
			entityType: "sku",
			localId: sku._id,
			qboId: item.Id,
			qboSyncToken: item.SyncToken ?? "0",
		});
		return item.Id;
	};

	// Only Type is enforced: the income account of a user's own item is theirs.
	const adoptItem = async (item: QboItem): Promise<string> => {
		if (item.Type !== "Service") {
			throw new TerminalSyncError(
				`QuickBooks already has an item named "${sku.name}" that is not a Service item. Rename it in QuickBooks or rename the line item in OneTool, then retry.`
			);
		}
		return await linkItem(item);
	};

	const existing = await findItemByName(tokens, sku.name);
	if (existing) return await adoptItem(existing);

	if (!connection.incomeAccountQboId) return null;

	try {
		const created = await qboPost<{ Item: QboItem }>(
			tokens,
			`/item?requestid=${sku._id}-${operationId}`,
			{
				Name: sku.name,
				Type: "Service",
				IncomeAccountRef: { value: connection.incomeAccountQboId },
			}
		);
		return await linkItem(created.Item);
	} catch (error) {
		if (error instanceof QboRequestError && error.isDuplicateName) {
			const adopted = await findItemByName(tokens, sku.name);
			if (adopted) return await adoptItem(adopted);
		}
		throw error;
	}
}

async function syncInvoice(
	ctx: ActionCtx,
	connection: Connection,
	tokens: QboRef,
	invoiceId: Id<"invoices">,
	requestId: string,
	operationId: string
): Promise<SyncOutcome> {
	if (!connection.defaultServiceItemQboId) {
		return { kind: "hold", delayMs: SETUP_HOLD_MS };
	}

	const payload = await ctx.runQuery(internal.quickbooks.getSyncJobPayload, {
		orgId: connection.orgId,
		entityType: "invoice",
		localId: invoiceId,
	});
	if (!payload || payload.kind !== "invoice") {
		throw new TerminalSyncError(
			"This invoice no longer exists in OneTool, so it cannot be synced."
		);
	}
	// Claimed before the cancel landed: the cancelled state must never be pushed.
	if (payload.invoice.status === "cancelled") {
		const link = await ctx.runQuery(internal.quickbooks.getEntityLinkInternal, {
			orgId: connection.orgId,
			entityType: "invoice",
			localId: invoiceId,
		});
		if (link) return await voidInvoice(ctx, connection, tokens, invoiceId);
		return { kind: "ignored", reason: CANCELLED_BEFORE_EXPORT };
	}

	// Dependency: the Customer must exist first.
	const customerQboId = await syncClient(
		ctx,
		connection,
		tokens,
		payload.clientId
	);

	// Per-SKU Items, resolved once per distinct SKU. A line whose SKU was
	// deleted (absent from payload.skus) silently keeps the generic item.
	const itemIdBySku = new Map<string, string>();
	for (const sku of Object.values(payload.skus)) {
		const itemQboId = await ensureItemForSku(
			ctx,
			connection,
			tokens,
			sku,
			operationId
		);
		if (itemQboId) itemIdBySku.set(sku._id, itemQboId);
	}

	const body = buildQboInvoice({
		invoice: payload.invoice,
		lineItems: payload.lineItems.map((item) => {
			const itemQboId = item.skuId ? itemIdBySku.get(item.skuId) : undefined;
			return itemQboId ? { ...item, itemQboId } : item;
		}),
		customerQboId,
		defaultServiceItemQboId: connection.defaultServiceItemQboId,
		jobSite: payload.jobSite,
	});
	const sentTax = deriveInvoiceAmounts(payload.invoice, payload.lineItems).tax;

	const link = await ctx.runQuery(internal.quickbooks.getEntityLinkInternal, {
		orgId: connection.orgId,
		entityType: "invoice",
		localId: invoiceId,
	});

	const result = link
		? await sparseUpdate(
				ctx,
				tokens,
				connection,
				"invoice",
				invoiceId,
				"Invoice",
				body as unknown as Record<string, unknown>,
				link.qboId,
				link.qboSyncToken
			)
		: (
				await qboPost<QboEntityResponse<"Invoice">>(
					tokens,
					// requestid makes the create idempotent across crash-retries.
					`/invoice?requestid=${requestId}`,
					body
				)
			).Invoice;

	// Automated Sales Tax may overrule the tax we sent. Never silent.
	const returnedTax = result.TxnTaxDetail?.TotalTax;
	let syncWarning: string | undefined;
	if (returnedTax !== undefined && differsByACent(returnedTax, sentTax)) {
		syncWarning = `QuickBooks adjusted the tax from ${formatCurrency(sentTax)} to ${formatCurrency(returnedTax)}.`;
	}
	const localTotal = roundCents(payload.invoice.total);
	const returnedTotal = result.TotalAmt;
	const totalMismatch =
		returnedTotal !== undefined && differsByACent(returnedTotal, localTotal);
	if (totalMismatch) {
		syncWarning = `QuickBooks totals this invoice at ${formatCurrency(returnedTotal)}, but OneTool billed ${formatCurrency(localTotal)}.${syncWarning ? ` ${syncWarning}` : ""} Align the tax settings on both sides, then retry.`;
	}

	// Linked even on a mismatch: the QBO invoice exists, so a retry must update it.
	await ctx.runMutation(internal.quickbooks.upsertEntityLink, {
		orgId: connection.orgId,
		connectionId: connection._id,
		entityType: "invoice",
		localId: invoiceId,
		qboId: result.Id,
		qboSyncToken: result.SyncToken,
		syncWarning,
	});
	if (totalMismatch) throw new TerminalSyncError(syncWarning!, "total_mismatch");
	return { kind: "done" };
}

/** QBO "Object Not Found" — the entity is already gone, so a void is moot. */
function isObjectNotFound(error: unknown): boolean {
	return (
		error instanceof QboRequestError &&
		error.faults.some((fault) => fault.code === "610")
	);
}

/**
 * Void a cancelled invoice in QBO. Re-GETs for a fresh SyncToken (the local
 * token may be stale) and POSTs to `/invoice?operation=void`. The link is kept
 * so a later reactivation updates the voided invoice instead of creating a
 * second one.
 */
async function voidInvoice(
	ctx: ActionCtx,
	connection: Connection,
	tokens: QboRef,
	invoiceId: Id<"invoices">
): Promise<SyncOutcome> {
	const link = await ctx.runQuery(internal.quickbooks.getEntityLinkInternal, {
		orgId: connection.orgId,
		entityType: "invoice",
		localId: invoiceId,
	});
	// Never pushed to QuickBooks: nothing to void.
	if (!link) return { kind: "done" };

	// The invoice may have been reactivated after this job was claimed. A
	// deleted invoice (null payload) still gets voided.
	const payload = await ctx.runQuery(internal.quickbooks.getSyncJobPayload, {
		orgId: connection.orgId,
		entityType: "invoice",
		localId: invoiceId,
	});
	if (payload?.kind === "invoice" && payload.invoice.status !== "cancelled") {
		return { kind: "done" };
	}

	const getFreshToken = async (): Promise<string | null> => {
		try {
			const fresh = await qboFetch<QboEntityResponse<"Invoice">>({
				accessToken: tokens.accessToken,
				realmId: tokens.realmId,
				environment: tokens.environment,
				path: `/invoice/${link.qboId}`,
			});
			return fresh.Invoice.SyncToken;
		} catch (error) {
			if (isObjectNotFound(error)) return null;
			throw error;
		}
	};

	const syncToken = await getFreshToken();
	// Already gone from QuickBooks — treat as success, keep the link.
	if (syncToken === null) return { kind: "done" };

	let voided: { Id: string; SyncToken: string };
	try {
		voided = (
			await qboPost<QboEntityResponse<"Invoice">>(tokens, "/invoice?operation=void", {
				Id: link.qboId,
				SyncToken: syncToken,
			})
		).Invoice;
	} catch (error) {
		if (isObjectNotFound(error)) return { kind: "done" };
		if (!(error instanceof QboRequestError) || !error.isStaleSyncToken) {
			throw error;
		}
		// One stale-token retry, mirroring sparseUpdate.
		const retryToken = await getFreshToken();
		if (retryToken === null) return { kind: "done" };
		voided = (
			await qboPost<QboEntityResponse<"Invoice">>(tokens, "/invoice?operation=void", {
				Id: link.qboId,
				SyncToken: retryToken,
			})
		).Invoice;
	}

	// A synced Payment referencing this invoice is now orphaned in QuickBooks;
	// only the user can decide what to do with it.
	const hasSyncedPayment: boolean = await ctx.runQuery(
		internal.quickbooks.hasSyncedPaymentForInvoice,
		{ orgId: connection.orgId, invoiceId }
	);

	await ctx.runMutation(internal.quickbooks.upsertEntityLink, {
		orgId: connection.orgId,
		connectionId: connection._id,
		entityType: "invoice",
		localId: invoiceId,
		qboId: voided.Id,
		qboSyncToken: voided.SyncToken,
		syncWarning: hasSyncedPayment
			? "Voided in QuickBooks; a synced payment referenced this invoice — review it in QuickBooks"
			: undefined,
	});
	return { kind: "done" };
}

/**
 * Setup finished without an Undeposited Funds account: re-resolve instead of
 * holding forever; if the company truly has none, fail actionably so it
 * reaches the error center rather than hanging silently.
 */
async function resolveDepositAccount(
	ctx: ActionCtx,
	connection: Connection,
	tokens: QboRef
): Promise<string> {
	if (connection.depositAccountQboId) return connection.depositAccountQboId;
	const deposit = await findUndepositedFundsAccount(tokens);
	if (!deposit) {
		throw new TerminalSyncError(
			"Your QuickBooks company has no Undeposited Funds account, so payments cannot be recorded. Create one in QuickBooks, then retry."
		);
	}
	await ctx.runMutation(internal.quickbooks.saveDepositAccount, {
		orgId: connection.orgId,
		depositAccountQboId: deposit.Id,
	});
	return deposit.Id;
}

/**
 * Stripe refund → QBO RefundReceipt against the customer, out of the account
 * the Payment was deposited to. Posted only once the Payment itself is in
 * QuickBooks: a payment refunded in full before it ever exported nets to
 * nothing there and posts nothing.
 */
async function syncRefund(
	ctx: ActionCtx,
	connection: Connection,
	tokens: QboRef,
	refundId: string,
	requestId: string
): Promise<SyncOutcome> {
	if (!connection.defaultServiceItemQboId) {
		return { kind: "hold", delayMs: SETUP_HOLD_MS };
	}
	const existingLink = await ctx.runQuery(
		internal.quickbooks.getEntityLinkInternal,
		{ orgId: connection.orgId, entityType: "refund", localId: refundId }
	);
	if (existingLink) return { kind: "done" };

	const payload = await ctx.runQuery(internal.quickbooks.getSyncJobPayload, {
		orgId: connection.orgId,
		entityType: "refund",
		localId: refundId,
	});
	if (!payload || payload.kind !== "refund") {
		throw new TerminalSyncError(
			"This refund no longer exists in OneTool, so it cannot be synced."
		);
	}
	if (payload.refund.status !== "succeeded") {
		return {
			kind: "ignored",
			reason: "Superseded: Stripe no longer reports this refund as succeeded",
		};
	}

	const paymentLink = await ctx.runQuery(
		internal.quickbooks.getEntityLinkInternal,
		{
			orgId: connection.orgId,
			entityType: "payment",
			localId: payload.payment._id,
		}
	);
	if (!paymentLink) {
		if (payload.payment.status !== "paid") {
			return {
				kind: "ignored",
				reason:
					"The payment was refunded before it reached QuickBooks, so there is nothing to reverse",
			};
		}
		const paymentFailed = await ctx.runQuery(internal.quickbooks.hasFailedSyncJob, {
			orgId: connection.orgId,
			entityType: "payment",
			localId: payload.payment._id,
		});
		if (paymentFailed) {
			throw new TerminalSyncError(
				"The payment for this refund failed to sync to QuickBooks; retry the payment sync first."
			);
		}
		return { kind: "hold", delayMs: DEPENDENCY_HOLD_MS };
	}
	const clientLink = await ctx.runQuery(
		internal.quickbooks.getEntityLinkInternal,
		{ orgId: connection.orgId, entityType: "client", localId: payload.clientId }
	);
	if (!clientLink) return { kind: "hold", delayMs: DEPENDENCY_HOLD_MS };

	const depositAccountQboId = await resolveDepositAccount(ctx, connection, tokens);
	const body = buildQboRefundReceipt({
		refund: payload.refund,
		customerQboId: clientLink.qboId,
		depositAccountQboId,
		serviceItemQboId: connection.defaultServiceItemQboId,
		invoiceNumber: payload.invoice.invoiceNumber,
	});
	const created = await qboPost<QboEntityResponse<"RefundReceipt">>(
		tokens,
		`/refundreceipt?requestid=${requestId}`,
		body
	);
	await ctx.runMutation(internal.quickbooks.upsertEntityLink, {
		orgId: connection.orgId,
		connectionId: connection._id,
		entityType: "refund",
		localId: refundId,
		qboId: created.RefundReceipt.Id,
		qboSyncToken: created.RefundReceipt.SyncToken,
	});
	return { kind: "done" };
}

async function syncPayment(
	ctx: ActionCtx,
	connection: Connection,
	tokens: QboRef,
	paymentId: Id<"payments">,
	requestId: string
): Promise<SyncOutcome> {
	// Setup not finished at all: park until completeSetup releases the queue.
	if (!connection.defaultServiceItemQboId) {
		return { kind: "hold", delayMs: SETUP_HOLD_MS };
	}

	const depositAccountQboId = await resolveDepositAccount(ctx, connection, tokens);

	// Payments are create-only in v1: a settled payment does not change.
	const existingLink = await ctx.runQuery(
		internal.quickbooks.getEntityLinkInternal,
		{ orgId: connection.orgId, entityType: "payment", localId: paymentId }
	);
	if (existingLink) return { kind: "done" };

	const payload = await ctx.runQuery(internal.quickbooks.getSyncJobPayload, {
		orgId: connection.orgId,
		entityType: "payment",
		localId: paymentId,
	});
	if (!payload || payload.kind !== "payment") {
		throw new TerminalSyncError(
			"This payment no longer exists in OneTool, so it cannot be synced."
		);
	}
	// Refunded or cancelled since it was queued: the original amount must not
	// post. A partial refund keeps the row paid; its RefundReceipt carries the rest.
	if (payload.payment.status !== "paid") {
		return {
			kind: "ignored",
			reason: "Superseded: the payment was refunded or cancelled before it reached QuickBooks",
		};
	}

	const invoiceLink = await ctx.runQuery(
		internal.quickbooks.getEntityLinkInternal,
		{
			orgId: connection.orgId,
			entityType: "invoice",
			localId: payload.invoiceId,
		}
	);
	const clientLink = await ctx.runQuery(
		internal.quickbooks.getEntityLinkInternal,
		{
			orgId: connection.orgId,
			entityType: "client",
			localId: payload.clientId,
		}
	);
	// Checked before the link: a linked invoice can still be in a failed state
	// (total mismatch), and no payment should settle against it.
	const invoiceFailed = await ctx.runQuery(internal.quickbooks.hasFailedSyncJob, {
		orgId: connection.orgId,
		entityType: "invoice",
		localId: payload.invoiceId,
	});
	if (invoiceFailed) {
		throw new TerminalSyncError(
			"The invoice for this payment failed to sync to QuickBooks; retry the invoice sync first."
		);
	}
	if (!invoiceLink || !clientLink) {
		// The invoice may never have been queued at all (created before QuickBooks
		// was connected and still only partially paid). Make sure a job exists so
		// this hold can resolve — the invoice sync also creates the customer link.
		await ctx.runMutation(internal.quickbooks.ensureInvoiceSyncQueued, {
			orgId: connection.orgId,
			invoiceId: payload.invoiceId,
		});
		return { kind: "hold", delayMs: DEPENDENCY_HOLD_MS };
	}

	const body = buildQboPayment({
		payment: payload.payment,
		customerQboId: clientLink.qboId,
		invoiceQboId: invoiceLink.qboId,
		depositAccountQboId,
	});
	// requestid: if a prior attempt created the Payment but we crashed before
	// linking it, the retry returns the original response instead of a duplicate.
	const created = await qboPost<QboEntityResponse<"Payment">>(
		tokens,
		`/payment?requestid=${requestId}`,
		body
	);

	await ctx.runMutation(internal.quickbooks.upsertEntityLink, {
		orgId: connection.orgId,
		connectionId: connection._id,
		entityType: "payment",
		localId: paymentId,
		qboId: created.Payment.Id,
		qboSyncToken: created.Payment.SyncToken,
	});
	return { kind: "done" };
}

/**
 * Propagate a SKU rename to its QBO Item. Only linked SKUs get here (the
 * enqueue hook filters the rest), so a missing link means the item was never
 * pushed and the job is a no-op.
 */
async function syncSku(
	ctx: ActionCtx,
	connection: Connection,
	tokens: QboRef,
	skuId: Id<"skus">
): Promise<SyncOutcome> {
	// Same hold as invoices: Item writes belong to a fully mapped connection.
	if (!connection.defaultServiceItemQboId) {
		return { kind: "hold", delayMs: SETUP_HOLD_MS };
	}

	const link = await ctx.runQuery(internal.quickbooks.getEntityLinkInternal, {
		orgId: connection.orgId,
		entityType: "sku",
		localId: skuId,
	});
	if (!link) return { kind: "done" };

	const payload = await ctx.runQuery(internal.quickbooks.getSyncJobPayload, {
		orgId: connection.orgId,
		entityType: "sku",
		localId: skuId,
	});
	if (!payload || payload.kind !== "sku") {
		throw new TerminalSyncError(
			"This line item no longer exists in OneTool, so it cannot be synced."
		);
	}

	try {
		const updated = await sparseUpdate(
			ctx,
			tokens,
			connection,
			"sku",
			skuId,
			"Item",
			{ Name: payload.sku.name },
			link.qboId,
			link.qboSyncToken
		);
		await ctx.runMutation(internal.quickbooks.upsertEntityLink, {
			orgId: connection.orgId,
			connectionId: connection._id,
			entityType: "sku",
			localId: skuId,
			qboId: updated.Id,
			qboSyncToken: updated.SyncToken,
		});
		return { kind: "done" };
	} catch (error) {
		// Never adopt on rename: the colliding item belongs to someone else's
		// catalog, and merging into it would be silent data loss.
		if (error instanceof QboRequestError && error.isDuplicateName) {
			throw new TerminalSyncError(
				`An item named "${payload.sku.name}" already exists in QuickBooks. Rename it there or in OneTool, then retry.`,
				error.faults[0]?.code ?? "6240"
			);
		}
		throw error;
	}
}

async function syncOne(
	ctx: ActionCtx,
	connection: Connection,
	tokens: QboRef,
	job: SyncJob
): Promise<SyncOutcome> {
	// Pre-operationId rows keep their attempt-numbered id until they drain.
	const operationId = job.operationId ?? String(job.attempts);
	const requestId = `${job.localId}-${operationId}`;

	if (job.entityType === "sku") {
		return await syncSku(ctx, connection, tokens, job.localId as Id<"skus">);
	}
	if (job.entityType === "client") {
		await syncClient(ctx, connection, tokens, job.localId as Id<"clients">);
		return { kind: "done" };
	}
	if (job.entityType === "invoice") {
		if (job.operation === "void") {
			return await voidInvoice(
				ctx,
				connection,
				tokens,
				job.localId as Id<"invoices">
			);
		}
		return await syncInvoice(
			ctx,
			connection,
			tokens,
			job.localId as Id<"invoices">,
			requestId,
			operationId
		);
	}
	if (job.entityType === "refund") {
		return await syncRefund(ctx, connection, tokens, job.localId, requestId);
	}
	return await syncPayment(
		ctx,
		connection,
		tokens,
		job.localId as Id<"payments">,
		requestId
	);
}

/**
 * Classify a failure per PRD §6.4. "pause" stops the org's queue (dead grant);
 * `runAfter` is the backoff gate when the job was requeued.
 */
async function handleJobFailure(
	ctx: ActionCtx,
	orgId: Id<"organizations">,
	job: SyncJob,
	error: unknown,
	storedAccessToken: string | null
): Promise<{ disposition: "continue" | "pause"; runAfter?: number }> {
	// Dead or rejected grant: park the job untouched and stop the batch.
	if (
		error instanceof QboInvalidGrantError ||
		(error instanceof QboRequestError && error.isAuthError)
	) {
		// Guarded on the token this request actually used: if a concurrent
		// refresh already rotated it, the 401 is stale — release and retry with
		// the fresh token instead of pausing the org on a false alarm.
		const marked = await ctx.runMutation(internal.quickbooks.markNeedsReauth, {
			orgId,
			ifAccessTokenMatches: storedAccessToken ?? undefined,
		});
		await ctx.runMutation(internal.quickbooks.releaseJob, { jobId: job._id });
		return { disposition: marked ? "pause" : "continue" };
	}

	const nextAttempt = job.attempts + 1;

	if (error instanceof QboRequestError && error.isRateLimited) {
		const backoff = 2 ** nextAttempt * 30_000 + Math.floor(Math.random() * 5_000);
		const terminal = nextAttempt >= MAX_JOB_ATTEMPTS;
		const runAfter = Date.now() + backoff;
		await ctx.runMutation(internal.quickbooks.markJobFailed, {
			jobId: job._id,
			terminal,
			runAfter,
			lastError: terminal
				? "QuickBooks kept rate limiting this sync, so it stopped retrying. Retry it once QuickBooks settles down."
				: "QuickBooks rate limit reached; the sync will retry shortly.",
			lastErrorCode: "429",
		});
		return { disposition: "continue", runAfter: terminal ? undefined : runAfter };
	}

	// A reset mid-flight: the job is already being purged, so never retry it.
	const staleConnection =
		error instanceof ConvexError && error.data === "stale_connection";
	// User-actionable QBO rejections never get better on retry.
	const isValidationFault =
		staleConnection ||
		error instanceof TerminalSyncError ||
		(error instanceof QboRequestError &&
			error.faults.some((fault) => fault.type === "ValidationFault"));

	if (isValidationFault) {
		await ctx.runMutation(internal.quickbooks.markJobFailed, {
			jobId: job._id,
			terminal: true,
			rejected: true,
			lastError: staleConnection
				? "QuickBooks was reconnected while this record was syncing."
				: error instanceof Error
					? error.message
					: "QuickBooks rejected the record.",
			lastErrorCode:
				error instanceof TerminalSyncError
					? error.code
					: error instanceof QboRequestError
						? error.faults[0]?.code
						: undefined,
		});
		return { disposition: "continue" };
	}

	const terminal = nextAttempt >= MAX_JOB_ATTEMPTS;
	const runAfter = Date.now() + 2 ** nextAttempt * 30_000;
	await ctx.runMutation(internal.quickbooks.markJobFailed, {
		jobId: job._id,
		terminal,
		runAfter,
		lastError:
			error instanceof Error
				? error.message
				: "The QuickBooks sync failed for an unknown reason.",
		lastErrorCode:
			error instanceof QboRequestError ? error.faults[0]?.code : undefined,
	});
	return { disposition: "continue", runAfter: terminal ? undefined : runAfter };
}

/**
 * Drain one org's sync queue. Sequential by design: QBO's per-realm
 * concurrency is low, and sequential execution is what guarantees the
 * client-before-invoice-before-payment ordering.
 */
export const processOrgJobs = internalAction({
	args: { orgId: v.id("organizations") },
	handler: async (
		ctx,
		args
	): Promise<{ processed: number; held: number; failed: number }> => {
		const connection: Connection | null = await ctx.runQuery(
			internal.quickbooks.getConnection,
			{ orgId: args.orgId }
		);
		if (!connection || connection.status !== "connected") {
			return { processed: 0, held: 0, failed: 0 };
		}

		const jobs: SyncJob[] = await ctx.runMutation(
			internal.quickbooks.claimDueJobs,
			{ orgId: args.orgId, limit: JOB_BATCH_SIZE }
		);
		if (jobs.length === 0) {
			return { processed: 0, held: 0, failed: 0 };
		}

		let processed = 0;
		let held = 0;
		let failed = 0;
		// Backoff gates set this pass; the earliest gets a wakeup (cron is the backstop).
		const wakeups: number[] = [];

		for (let index = 0; index < jobs.length; index++) {
			const job = jobs[index];

			// Per-job fence: re-reads the connection doc, so a disconnect, dead
			// grant, or reset-and-reconnect (new realm) that lands mid-batch stops
			// the queue before the next QBO write.
			const fresh = await ensureFreshAccessToken(ctx, args.orgId);
			const tokens =
				fresh && fresh.connectionId === connection._id ? fresh : null;
			if (!tokens) {
				// needs_reauth parks the remainder for the reconnect drain; a
				// disconnect cancels it — these jobs were claimed before the
				// disconnect mutation's pending-job sweep could ignore them.
				const current: Connection | null = await ctx.runQuery(
					internal.quickbooks.getConnection,
					{ orgId: args.orgId }
				);
				const disconnected = !current || current.status === "disconnected";
				for (let rest = index; rest < jobs.length; rest++) {
					if (disconnected) {
						await ctx.runMutation(internal.quickbooks.markJobIgnored, {
							jobId: jobs[rest]._id,
							lastError: "Cancelled because QuickBooks was disconnected",
						});
					} else {
						await ctx.runMutation(internal.quickbooks.releaseJob, {
							jobId: jobs[rest]._id,
						});
					}
					held++;
				}
				return { processed, held, failed };
			}

			try {
				const outcome = await syncOne(ctx, connection, tokens, job);
				if (outcome.kind === "hold") {
					const runAfter = Date.now() + outcome.delayMs;
					await ctx.runMutation(internal.quickbooks.releaseJob, {
						jobId: job._id,
						runAfter,
					});
					wakeups.push(runAfter);
					held++;
				} else if (outcome.kind === "ignored") {
					await ctx.runMutation(internal.quickbooks.markJobIgnored, {
						jobId: job._id,
						lastError: outcome.reason,
					});
					processed++;
				} else {
					await ctx.runMutation(internal.quickbooks.markJobSucceeded, {
						jobId: job._id,
					});
					processed++;
				}
			} catch (error) {
				failed++;
				const { disposition, runAfter } = await handleJobFailure(
					ctx,
					args.orgId,
					job,
					error,
					tokens.storedAccessToken
				);
				if (runAfter !== undefined) wakeups.push(runAfter);
				if (disposition === "pause") {
					for (let rest = index + 1; rest < jobs.length; rest++) {
						await ctx.runMutation(internal.quickbooks.releaseJob, {
							jobId: jobs[rest]._id,
						});
						held++;
					}
					return { processed, held, failed };
				}
			}
		}

		// Any progress warrants one more pass: a full batch may have left due
		// work behind, and a job claim-skipped while its entity was in flight
		// becomes claimable the moment this batch finished. The follow-up that
		// claims nothing ends the chain.
		if (processed > 0) {
			await ctx.scheduler.runAfter(
				0,
				internal.quickbooksActions.processOrgJobs,
				{ orgId: args.orgId }
			);
		}
		if (wakeups.length > 0) {
			await ctx.scheduler.runAt(
				Math.min(...wakeups),
				internal.quickbooksActions.processOrgJobs,
				{ orgId: args.orgId }
			);
		}

		return { processed, held, failed };
	},
});

/** Watchdog: unstick abandoned claims and re-kick orgs whose kick was lost. */
export const sweepSyncJobs = internalAction({
	args: {},
	handler: async (ctx): Promise<{ reclaimed: number; kicked: number }> => {
		const { reclaimed } = await ctx.runMutation(
			internal.quickbooks.reclaimStuckJobs,
			{ staleBeforeMs: Date.now() - 10 * 60 * 1000 }
		);

		let kicked = 0;
		let after: number | undefined = undefined;
		do {
			const page: {
				orgIds: Id<"organizations">[];
				nextAfter: number | null;
			} = await ctx.runQuery(internal.quickbooks.listOrgsWithDueJobs, { after });
			for (const orgId of page.orgIds) {
				await ctx.scheduler.runAfter(
					0,
					internal.quickbooksActions.processOrgJobs,
					{ orgId }
				);
			}
			kicked += page.orgIds.length;
			after = page.nextAfter ?? undefined;
		} while (after !== undefined);

		return { reclaimed, kicked };
	},
});

/**
 * Best-effort revoke of a snapshotted refresh token, scheduled from
 * disconnect, reset, and the org-delete cascade. Never reads the live row: a
 * reconnect that lands first must keep its fresh grant.
 */
export const revokeConnection = internalAction({
	args: { refreshToken: v.string() },
	handler: async (_ctx, args): Promise<null> => {
		if (!args.refreshToken) return null;
		try {
			const revoked = await revokeToken(await decryptToken(args.refreshToken));
			if (!revoked) {
				console.warn("QuickBooks token revoke returned a non-OK status");
			}
		} catch (error) {
			console.warn("QuickBooks token revoke failed", error);
		}
		return null;
	},
});
