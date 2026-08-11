/**
 * Build a public portal quote URL. Convex-side mirror of
 * apps/web/src/lib/portal/url.ts's `portalUrl` — Convex functions can't
 * import the web app's `@/env`, so this reads `PORTAL_JWT_ISSUER` directly
 * from process.env (the same origin shared with the JWT `iss` claim / JWKS
 * endpoint, see auth.config.ts).
 */
export function buildPortalQuoteUrl(options: {
	portalAccessId: string;
	quoteId: string;
}): string {
	const issuer = process.env.PORTAL_JWT_ISSUER;
	if (!issuer) {
		throw new Error("PORTAL_JWT_ISSUER is not set");
	}
	const origin = issuer.replace(/\/+$/, "");
	return `${origin}/portal/c/${options.portalAccessId}/quotes/${options.quoteId}`;
}
