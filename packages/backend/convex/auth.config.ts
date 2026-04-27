const authConfig = {
	providers: [
		{
			domain: process.env.CLERK_ISSUER_DOMAIN,
			applicationID: "convex",
		},
		{
			// [Review fix #9] Explicit jwks URL — Convex cannot infer non-default
			// discovery paths from `domain` alone. Our portal serves at
			// /.well-known/portal-jwks.json (NOT the OIDC default
			// /.well-known/jwks.json) to avoid colliding with workspace OIDC.
			//
			// [Review fix #4] applicationID "convex-portal" matches the long-lived
			// cookie JWT's `aud` claim AND the short-lived
			// `convex-portal-access` token (since both are signed by the same
			// issuer and use the same JWKS). The audience discrimination happens
			// in getPortalSessionOrThrow, not in Convex's provider-resolution
			// layer.
			domain: process.env.PORTAL_JWT_ISSUER,
			applicationID: "convex-portal",
			jwks: `${process.env.PORTAL_JWT_ISSUER}/.well-known/portal-jwks.json`,
		},
	],
};

export default authConfig;
