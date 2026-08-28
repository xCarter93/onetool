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

/**
 * Same link, but null instead of a throw when the portal origin isn't
 * configured — a deployment without it must still be able to send email.
 */
export function optionalPortalQuoteUrl(
	portalAccessId: string | undefined,
	quoteId: string
): string | null {
	if (!portalAccessId || !process.env.PORTAL_JWT_ISSUER) return null;
	return buildPortalQuoteUrl({ portalAccessId, quoteId });
}
