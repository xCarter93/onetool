/** AST node types, runtime value type, and parse/limit constants. No dependencies. */

export type Val = number | string | boolean | Date | null;

export type NumNode = { kind: "Num"; value: number };
export type StrNode = { kind: "Str"; value: string };
export type BoolNode = { kind: "Bool"; value: boolean };
export type VarNode = { kind: "Var"; path: string };
export type UnaryNode = { kind: "Unary"; op: "-"; operand: FormulaAst };
export type BinaryOp = "==" | "!=" | "<" | "<=" | ">" | ">=" | "+" | "-" | "*" | "/";
export type BinaryNode = { kind: "Binary"; op: BinaryOp; left: FormulaAst; right: FormulaAst };
export type CallNode = { kind: "Call"; name: string; args: FormulaAst[] };

export type FormulaAst = NumNode | StrNode | BoolNode | VarNode | UnaryNode | BinaryNode | CallNode;

export const FORMULA_LIMITS = {
	maxLen: 2000,
	maxDepth: 32,
	maxNodes: 500,
	maxStrLen: 10000,
} as const;
