/**
 * Build a public portal invoice URL. Convex-side mirror of
 * apps/web/src/lib/portal/url.ts's `portalUrl` — Convex functions can't
 * import the web app's `@/env`, so this reads `PORTAL_JWT_ISSUER` directly
 * from process.env (the same origin shared with the JWT `iss` claim / JWKS
 * endpoint, see auth.config.ts).
 */
export function buildPortalInvoiceUrl(options: {
	portalAccessId: string;
	invoiceId: string;
}): string {
	const origin = process.env.PORTAL_JWT_ISSUER;
	return `${origin}/portal/c/${options.portalAccessId}/invoices/${options.invoiceId}`;
}
