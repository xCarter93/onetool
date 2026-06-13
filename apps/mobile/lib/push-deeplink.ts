// Pitfall 4: createMention emits actionUrl "/quotes/<id>" but the mobile route is
// "/quote/[id]" (singular). Rewrite only that leading segment; /clients and
// /projects are already plural and pass through unchanged.

const QUOTES_PREFIX = "/quotes/";
const QUOTE_PREFIX = "/quote/";

export function normalizeActionUrl(url: string): string {
	if (url.startsWith(QUOTES_PREFIX)) {
		return QUOTE_PREFIX + url.slice(QUOTES_PREFIX.length);
	}
	return url;
}
