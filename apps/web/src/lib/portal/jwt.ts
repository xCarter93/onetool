import "server-only";
import {
	SignJWT,
	importPKCS8,
	jwtVerify,
	createLocalJWKSet,
	type JWTPayload,
} from "jose";
import { env } from "@/env";

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

// Accept either the JSON-encoded PEM produced by the generator script or a raw
// PEM value already expanded by dotenv.
function decodeMaybeJson(raw: string): string {
	const trimmed = raw.trim();
	if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
		try {
			return JSON.parse(trimmed) as string;
		} catch (err) {
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
let cachedKid: string | null = null;
function parseJwks() {
	const jwksRaw = env.PORTAL_JWT_JWKS.trim();
	const parsed = JSON.parse(jwksRaw) as {
		keys: Array<Record<string, unknown>>;
	};
	return parsed;
}
function getLocalJwks() {
	if (cachedJwks) return cachedJwks;
	const parsed = parseJwks();
	cachedJwks = createLocalJWKSet(
		parsed as Parameters<typeof createLocalJWKSet>[0],
	);
	return cachedJwks;
}
function getSigningKid(): string {
	if (cachedKid) return cachedKid;
	const parsed = parseJwks();
	const kid = parsed.keys[0]?.kid;
	if (typeof kid !== "string" || !kid) {
		throw new Error("PORTAL_JWT_JWKS first key is missing a 'kid' field");
	}
	cachedKid = kid;
	return cachedKid;
}

export function getJwksJson(): string {
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
		// Convex exposes custom payload claims to functions, so duplicate the
		// session id outside the standard JWT envelope.
		sessionJti: jti,
	})
		.setProtectedHeader({ alg: ALG, typ: "JWT", kid: getSigningKid() })
		.setSubject(claims.clientContactId)
		.setJti(jti)
		.setIssuer(env.PORTAL_JWT_ISSUER)
		.setAudience(AUDIENCE)
		.setIssuedAt(now)
		.setExpirationTime(exp)
		.sign(await getPrivateKey());

	return { token, jti, expiresAt: exp * 1000 };
}

const CONVEX_ACCESS_AUDIENCE = "convex-portal-access" as const;
const CONVEX_ACCESS_TTL_SECONDS = 300;

export async function signConvexAccessToken(claims: {
	clientContactId: string;
	orgId: string;
	clientPortalId: string;
	sessionJti: string;
}): Promise<{ token: string; expiresAt: number }> {
	const now = Math.floor(Date.now() / 1000);
	const exp = now + CONVEX_ACCESS_TTL_SECONDS;
	const token = await new SignJWT({
		orgId: claims.orgId,
		clientContactId: claims.clientContactId,
		clientPortalId: claims.clientPortalId,
		sessionJti: claims.sessionJti,
	})
		.setProtectedHeader({ alg: ALG, typ: "JWT", kid: getSigningKid() })
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
