/**
 * Build a `From` header from a user-controlled display name.
 *
 * Org and user names reach this unvalidated, so control characters — CR/LF
 * above all, the header-injection vector — are stripped, and the name is
 * emitted as an RFC 5322 quoted-string (with `"` and `\` escaped) so commas,
 * colons and angle brackets in a business name stay harmless. A name that is
 * empty after cleaning falls back to the bare address.
 */
export function formatEmailFrom(displayName: string, address: string): string {
	// eslint-disable-next-line no-control-regex
	const cleaned = displayName.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
	if (!cleaned) return address;
	const escaped = cleaned.replace(/(["\\])/g, "\\$1");
	return `"${escaped}" <${address}>`;
}
