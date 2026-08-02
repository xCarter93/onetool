/**
 * Search digests: the single string each searchable table indexes via its
 * `search_text` search index. Pure functions (no ctx) so lib/triggers.ts,
 * migrations/backfillSearchText.ts, and test.helpers.ts can all build the
 * same value.
 *
 * Convex tokenizes on whitespace AND punctuation and prefix-matches the last
 * term; convex-test's emulation only splits on whitespace. numberVariants
 * bridges the gap for identifier fields so "9931" still finds "Q-9931" in
 * both environments.
 */

/**
 * Convex caps a single term at 32 chars and a document at 1 MiB but publishes
 * no search-field ceiling, so this is a defensive cap on unbounded free text
 * (notes/terms/clientMessage).
 */
const MAX_DIGEST_LENGTH = 8000;

function joinDigest(parts: Array<string | undefined | null>): string {
	const out: string[] = [];
	for (const part of parts) {
		if (part == null) continue;
		const trimmed = part.trim();
		if (trimmed.length === 0) continue;
		out.push(trimmed);
	}
	return out.join(" ").slice(0, MAX_DIGEST_LENGTH);
}

/**
 * "Q-9931" -> "Q-9931 Q 9931". Emits the raw identifier plus each
 * alphanumeric run so a bare-number query still matches under word-prefix
 * tokenization. Returns undefined for empty input so joinDigest skips it.
 */
export function numberVariants(
	value: string | undefined | null
): string | undefined {
	if (value == null) return undefined;
	const raw = value.trim();
	if (raw.length === 0) return undefined;
	const variants = new Set<string>([raw]);
	for (const segment of raw.split(/[^a-zA-Z0-9]+/)) {
		if (segment.length > 0) variants.add(segment);
	}
	return [...variants].join(" ");
}

type ClientLike = {
	companyName: string;
	notes?: string;
	tags?: string[];
};

type ContactLike = {
	firstName: string;
	lastName: string;
	email?: string;
	jobTitle?: string;
};

type PropertyLike = {
	propertyName?: string;
	streetAddress: string;
	city: string;
	state: string;
	zipCode: string;
};

type ProjectLike = {
	title: string;
	description?: string;
	projectNumber?: string;
};

type QuoteLike = {
	title?: string;
	quoteNumber?: string;
	clientMessage?: string;
	terms?: string;
};

type InvoiceLike = {
	invoiceNumber: string;
};

type TaskLike = {
	title: string;
	description?: string;
};

export function clientSearchText(doc: ClientLike): string {
	return joinDigest([doc.companyName, doc.notes, ...(doc.tags ?? [])]);
}

export function contactSearchText(doc: ContactLike): string {
	return joinDigest([
		`${doc.firstName} ${doc.lastName}`,
		doc.email,
		doc.jobTitle,
	]);
}

export function propertySearchText(doc: PropertyLike): string {
	return joinDigest([
		doc.propertyName,
		doc.streetAddress,
		doc.city,
		doc.state,
		doc.zipCode,
	]);
}

export function projectSearchText(doc: ProjectLike): string {
	return joinDigest([
		doc.title,
		doc.description,
		numberVariants(doc.projectNumber),
	]);
}

export function quoteSearchText(doc: QuoteLike): string {
	return joinDigest([
		doc.title,
		numberVariants(doc.quoteNumber),
		doc.clientMessage,
		doc.terms,
	]);
}

export function invoiceSearchText(doc: InvoiceLike): string {
	return joinDigest([numberVariants(doc.invoiceNumber)]);
}

export function taskSearchText(doc: TaskLike): string {
	return joinDigest([doc.title, doc.description]);
}
