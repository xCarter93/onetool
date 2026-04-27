// [Review fix IN-01] Fail loudly at module load if PORTAL_JWT_ISSUER is unset
// on the Convex deployment. Previously an unset value silently registered
// `domain: undefined`, which would later cause Convex to fail JWKS discovery
// at runtime with no clear startup signal. The Clerk issuer is similarly
// required, but throwing here lets us surface the misconfiguration during
// `convex deploy` rather than on the first authenticated portal request.
if (!process.env.PORTAL_JWT_ISSUER) {
	throw new Error(
		"PORTAL_JWT_ISSUER is unset on this Convex deployment — the portal " +
			"auth provider cannot be registered. Set it in the Convex dashboard."
	);
}

const authConfig = {
	providers: [
		{
			domain: process.env.CLERK_ISSUER_DOMAIN,
			applicationID: "convex",
		},
		{
			// [Review fix CR-05] Use the `customJwt` provider shape so Convex
			// surfaces our custom RS256 claims (orgId, clientContactId,
			// clientPortalId, jti, sessionJti, aud) on UserIdentity. The default
			// (OIDC-shaped) provider entry only exposes the standard OIDC fields
			// and would cause helpers.ts's claim reads to silently return
			// undefined.
			//
			// [Review fix #9] Explicit jwks URL — Convex cannot infer non-default
			// discovery paths from `issuer` alone. Our portal serves at
			// /.well-known/portal-jwks.json (NOT the OIDC default
			// /.well-known/jwks.json) to avoid colliding with workspace OIDC.
			//
			// [Review fix Greptile-P1] Convex's customJwt provider enforces
			// `aud === applicationID` at the provider layer BEFORE our code
			// runs. The cookie JWT and the short-lived realtime access token
			// use DIFFERENT audiences ("convex-portal" vs
			// "convex-portal-access"), so we must register one provider entry
			// per audience. Both share the same issuer + JWKS + algorithm.
			// Fine-grained discrimination still happens in
			// `getPortalSessionOrThrow`.
			type: "customJwt",
			issuer: process.env.PORTAL_JWT_ISSUER,
			jwks: `${process.env.PORTAL_JWT_ISSUER}/.well-known/portal-jwks.json`,
			algorithm: "RS256",
			applicationID: "convex-portal",
		},
		{
			// Short-lived realtime access token minted by /api/portal/token.
			// Same key material as the cookie provider above; only the
			// audience differs.
			type: "customJwt",
			issuer: process.env.PORTAL_JWT_ISSUER,
			jwks: `${process.env.PORTAL_JWT_ISSUER}/.well-known/portal-jwks.json`,
			algorithm: "RS256",
			applicationID: "convex-portal-access",
		},
	],
};

export default authConfig;
