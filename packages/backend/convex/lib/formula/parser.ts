/**
 * Pratt / precedence-climbing parser: token array -> AST.
 *
 * Grammar (lowest -> highest precedence):
 *   1. == !=            (equality)
 *   2. < <= > >=        (relational)
 *   3. + -              (additive)
 *   4. * /              (multiplicative)
 *   5. unary -          (prefix)
 *   6. primary          number/string/bool/{var}/IDENT(args)/( expr )
 *
 * A bare IDENT not immediately followed by "(" is a SYNTAX error — identifiers
 * are ONLY function names. Data comes exclusively via {var} tokens. There is no
 * member-access operator, so `{a}.b` fails: the `.b` cannot be consumed.
 */

import type { BinaryOp, FormulaAst } from "./ast";
import { FORMULA_LIMITS } from "./ast";
import { FormulaError } from "./errors";
import { tokenize, type Token } from "./tokenizer";

const EQUALITY_OPS = new Set(["==", "!="]);
const RELATIONAL_OPS = new Set(["<", "<=", ">", ">="]);
const ADDITIVE_OPS = new Set(["+", "-"]);
const MULTIPLICATIVE_OPS = new Set(["*", "/"]);

class Parser {
	private tokens: Token[];
	private pos = 0;
	private nodeCount = 0;
	private depth = 0;

	constructor(tokens: Token[]) {
		this.tokens = tokens;
	}

	private peek(): Token {
		return this.tokens[this.pos];
	}

	private next(): Token {
		return this.tokens[this.pos++];
	}

	private countNode(): void {
		this.nodeCount++;
		if (this.nodeCount > FORMULA_LIMITS.maxNodes) {
			throw new FormulaError(
				"LIMIT",
				`Formula has too many nodes (limit ${FORMULA_LIMITS.maxNodes})`
			);
		}
	}

	private enter(): void {
		this.depth++;
		if (this.depth > FORMULA_LIMITS.maxDepth) {
			throw new FormulaError(
				"LIMIT",
				`Formula nesting is too deep (limit ${FORMULA_LIMITS.maxDepth})`
			);
		}
	}

	private leave(): void {
		this.depth--;
	}

	parse(): FormulaAst {
		if (this.peek().type === "EOF") {
			throw new FormulaError("SYNTAX", "Empty formula");
		}
		const expr = this.parseEquality();
		const tok = this.peek();
		if (tok.type !== "EOF") {
			throw new FormulaError(
				"SYNTAX",
				`Unexpected token "${tok.value || tok.type}" at position ${tok.pos}`
			);
		}
		return expr;
	}

	private parseBinaryLevel(ops: Set<string>, nextLevel: () => FormulaAst): FormulaAst {
		this.enter();
		let left = nextLevel();
		while (this.peek().type === "OP" && ops.has(this.peek().value)) {
			const opTok = this.next();
			const right = nextLevel();
			this.countNode();
			left = { kind: "Binary", op: opTok.value as BinaryOp, left, right };
		}
		this.leave();
		return left;
	}

	private parseEquality(): FormulaAst {
		return this.parseBinaryLevel(EQUALITY_OPS, () => this.parseRelational());
	}

	private parseRelational(): FormulaAst {
		return this.parseBinaryLevel(RELATIONAL_OPS, () => this.parseAdditive());
	}

	private parseAdditive(): FormulaAst {
		return this.parseBinaryLevel(ADDITIVE_OPS, () => this.parseMultiplicative());
	}

	private parseMultiplicative(): FormulaAst {
		return this.parseBinaryLevel(MULTIPLICATIVE_OPS, () => this.parseUnary());
	}

	private parseUnary(): FormulaAst {
		const tok = this.peek();
		if (tok.type === "OP" && tok.value === "-") {
			this.next();
			this.enter();
			const operand = this.parseUnary();
			this.leave();
			this.countNode();
			return { kind: "Unary", op: "-", operand };
		}
		// A leading "+" is not a valid unary operator in this grammar.
		if (tok.type === "OP" && tok.value === "+") {
			throw new FormulaError("SYNTAX", `Unexpected unary "+" at position ${tok.pos}`);
		}
		return this.parsePrimary();
	}

	private parsePrimary(): FormulaAst {
		const tok = this.peek();

		switch (tok.type) {
			case "NUMBER": {
				this.next();
				this.countNode();
				return { kind: "Num", value: tok.num as number };
			}
			case "STRING": {
				this.next();
				this.countNode();
				return { kind: "Str", value: tok.value };
			}
			case "BOOLEAN": {
				this.next();
				this.countNode();
				return { kind: "Bool", value: tok.bool as boolean };
			}
			case "VAR": {
				this.next();
				this.countNode();
				return { kind: "Var", path: tok.value };
			}
			case "LPAREN": {
				this.next();
				this.enter();
				const expr = this.parseEquality();
				this.leave();
				const close = this.peek();
				if (close.type !== "RPAREN") {
					throw new FormulaError(
						"SYNTAX",
						`Expected ")" at position ${close.pos}`
					);
				}
				this.next();
				return expr;
			}
			case "IDENT": {
				this.next();
				const afterName = this.peek();
				if (afterName.type !== "LPAREN") {
					throw new FormulaError(
						"SYNTAX",
						`Bare identifier "${tok.value}" at position ${tok.pos} is not allowed; ` +
							`identifiers must be function calls, e.g. ${tok.value}(...). ` +
							`Reference data with {path}.`
					);
				}
				this.next(); // consume "("
				const args: FormulaAst[] = [];
				if (this.peek().type !== "RPAREN") {
					this.enter();
					args.push(this.parseEquality());
					while (this.peek().type === "COMMA") {
						this.next();
						args.push(this.parseEquality());
					}
					this.leave();
				}
				const close = this.peek();
				if (close.type !== "RPAREN") {
					throw new FormulaError(
						"SYNTAX",
						`Expected ")" to close call to "${tok.value}" at position ${close.pos}`
					);
				}
				this.next();
				this.countNode();
				return { kind: "Call", name: tok.value, args };
			}
			case "OP":
				throw new FormulaError(
					"SYNTAX",
					`Unexpected operator "${tok.value}" at position ${tok.pos}`
				);
			case "RPAREN":
				throw new FormulaError("SYNTAX", `Unexpected ")" at position ${tok.pos}`);
			case "COMMA":
				throw new FormulaError("SYNTAX", `Unexpected "," at position ${tok.pos}`);
			case "EOF":
				throw new FormulaError("SYNTAX", `Unexpected end of formula`);
			default:
				throw new FormulaError(
					"SYNTAX",
					`Unexpected token at position ${tok.pos}`
				);
		}
	}
}

export function parseFormula(src: string): FormulaAst {
	if (typeof src !== "string") {
		throw new FormulaError("SYNTAX", "Formula source must be a string");
	}
	if (src.length > FORMULA_LIMITS.maxLen) {
		throw new FormulaError(
			"LIMIT",
			`Formula source is too long (${src.length} > ${FORMULA_LIMITS.maxLen})`
		);
	}
	const tokens = tokenize(src);
	return new Parser(tokens).parse();
}

/** Dedup'd list of every {var} path referenced in the AST (for scope analysis). */
export function collectReferencedPaths(ast: FormulaAst): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	const visit = (node: FormulaAst): void => {
		switch (node.kind) {
			case "Var":
				if (!seen.has(node.path)) {
					seen.add(node.path);
					out.push(node.path);
				}
				return;
			case "Unary":
				visit(node.operand);
				return;
			case "Binary":
				visit(node.left);
				visit(node.right);
				return;
			case "Call":
				for (const arg of node.args) visit(arg);
				return;
			default:
				return;
		}
	};
	visit(ast);
	return out;
}
