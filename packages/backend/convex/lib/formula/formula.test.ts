import { describe, it, expect } from "vitest";
import { tokenize } from "./tokenizer";
import {
	parseFormula,
	collectReferencedPaths,
	evaluateFormula,
	runFormula,
	FormulaError,
	FORMULA_LIMITS,
	FORMULA_FUNCTIONS,
	type Val,
	type FormulaContext,
	type FormulaAst,
} from "./index";

/* --------------------------------- helpers -------------------------------- */

const FIXED_NOW = Date.UTC(2026, 6, 4, 12, 0, 0); // 2026-07-04T12:00:00Z

function ctx(
	vars: Record<string, Val> = {},
	opts: { now?: number; tz?: string } = {}
): FormulaContext {
	return {
		// Own-property lookup only, so inherited props (e.g. "constructor")
		// are never pulled from the object's prototype.
		resolve: (path: string) =>
			Object.prototype.hasOwnProperty.call(vars, path) ? vars[path] : null,
		now: opts.now ?? FIXED_NOW,
		tz: opts.tz ?? "UTC",
	};
}

function run(src: string, vars: Record<string, Val> = {}, opts?: { now?: number; tz?: string }): Val {
	return runFormula(src, ctx(vars, opts));
}

function code(fn: () => unknown): string {
	try {
		fn();
	} catch (e) {
		if (e instanceof FormulaError) return e.code;
		return `NON_FORMULA_ERROR:${String(e)}`;
	}
	return "NO_ERROR";
}

/* ------------------------------- tokenizer -------------------------------- */

describe("tokenizer", () => {
	it("tokenizes numbers including leading dot", () => {
		expect(tokenize("123").map((t) => t.type)).toEqual(["NUMBER", "EOF"]);
		expect(tokenize("1.5")[0].num).toBe(1.5);
		expect(tokenize(".5")[0].num).toBe(0.5);
	});

	it("tokenizes strings with escapes in both quote styles", () => {
		expect(tokenize('"a\\nb"')[0].value).toBe("a\nb");
		expect(tokenize("'a\\tb'")[0].value).toBe("a\tb");
		expect(tokenize('"quote\\"end"')[0].value).toBe('quote"end');
		expect(tokenize("'\\''")[0].value).toBe("'");
		expect(tokenize('"back\\\\slash"')[0].value).toBe("back\\slash");
	});

	it("tokenizes booleans case-insensitively", () => {
		expect(tokenize("TRUE")[0]).toMatchObject({ type: "BOOLEAN", bool: true });
		expect(tokenize("False")[0]).toMatchObject({ type: "BOOLEAN", bool: false });
	});

	it("tokenizes {var} paths with dots", () => {
		const t = tokenize("{trigger.record.amount}")[0];
		expect(t).toMatchObject({ type: "VAR", value: "trigger.record.amount" });
		expect(tokenize("{loop.abc.item.total}")[0].value).toBe("loop.abc.item.total");
	});

	it("maps <> to != and recognizes all operators", () => {
		expect(tokenize("<>")[0]).toMatchObject({ type: "OP", value: "!=" });
		expect(tokenize("a != b").filter((t) => t.type === "OP")[0].value).toBe("!=");
		expect(tokenize(">=")[0].value).toBe(">=");
		expect(tokenize("<=")[0].value).toBe("<=");
		expect(tokenize("==")[0].value).toBe("==");
	});

	it("errors on unterminated string", () => {
		expect(code(() => tokenize('"abc'))).toBe("SYNTAX");
	});

	it("errors on stray / unterminated {", () => {
		expect(code(() => tokenize("{abc"))).toBe("SYNTAX");
		expect(code(() => tokenize("{}"))).toBe("SYNTAX");
	});

	it("errors on unexpected characters", () => {
		expect(code(() => tokenize("@"))).toBe("SYNTAX");
	});
});

/* --------------------------------- parser --------------------------------- */

describe("parser", () => {
	it("binds * tighter than +", () => {
		const ast = parseFormula("1 + 2 * 3") as Extract<FormulaAst, { kind: "Binary" }>;
		expect(ast.kind).toBe("Binary");
		expect(ast.op).toBe("+");
		expect(ast.left).toEqual({ kind: "Num", value: 1 });
		const right = ast.right as Extract<FormulaAst, { kind: "Binary" }>;
		expect(right.op).toBe("*");
	});

	it("parses unary minus", () => {
		expect(parseFormula("-5")).toEqual({
			kind: "Unary",
			op: "-",
			operand: { kind: "Num", value: 5 },
		});
	});

	it("respects parentheses grouping", () => {
		const ast = parseFormula("(1 + 2) * 3") as Extract<FormulaAst, { kind: "Binary" }>;
		expect(ast.op).toBe("*");
		expect((ast.left as Extract<FormulaAst, { kind: "Binary" }>).op).toBe("+");
	});

	it("maps <> to != in the AST", () => {
		const ast = parseFormula("{a} <> 1") as Extract<FormulaAst, { kind: "Binary" }>;
		expect(ast.op).toBe("!=");
	});

	it("parses nested function calls with args", () => {
		const ast = parseFormula("MAX(1, MIN(2, 3), 4)") as Extract<FormulaAst, { kind: "Call" }>;
		expect(ast.kind).toBe("Call");
		expect(ast.name).toBe("MAX");
		expect(ast.args.length).toBe(3);
		expect((ast.args[1] as Extract<FormulaAst, { kind: "Call" }>).name).toBe("MIN");
	});

	it("rejects a bare identifier not followed by (", () => {
		expect(code(() => parseFormula("foo"))).toBe("SYNTAX");
		expect(code(() => parseFormula("foo + 1"))).toBe("SYNTAX");
	});

	it("rejects member-access attempts like {a}.b", () => {
		expect(code(() => parseFormula("{a}.b"))).toBe("SYNTAX");
		expect(code(() => parseFormula("{a}.constructor"))).toBe("SYNTAX");
	});

	it("rejects empty formula and trailing tokens", () => {
		expect(code(() => parseFormula(""))).toBe("SYNTAX");
		expect(code(() => parseFormula("1 2"))).toBe("SYNTAX");
		expect(code(() => parseFormula("(1"))).toBe("SYNTAX");
	});
});

/* -------------------------- collectReferencedPaths ------------------------ */

describe("collectReferencedPaths", () => {
	it("collects and dedups var paths nested in calls and binaries", () => {
		const ast = parseFormula(
			"CONCAT({a.b}, IF({a.b} == {c}, {d}, {c}))"
		);
		expect(collectReferencedPaths(ast).sort()).toEqual(["a.b", "c", "d"]);
	});

	it("returns empty for constant expressions", () => {
		expect(collectReferencedPaths(parseFormula("1 + 2"))).toEqual([]);
	});
});

/* ------------------------------- arithmetic ------------------------------- */

describe("evaluator arithmetic", () => {
	it("evaluates precedence correctly", () => {
		expect(run("1 + 2 * 3")).toBe(7);
		expect(run("(1 + 2) * 3")).toBe(9);
		expect(run("10 - 2 - 3")).toBe(5);
	});

	it("handles unary minus", () => {
		expect(run("-5 + 2")).toBe(-3);
		expect(run("--5")).toBe(5);
	});

	it("coerces numeric strings", () => {
		expect(run("{a} + 1", { a: "12" })).toBe(13);
		expect(run("{a} * 2", { a: " 3 " })).toBe(6);
	});

	it("throws DIV_ZERO on divide by zero", () => {
		expect(code(() => run("1 / 0"))).toBe("DIV_ZERO");
		expect(code(() => run("1 / {a}", { a: 0 }))).toBe("DIV_ZERO");
	});

	it("throws TYPE on non-numeric arithmetic", () => {
		expect(code(() => run('1 + "abc"'))).toBe("TYPE");
		expect(code(() => run("1 + {a}", { a: true }))).toBe("TYPE");
		expect(code(() => run("1 + {a}", { a: null }))).toBe("TYPE");
	});

	it("guards NaN / Infinity", () => {
		expect(code(() => run("POWER(0, -1)"))).toBe("TYPE"); // Infinity
		expect(code(() => run("POWER(-1, 0.5)"))).toBe("TYPE"); // NaN
	});

	it("+ is numeric-only (no string concatenation)", () => {
		expect(code(() => run('"a" + "b"'))).toBe("TYPE");
	});
});

/* -------------------------- comparison & equality ------------------------- */

describe("comparison and equality", () => {
	it("orders numbers and numeric strings", () => {
		expect(run("1 < 2")).toBe(true);
		expect(run("2 <= 2")).toBe(true);
		expect(run("3 > 2")).toBe(true);
		expect(run("{a} >= 5", { a: "5" })).toBe(true);
	});

	it("orders dates by epoch", () => {
		expect(run("DATE(2026,1,1) < DATE(2026,1,2)")).toBe(true);
		expect(run("DATE(2026,1,2) > DATE(2026,1,1)")).toBe(true);
	});

	it("throws TYPE on mismatched order comparison", () => {
		expect(code(() => run("DATE(2026,1,1) < 5"))).toBe("TYPE");
		expect(code(() => run('1 < "abc"'))).toBe("TYPE");
		expect(code(() => run("true < false"))).toBe("TYPE");
	});

	it("equality across types", () => {
		expect(run("1 == 1")).toBe(true);
		expect(run('"x" == "x"')).toBe(true);
		expect(run("true == true")).toBe(true);
		expect(run("1 != 2")).toBe(true);
		expect(run("{a} == 1", { a: "1" })).toBe(true); // numeric string coerces
		expect(run("true == 1")).toBe(false); // bool never equals number
	});

	it("null equality", () => {
		expect(run("{a} == {b}", { a: null, b: null })).toBe(true);
		expect(run("{a} == 1", { a: null })).toBe(false);
		expect(run("{a} != 1", { a: null })).toBe(true);
	});

	it("date equality by epoch", () => {
		expect(run("DATE(2026,1,1) == DATE(2026,1,1)")).toBe(true);
		expect(run("DATE(2026,1,1) == DATE(2026,1,2)")).toBe(false);
	});
});

/* ----------------------------- number functions --------------------------- */

describe("number functions", () => {
	it("ROUND is half-up (away from zero)", () => {
		expect(run("ROUND(2.5)")).toBe(3);
		expect(run("ROUND(3.5)")).toBe(4);
		expect(run("ROUND(-2.5)")).toBe(-3);
		expect(run("ROUND(3.14159, 2)")).toBe(3.14);
		expect(run("ROUND(2.345, 2)")).toBe(2.35);
		expect(run("ROUND(1.005, 2)")).toBe(1.01);
	});

	it("ABS, FLOOR, CEIL", () => {
		expect(run("ABS(-5)")).toBe(5);
		expect(run("FLOOR(2.9)")).toBe(2);
		expect(run("CEIL(2.1)")).toBe(3);
	});

	it("MIN / MAX variadic", () => {
		expect(run("MIN(3, 1, 2)")).toBe(1);
		expect(run("MAX(3, 1, 2)")).toBe(3);
		expect(run("MIN(7)")).toBe(7);
	});

	it("MOD and POWER", () => {
		expect(run("MOD(7, 3)")).toBe(1);
		expect(run("POWER(2, 10)")).toBe(1024);
		expect(code(() => run("MOD(7, 0)"))).toBe("DIV_ZERO");
	});
});

/* ------------------------------ logic functions --------------------------- */

describe("logic functions", () => {
	it("AND / OR short-circuit", () => {
		// OR stops at the first true, so the erroring second arg is never touched.
		expect(run("OR(true, {missing})", { missing: null })).toBe(true);
		// AND stops at the first false.
		expect(run("AND(false, {missing})", { missing: null })).toBe(false);
	});

	it("AND / OR full evaluation", () => {
		expect(run("AND(true, true, true)")).toBe(true);
		expect(run("AND(true, false)")).toBe(false);
		expect(run("OR(false, false)")).toBe(false);
	});

	it("NOT", () => {
		expect(run("NOT(true)")).toBe(false);
		expect(run("NOT(false)")).toBe(true);
		expect(code(() => run("NOT(1)"))).toBe("TYPE");
	});

	it("IF evaluates only the taken branch (lazy)", () => {
		expect(run("IF(true, 1, 10 / 0)")).toBe(1);
		expect(run("IF(false, 10 / 0, 2)")).toBe(2);
		expect(run("IF({x} == 0, 0, 10 / {x})", { x: 0 })).toBe(0);
		expect(run("IF({x} == 0, 0, 10 / {x})", { x: 2 })).toBe(5);
	});

	it("IF requires a boolean condition", () => {
		expect(code(() => run("IF(1, 2, 3)"))).toBe("TYPE");
	});
});

/* ------------------------------- text functions --------------------------- */

describe("text functions", () => {
	it("CONCAT stringifies, null becomes empty", () => {
		expect(run('CONCAT("a", "b", "c")')).toBe("abc");
		expect(run('CONCAT("x", {a}, "y")', { a: null })).toBe("xy");
		expect(run('CONCAT("n=", {a})', { a: 5 })).toBe("n=5");
		expect(run('CONCAT({a})', { a: true })).toBe("true");
	});

	it("UPPER / LOWER / TRIM / LEN", () => {
		expect(run('UPPER("abc")')).toBe("ABC");
		expect(run('LOWER("ABC")')).toBe("abc");
		expect(run('TRIM("  hi  ")')).toBe("hi");
		expect(run('LEN("hello")')).toBe(5);
	});

	it("LEFT / RIGHT", () => {
		expect(run('LEFT("hello", 3)')).toBe("hel");
		expect(run('RIGHT("hello", 2)')).toBe("lo");
		expect(run('LEFT("hi", 10)')).toBe("hi");
		expect(run('RIGHT("hi", 0)')).toBe("");
	});

	it("CONTAINS is case-insensitive", () => {
		expect(run('CONTAINS("Hello World", "world")')).toBe(true);
		expect(run('CONTAINS("Hello", "xyz")')).toBe(false);
	});

	it("strict text functions reject non-strings (TYPE)", () => {
		expect(code(() => run("UPPER(5)"))).toBe("TYPE");
		expect(code(() => run("LEN(5)"))).toBe("TYPE");
		expect(code(() => run('CONTAINS(5, "x")'))).toBe("TYPE");
	});
});

/* ------------------------------ date functions ---------------------------- */

describe("date functions (deterministic)", () => {
	it("NOW derives from ctx.now", () => {
		const v = run("NOW()") as Date;
		expect(v instanceof Date).toBe(true);
		expect(v.getTime()).toBe(FIXED_NOW);
	});

	it("TODAY is start of day in the tz", () => {
		const utc = run("TODAY()", {}, { tz: "UTC" }) as Date;
		expect(utc.toISOString()).toBe("2026-07-04T00:00:00.000Z");
	});

	it("DATE constructs midnight in the tz, round-trips via YEAR/MONTH/DAY", () => {
		expect(run("YEAR(DATE(2026, 7, 4))")).toBe(2026);
		expect(run("MONTH(DATE(2026, 7, 4))")).toBe(7);
		expect(run("DAY(DATE(2026, 7, 4))")).toBe(4);
	});

	it("ADDDAYS and DAYS_BETWEEN", () => {
		expect(run("DAY(ADDDAYS(DATE(2026,7,4), 3))")).toBe(7);
		expect(run("MONTH(ADDDAYS(DATE(2026,7,30), 5))")).toBe(8); // rolls into August
		expect(run("DAYS_BETWEEN(DATE(2026,7,1), DATE(2026,7,4))")).toBe(3);
		expect(run("DAYS_BETWEEN(DATE(2026,7,4), DATE(2026,7,1))")).toBe(-3);
	});

	it("accepts epoch-ms and ISO string date inputs", () => {
		expect(run("YEAR({d})", { d: Date.UTC(2025, 0, 1) })).toBe(2025);
		expect(run("YEAR({d})", { d: "2024-03-15T00:00:00Z" })).toBe(2024);
		expect(code(() => run("YEAR({d})", { d: "not-a-date" }))).toBe("TYPE");
	});

	it("extracts date parts using ctx.tz, not UTC (America/New_York)", () => {
		// 2026-07-04T02:00:00Z is still 2026-07-03 22:00 in New York (UTC-4 DST).
		const nearBoundary = Date.UTC(2026, 6, 4, 2, 0, 0);
		expect(run("DAY(NOW())", {}, { now: nearBoundary, tz: "America/New_York" })).toBe(3);
		expect(run("DAY(NOW())", {}, { now: nearBoundary, tz: "UTC" })).toBe(4);
		// TODAY in NY is midnight of Jul 3 NY = 2026-07-03T04:00:00Z.
		const todayNY = run("TODAY()", {}, { now: nearBoundary, tz: "America/New_York" }) as Date;
		expect(todayNY.toISOString()).toBe("2026-07-03T04:00:00.000Z");
	});
});

/* ---------------------------------- errors -------------------------------- */

describe("errors", () => {
	it("UNKNOWN_FN for functions outside the whitelist", () => {
		expect(code(() => run("FOO(1)"))).toBe("UNKNOWN_FN");
		expect(code(() => run("constructor(1)"))).toBe("UNKNOWN_FN");
	});

	it("ARITY for wrong argument counts", () => {
		expect(code(() => run("ABS(1, 2)"))).toBe("ARITY");
		expect(code(() => run("ABS()"))).toBe("ARITY");
		expect(code(() => run("IF(true, 1)"))).toBe("ARITY");
		expect(code(() => run("NOW(1)"))).toBe("ARITY");
	});

	it("resolve returning null is treated as null (not UNRESOLVED)", () => {
		// Out-of-scope detection is the caller's job via collectReferencedPaths.
		expect(run("{anything} == {other}", {})).toBe(true); // null == null
	});

	it("FormulaError carries a code", () => {
		try {
			run("1 / 0");
			throw new Error("expected throw");
		} catch (e) {
			expect(e).toBeInstanceOf(FormulaError);
			expect((e as FormulaError).code).toBe("DIV_ZERO");
		}
	});
});

/* ---------------------------------- limits -------------------------------- */

describe("limits", () => {
	it("rejects over-long source (LIMIT)", () => {
		const src = "1" + "+1".repeat(FORMULA_LIMITS.maxLen); // well over maxLen chars
		expect(src.length).toBeGreaterThan(FORMULA_LIMITS.maxLen);
		expect(code(() => parseFormula(src))).toBe("LIMIT");
	});

	it("rejects excessive nesting depth (LIMIT)", () => {
		const deep = "(".repeat(FORMULA_LIMITS.maxDepth + 5) + "1" + ")".repeat(FORMULA_LIMITS.maxDepth + 5);
		expect(code(() => parseFormula(deep))).toBe("LIMIT");
	});

	it("rejects too many nodes (LIMIT)", () => {
		// A single call with many compact args exceeds the node cap while staying
		// under maxLen, so the LIMIT is the node limit (not the length limit).
		const many = "MIN(" + "1,".repeat(FORMULA_LIMITS.maxNodes + 10) + "1)";
		expect(many.length).toBeLessThan(FORMULA_LIMITS.maxLen);
		expect(code(() => parseFormula(many))).toBe("LIMIT");
	});

	it("rejects string results over maxStrLen (LIMIT)", () => {
		const big = "x".repeat(FORMULA_LIMITS.maxStrLen);
		// CONCAT of two near-max strings exceeds the cap.
		expect(code(() => run("CONCAT({a}, {a})", { a: big }))).toBe("LIMIT");
	});
});

/* --------------------------------- security ------------------------------- */

describe("security", () => {
	it("{__proto__} is just a path string resolved by the caller", () => {
		// The path is an opaque string handed to resolve(); nothing dereferences
		// a JS prototype. Unprovided paths resolve to null.
		expect(run("{__proto__}", {})).toBe(null);
		expect(run("{constructor.prototype}", {})).toBe(null);
		// A resolver that treats "__proto__" as a normal key round-trips its value.
		const store = new Map<string, Val>([["__proto__", 42]]);
		const protoCtx: FormulaContext = {
			resolve: (p) => (store.has(p) ? (store.get(p) as Val) : null),
			now: FIXED_NOW,
			tz: "UTC",
		};
		expect(runFormula("{__proto__}", protoCtx)).toBe(42);
	});

	it("has no member-access operator", () => {
		expect(code(() => parseFormula("{a}.constructor"))).toBe("SYNTAX");
		expect(code(() => parseFormula("{a}.__proto__"))).toBe("SYNTAX");
	});

	it("cannot call non-whitelisted names even if they are JS globals", () => {
		expect(code(() => run("constructor(1)"))).toBe("UNKNOWN_FN");
		expect(code(() => run("eval(1)"))).toBe("UNKNOWN_FN");
		expect(code(() => run("Function(1)"))).toBe("UNKNOWN_FN");
		expect(code(() => run("require(1)"))).toBe("UNKNOWN_FN");
	});

	it("resolver output outside the Val union is rejected (TYPE)", () => {
		const badCtx: FormulaContext = {
			resolve: () => ({ evil: true } as unknown as Val),
			now: FIXED_NOW,
			tz: "UTC",
		};
		expect(code(() => evaluateFormula(parseFormula("{x}"), badCtx))).toBe("TYPE");
	});

	it("evaluating a constant AST is deterministic and pure", () => {
		const ast = parseFormula("ROUND(3.14159, 2) + 1");
		const first = evaluateFormula(ast, ctx());
		const second = evaluateFormula(ast, ctx());
		expect(first).toBe(second); // deterministic across runs
		expect(first as number).toBeCloseTo(4.14, 10);
	});
});

/* ------------------------------ function docs ----------------------------- */

describe("FORMULA_FUNCTIONS metadata", () => {
	it("has one entry per whitelisted function with required fields", () => {
		expect(FORMULA_FUNCTIONS.length).toBeGreaterThanOrEqual(25);
		for (const doc of FORMULA_FUNCTIONS) {
			expect(doc.name).toBe(doc.name.toUpperCase());
			expect(["number", "logic", "text", "date"]).toContain(doc.category);
			expect(doc.signature.length).toBeGreaterThan(0);
			expect(doc.description.length).toBeGreaterThan(0);
			expect(doc.example.length).toBeGreaterThan(0);
		}
	});

	it("every documented function is actually callable (name resolves)", () => {
		// A smoke check: names are unique.
		const names = FORMULA_FUNCTIONS.map((d) => d.name);
		expect(new Set(names).size).toBe(names.length);
	});
});
