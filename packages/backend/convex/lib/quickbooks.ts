/**
 * QuickBooks Online REST + OAuth helpers.
 * Pure fetch, no ctx, no SDK — called only from actions (PRD §6.1).
 */

const QBO_MINOR_VERSION = "75"; // minimum since Aug 2025 deprecation; pin explicitly
const OAUTH_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const OAUTH_REVOKE_URL =
	"https://developer.api.intuit.com/v2/oauth2/tokens/revoke";

export type QboEnvironment = "sandbox" | "production";

export function qboApiBase(environment: QboEnvironment): string {
	return environment === "sandbox"
		? "https://sandbox-quickbooks.api.intuit.com"
		: "https://quickbooks.api.intuit.com";
}

/** Deployment environment. Throws rather than defaulting — a silent sandbox fallback in production is worse. */
export function qboEnvironment(): QboEnvironment {
	const raw = process.env.QUICKBOOKS_ENVIRONMENT;
	if (raw === "sandbox" || raw === "production") {
		return raw;
	}
	throw new Error(
		"QUICKBOOKS_ENVIRONMENT must be set to 'sandbox' or 'production' in the Convex deployment"
	);
}

function qboBasicAuthHeader(): string {
	const clientId = process.env.QUICKBOOKS_CLIENT_ID;
	const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET;
	if (!clientId || !clientSecret) {
		throw new Error(
			"QUICKBOOKS_CLIENT_ID / QUICKBOOKS_CLIENT_SECRET are not configured in the Convex deployment"
		);
	}
	const encoded = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
	return `Basic ${encoded}`;
}

export interface QboFaultError {
	code: string; // e.g. "6240"
	message: string;
	detail?: string;
	type?: string; // ValidationFault | AuthenticationFault | ...
}

export class QboRequestError extends Error {
	constructor(
		public readonly status: number,
		public readonly faults: QboFaultError[],
		public readonly intuitTid: string | null = null
	) {
		const base = faults[0]?.message ?? `QBO request failed (${status})`;
		super(intuitTid ? `${base} [intuit_tid=${intuitTid}]` : base);
		this.name = "QboRequestError";
	}
	get isAuthError() {
		return this.status === 401;
	}
	get isRateLimited() {
		return this.status === 429;
	}
	get isDuplicateName() {
		return this.faults.some((f) => f.code === "6240");
	}
	get isStaleSyncToken() {
		// "Stale object" validation class — re-GET entity and retry
		return this.faults.some((f) => f.code === "5010");
	}
}

/** Every Intuit request gets a deadline so a hung fetch can't burn the action. */
const QBO_FETCH_TIMEOUT_MS = 30_000;

export async function qboFetch<T>(args: {
	accessToken: string;
	realmId: string;
	environment: QboEnvironment;
	path: string; // e.g. "/invoice" or "/query?query=..."
	method?: "GET" | "POST";
	body?: unknown;
}): Promise<T> {
	const sep = args.path.includes("?") ? "&" : "?";
	const url = `${qboApiBase(args.environment)}/v3/company/${args.realmId}${args.path}${sep}minorversion=${QBO_MINOR_VERSION}`;
	const response = await fetch(url, {
		method: args.method ?? "GET",
		headers: {
			Authorization: `Bearer ${args.accessToken}`,
			Accept: "application/json",
			"Content-Type": "application/json",
		},
		body: args.body ? JSON.stringify(args.body) : undefined,
		signal: AbortSignal.timeout(QBO_FETCH_TIMEOUT_MS),
	});

	// intuit_tid is the only handle Intuit support can trace — log it on every call.
	// The query string is stripped: /query?query=... embeds customer and item
	// names, and Intuit forbids logging QBO data.
	const intuitTid = response.headers.get("intuit_tid");
	const loggedPath = args.path.split("?")[0];
	console.log(
		`[qbo] realm=${args.realmId} ${args.method ?? "GET"} ${loggedPath} status=${response.status} intuit_tid=${intuitTid ?? "none"}`
	);

	if (!response.ok) {
		const payload = (await response.json().catch(() => null)) as {
			Fault?: {
				type?: string;
				Error?: Array<{ code: string; Message: string; Detail?: string }>;
			};
		} | null;
		const faults =
			payload?.Fault?.Error?.map((e) => ({
				code: e.code,
				message: e.Message,
				detail: e.Detail,
				type: payload?.Fault?.type,
			})) ?? [];
		throw new QboRequestError(response.status, faults, intuitTid);
	}
	return (await response.json()) as T;
}

/** Token set with absolute expiry timestamps (ms) already resolved. */
export interface QboTokenSet {
	accessToken: string;
	accessTokenExpiresAt: number;
	refreshToken: string;
	refreshTokenExpiresAt: number;
}

interface IntuitTokenResponse {
	access_token: string;
	refresh_token: string;
	expires_in: number;
	x_refresh_token_expires_in: number;
}

/** Thrown when Intuit rejects the grant (expired/revoked refresh token) — caller flips to needs_reauth. */
export class QboInvalidGrantError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "QboInvalidGrantError";
	}
}

async function postTokenRequest(body: URLSearchParams): Promise<QboTokenSet> {
	const response = await fetch(OAUTH_TOKEN_URL, {
		method: "POST",
		headers: {
			Authorization: qboBasicAuthHeader(),
			Accept: "application/json",
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: body.toString(),
		signal: AbortSignal.timeout(QBO_FETCH_TIMEOUT_MS),
	});

	const intuitTid = response.headers.get("intuit_tid");
	console.log(
		`[qbo] oauth token grant=${body.get("grant_type")} status=${response.status} intuit_tid=${intuitTid ?? "none"}`
	);

	if (!response.ok) {
		const text = await response.text().catch(() => "");
		const message = `QBO token request failed (${response.status}) [intuit_tid=${intuitTid ?? "none"}] ${text}`;
		if (text.includes("invalid_grant")) {
			throw new QboInvalidGrantError(message);
		}
		throw new Error(message);
	}

	const payload = (await response.json()) as IntuitTokenResponse;
	const now = Date.now();
	return {
		accessToken: payload.access_token,
		accessTokenExpiresAt: now + payload.expires_in * 1000,
		refreshToken: payload.refresh_token,
		refreshTokenExpiresAt: now + payload.x_refresh_token_expires_in * 1000,
	};
}

export async function exchangeAuthCode(
	code: string,
	redirectUri: string
): Promise<QboTokenSet> {
	return postTokenRequest(
		new URLSearchParams({
			grant_type: "authorization_code",
			code,
			redirect_uri: redirectUri,
		})
	);
}

export async function refreshTokens(refreshToken: string): Promise<QboTokenSet> {
	return postTokenRequest(
		new URLSearchParams({
			grant_type: "refresh_token",
			refresh_token: refreshToken,
		})
	);
}

/** Best-effort revoke on disconnect. Returns false when Intuit rejects it. */
export async function revokeToken(refreshToken: string): Promise<boolean> {
	const response = await fetch(OAUTH_REVOKE_URL, {
		method: "POST",
		headers: {
			Authorization: qboBasicAuthHeader(),
			Accept: "application/json",
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ token: refreshToken }),
		signal: AbortSignal.timeout(QBO_FETCH_TIMEOUT_MS),
	});
	const intuitTid = response.headers.get("intuit_tid");
	console.log(
		`[qbo] oauth revoke status=${response.status} intuit_tid=${intuitTid ?? "none"}`
	);
	return response.ok;
}
