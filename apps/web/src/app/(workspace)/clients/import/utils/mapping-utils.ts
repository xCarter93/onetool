/**
 * Confidence state for a column mapping.
 * - "high": AI mapped with >= 0.7 confidence
 * - "low": AI mapped with < 0.7 confidence
 * - "manual": User manually overrode the mapping
 * - "skipped": Column set to "Do not import" (__skip__)
 */
export type ConfidenceState = "high" | "low" | "manual" | "skipped";

/**
 * Determine the display confidence state for a mapping row.
 * Priority: skipped > manual > confidence threshold.
 */
export function getConfidenceState(
	mapping: { schemaField: string; confidence: number },
	isManuallyOverridden: boolean
): ConfidenceState {
	if (mapping.schemaField === "__skip__") return "skipped";
	if (isManuallyOverridden) return "manual";
	return mapping.confidence >= 0.7 ? "high" : "low";
}

/**
 * Detect type mismatches between sample CSV values and the target field definition.
 * Returns deduplicated array of human-readable mismatch messages.
 */
export function detectTypeMismatches(
	sampleValues: string[],
	fieldDef: { type: string; options?: readonly string[] }
): string[] {
	const messages = new Set<string>();

	for (const value of sampleValues) {
		if (value === "") continue;

		if (fieldDef.type === "enum" && fieldDef.options) {
			if (!fieldDef.options.includes(value)) {
				messages.add(
					`"${value}" is not a valid option (expected: ${fieldDef.options.join(", ")})`
				);
			}
		}

		if (fieldDef.type === "number") {
			if (isNaN(Number(value))) {
				messages.add(`"${value}" is not a valid number`);
			}
		}
	}

	return Array.from(messages);
}
