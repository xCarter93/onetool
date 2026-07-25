// Screen context for the assistant — the mobile analogue of web's
// use-screen-context. HARD RULE (shared with web): paths and ids only, never
// data values; the server injects this verbatim into the system prompt.
export function buildScreenContext(
	path: string | null | undefined,
	extras?: Record<string, string | undefined>
): string | undefined {
	if (!path) return undefined;
	const present = Object.fromEntries(
		Object.entries(extras ?? {}).filter(([, v]) => v !== undefined && v !== "")
	);
	return JSON.stringify({ platform: "mobile", path, ...present });
}
