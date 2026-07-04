/** Error codes and error class for the formula engine. No dependencies. */

export type FormulaErrorCode =
	| "SYNTAX"
	| "LIMIT"
	| "UNKNOWN_FN"
	| "ARITY"
	| "TYPE"
	| "DIV_ZERO"
	| "UNRESOLVED";

export class FormulaError extends Error {
	code: FormulaErrorCode;

	constructor(code: FormulaErrorCode, message: string) {
		super(message);
		this.name = "FormulaError";
		this.code = code;
	}
}
