/**
 * Pure mapper from the web workspace paths the assistant's `navigate` tool
 * returns (see packages/backend/convex/assistantTools.ts NAVIGATE_ALLOWED_PATHS)
 * to the equivalent mobile route. Unknown/unmapped paths return null — the
 * caller renders a neutral "open it on the web" line instead of navigating.
 */

const EXACT_ROUTES: Record<string, string> = {
	"/": "/(tabs)",
	"/home": "/(tabs)",
	"/projects": "/(tabs)/work",
	"/clients": "/(tabs)/work",
	"/quotes": "/(tabs)/work",
	"/invoices": "/(tabs)/work",
	"/routing": "/(tabs)/routes",
};

const ID_ROUTES: [RegExp, (id: string) => string][] = [
	// /clients/import is the CSV-import wizard, not a client id — no mobile analog.
	[/^\/clients\/(?!import$)([A-Za-z0-9_-]+)$/, (id) => `/(tabs)/clients/${id}`],
	[/^\/projects\/([A-Za-z0-9_-]+)$/, (id) => `/(tabs)/projects/${id}`],
	[/^\/quotes\/([A-Za-z0-9_-]+)$/, (id) => `/quote/${id}`],
	[/^\/invoices\/([A-Za-z0-9_-]+)$/, (id) => `/invoice/${id}`],
];

export function mapWebPathToMobileRoute(path: string): string | null {
	const exact = EXACT_ROUTES[path];
	if (exact) return exact;
	for (const [pattern, toRoute] of ID_ROUTES) {
		const match = pattern.exec(path);
		if (match) return toRoute(match[1]);
	}
	return null;
}
