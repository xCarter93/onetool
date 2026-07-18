// [PUB-30] CSRF guard for state-changing admin routes. Fail CLOSED: block
// unless there is an affirmative same-origin signal, since a missing Origin
// AND missing Sec-Fetch-Site would otherwise sail through on a forged request.
export function isCrossSite(request: Request): boolean {
	const secFetchSite = request.headers.get("sec-fetch-site");
	if (secFetchSite) {
		return secFetchSite !== "same-origin" && secFetchSite !== "same-site";
	}
	// Older UA without Sec-Fetch-Site: require a matching Origin, else block.
	const origin = request.headers.get("origin");
	if (!origin) return true;
	try {
		return new URL(origin).origin !== new URL(request.url).origin;
	} catch {
		return true;
	}
}
