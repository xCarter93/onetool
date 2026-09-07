export type RecurringGroupRow = {
	_id: string;
	title?: string;
	status?: string;
	sentAt?: number;
	recurringAgreement?: {
		reference: string;
		sourceQuoteId: string;
		inherited: boolean;
	} | null;
};

export type GroupedQuoteRow<T> = T & { coveredVisits?: T[]; synthetic?: boolean };

export function groupRecurringAgreementQuotes<T extends RecurringGroupRow>(
	quotes: T[]
): GroupedQuoteRow<T>[] {
	const inheritedBySource = new Map<string, T[]>();
	for (const quote of quotes) {
		if (!quote.recurringAgreement?.inherited) continue;
		const sourceId = quote.recurringAgreement.sourceQuoteId;
		inheritedBySource.set(sourceId, [...(inheritedBySource.get(sourceId) ?? []), quote]);
	}

	const rows: GroupedQuoteRow<T>[] = quotes
		.filter((quote) => !quote.recurringAgreement?.inherited)
		.map((quote) => {
			const coveredVisits = inheritedBySource.get(quote._id);
			return coveredVisits?.length ? { ...quote, coveredVisits } : quote;
		});
	const visibleSourceIds = new Set(rows.map((quote) => quote._id));
	for (const [sourceId, coveredVisits] of inheritedBySource) {
		if (visibleSourceIds.has(sourceId)) continue;
		// The agreement itself is not listed: this row only groups its approved visits and opens nothing.
		rows.push({
			...coveredVisits[0],
			_id: `agreement:${sourceId}`,
			status: "approved" as T["status"],
			title: "Recurring agreement",
			sentAt: Math.max(...coveredVisits.map((visit) => visit.sentAt ?? 0)),
			synthetic: true,
			coveredVisits,
		});
	}
	return rows.sort((a, b) => (b.sentAt ?? 0) - (a.sentAt ?? 0));
}

export function rowMatchesStatus<T extends RecurringGroupRow>(
	row: GroupedQuoteRow<T>,
	status: string
): boolean {
	return row.status === status || (row.coveredVisits ?? []).some((visit) => visit.status === status);
}
