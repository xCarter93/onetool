/** Same-origin check for state-changing portal routes. */
export function isSameOrigin(
	originHeader: string | null,
	refererHeader: string | null,
	expectedOrigin: string | null,
): boolean {
	if (!expectedOrigin) return false;
	if (originHeader !== null && originHeader !== undefined) {
		if (originHeader === "" || originHeader === "null") return false;
		try {
			return new URL(originHeader).origin === expectedOrigin;
		} catch {
			return false; // malformed Origin → reject
		}
	}
	if (!refererHeader) return false;
	try {
		return new URL(refererHeader).origin === expectedOrigin;
	} catch {
		return false;
	}
}
