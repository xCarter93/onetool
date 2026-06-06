// One-time RSA keypair generator for the portal session JWT (PORTAL-03, PORTAL-05).
// Outputs PORTAL_JWT_PRIVATE_KEY (PKCS8 PEM, JSON-stringified) and
// PORTAL_JWT_JWKS (JSON-stringified key set). Copy both into apps/web .env.local.
// PORTAL_JWT_ISSUER must be set separately (the public origin that serves /.well-known/portal-jwks.json).
//
// Run: pnpm tsx scripts/generate-portal-jwt-keys.ts
import { generateKeyPair, exportPKCS8, exportJWK } from "jose";
import { randomUUID } from "crypto";

// Wrapped in an async IIFE because the repo root package.json is CJS;
// tsx transpiles top-level await to CJS and fails. The IIFE preserves
// identical observable behavior (prints three env-var lines to stdout).
async function main() {
	const { publicKey, privateKey } = await generateKeyPair("RS256", {
		extractable: true,
	});
	const pkcs8 = await exportPKCS8(privateKey);
	const jwk = await exportJWK(publicKey);
	jwk.kid = randomUUID();
	jwk.alg = "RS256";
	jwk.use = "sig";

	console.log("PORTAL_JWT_PRIVATE_KEY=" + JSON.stringify(pkcs8));
	console.log("PORTAL_JWT_JWKS=" + JSON.stringify({ keys: [jwk] }));
	console.log(
		"PORTAL_JWT_ISSUER=https://app.onetool.biz  # update to deployment origin",
	);
}

void main();
