import { env } from "@/env";

/**
 * Build a public portal URL for a given client portal id.
 *
 * Used by Phase 14/15 email integrations ("View in Portal" links) and by the
 * portal middleware when constructing redirect targets. The origin shares the
 * `PORTAL_JWT_ISSUER` value so the JWT `iss` claim, the JWKS endpoint, and the
 * portal URL all agree on the public origin.
 */
export function portalUrl(options: {
	clientPortalId: string;
	path?: string;
}): string {
	const origin = env.PORTAL_JWT_ISSUER; // shares the public origin with the JWKS issuer
	const path = options.path ?? "";
	return `${origin}/portal/c/${options.clientPortalId}${path}`;
}
