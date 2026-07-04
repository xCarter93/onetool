/**
 * Value coercion, equality/comparison, string guards, and deterministic
 * timezone-aware date math. Dependency-free (only ./errors and ./ast types).
 *
 * All wall-clock date logic derives from an explicit tz string and an explicit
 * epoch — never from the ambient clock (no argless Date/Date.now).
 */

import { FORMULA_LIMITS, type Val } from "./ast";
import { FormulaError } from "./errors";

/* --------------------------------- numbers -------------------------------- */

/** A string that Number() parses to a finite value (trimmed, non-empty). */
function numericStringToNumber(s: string): number | null {
	const trimmed = s.trim();
	if (trimmed === "") return null;
	const n = Number(trimmed);
	return Number.isFinite(n) ? n : null;
}

/** Coerce to a finite number. Accepts number or numeric string. Else TYPE. */
export function toNumber(v: Val, label: string): number {
	if (typeof v === "number") {
		if (!Number.isFinite(v)) {
			throw new FormulaError("TYPE", `${label} is not a finite number`);
		}
		return v;
	}
	if (typeof v === "string") {
		const n = numericStringToNumber(v);
		if (n === null) {
			throw new FormulaError("TYPE", `${label} expected a number, got the string "${v}"`);
		}
		return n;
	}
	throw new FormulaError("TYPE", `${label} expected a number, got ${describe(v)}`);
}

/** Coerce to an integer number (TYPE if non-integer or not numeric). */
export function toInt(v: Val, label: string): number {
	const n = toNumber(v, label);
	if (!Number.isInteger(n)) {
		throw new FormulaError("TYPE", `${label} expected an integer, got ${n}`);
	}
	return n;
}

/** Guard an arithmetic result: NaN/Infinity are never returned silently. */
export function guardNumber(n: number, label: string): number {
	if (Number.isNaN(n)) {
		throw new FormulaError("TYPE", `${label} produced an invalid number (NaN)`);
	}
	if (!Number.isFinite(n)) {
		throw new FormulaError("TYPE", `${label} produced a non-finite number`);
	}
	return n;
}

/* --------------------------------- strings -------------------------------- */

/** Require a string value; used by strict text functions (UPPER, LEFT, ...). */
export function requireString(v: Val, label: string): string {
	if (typeof v !== "string") {
		throw new FormulaError("TYPE", `${label} expected a string, got ${describe(v)}`);
	}
	return v;
}

/** Stringify any value for CONCAT: null -> "", Date -> ISO, others -> String(). */
export function stringify(v: Val): string {
	if (v === null) return "";
	if (typeof v === "string") return v;
	if (typeof v === "boolean") return v ? "true" : "false";
	if (typeof v === "number") return String(v);
	if (v instanceof Date) return v.toISOString();
	return String(v);
}

/** Throw LIMIT if a produced string exceeds maxStrLen; otherwise pass through. */
export function guardStr(s: string): string {
	if (s.length > FORMULA_LIMITS.maxStrLen) {
		throw new FormulaError(
			"LIMIT",
			`String result exceeds maximum length (${s.length} > ${FORMULA_LIMITS.maxStrLen})`
		);
	}
	return s;
}

/* ------------------------- equality & comparison -------------------------- */

/** Value equality for == / !=. See module notes for the exact rules. */
export function valuesEqual(a: Val, b: Val): boolean {
	if (a === null || b === null) return a === null && b === null;

	const aDate = a instanceof Date;
	const bDate = b instanceof Date;
	if (aDate || bDate) {
		return aDate && bDate && a.getTime() === b.getTime();
	}

	if (typeof a === "boolean" || typeof b === "boolean") {
		return typeof a === "boolean" && typeof b === "boolean" && a === b;
	}

	if (typeof a === "number" && typeof b === "number") return a === b;
	if (typeof a === "string" && typeof b === "string") return a === b;

	// Mixed number/string: compare numerically only if the string is numeric.
	if (typeof a === "number" && typeof b === "string") {
		const nb = numericStringToNumber(b);
		return nb !== null && a === nb;
	}
	if (typeof a === "string" && typeof b === "number") {
		const na = numericStringToNumber(a);
		return na !== null && na === b;
	}
	return false;
}

/**
 * Ordered comparison for < <= > >=. Returns negative/zero/positive.
 * Both dates -> epoch compare; otherwise numeric compare (numeric strings ok).
 * Any other mix -> TYPE error.
 */
export function compareValues(a: Val, b: Val): number {
	const aDate = a instanceof Date;
	const bDate = b instanceof Date;
	if (aDate && bDate) {
		return a.getTime() - b.getTime();
	}
	if (aDate || bDate) {
		throw new FormulaError("TYPE", "Cannot compare a date with a non-date");
	}
	const na = toNumberOrNull(a);
	const nb = toNumberOrNull(b);
	if (na === null || nb === null) {
		throw new FormulaError(
			"TYPE",
			`Cannot order-compare ${describe(a)} and ${describe(b)}`
		);
	}
	return na - nb;
}

function toNumberOrNull(v: Val): number | null {
	if (typeof v === "number") return Number.isFinite(v) ? v : null;
	if (typeof v === "string") return numericStringToNumber(v);
	return null;
}

/* ---------------------------------- dates --------------------------------- */

/** Coerce Date | epoch-ms number | ISO string -> Date. Invalid -> TYPE. */
export function toDate(v: Val, label: string): Date {
	if (v instanceof Date) {
		if (Number.isNaN(v.getTime())) {
			throw new FormulaError("TYPE", `${label} is an invalid date`);
		}
		return v;
	}
	if (typeof v === "number") {
		if (!Number.isFinite(v)) {
			throw new FormulaError("TYPE", `${label} is not a valid epoch timestamp`);
		}
		return new Date(v);
	}
	if (typeof v === "string") {
		const ms = Date.parse(v);
		if (Number.isNaN(ms)) {
			throw new FormulaError("TYPE", `${label} could not be parsed as a date: "${v}"`);
		}
		return new Date(ms);
	}
	throw new FormulaError("TYPE", `${label} expected a date, got ${describe(v)}`);
}

export type ZonedParts = {
	year: number;
	month: number; // 1-12
	day: number;
	hour: number;
	minute: number;
	second: number;
};

function makeFormatter(tz: string): Intl.DateTimeFormat {
	try {
		return new Intl.DateTimeFormat("en-US", {
			timeZone: tz,
			hourCycle: "h23",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		});
	} catch {
		throw new FormulaError("TYPE", `Invalid time zone "${tz}"`);
	}
}

/** Wall-clock parts of an instant in a tz. */
export function getZonedParts(epochMs: number, tz: string): ZonedParts {
	const parts = makeFormatter(tz).formatToParts(new Date(epochMs));
	const map: Record<string, number> = {};
	for (const p of parts) {
		if (p.type !== "literal") map[p.type] = Number(p.value);
	}
	return {
		year: map.year,
		month: map.month,
		day: map.day,
		hour: map.hour,
		minute: map.minute,
		second: map.second,
	};
}

function tzOffsetMs(instant: number, tz: string): number {
	const p = getZonedParts(instant, tz);
	const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
	return asUTC - instant;
}

/**
 * Epoch ms for a wall-clock time in a tz. Day/month overflow normalizes via
 * Date.UTC (so day = 32 rolls into next month), and the offset is resolved
 * twice to stay correct across DST transitions.
 */
export function zonedPartsToEpoch(p: ZonedParts, tz: string): number {
	const utcGuess = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
	const offset1 = tzOffsetMs(utcGuess, tz);
	let epoch = utcGuess - offset1;
	const offset2 = tzOffsetMs(epoch, tz);
	if (offset2 !== offset1) epoch = utcGuess - offset2;
	return epoch;
}

/** Start-of-day (midnight) epoch for the calendar day of `epochMs` in `tz`. */
export function startOfDayEpoch(epochMs: number, tz: string): number {
	const p = getZonedParts(epochMs, tz);
	return zonedPartsToEpoch(
		{ year: p.year, month: p.month, day: p.day, hour: 0, minute: 0, second: 0 },
		tz
	);
}

/* --------------------------------- helpers -------------------------------- */

export function describe(v: Val): string {
	if (v === null) return "null";
	if (v instanceof Date) return "a date";
	return `a ${typeof v}`;
}

/** Normalize a resolver return value; reject anything outside the Val union. */
export function normalizeResolved(v: unknown): Val {
	if (v === undefined || v === null) return null;
	if (v instanceof Date) return v;
	const t = typeof v;
	if (t === "number" || t === "string" || t === "boolean") return v as Val;
	throw new FormulaError(
		"TYPE",
		`Resolved variable has an unsupported value type (${t}); only number, string, boolean, date, or null are allowed`
	);
}
