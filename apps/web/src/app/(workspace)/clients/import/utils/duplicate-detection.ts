import Fuse from "fuse.js";
import type { ImportRecord } from "@/types/csv-import";

export interface DuplicateMatch {
	rowIndex: number;
	matchedName: string;
	score: number;
}

/**
 * Detect potential duplicate clients by fuzzy-matching import record
 * companyName values against existing client names using fuse.js.
 *
 * Returns a Map keyed by row index for O(1) lookup.
 */
export function detectDuplicates(
	records: ImportRecord[],
	existingClients: { _id: string; companyName: string }[]
): Map<number, DuplicateMatch> {
	const matches = new Map<number, DuplicateMatch>();

	if (existingClients.length === 0) {
		return matches;
	}

	const fuse = new Fuse(existingClients, {
		keys: ["companyName"],
		threshold: 0.4,
		includeScore: true,
		ignoreLocation: true,
		minMatchCharLength: 2,
	});

	records.forEach((record, index) => {
		const name = record.companyName;
		if (!name || !String(name).trim()) {
			return;
		}

		const results = fuse.search(String(name));
		if (results.length > 0 && results[0].score !== undefined) {
			matches.set(index, {
				rowIndex: index,
				matchedName: results[0].item.companyName,
				score: results[0].score,
			});
		}
	});

	return matches;
}
