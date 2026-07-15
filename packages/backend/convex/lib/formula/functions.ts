/**
 * Whitelisted function table. This is the ONLY set of callable operations —
 * there is no dynamic lookup, no member access, no way to reach arbitrary JS.
 *
 * Eager functions receive already-evaluated args plus ctx. IF / AND / OR are
 * marked `special` and are handled with lazy / short-circuit semantics in the
 * evaluator (they never call an eager `fn`).
 */

import type { Val } from "./ast";
import type { FormulaContext } from "./context";
import { FormulaError } from "./errors";
import {
	calendarDayEpoch,
	getZonedParts,
	guardNumber,
	guardStr,
	isCalendarDateEpoch,
	partsFor,
	requireString,
	stringify,
	toDate,
	toInt,
	toNumber,
	zonedPartsToEpoch,
} from "./coerce";

export type FormulaFnDoc = {
	name: string;
	category: "number" | "logic" | "text" | "date";
	signature: string;
	description: string;
	example: string;
};

type EagerFn = (args: Val[], ctx: FormulaContext) => Val;

export type FunctionSpec = {
	name: string; // normalized UPPER
	category: FormulaFnDoc["category"];
	minArgs: number;
	maxArgs: number; // Infinity for variadic
	special?: "IF" | "AND" | "OR";
	fn?: EagerFn;
	doc: FormulaFnDoc;
};

function roundHalfUp(x: number, digits: number): number {
	const factor = 10 ** digits;
	// Nudge to correct binary-float representation error (e.g. 2.345*100 =
	// 234.49999999999997 -> 234.5) so half-values round away from zero.
	let scaled = x * factor + (x >= 0 ? 1 : -1) * 1e-9;
	scaled = scaled >= 0 ? Math.floor(scaled + 0.5) : Math.ceil(scaled - 0.5);
	return scaled / factor;
}

const MAX_EPOCH_MS = 8.64e15; // ECMAScript maximum absolute time value.

/** Reject a computed epoch that is NaN or outside the representable date range. */
function guardEpoch(ms: number, label: string): number {
	if (Number.isNaN(ms) || Math.abs(ms) > MAX_EPOCH_MS) {
		throw new FormulaError("TYPE", `${label} is outside the supported date range`);
	}
	return ms;
}

const SPECS: FunctionSpec[] = [
	/* ------------------------------- number -------------------------------- */
	{
		name: "ROUND",
		category: "number",
		minArgs: 1,
		maxArgs: 2,
		fn: (args) => {
			const x = toNumber(args[0], "ROUND(x)");
			const digits = args.length > 1 ? toInt(args[1], "ROUND digits") : 0;
			return guardNumber(roundHalfUp(x, digits), "ROUND");
		},
		doc: {
			name: "ROUND",
			category: "number",
			signature: "ROUND(number, [digits])",
			description: "Round to the given decimal places (default 0), halves away from zero.",
			example: "ROUND(3.14159, 2) → 3.14",
		},
	},
	{
		name: "ABS",
		category: "number",
		minArgs: 1,
		maxArgs: 1,
		fn: (args) => guardNumber(Math.abs(toNumber(args[0], "ABS(x)")), "ABS"),
		doc: {
			name: "ABS",
			category: "number",
			signature: "ABS(number)",
			description: "Absolute value.",
			example: "ABS(-5) → 5",
		},
	},
	{
		name: "MIN",
		category: "number",
		minArgs: 1,
		maxArgs: Infinity,
		fn: (args) => guardNumber(Math.min(...args.map((a, i) => toNumber(a, `MIN arg ${i + 1}`))), "MIN"),
		doc: {
			name: "MIN",
			category: "number",
			signature: "MIN(a, b, ...)",
			description: "Smallest of the given numbers.",
			example: "MIN(3, 1, 2) → 1",
		},
	},
	{
		name: "MAX",
		category: "number",
		minArgs: 1,
		maxArgs: Infinity,
		fn: (args) => guardNumber(Math.max(...args.map((a, i) => toNumber(a, `MAX arg ${i + 1}`))), "MAX"),
		doc: {
			name: "MAX",
			category: "number",
			signature: "MAX(a, b, ...)",
			description: "Largest of the given numbers.",
			example: "MAX(3, 1, 2) → 3",
		},
	},
	{
		name: "FLOOR",
		category: "number",
		minArgs: 1,
		maxArgs: 1,
		fn: (args) => guardNumber(Math.floor(toNumber(args[0], "FLOOR(x)")), "FLOOR"),
		doc: {
			name: "FLOOR",
			category: "number",
			signature: "FLOOR(number)",
			description: "Round down to the nearest integer.",
			example: "FLOOR(2.9) → 2",
		},
	},
	{
		name: "CEIL",
		category: "number",
		minArgs: 1,
		maxArgs: 1,
		fn: (args) => guardNumber(Math.ceil(toNumber(args[0], "CEIL(x)")), "CEIL"),
		doc: {
			name: "CEIL",
			category: "number",
			signature: "CEIL(number)",
			description: "Round up to the nearest integer.",
			example: "CEIL(2.1) → 3",
		},
	},
	{
		name: "MOD",
		category: "number",
		minArgs: 2,
		maxArgs: 2,
		fn: (args) => {
			const a = toNumber(args[0], "MOD(a)");
			const b = toNumber(args[1], "MOD(b)");
			if (b === 0) throw new FormulaError("DIV_ZERO", "MOD by zero");
			// Floored modulo: result takes the sign of the divisor (spreadsheet
			// semantics), e.g. MOD(-7, 3) === 2, not JS's -1.
			return guardNumber(((a % b) + b) % b, "MOD");
		},
		doc: {
			name: "MOD",
			category: "number",
			signature: "MOD(a, b)",
			description: "Remainder of a divided by b (result takes the sign of the divisor).",
			example: "MOD(7, 3) → 1",
		},
	},
	{
		name: "POWER",
		category: "number",
		minArgs: 2,
		maxArgs: 2,
		fn: (args) => {
			const base = toNumber(args[0], "POWER(base)");
			const exp = toNumber(args[1], "POWER(exp)");
			return guardNumber(Math.pow(base, exp), "POWER");
		},
		doc: {
			name: "POWER",
			category: "number",
			signature: "POWER(base, exponent)",
			description: "base raised to the exponent.",
			example: "POWER(2, 10) → 1024",
		},
	},

	/* -------------------------------- logic -------------------------------- */
	{
		name: "AND",
		category: "logic",
		minArgs: 1,
		maxArgs: Infinity,
		special: "AND",
		doc: {
			name: "AND",
			category: "logic",
			signature: "AND(a, b, ...)",
			description: "True if every argument is true (short-circuits on the first false).",
			example: "AND(true, false) → false",
		},
	},
	{
		name: "OR",
		category: "logic",
		minArgs: 1,
		maxArgs: Infinity,
		special: "OR",
		doc: {
			name: "OR",
			category: "logic",
			signature: "OR(a, b, ...)",
			description: "True if any argument is true (short-circuits on the first true).",
			example: "OR(false, true) → true",
		},
	},
	{
		name: "NOT",
		category: "logic",
		minArgs: 1,
		maxArgs: 1,
		fn: (args) => {
			const v = args[0];
			if (typeof v !== "boolean") {
				throw new FormulaError("TYPE", "NOT expects a boolean");
			}
			return !v;
		},
		doc: {
			name: "NOT",
			category: "logic",
			signature: "NOT(boolean)",
			description: "Logical negation.",
			example: "NOT(true) → false",
		},
	},
	{
		name: "IF",
		category: "logic",
		minArgs: 3,
		maxArgs: 3,
		special: "IF",
		doc: {
			name: "IF",
			category: "logic",
			signature: "IF(condition, thenValue, elseValue)",
			description: "Returns thenValue when condition is true, else elseValue. Only the taken branch is evaluated.",
			example: "IF(1 < 2, \"yes\", \"no\") → \"yes\"",
		},
	},

	/* --------------------------------- text -------------------------------- */
	{
		name: "CONCAT",
		category: "text",
		minArgs: 1,
		maxArgs: Infinity,
		fn: (args) => guardStr(args.map(stringify).join("")),
		doc: {
			name: "CONCAT",
			category: "text",
			signature: "CONCAT(a, b, ...)",
			description: "Join values into one string (null becomes an empty string).",
			example: "CONCAT(\"a\", \"b\", \"c\") → \"abc\"",
		},
	},
	{
		name: "UPPER",
		category: "text",
		minArgs: 1,
		maxArgs: 1,
		fn: (args) => guardStr(requireString(args[0], "UPPER(s)").toUpperCase()),
		doc: {
			name: "UPPER",
			category: "text",
			signature: "UPPER(text)",
			description: "Uppercase a string.",
			example: "UPPER(\"abc\") → \"ABC\"",
		},
	},
	{
		name: "LOWER",
		category: "text",
		minArgs: 1,
		maxArgs: 1,
		fn: (args) => guardStr(requireString(args[0], "LOWER(s)").toLowerCase()),
		doc: {
			name: "LOWER",
			category: "text",
			signature: "LOWER(text)",
			description: "Lowercase a string.",
			example: "LOWER(\"ABC\") → \"abc\"",
		},
	},
	{
		name: "LEFT",
		category: "text",
		minArgs: 2,
		maxArgs: 2,
		fn: (args) => {
			const s = requireString(args[0], "LEFT(s)");
			const n = Math.max(0, toInt(args[1], "LEFT(n)"));
			return guardStr(s.slice(0, n));
		},
		doc: {
			name: "LEFT",
			category: "text",
			signature: "LEFT(text, n)",
			description: "First n characters of a string.",
			example: "LEFT(\"hello\", 3) → \"hel\"",
		},
	},
	{
		name: "RIGHT",
		category: "text",
		minArgs: 2,
		maxArgs: 2,
		fn: (args) => {
			const s = requireString(args[0], "RIGHT(s)");
			const n = Math.max(0, toInt(args[1], "RIGHT(n)"));
			return guardStr(n === 0 ? "" : s.slice(Math.max(0, s.length - n)));
		},
		doc: {
			name: "RIGHT",
			category: "text",
			signature: "RIGHT(text, n)",
			description: "Last n characters of a string.",
			example: "RIGHT(\"hello\", 2) → \"lo\"",
		},
	},
	{
		name: "LEN",
		category: "text",
		minArgs: 1,
		maxArgs: 1,
		fn: (args) => requireString(args[0], "LEN(s)").length,
		doc: {
			name: "LEN",
			category: "text",
			signature: "LEN(text)",
			description: "Number of characters in a string.",
			example: "LEN(\"hello\") → 5",
		},
	},
	{
		name: "TRIM",
		category: "text",
		minArgs: 1,
		maxArgs: 1,
		fn: (args) => guardStr(requireString(args[0], "TRIM(s)").trim()),
		doc: {
			name: "TRIM",
			category: "text",
			signature: "TRIM(text)",
			description: "Remove leading and trailing whitespace.",
			example: "TRIM(\"  hi  \") → \"hi\"",
		},
	},
	{
		name: "CONTAINS",
		category: "text",
		minArgs: 2,
		maxArgs: 2,
		fn: (args) => {
			const haystack = requireString(args[0], "CONTAINS(haystack)");
			const needle = requireString(args[1], "CONTAINS(needle)");
			return haystack.toLowerCase().includes(needle.toLowerCase());
		},
		doc: {
			name: "CONTAINS",
			category: "text",
			signature: "CONTAINS(haystack, needle)",
			description: "Case-insensitive test for a substring.",
			example: "CONTAINS(\"Hello\", \"ell\") → true",
		},
	},

	/* --------------------------------- date -------------------------------- */
	{
		name: "TODAY",
		category: "date",
		minArgs: 0,
		maxArgs: 0,
		// Returns today's calendar DATE (UTC-midnight encoded), not a local-midnight
		// instant — so it compares equal to stored date fields, which use the same
		// encoding. Which day it is, is still decided in the workflow timezone.
		fn: (_args, ctx) => new Date(calendarDayEpoch(ctx.now, ctx.tz)),
		doc: {
			name: "TODAY",
			category: "date",
			signature: "TODAY()",
			description: "The current date in the workflow timezone.",
			example: "TODAY() → 2026-07-04",
		},
	},
	{
		name: "NOW",
		category: "date",
		minArgs: 0,
		maxArgs: 0,
		fn: (_args, ctx) => new Date(ctx.now),
		doc: {
			name: "NOW",
			category: "date",
			signature: "NOW()",
			description: "The current instant (deterministic run start time).",
			example: "NOW() → current timestamp",
		},
	},
	{
		name: "DATE",
		category: "date",
		minArgs: 3,
		maxArgs: 3,
		fn: (args) => {
			const year = toInt(args[0], "DATE(year)");
			const month = toInt(args[1], "DATE(month)");
			const day = toInt(args[2], "DATE(day)");
			// A calendar date is UTC-midnight by construction. Building it from
			// zoned parts also broke outright in zones where DST springs forward AT
			// midnight (e.g. America/Santiago): local midnight doesn't exist there,
			// so the epoch landed at 01:00 local and was never a calendar date.
			const epoch = Date.UTC(year, month - 1, day);
			return new Date(guardEpoch(epoch, "DATE(year, month, day)"));
		},
		doc: {
			name: "DATE",
			category: "date",
			signature: "DATE(year, month, day)",
			description: "Construct a calendar date (month is 1-12).",
			example: "DATE(2026, 7, 4) → 2026-07-04",
		},
	},
	{
		name: "ADDDAYS",
		category: "date",
		minArgs: 2,
		maxArgs: 2,
		fn: (args, ctx) => {
			const date = toDate(args[0], "ADDDAYS(date)");
			const n = toInt(args[1], "ADDDAYS(n)");
			const ms = date.getTime();
			// A calendar date advances in UTC, which has no DST — so the result is
			// still exactly UTC midnight. Preserving wall-clock in the run timezone
			// (what an instant needs) would land it off-midnight across a DST
			// boundary, silently reclassifying it as an instant and corrupting the
			// field it gets written to.
			if (isCalendarDateEpoch(ms)) {
				return new Date(guardEpoch(ms + n * 86_400_000, "ADDDAYS result"));
			}
			const p = getZonedParts(ms, ctx.tz);
			const parts = { ...p, day: p.day + n };
			// Bounds-check before the epoch can reach getZonedParts (raw RangeError guard).
			guardEpoch(
				Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second),
				"ADDDAYS result"
			);
			return new Date(zonedPartsToEpoch(parts, ctx.tz));
		},
		doc: {
			name: "ADDDAYS",
			category: "date",
			signature: "ADDDAYS(date, n)",
			description: "Add n whole days to a date (a time of day, if any, is preserved).",
			example: "ADDDAYS(DATE(2026,7,4), 3) → 2026-07-07",
		},
	},
	{
		name: "DAYS_BETWEEN",
		category: "date",
		minArgs: 2,
		maxArgs: 2,
		fn: (args, ctx) => {
			const a = toDate(args[0], "DAYS_BETWEEN(a)");
			const b = toDate(args[1], "DAYS_BETWEEN(b)");
			// Each side is read in its own day-space, so a calendar date and an
			// instant diff correctly instead of coming out one day apart.
			const midA = calendarDayEpoch(a.getTime(), ctx.tz);
			const midB = calendarDayEpoch(b.getTime(), ctx.tz);
			return Math.round((midB - midA) / 86_400_000);
		},
		doc: {
			name: "DAYS_BETWEEN",
			category: "date",
			signature: "DAYS_BETWEEN(a, b)",
			description: "Whole calendar days from a to b (b − a).",
			example: "DAYS_BETWEEN(DATE(2026,7,1), DATE(2026,7,4)) → 3",
		},
	},
	{
		name: "YEAR",
		category: "date",
		minArgs: 1,
		maxArgs: 1,
		fn: (args, ctx) => partsFor(toDate(args[0], "YEAR(date)").getTime(), ctx.tz).year,
		doc: {
			name: "YEAR",
			category: "date",
			signature: "YEAR(date)",
			description: "Calendar year in the workflow timezone.",
			example: "YEAR(DATE(2026,7,4)) → 2026",
		},
	},
	{
		name: "MONTH",
		category: "date",
		minArgs: 1,
		maxArgs: 1,
		fn: (args, ctx) => partsFor(toDate(args[0], "MONTH(date)").getTime(), ctx.tz).month,
		doc: {
			name: "MONTH",
			category: "date",
			signature: "MONTH(date)",
			description: "Calendar month (1-12) in the workflow timezone.",
			example: "MONTH(DATE(2026,7,4)) → 7",
		},
	},
	{
		name: "DAY",
		category: "date",
		minArgs: 1,
		maxArgs: 1,
		fn: (args, ctx) => partsFor(toDate(args[0], "DAY(date)").getTime(), ctx.tz).day,
		doc: {
			name: "DAY",
			category: "date",
			signature: "DAY(date)",
			description: "Day of the month in the workflow timezone.",
			example: "DAY(DATE(2026,7,4)) → 4",
		},
	},
];

const REGISTRY = new Map<string, FunctionSpec>();
for (const spec of SPECS) REGISTRY.set(spec.name, spec);

export function getFunctionSpec(nameUpper: string): FunctionSpec | undefined {
	return REGISTRY.get(nameUpper);
}

/** Ordered doc metadata for the editor reference pane. */
export const FORMULA_FUNCTIONS: FormulaFnDoc[] = SPECS.map((s) => s.doc);
