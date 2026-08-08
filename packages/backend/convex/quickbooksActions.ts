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
	refreshTokens,
	revokeToken,
} from "./lib/quickbooks";

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
			await ctx.runMutation(internal.quickbooks.markNeedsReauth, {
				orgId: connection.orgId,
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

/** Best-effort revoke, scheduled from the disconnect mutation. */
export const revokeConnection = internalAction({
	args: { refreshToken: v.string() },
	handler: async (_ctx, args): Promise<null> => {
		try {
			const revoked = await revokeToken(args.refreshToken);
			if (!revoked) {
				console.warn("QuickBooks token revoke returned a non-OK status");
			}
		} catch (error) {
			console.warn("QuickBooks token revoke failed", error);
		}
		return null;
	},
});
