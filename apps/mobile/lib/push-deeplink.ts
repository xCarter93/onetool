// Pitfall 4: the backend emits plural workspace actionUrls ("/quotes/<id>" from
// createMention, "/invoices/<id>" from createMention + the invoice-paid
// celebration) but those mobile routes are singular ("/quote/[id]",
// "/invoice/[id]"). Rewrite only that leading segment; /clients and /projects
// are already plural and pass through unchanged.
//
// automationActionUrl (backend lib/automationExec/actions.ts) also emits
// "/tasks/<id>", but task detail on mobile is a query param on the shared
// form modal, not a [taskId] route — rewrite to that route.

const REWRITES: readonly (readonly [string, string])[] = [
	["/quotes/", "/quote/"],
	["/invoices/", "/invoice/"],
	["/tasks/", "/tasks/form?taskId="],
];

export function normalizeActionUrl(url: string): string {
	for (const [from, to] of REWRITES) {
		if (url.startsWith(from)) return to + url.slice(from.length);
	}
	return url;
}
