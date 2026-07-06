/**
 * Formula tokenizer: source string -> flat token array.
 *
 * Security note: variables are ONLY reachable via the `{dotted.path}` token.
 * There is no bare-identifier-as-data token and no `.` operator, so there is
 * no lexical path from source text to JS member access.
 */

import { FormulaError } from "./errors";

export type TokenType =
	| "NUMBER"
	| "STRING"
	| "BOOLEAN"
	| "VAR"
	| "IDENT"
	| "OP"
	| "LPAREN"
	| "RPAREN"
	| "COMMA"
	| "EOF";

export type Token = {
	type: TokenType;
	value: string;
	/** Numeric literal value, only set when type === "NUMBER". */
	num?: number;
	/** Boolean literal value, only set when type === "BOOLEAN". */
	bool?: boolean;
	pos: number;
};

const OPERATORS = ["<>", "==", "!=", "<=", ">=", "<", ">", "+", "-", "*", "/"];

function isDigit(ch: string): boolean {
	return ch >= "0" && ch <= "9";
}

function isIdentStart(ch: string): boolean {
	return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_";
}

function isIdentChar(ch: string): boolean {
	return isIdentStart(ch) || isDigit(ch);
}

function isVarPathChar(ch: string): boolean {
	return isIdentChar(ch) || ch === ".";
}

export function tokenize(src: string): Token[] {
	const tokens: Token[] = [];
	let i = 0;
	const len = src.length;

	while (i < len) {
		const ch = src[i];

		if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
			i++;
			continue;
		}

		if (ch === "(") {
			tokens.push({ type: "LPAREN", value: "(", pos: i });
			i++;
			continue;
		}
		if (ch === ")") {
			tokens.push({ type: "RPAREN", value: ")", pos: i });
			i++;
			continue;
		}
		if (ch === ",") {
			tokens.push({ type: "COMMA", value: ",", pos: i });
			i++;
			continue;
		}

		if (ch === "{") {
			const start = i;
			i++;
			const pathStart = i;
			while (i < len && isVarPathChar(src[i])) i++;
			if (i >= len || src[i] !== "}") {
				throw new FormulaError(
					"SYNTAX",
					`Unterminated or invalid variable reference starting at position ${start}`
				);
			}
			const path = src.slice(pathStart, i);
			if (path.length === 0) {
				throw new FormulaError("SYNTAX", `Empty variable reference at position ${start}`);
			}
			i++; // consume '}'
			tokens.push({ type: "VAR", value: path, pos: start });
			continue;
		}

		if (ch === '"' || ch === "'") {
			const quote = ch;
			const start = i;
			i++;
			let value = "";
			let closed = false;
			while (i < len) {
				const c = src[i];
				if (c === quote) {
					closed = true;
					i++;
					break;
				}
				if (c === "\\") {
					const next = src[i + 1];
					if (next === undefined) break;
					switch (next) {
						case "n":
							value += "\n";
							break;
						case "t":
							value += "\t";
							break;
						case "\\":
							value += "\\";
							break;
						case '"':
							value += '"';
							break;
						case "'":
							value += "'";
							break;
						default:
							value += next;
							break;
					}
					i += 2;
					continue;
				}
				value += c;
				i++;
			}
			if (!closed) {
				throw new FormulaError("SYNTAX", `Unterminated string literal starting at position ${start}`);
			}
			tokens.push({ type: "STRING", value, pos: start });
			continue;
		}

		if (isDigit(ch) || (ch === "." && isDigit(src[i + 1] ?? ""))) {
			const start = i;
			let sawDot = false;
			while (i < len) {
				const c = src[i];
				if (isDigit(c)) {
					i++;
					continue;
				}
				if (c === "." && !sawDot) {
					sawDot = true;
					i++;
					continue;
				}
				break;
			}
			const raw = src.slice(start, i);
			const num = Number(raw);
			if (!Number.isFinite(num)) {
				throw new FormulaError("SYNTAX", `Invalid number literal "${raw}" at position ${start}`);
			}
			tokens.push({ type: "NUMBER", value: raw, num, pos: start });
			continue;
		}

		if (isIdentStart(ch)) {
			const start = i;
			while (i < len && isIdentChar(src[i])) i++;
			const raw = src.slice(start, i);
			const lower = raw.toLowerCase();
			if (lower === "true" || lower === "false") {
				tokens.push({ type: "BOOLEAN", value: raw, bool: lower === "true", pos: start });
			} else {
				tokens.push({ type: "IDENT", value: raw, pos: start });
			}
			continue;
		}

		// Operators, longest-match first.
		let matched = false;
		for (const op of OPERATORS) {
			if (src.startsWith(op, i)) {
				tokens.push({ type: "OP", value: op === "<>" ? "!=" : op, pos: i });
				i += op.length;
				matched = true;
				break;
			}
		}
		if (matched) continue;

		throw new FormulaError("SYNTAX", `Unexpected character "${ch}" at position ${i}`);
	}

	tokens.push({ type: "EOF", value: "", pos: len });
	return tokens;
}
