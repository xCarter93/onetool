export type RecurringGroupRow = {
	_id: string;
	title?: string;
	sentAt?: number;
	recurringAgreement?: {
		reference: string;
		sourceQuoteId: string;
		inherited: boolean;
	} | null;
};

export function groupRecurringAgreementQuotes<T extends RecurringGroupRow>(
	quotes: T[]
): Array<T & { coveredVisits?: T[] }> {
	const inheritedBySource = new Map<string, T[]>();
	for (const quote of quotes) {
		if (!quote.recurringAgreement?.inherited) continue;
		const sourceId = quote.recurringAgreement.sourceQuoteId;
		inheritedBySource.set(sourceId, [...(inheritedBySource.get(sourceId) ?? []), quote]);
	}

	const rows = quotes
		.filter((quote) => !quote.recurringAgreement?.inherited)
		.map((quote) => {
			const coveredVisits = inheritedBySource.get(quote._id);
			return coveredVisits?.length ? { ...quote, coveredVisits } : quote;
		});
	const visibleSourceIds = new Set(rows.map((quote) => quote._id));
	for (const [sourceId, coveredVisits] of inheritedBySource) {
		if (visibleSourceIds.has(sourceId)) continue;
		rows.push({ ...coveredVisits[0], title: "Recurring agreement", coveredVisits });
	}
	return rows.sort((a, b) => (b.sentAt ?? 0) - (a.sentAt ?? 0));
}
