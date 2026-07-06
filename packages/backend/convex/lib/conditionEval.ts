import type {
	ConditionGroup,
	ConditionRule,
	FormulaResource,
	FormulaReturnType,
	ValueRef,
} from "./workflowTypes";
import {
	evaluateFormula,
	parseFormula,
	FormulaError,
	type FormulaAst,
	type FormulaContext,
	type Val,
} from "./formula";

/**
 * Pure condition/filter evaluation engine for workflow automations v2.
 *
 * Registry-independent: callers pass records and a VariableScope; no imports
 * from ./_generated or convex/server so this stays usable from any context
 * (and from the web app via @onetool/backend).
 */

export type VariableScope = {
	trigger?: {
		record: Record<string, unknown>;
		event?: { oldValue?: unknown; newValue?: unknown };
	};
	loops?: Record<string, { item: Record<string, unknown>; index: number }>;
	/** Per-node outputs: fetch → count; aggregate/adjust-time → result. */
	nodes?: Record<string, { count?: number; result?: unknown }>;
	// Built-in globals, populated at run start (see automationExecutor).
	/** Execution start time (epoch ms) + tz; feed formula NOW()/TODAY() and date math. */
	workflow?: { now?: number; tz?: string };
	/** Always populated (the executor loads the org). */
	org?: { id?: string; name?: string };
	/** Triggering actor; empty on scheduled/system/event runs with no actor. */
	user?: { id?: string; name?: string; email?: string };
	/** Formula resource definitions, resolved lazily via `formula.<id>` paths. */
	formulas?: FormulaResource[];
	/**
	 * Per-run memo of parsed formula ASTs, keyed by formula id. Formula
	 * expressions are immutable within a run, so a formula referenced N times
	 * (e.g. inside a loop body) parses once. Internal; populated lazily by
	 * resolveFormula.
	 */
	formulaAstCache?: Map<string, FormulaAst>;
};

/**
 * Resolve a ValueRef against the scope.
 *
 * Var paths (matched by prefix so field keys containing dots still resolve):
 *   trigger.record.<field>
 *   trigger.event.oldValue | trigger.event.newValue
 *   loop.<loopNodeId>.item.<field>
 *   loop.<loopNodeId>.index
 *   node.<nodeId>.count
 *   node.<nodeId>.result
 *   workflow.now
 *   org.id | org.name
 *   user.id | user.name | user.email
 *   formula.<id>   (evaluates a formula resource against the current scope)
 *
 * Unknown or missing paths resolve to the fallback if provided, else undefined.
 */
export function resolveValueRef(ref: ValueRef, scope: VariableScope): unknown {
	if (ref.kind === "static") return ref.value;
	const resolved = resolvePath(ref.path, scope);
	if (resolved === undefined) return ref.fallback ?? undefined;
	return resolved;
}

function resolvePath(
	path: string,
	scope: VariableScope,
	// Formula ids currently being resolved — guards against reference cycles.
	resolving: Set<string> = new Set()
): unknown {
	const TRIGGER_RECORD = "trigger.record.";
	if (path.startsWith(TRIGGER_RECORD)) {
		const field = path.slice(TRIGGER_RECORD.length);
		if (field === "") return undefined;
		return scope.trigger?.record?.[field];
	}
	if (path === "trigger.event.oldValue") return scope.trigger?.event?.oldValue;
	if (path === "trigger.event.newValue") return scope.trigger?.event?.newValue;

	// Built-in globals (exact-match paths).
	if (path === "workflow.now") return scope.workflow?.now;
	if (path === "org.id") return scope.org?.id;
	if (path === "org.name") return scope.org?.name;
	if (path === "user.id") return scope.user?.id;
	if (path === "user.name") return scope.user?.name;
	if (path === "user.email") return scope.user?.email;

	const LOOP = "loop.";
	if (path.startsWith(LOOP)) {
		const rest = path.slice(LOOP.length);
		// Node ids never contain dots; everything after ".item." is the field key.
		const dot = rest.indexOf(".");
		if (dot === -1) return undefined;
		const loopNodeId = rest.slice(0, dot);
		const tail = rest.slice(dot + 1);
		const loop = scope.loops?.[loopNodeId];
		if (!loop) return undefined;
		if (tail === "index") return loop.index;
		const ITEM = "item.";
		if (tail.startsWith(ITEM)) {
			const field = tail.slice(ITEM.length);
			if (field === "") return undefined;
			return loop.item?.[field];
		}
		return undefined;
	}

	const NODE = "node.";
	if (path.startsWith(NODE)) {
		const rest = path.slice(NODE.length);
		// Node ids never contain dots; the suffix names the output.
		const COUNT_SUFFIX = ".count";
		const RESULT_SUFFIX = ".result";
		if (rest.endsWith(COUNT_SUFFIX)) {
			const nodeId = rest.slice(0, rest.length - COUNT_SUFFIX.length);
			if (nodeId === "") return undefined;
			return scope.nodes?.[nodeId]?.count;
		}
		if (rest.endsWith(RESULT_SUFFIX)) {
			const nodeId = rest.slice(0, rest.length - RESULT_SUFFIX.length);
			if (nodeId === "") return undefined;
			return scope.nodes?.[nodeId]?.result;
		}
		return undefined;
	}

	const FORMULA = "formula.";
	if (path.startsWith(FORMULA)) {
		return resolveFormula(path.slice(FORMULA.length), scope, resolving);
	}

	return undefined;
}

/**
 * Evaluate a formula resource by id against the current scope. The evaluator's
 * variable resolver recurses back into resolvePath, so nested formulas work; a
 * `resolving` set guards against reference cycles (fail closed).
 */
function resolveFormula(
	id: string,
	scope: VariableScope,
	resolving: Set<string>
): unknown {
	if (id === "") return undefined;
	const def = scope.formulas?.find((f) => f.id === id);
	if (!def) return undefined;
	if (resolving.has(id)) {
		throw new FormulaError(
			"SYNTAX",
			`Formula "${def.name}" is part of a reference cycle`
		);
	}
	resolving.add(id);
	try {
		// Memoize the parsed AST on the (per-run) scope so a formula referenced
		// many times parses once. Keyed by id; the expression is immutable in a run.
		const cache = (scope.formulaAstCache ??= new Map());
		let ast = cache.get(id);
		if (!ast) {
			ast = parseFormula(def.expression);
			cache.set(id, ast);
		}
		const ctx: FormulaContext = {
			resolve: (p) => toFormulaVal(resolvePath(p, scope, resolving)),
			now: scope.workflow?.now ?? 0,
			tz: scope.workflow?.tz ?? "UTC",
		};
		return applyFormulaReturnType(evaluateFormula(ast, ctx), def.returnType);
	} finally {
		resolving.delete(id);
	}
}

/** Coerce an arbitrary resolved value into the formula engine's Val union. */
function toFormulaVal(value: unknown): Val {
	if (value === null || value === undefined) return null;
	if (
		typeof value === "number" ||
		typeof value === "string" ||
		typeof value === "boolean" ||
		value instanceof Date
	) {
		return value;
	}
	// Arrays/objects aren't representable as a scalar formula value.
	return null;
}

/** Normalize a formula result to the resource's declared return type. */
function applyFormulaReturnType(
	value: Val,
	returnType: FormulaReturnType
): unknown {
	if (value === null) return null;
	switch (returnType) {
		case "currency":
			// Dollars, rounded to cents (matches CLAUDE.md money convention).
			return typeof value === "number" ? Math.round(value * 100) / 100 : value;
		case "date":
			// Epoch ms, consistent with date fields / adjust_time / delay_until.
			return value instanceof Date ? value.getTime() : value;
		case "text":
			return value instanceof Date ? value.toISOString() : String(value);
		case "number":
		case "boolean":
		default:
			return value;
	}
}

/**
 * Built-in global paths whose resolved value is an epoch-ms timestamp and
 * should render as a readable date/time (not the raw number) in templates.
 */
const DATE_GLOBAL_PATHS = new Set(["workflow.now"]);

/** Format an epoch-ms timestamp as a readable date/time in the given IANA tz. */
function formatTimestampForDisplay(ms: number, tz: string): string {
	try {
		return new Intl.DateTimeFormat("en-US", {
			timeZone: tz,
			year: "numeric",
			month: "short",
			day: "numeric",
			hour: "numeric",
			minute: "2-digit",
		}).format(new Date(ms));
	} catch {
		// Invalid tz or ms — fall back to a stable ISO string rather than throw.
		return new Date(ms).toISOString();
	}
}

/**
 * Replace `{{path}}` tokens with values resolved from the scope.
 * Missing values (undefined/null) render as an empty string. Date values and
 * epoch-ms date globals (e.g. `workflow.now`) render as a readable date/time in
 * the run's timezone; other non-string values are String()-ified.
 */
export function interpolateTemplate(
	template: string,
	scope: VariableScope
): string {
	const tz = scope.workflow?.tz ?? "UTC";
	return template.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, path: string) => {
		const value = resolvePath(path, scope);
		if (value === undefined || value === null) return "";
		if (value instanceof Date) return formatTimestampForDisplay(value.getTime(), tz);
		if (typeof value === "number" && DATE_GLOBAL_PATHS.has(path)) {
			return formatTimestampForDisplay(value, tz);
		}
		return typeof value === "string" ? value : String(value);
	});
}

// ---------------------------------------------------------------------------
// Operator evaluation
// ---------------------------------------------------------------------------

/** Strict equality, except a number compares equal to its numeric string. */
function looseEquals(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (typeof a === "number" && typeof b === "string") {
		return numericStringToNumber(b) === a;
	}
	if (typeof b === "number" && typeof a === "string") {
		return numericStringToNumber(a) === b;
	}
	return false;
}

/** Returns the number for a non-empty numeric string, else undefined. */
function numericStringToNumber(s: string): number | undefined {
	if (s.trim() === "") return undefined;
	const n = Number(s);
	return Number.isNaN(n) ? undefined : n;
}

function contains(fieldValue: unknown, compareValue: unknown): boolean {
	if (typeof fieldValue === "string") {
		if (compareValue === undefined || compareValue === null) return false;
		return fieldValue
			.toLowerCase()
			.includes(String(compareValue).toLowerCase());
	}
	if (Array.isArray(fieldValue)) {
		return fieldValue.some((el) => looseEquals(el, compareValue));
	}
	return false;
}

function isEmpty(value: unknown): boolean {
	return (
		value === undefined ||
		value === null ||
		value === "" ||
		(Array.isArray(value) && value.length === 0)
	);
}

function compareNumeric(
	fieldValue: unknown,
	compareValue: unknown,
	cmp: (a: number, b: number) => boolean
): boolean {
	const a = Number(fieldValue);
	const b = Number(compareValue);
	if (Number.isNaN(a) || Number.isNaN(b)) return false;
	return cmp(a, b);
}

/** Epoch ms from a number (as-is) or a string (Date.parse); else NaN. */
function toEpochMs(value: unknown): number {
	if (typeof value === "number") return value;
	if (typeof value === "string") return Date.parse(value);
	return NaN;
}

function compareDates(
	fieldValue: unknown,
	compareValue: unknown,
	cmp: (a: number, b: number) => boolean
): boolean {
	const a = toEpochMs(fieldValue);
	const b = toEpochMs(compareValue);
	if (Number.isNaN(a) || Number.isNaN(b)) return false;
	return cmp(a, b);
}

/** Evaluate one rule against a record. */
export function evaluateRule(
	rule: ConditionRule,
	record: Record<string, unknown>,
	scope: VariableScope
): boolean {
	const fieldValue = record[rule.field];
	const compareValue = rule.value
		? resolveValueRef(rule.value, scope)
		: undefined;

	switch (rule.operator) {
		case "equals":
			return looseEquals(fieldValue, compareValue);
		case "not_equals":
			return !looseEquals(fieldValue, compareValue);
		case "contains":
			return contains(fieldValue, compareValue);
		case "not_contains":
			return !contains(fieldValue, compareValue);
		case "is_empty":
			return isEmpty(fieldValue);
		case "is_not_empty":
			return !isEmpty(fieldValue);
		case "greater_than":
			return compareNumeric(fieldValue, compareValue, (a, b) => a > b);
		case "less_than":
			return compareNumeric(fieldValue, compareValue, (a, b) => a < b);
		case "gte":
			return compareNumeric(fieldValue, compareValue, (a, b) => a >= b);
		case "lte":
			return compareNumeric(fieldValue, compareValue, (a, b) => a <= b);
		case "is_true":
			return fieldValue === true;
		case "is_false":
			return fieldValue === false;
		case "before":
			return compareDates(fieldValue, compareValue, (a, b) => a < b);
		case "after":
			return compareDates(fieldValue, compareValue, (a, b) => a > b);
		default: {
			const _exhaustive: never = rule.operator;
			return _exhaustive;
		}
	}
}

/** Evaluate one group; an empty rules array is vacuously true. */
export function evaluateGroup(
	group: ConditionGroup,
	record: Record<string, unknown>,
	scope: VariableScope
): boolean {
	if (group.rules.length === 0) return true;
	return group.logic === "and"
		? group.rules.every((rule) => evaluateRule(rule, record, scope))
		: group.rules.some((rule) => evaluateRule(rule, record, scope));
}

/** Evaluate groups combined with top-level logic; empty groups => true. */
export function evaluateConditionGroups(
	logic: "and" | "or",
	groups: ConditionGroup[],
	record: Record<string, unknown>,
	scope: VariableScope
): boolean {
	if (groups.length === 0) return true;
	return logic === "and"
		? groups.every((group) => evaluateGroup(group, record, scope))
		: groups.some((group) => evaluateGroup(group, record, scope));
}
