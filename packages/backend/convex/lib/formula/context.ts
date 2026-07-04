/** Runtime context passed to the evaluator. No dependencies beyond ast types. */

import type { Val } from "./ast";

export type FormulaContext = {
	/** Caller's variable resolver. Returns null (or undefined -> treated as null) for empty. */
	resolve: (path: string) => Val;
	/** Injected epoch ms -> deterministic NOW()/TODAY(). Never read the wall clock. */
	now: number;
	/** IANA tz -> deterministic wall-clock date math. */
	tz: string;
};
