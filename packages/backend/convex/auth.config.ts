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
			// [Review fix #4] applicationID "convex-portal" matches the long-lived
			// cookie JWT's `aud` claim AND the short-lived
			// `convex-portal-access` token (since both are signed by the same
			// issuer and use the same JWKS). The audience discrimination happens
			// in getPortalSessionOrThrow, not in Convex's provider-resolution
			// layer.
			type: "customJwt",
			issuer: process.env.PORTAL_JWT_ISSUER,
			jwks: `${process.env.PORTAL_JWT_ISSUER}/.well-known/portal-jwks.json`,
			algorithm: "RS256",
			applicationID: "convex-portal",
		},
	],
};

export default authConfig;
