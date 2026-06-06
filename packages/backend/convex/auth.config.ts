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
			// One customJwt provider per portal audience: the httpOnly cookie JWT
			// and the short-lived browser access token share issuer/JWKS but use
			// distinct application IDs.
			type: "customJwt",
			issuer: process.env.PORTAL_JWT_ISSUER,
			jwks: `${process.env.PORTAL_JWT_ISSUER}/.well-known/portal-jwks.json`,
			algorithm: "RS256",
			applicationID: "convex-portal",
		},
		{
			type: "customJwt",
			issuer: process.env.PORTAL_JWT_ISSUER,
			jwks: `${process.env.PORTAL_JWT_ISSUER}/.well-known/portal-jwks.json`,
			algorithm: "RS256",
			applicationID: "convex-portal-access",
		},
	],
};

export default authConfig;
