"use client";

import { useCallback, useState } from "react";

/**
 * Drives the "glow on save" validation pattern used across the profile tabs.
 * Fields stay calm until the user attempts to save; only then do required-but-
 * empty fields surface their invalid styling. Combine `showErrors` with each
 * field's own emptiness check to set `aria-invalid`.
 */
export function useSaveValidation() {
	const [showErrors, setShowErrors] = useState(false);

	// Call at the start of a save handler so the current attempt reveals errors.
	const markSaveAttempt = useCallback(() => setShowErrors(true), []);

	// Call after a successful save (or when leaving the form) to calm the fields.
	const clearErrors = useCallback(() => setShowErrors(false), []);

	return { showErrors, markSaveAttempt, clearErrors };
}
