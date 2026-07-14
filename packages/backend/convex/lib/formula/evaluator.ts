/**
 * Tree-walk interpreter. Pure: reads only the AST and the provided context.
 * Never touches JS object internals — the AST has no member-access node, so
 * property access is unreachable by construction.
 */

import type { BinaryOp, FormulaAst, Val } from "./ast";
import type { FormulaContext } from "./context";
import { parseFormula } from "./parser";
import { FormulaError } from "./errors";
import { getFunctionSpec } from "./functions";
import {
	compareValues,
	guardNumber,
	normalizeResolved,
	toNumber,
	valuesEqual,
} from "./coerce";

function requireBoolean(v: Val, label: string): boolean {
	if (typeof v !== "boolean") {
		throw new FormulaError("TYPE", `${label} expected a boolean`);
	}
	return v;
}

function evalNode(node: FormulaAst, ctx: FormulaContext): Val {
	switch (node.kind) {
		case "Num":
			return node.value;
		case "Str":
			return node.value;
		case "Bool":
			return node.value;
		case "Var":
			return normalizeResolved(ctx.resolve(node.path));
		case "Unary": {
			const v = toNumber(evalNode(node.operand, ctx), "unary -");
			return guardNumber(-v, "unary -");
		}
		case "Binary":
			return evalBinary(node.op, node.left, node.right, ctx);
		case "Call":
			return evalCall(node.name, node.args, ctx);
		default: {
			// Exhaustiveness guard: `node` is `never` here.
			const _exhaustive: never = node;
			return _exhaustive;
		}
	}
}

function evalBinary(
	op: BinaryOp,
	leftNode: FormulaAst,
	rightNode: FormulaAst,
	ctx: FormulaContext
): Val {
	// Equality operators compare values directly (no numeric-only requirement).
	// tz is threaded through because a date compares in its own day-space.
	if (op === "==" || op === "!=") {
		const l = evalNode(leftNode, ctx);
		const r = evalNode(rightNode, ctx);
		const eq = valuesEqual(l, r, ctx.tz);
		return op === "==" ? eq : !eq;
	}

	if (op === "<" || op === "<=" || op === ">" || op === ">=") {
		const l = evalNode(leftNode, ctx);
		const r = evalNode(rightNode, ctx);
		const c = compareValues(l, r, ctx.tz);
		switch (op) {
			case "<":
				return c < 0;
			case "<=":
				return c <= 0;
			case ">":
				return c > 0;
			default:
				return c >= 0;
		}
	}

	// Arithmetic: numeric only (use CONCAT for strings).
	const a = toNumber(evalNode(leftNode, ctx), "left operand");
	const b = toNumber(evalNode(rightNode, ctx), "right operand");
	switch (op) {
		case "+":
			return guardNumber(a + b, "+");
		case "-":
			return guardNumber(a - b, "-");
		case "*":
			return guardNumber(a * b, "*");
		case "/":
			if (b === 0) throw new FormulaError("DIV_ZERO", "Division by zero");
			return guardNumber(a / b, "/");
		default:
			throw new FormulaError("SYNTAX", `Unknown operator "${op}"`);
	}
}

function checkArity(name: string, min: number, max: number, count: number): void {
	if (count < min || count > max) {
		const range = max === Infinity ? `at least ${min}` : min === max ? `${min}` : `${min}-${max}`;
		throw new FormulaError(
			"ARITY",
			`${name} expects ${range} argument(s), got ${count}`
		);
	}
}

function evalCall(rawName: string, args: FormulaAst[], ctx: FormulaContext): Val {
	const name = rawName.toUpperCase();
	const spec = getFunctionSpec(name);
	if (!spec) {
		throw new FormulaError("UNKNOWN_FN", `Unknown function "${rawName}"`);
	}
	checkArity(name, spec.minArgs, spec.maxArgs, args.length);

	// Special forms: lazy / short-circuit — do NOT eagerly evaluate all args.
	if (spec.special === "IF") {
		const cond = requireBoolean(evalNode(args[0], ctx), "IF condition");
		return evalNode(cond ? args[1] : args[2], ctx);
	}
	if (spec.special === "AND") {
		for (let i = 0; i < args.length; i++) {
			const v = requireBoolean(evalNode(args[i], ctx), `AND arg ${i + 1}`);
			if (!v) return false;
		}
		return true;
	}
	if (spec.special === "OR") {
		for (let i = 0; i < args.length; i++) {
			const v = requireBoolean(evalNode(args[i], ctx), `OR arg ${i + 1}`);
			if (v) return true;
		}
		return false;
	}

	if (!spec.fn) {
		throw new FormulaError("UNKNOWN_FN", `Function "${rawName}" is not callable`);
	}
	const values = args.map((a) => evalNode(a, ctx));
	return spec.fn(values, ctx);
}

export function evaluateFormula(ast: FormulaAst, ctx: FormulaContext): Val {
	return evalNode(ast, ctx);
}

export function runFormula(src: string, ctx: FormulaContext): Val {
	return evaluateFormula(parseFormula(src), ctx);
}
