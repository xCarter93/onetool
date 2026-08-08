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
import {
	buildQboCustomer,
	buildQboInvoice,
	buildQboPayment,
	deriveInvoiceAmounts,
	escapeQboQueryValue,
	type QboCustomerPayload,
} from "./lib/quickbooksMappers";
import { formatCurrency } from "./lib/money";

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
			accessToken: tokens.accessToken,
			accessTokenExpiresAt: tokens.accessTokenExpiresAt,
			refreshToken: tokens.refreshToken,
			refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
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
			accessToken: connection.accessToken,
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
		realmId: connection.realmId,
		environment: connection.environment,
	};
}

/** Refresh + persist rotated tokens. Null when the grant is dead (needs_reauth). */
async function refreshConnection(
	ctx: ActionCtx,
	connection: Doc<"quickbooksConnections">
): Promise<{ accessToken: string } | null> {
	try {
		const tokens = await refreshTokens(connection.refreshToken);
		await ctx.runMutation(internal.quickbooks.updateTokens, {
			orgId: connection.orgId,
			accessToken: tokens.accessToken,
			accessTokenExpiresAt: tokens.accessTokenExpiresAt,
			refreshToken: tokens.refreshToken,
			refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
		});
		return { accessToken: tokens.accessToken };
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
type QboItem = { Id: string; Name: string; SyncToken?: string };
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

		// QBO caps query pages at 1000 rows; page until a short page.
		const PAGE_SIZE = 1000;
		const incomeAccounts: QboAccount[] = [];
		for (let start = 1; ; start += PAGE_SIZE) {
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
	const existing = await qboQuery<QboItem>(
		tokens,
		`SELECT * FROM Item WHERE Name = '${escapeQboQueryValue(ONETOOL_SERVICE_ITEM_NAME)}'`
	);
	const found = existing.QueryResponse?.Item?.[0];
	if (found) return found.Id;

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
			const retry = await qboQuery<QboItem>(
				tokens,
				`SELECT * FROM Item WHERE Name = '${escapeQboQueryValue(ONETOOL_SERVICE_ITEM_NAME)}'`
			);
			const adopted = retry.QueryResponse?.Item?.[0];
			if (adopted) return adopted.Id;
		}
		throw error;
	}
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
type SyncOutcome = { kind: "done" } | { kind: "hold"; delayMs: number };

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
	{ Id: string; SyncToken: string; TxnTaxDetail?: { TotalTax?: number } }
>;

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
	orgId: Id<"organizations">,
	entityType: "client" | "invoice",
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
			orgId,
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
			connection.orgId,
			"client",
			clientId,
			"Customer",
			customer as unknown as Record<string, unknown>,
			link.qboId,
			link.qboSyncToken
		);
		await ctx.runMutation(internal.quickbooks.upsertEntityLink, {
			orgId: connection.orgId,
			entityType: "client",
			localId: clientId,
			qboId: updated.Id,
			qboSyncToken: updated.SyncToken,
		});
		return updated.Id;
	}

	let created: { Id: string; SyncToken: string };
	try {
		const response = await qboPost<QboEntityResponse<"Customer">>(
			tokens,
			"/customer",
			customer
		);
		created = response.Customer;
	} catch (error) {
		if (!(error instanceof QboRequestError) || !error.isDuplicateName) {
			throw error;
		}
		created = await resolveDuplicateCustomer(
			tokens,
			connection,
			customer,
			error
		);
	}

	await ctx.runMutation(internal.quickbooks.upsertEntityLink, {
		orgId: connection.orgId,
		entityType: "client",
		localId: clientId,
		qboId: created.Id,
		qboSyncToken: created.SyncToken,
	});
	return created.Id;
}

/**
 * 6240 on create: adopt an existing Customer with the same DisplayName, else
 * disambiguate when the org allows it, else surface it in the error center.
 */
async function resolveDuplicateCustomer(
	tokens: QboRef,
	connection: Connection,
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
	if (existing) {
		return { Id: existing.Id, SyncToken: existing.SyncToken };
	}

	if (!connection.autoDisambiguateNames) {
		throw new TerminalSyncError(
			`QuickBooks already has a different record named "${displayName}". Rename the client in OneTool or the record in QuickBooks, then retry.`,
			original.faults[0]?.code ?? "6240"
		);
	}

	const retryResponse = await qboPost<QboEntityResponse<"Customer">>(
		tokens,
		"/customer",
		{ ...payload, DisplayName: `${displayName} - 2` }
	);
	return retryResponse.Customer;
}

async function syncInvoice(
	ctx: ActionCtx,
	connection: Connection,
	tokens: QboRef,
	invoiceId: Id<"invoices">,
	requestId: string
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

	// Dependency: the Customer must exist first.
	const customerQboId = await syncClient(
		ctx,
		connection,
		tokens,
		payload.clientId
	);

	const body = buildQboInvoice({
		invoice: payload.invoice,
		lineItems: payload.lineItems,
		customerQboId,
		defaultServiceItemQboId: connection.defaultServiceItemQboId,
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
				connection.orgId,
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
	if (returnedTax !== undefined && Math.abs(returnedTax - sentTax) >= 0.01) {
		syncWarning = `QuickBooks adjusted the tax from ${formatCurrency(sentTax)} to ${formatCurrency(returnedTax)}.`;
	}

	await ctx.runMutation(internal.quickbooks.upsertEntityLink, {
		orgId: connection.orgId,
		entityType: "invoice",
		localId: invoiceId,
		qboId: result.Id,
		qboSyncToken: result.SyncToken,
		syncWarning,
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

	// Setup finished without an Undeposited Funds account. Re-resolve instead
	// of holding forever; if the company truly has none, fail actionably so it
	// reaches the error center rather than hanging silently.
	let depositAccountQboId = connection.depositAccountQboId;
	if (!depositAccountQboId) {
		const deposit = await findUndepositedFundsAccount(tokens);
		if (!deposit) {
			throw new TerminalSyncError(
				"Your QuickBooks company has no Undeposited Funds account, so payments cannot be recorded. Create one in QuickBooks, then retry."
			);
		}
		depositAccountQboId = deposit.Id;
		await ctx.runMutation(internal.quickbooks.saveDepositAccount, {
			orgId: connection.orgId,
			depositAccountQboId,
		});
	}

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
		entityType: "payment",
		localId: paymentId,
		qboId: created.Payment.Id,
		qboSyncToken: created.Payment.SyncToken,
	});
	return { kind: "done" };
}

async function syncOne(
	ctx: ActionCtx,
	connection: Connection,
	tokens: QboRef,
	job: SyncJob
): Promise<SyncOutcome> {
	// Stable within a claim (crash-retries reuse it, so QBO dedupes the create)
	// but new on each user-visible retry, which increments attempts.
	const requestId = `${job.localId}-${job.attempts}`;

	if (job.entityType === "client") {
		await syncClient(ctx, connection, tokens, job.localId as Id<"clients">);
		return { kind: "done" };
	}
	if (job.entityType === "invoice") {
		return await syncInvoice(
			ctx,
			connection,
			tokens,
			job.localId as Id<"invoices">,
			requestId
		);
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
 * Classify a failure per PRD §6.4. Returns "pause" when the whole org's queue
 * must stop (dead grant), "continue" otherwise.
 */
async function handleJobFailure(
	ctx: ActionCtx,
	orgId: Id<"organizations">,
	job: SyncJob,
	error: unknown
): Promise<"continue" | "pause"> {
	// Dead or rejected grant: park the job untouched and stop the batch.
	if (
		error instanceof QboInvalidGrantError ||
		(error instanceof QboRequestError && error.isAuthError)
	) {
		await ctx.runMutation(internal.quickbooks.markNeedsReauth, { orgId });
		await ctx.runMutation(internal.quickbooks.releaseJob, { jobId: job._id });
		return "pause";
	}

	const nextAttempt = job.attempts + 1;

	if (error instanceof QboRequestError && error.isRateLimited) {
		const backoff = 2 ** nextAttempt * 30_000 + Math.floor(Math.random() * 5_000);
		await ctx.runMutation(internal.quickbooks.markJobFailed, {
			jobId: job._id,
			terminal: nextAttempt >= MAX_JOB_ATTEMPTS,
			runAfter: Date.now() + backoff,
			lastError: "QuickBooks rate limit reached; the sync will retry shortly.",
			lastErrorCode: "429",
		});
		return "continue";
	}

	// User-actionable QBO rejections never get better on retry.
	const isValidationFault =
		error instanceof TerminalSyncError ||
		(error instanceof QboRequestError &&
			error.faults.some((fault) => fault.type === "ValidationFault"));

	if (isValidationFault) {
		await ctx.runMutation(internal.quickbooks.markJobFailed, {
			jobId: job._id,
			terminal: true,
			lastError:
				error instanceof Error ? error.message : "QuickBooks rejected the record.",
			lastErrorCode:
				error instanceof TerminalSyncError
					? error.code
					: error instanceof QboRequestError
						? error.faults[0]?.code
						: undefined,
		});
		return "continue";
	}

	const terminal = nextAttempt >= MAX_JOB_ATTEMPTS;
	await ctx.runMutation(internal.quickbooks.markJobFailed, {
		jobId: job._id,
		terminal,
		runAfter: Date.now() + 2 ** nextAttempt * 30_000,
		lastError:
			error instanceof Error
				? error.message
				: "The QuickBooks sync failed for an unknown reason.",
		lastErrorCode:
			error instanceof QboRequestError ? error.faults[0]?.code : undefined,
	});
	return "continue";
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

		for (let index = 0; index < jobs.length; index++) {
			const job = jobs[index];

			// Per-job fence: re-reads the connection doc, so a disconnect or dead
			// grant that lands mid-batch stops the queue before the next QBO write.
			const tokens = await ensureFreshAccessToken(ctx, args.orgId);
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
					await ctx.runMutation(internal.quickbooks.releaseJob, {
						jobId: job._id,
						runAfter: Date.now() + outcome.delayMs,
					});
					held++;
				} else {
					await ctx.runMutation(internal.quickbooks.markJobSucceeded, {
						jobId: job._id,
					});
					processed++;
				}
			} catch (error) {
				failed++;
				const disposition = await handleJobFailure(
					ctx,
					args.orgId,
					job,
					error
				);
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

		// A full batch means there may be more due work waiting.
		if (processed > 0 && jobs.length === JOB_BATCH_SIZE) {
			await ctx.scheduler.runAfter(
				0,
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

		const orgIds: Id<"organizations">[] = await ctx.runQuery(
			internal.quickbooks.listOrgsWithDueJobs,
			{}
		);
		for (const orgId of orgIds) {
			await ctx.scheduler.runAfter(
				0,
				internal.quickbooksActions.processOrgJobs,
				{ orgId }
			);
		}

		return { reclaimed, kicked: orgIds.length };
	},
});

/** Best-effort revoke, scheduled from the disconnect mutation. */
/**
 * Revoke a refresh token at Intuit. Preferred form is `orgId`: the token is
 * read from the connection doc and scrubbed afterwards, so the secret never
 * rides in scheduler args. The explicit `refreshToken` form exists only for
 * the org-delete cascade, where the doc is gone before this action runs.
 */
export const revokeConnection = internalAction({
	args: {
		orgId: v.optional(v.id("organizations")),
		refreshToken: v.optional(v.string()),
	},
	handler: async (ctx, args): Promise<null> => {
		let token = args.refreshToken ?? null;
		if (!token && args.orgId) {
			const connection: Doc<"quickbooksConnections"> | null =
				await ctx.runQuery(internal.quickbooks.getConnection, {
					orgId: args.orgId,
				});
			token = connection?.refreshToken || null;
		}
		if (!token) return null;

		try {
			const revoked = await revokeToken(token);
			if (!revoked) {
				console.warn("QuickBooks token revoke returned a non-OK status");
			}
		} catch (error) {
			console.warn("QuickBooks token revoke failed", error);
		}
		if (args.orgId) {
			await ctx.runMutation(internal.quickbooks.clearConnectionTokens, {
				orgId: args.orgId,
			});
		}
		return null;
	},
});
