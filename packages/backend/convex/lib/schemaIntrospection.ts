/**
 * Runtime schema introspection for the assistant's describeSchema tool.
 *
 * Reads field/type/enum info straight off the live Convex schema validators
 * (schema.tables[name].validator) so it can never drift from schema.ts — there
 * is no hand-maintained catalog to keep in sync. Table descriptions are the
 * only hand-written layer, and they are additive: an unannotated table still
 * describes fine, it just lacks the one-line hint.
 */
import schema from "../schema";

// Business-data tables the assistant may describe. Deliberately excludes auth,
// billing, portal, and internal plumbing tables.
export const DESCRIBABLE_TABLES = [
	"clients",
	"clientContacts",
	"clientProperties",
	"projects",
	"tasks",
	"quotes",
	"quoteLineItems",
	"invoices",
	"invoiceLineItems",
	"payments",
	"activities",
	"skus",
	"emailMessages",
] as const;

export type DescribableTable = (typeof DESCRIBABLE_TABLES)[number];

const TABLE_DESCRIPTIONS: Record<DescribableTable, string> = {
	clients: "Customers and prospects the organization serves.",
	clientContacts: "People associated with a client (name, email, phone, role).",
	clientProperties: "Physical service locations/addresses belonging to a client.",
	projects: "Jobs/engagements for a client (one-off or recurring).",
	tasks: "Scheduled work items or visits, optionally tied to a project.",
	quotes: "Price quotes/proposals sent to clients.",
	quoteLineItems: "Individual line items on a quote.",
	invoices: "Invoices issued to clients and their payment status.",
	invoiceLineItems: "Individual line items on an invoice.",
	payments: "Payments recorded against invoices.",
	activities: "Audit-trail log of changes to records.",
	skus: "Reusable service/product templates (price book).",
	emailMessages: "Email messages synced or sent for the org, linked to clients.",
};

// Stop expanding nested objects past this depth to keep output bounded.
const MAX_DEPTH = 3;

// Structural view of a Convex validator instance. The runtime shape is
// documented (stack.convex.dev/types-cookbook) but only loosely typed, so we
// read it structurally and branch on `kind`. `value` is a literal's primitive
// OR a record's value-validator depending on `kind`.
interface RawValidator {
	kind:
		| "id"
		| "string"
		| "float64"
		| "int64"
		| "boolean"
		| "bytes"
		| "null"
		| "any"
		| "object"
		| "literal"
		| "array"
		| "record"
		| "union";
	isOptional: "optional" | "required";
	fields?: Record<string, RawValidator>;
	members?: RawValidator[];
	element?: RawValidator;
	key?: RawValidator;
	value?: unknown;
	tableName?: string;
}

export interface SchemaFieldInfo {
	type: string;
	optional: boolean;
	enumValues?: string[];
	of?: string;
	fields?: Record<string, SchemaFieldInfo>;
	literal?: string;
}

export interface TableSchema {
	table: string;
	description?: string;
	fields: Record<string, SchemaFieldInfo>;
}

export interface TableSummary {
	table: string;
	description?: string;
	fieldCount: number;
}

function scalarType(kind: RawValidator["kind"]): string {
	return kind === "float64" || kind === "int64" ? "number" : kind;
}

// Short type label for a union/record member; keeps an id's target table.
function memberLabel(validator: RawValidator): string {
	return validator.kind === "id" && validator.tableName
		? `id(${validator.tableName})`
		: scalarType(validator.kind);
}

function literalToString(value: unknown): string {
	return typeof value === "bigint" ? value.toString() : String(value);
}

// Returns literal values if every union member is a literal (null members are
// allowed and skipped); null if the union mixes in non-literal members.
function unionEnumValues(members: RawValidator[]): string[] | null {
	const values: string[] = [];
	for (const m of members) {
		if (m.kind === "literal") values.push(literalToString(m.value));
		else if (m.kind === "null") continue;
		else return null;
	}
	return values.length > 0 ? values : null;
}

function describeValidator(validator: RawValidator, depth: number): SchemaFieldInfo {
	const optional = validator.isOptional === "optional";

	switch (validator.kind) {
		case "union": {
			const members = validator.members ?? [];
			const enumValues = unionEnumValues(members);
			if (enumValues) return { type: "enum", optional, enumValues };
			// A nullable id (id + null) is really an optional foreign key — keep
			// its target table instead of flattening to "id | null".
			const nonNull = members.filter((m) => m.kind !== "null");
			if (nonNull.length === 1 && nonNull[0].kind === "id") {
				return { type: "id", optional: true, of: nonNull[0].tableName };
			}
			const memberTypes = [...new Set(members.map(memberLabel))];
			return { type: "union", optional, of: memberTypes.join(" | ") };
		}
		case "literal":
			return { type: "literal", optional, literal: literalToString(validator.value) };
		case "id":
			return { type: "id", optional, of: validator.tableName };
		case "array": {
			const el = validator.element;
			if (!el) return { type: "array", optional };
			if (el.kind === "union") {
				const enumValues = unionEnumValues(el.members ?? []);
				if (enumValues) return { type: "array", optional, of: "enum", enumValues };
			}
			if (el.kind === "object" && depth < MAX_DEPTH) {
				return {
					type: "array",
					optional,
					of: "object",
					fields: describeFields(el.fields ?? {}, depth + 1),
				};
			}
			return { type: "array", optional, of: scalarType(el.kind) };
		}
		case "object":
			if (depth >= MAX_DEPTH) return { type: "object", optional };
			return { type: "object", optional, fields: describeFields(validator.fields ?? {}, depth + 1) };
		case "record": {
			// `.value` here is the value-validator (not a literal primitive).
			const valueValidator = validator.value as RawValidator | undefined;
			const keyLabel = validator.key ? memberLabel(validator.key) : "string";
			const valueLabel = valueValidator ? memberLabel(valueValidator) : "any";
			return { type: "record", optional, of: `${keyLabel} → ${valueLabel}` };
		}
		default:
			return { type: scalarType(validator.kind), optional };
	}
}

function describeFields(
	fields: Record<string, RawValidator>,
	depth: number
): Record<string, SchemaFieldInfo> {
	const out: Record<string, SchemaFieldInfo> = {};
	for (const [name, validator] of Object.entries(fields)) {
		out[name] = describeValidator(validator, depth);
	}
	return out;
}

// schema.tables[table].validator is the documented introspection entry point;
// it is a VObject for object tables and excludes system fields. The optional
// chain guards the (type-impossible) case of an allowlist entry with no schema
// table, so the tool degrades to null instead of throwing inside the agent.
function tableValidator(table: DescribableTable): RawValidator | undefined {
	return schema.tables[table]?.validator as unknown as RawValidator | undefined;
}

export function isDescribableTable(table: string): table is DescribableTable {
	return (DESCRIBABLE_TABLES as readonly string[]).includes(table);
}

export function listDescribableTables(): TableSummary[] {
	return DESCRIBABLE_TABLES.map((table) => {
		// Count from describeTable so the summary can never disagree with the
		// detail — which also includes the injected _id/_creationTime fields.
		const described = describeTable(table);
		return {
			table,
			description: TABLE_DESCRIPTIONS[table],
			fieldCount: described ? Object.keys(described.fields).length : 0,
		};
	});
}

export function describeTable(table: string): TableSchema | null {
	if (!isDescribableTable(table)) return null;
	const root = tableValidator(table);
	if (!root) return null;
	// The validator omits system fields, so add them explicitly.
	const fields: Record<string, SchemaFieldInfo> = {
		_id: { type: "id", optional: false, of: table },
		_creationTime: { type: "number", optional: false },
	};
	if (root.kind === "object" && root.fields) {
		Object.assign(fields, describeFields(root.fields, 1));
	}
	return { table, description: TABLE_DESCRIPTIONS[table], fields };
}
