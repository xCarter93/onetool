/**
 * Plan 14.1-02: shared predicate for "this quote was approved via BoldSign".
 * Hardened against shape variants — case sensitivity ("Completed" vs
 * "completed"), null/undefined boldsign fields, partially-signed envelopes,
 * malformed array entries. Pure function. Add new variants here, not inline.
 */
export function hasCompletedBoldsign(
	docs:
		| ReadonlyArray<
				| { boldsign?: { status?: string | null } | null }
				| null
				| undefined
		  >
		| null
		| undefined,
): boolean {
	if (!docs || docs.length === 0) return false;
	return docs.some((d) => {
		const status = d?.boldsign?.status;
		if (typeof status !== "string") return false;
		return status.toLowerCase() === "completed";
	});
}
