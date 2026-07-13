import { parsePhoneNumber } from "react-phone-number-input";

/**
 * Phones predate the E.164 `PhoneInput`, so stored values are free text
 * ("(555) 123-4567", "555.123.4567 x2"). Upgrade what libphonenumber can parse
 * and hand back the rest as `unparsed` so a caller can surface it for re-entry
 * rather than silently blanking the field.
 *
 * Always resolves through the parsed number: a value can be valid and still
 * carry spaces or parens, which `PhoneInput` won't accept as `value`.
 */
export function parseLegacyPhone(raw?: string): {
	value: string;
	unparsed: string;
} {
	const trimmed = raw?.trim() ?? "";
	if (!trimmed) return { value: "", unparsed: "" };
	try {
		const parsed = parsePhoneNumber(trimmed, "US");
		if (parsed?.isValid()) return { value: parsed.number, unparsed: "" };
	} catch {
		// parsePhoneNumber throws on malformed input — treat it as unparsed.
	}
	return { value: "", unparsed: trimmed };
}

/** E.164 for what parses, "" for what doesn't. */
export function toE164(raw?: string): string {
	return parseLegacyPhone(raw).value;
}
