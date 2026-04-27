import "server-only";
import {
	SignJWT,
	importPKCS8,
	jwtVerify,
	createLocalJWKSet,
	type JWTPayload,
} from "jose";
import { env } from "@/env";

// Use Web Crypto's randomUUID — available globally in both Node 19+ and the
// Edge runtime (where Next.js middleware executes). Importing from Node's
// "crypto" module triggers "Node.js module loaded in Edge Runtime" build errors.
function randomUUID(): string {
	return crypto.randomUUID();
}

const ALG = "RS256" as const;
const AUDIENCE = "convex-portal" as const;

export type PortalJwtClaims = {
	clientContactId: string;
	orgId: string;
	clientPortalId: string;
	jti?: string;
};

// The generator script outputs JSON.stringify(pkcs8) so newlines stay encoded
// when pasted into .env.local. But @next/env expands `\n` → actual newline
// inside double-quoted values, breaking the JSON encoding before we read it.
// Be defensive: try JSON.parse first; on failure, treat as raw PEM (already
// expanded by dotenv).
function decodeMaybeJson(raw: string): string {
	const trimmed = raw.trim();
	if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
		try {
			return JSON.parse(trimmed) as string;
		} catch (err) {
			// [Review fix WR-07] Don't silently fall through to raw PEM —
			// importPKCS8 would throw a cryptic "Invalid PEM" with no hint
			// that JSON parsing was the actual problem. Surface the JSON
			// error so the operator can fix the env var encoding instead of
			// chasing a misleading downstream error.
			throw new Error(
				"PORTAL_JWT_PRIVATE_KEY appears JSON-encoded (starts/ends with \") " +
					"but failed to parse: " +
					(err as Error).message
			);
		}
	}
	return raw;
}

let cachedPrivateKey: CryptoKey | null = null;
async function getPrivateKey(): Promise<CryptoKey> {
	if (cachedPrivateKey) return cachedPrivateKey;
	const pem = decodeMaybeJson(env.PORTAL_JWT_PRIVATE_KEY);
	cachedPrivateKey = (await importPKCS8(pem, ALG)) as CryptoKey;
	return cachedPrivateKey;
}

let cachedJwks: ReturnType<typeof createLocalJWKSet> | null = null;
function getLocalJwks() {
	if (cachedJwks) return cachedJwks;
	const jwksRaw = env.PORTAL_JWT_JWKS.trim();
	const parsed = JSON.parse(jwksRaw) as {
		keys: Array<Record<string, unknown>>;
	};
	cachedJwks = createLocalJWKSet(
		parsed as Parameters<typeof createLocalJWKSet>[0],
	);
	return cachedJwks;
}

export function getJwksJson(): string {
	// Return raw JSON string for the public JWKS endpoint
	return env.PORTAL_JWT_JWKS;
}

export async function signSessionJwt(
	claims: PortalJwtClaims,
	ttlSeconds: number,
): Promise<{ token: string; jti: string; expiresAt: number }> {
	const jti = claims.jti ?? randomUUID();
	const now = Math.floor(Date.now() / 1000);
	const exp = now + ttlSeconds;

	const token = await new SignJWT({
		orgId: claims.orgId,
		clientContactId: claims.clientContactId,
		clientPortalId: claims.clientPortalId,
	})
		.setProtectedHeader({ alg: ALG, typ: "JWT" })
		.setSubject(claims.clientContactId)
		.setJti(jti)
		.setIssuer(env.PORTAL_JWT_ISSUER)
		.setAudience(AUDIENCE)
		.setIssuedAt(now)
		.setExpirationTime(exp)
		.sign(await getPrivateKey());

	return { token, jti, expiresAt: exp * 1000 };
}

// [Review fix #4] Short-lived Convex access token. The cookie JWT (long-lived, 24h, aud="convex-portal") is httpOnly
// and must NOT be returned to JavaScript. ConvexPortalProvider calls /api/portal/token, which mints THIS short-lived
// token (5min TTL, distinct aud "convex-portal-access") for the realtime WS. XSS exfiltration of this token grants only
// 5 minutes of access; the cookie remains httpOnly so persistence cannot be hijacked.
const CONVEX_ACCESS_AUDIENCE = "convex-portal-access" as const;
const CONVEX_ACCESS_TTL_SECONDS = 300; // 5 minutes — Review fix #4

export async function signConvexAccessToken(claims: {
	clientContactId: string;
	orgId: string;
	clientPortalId: string;
	sessionJti: string; // pin to the originating cookie's jti — getPortalSessionOrThrow re-validates this against portalSessions
}): Promise<{ token: string; expiresAt: number }> {
	const now = Math.floor(Date.now() / 1000);
	const exp = now + CONVEX_ACCESS_TTL_SECONDS;
	const token = await new SignJWT({
		orgId: claims.orgId,
		clientContactId: claims.clientContactId,
		clientPortalId: claims.clientPortalId,
		sessionJti: claims.sessionJti, // [Review fix #2] backend uses this to look up the portalSessions row
	})
		.setProtectedHeader({ alg: ALG, typ: "JWT" })
		.setSubject(claims.clientContactId)
		.setIssuer(env.PORTAL_JWT_ISSUER)
		.setAudience(CONVEX_ACCESS_AUDIENCE)
		.setIssuedAt(now)
		.setExpirationTime(exp)
		.sign(await getPrivateKey());
	return { token, expiresAt: exp * 1000 };
}

export async function verifySessionJwt(token: string): Promise<{
	payload: JWTPayload & PortalJwtClaims;
	remainingSeconds: number;
}> {
	const { payload } = await jwtVerify(token, getLocalJwks(), {
		issuer: env.PORTAL_JWT_ISSUER,
		audience: AUDIENCE,
	});
	const now = Math.floor(Date.now() / 1000);
	const remainingSeconds = (payload.exp ?? 0) - now;
	return {
		payload: payload as JWTPayload & PortalJwtClaims,
		remainingSeconds,
	};
}
