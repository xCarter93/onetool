// Pitfall 4: the backend emits plural workspace actionUrls ("/quotes/<id>" from
// createMention, "/invoices/<id>" from createMention + the invoice-paid
// celebration) but those mobile routes are singular ("/quote/[id]",
// "/invoice/[id]"). Rewrite only that leading segment; /clients and /projects
// are already plural and pass through unchanged.

const REWRITES: readonly (readonly [string, string])[] = [
	["/quotes/", "/quote/"],
	["/invoices/", "/invoice/"],
];

export function normalizeActionUrl(url: string): string {
	for (const [from, to] of REWRITES) {
		if (url.startsWith(from)) return to + url.slice(from.length);
	}
	return url;
}
