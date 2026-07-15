/**
 * Public API for the formula engine.
 *
 * SECURITY: this is a dependency-free, sandboxed expression language. The only
 * way to reference data is the `{dotted.path}` variable token, resolved by the
 * caller-supplied `resolve`. There is no member access, no dynamic property
 * lookup, no `this`, no prototype access, no `eval`, and functions are a fixed
 * whitelist. Out-of-scope path detection is the caller's job — use
 * `collectReferencedPaths` on the parsed AST for scope analysis.
 */

export type { Val, FormulaAst } from "./ast";
export { FORMULA_LIMITS } from "./ast";

export { FormulaError } from "./errors";
export type { FormulaErrorCode } from "./errors";

export type { FormulaContext } from "./context";

export { parseFormula, collectReferencedPaths } from "./parser";
export { evaluateFormula, runFormula } from "./evaluator";

export { FORMULA_FUNCTIONS } from "./functions";
export type { FormulaFnDoc } from "./functions";

// Calendar-date vs instant classification. Callers that read or write date
// fields need it to stay in the same day-space the formula layer uses.
export { calendarDayEpoch, isCalendarDateEpoch } from "./coerce";
