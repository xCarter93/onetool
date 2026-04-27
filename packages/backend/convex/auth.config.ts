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
