/**
 * Canonical public origin, no trailing slash.
 *
 * NEXT_PUBLIC_APP_URL is set on Production only, so this falls back to the
 * canonical host: canonical and OG tags must be absolute and must point at the
 * real page from every build, and the apex 307s to www, so a canonical on the
 * apex names a URL that redirects away.
 *
 * robots.ts and sitemap.ts deliberately do NOT use this. Indexing directives
 * should come from explicit config — an unconfigured deploy should stay silent
 * rather than advertise production URLs from a preview host.
 */
// `||`, not `??`: a var present but blank is unconfigured, and an empty
// SITE_URL would emit relative canonical/OG URLs, which are invalid there.
export const SITE_URL = (
	process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://www.onetool.biz"
).replace(/\/+$/, "");
