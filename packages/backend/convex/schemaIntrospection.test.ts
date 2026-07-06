import { describe, expect, it } from "vitest";
import {
	DESCRIBABLE_TABLES,
	describeTable,
	isDescribableTable,
	listDescribableTables,
} from "./lib/schemaIntrospection";

describe("schema introspection", () => {
	it("lists every describable table with a non-empty field count", () => {
		const tables = listDescribableTables();
		expect(tables.map((t) => t.table).sort()).toEqual([...DESCRIBABLE_TABLES].sort());
		for (const t of tables) {
			expect(t.fieldCount).toBeGreaterThan(0);
			expect(t.description).toBeTruthy();
			// Summary count must match the detail's field count (incl. system fields).
			expect(t.fieldCount).toBe(Object.keys(describeTable(t.table)!.fields).length);
		}
	});

	it("includes system fields on every table", () => {
		for (const table of DESCRIBABLE_TABLES) {
			const described = describeTable(table);
			expect(described).not.toBeNull();
			expect(described!.fields._id.type).toBe("id");
			expect(described!.fields._id.of).toBe(table);
			expect(described!.fields._creationTime.type).toBe("number");
		}
	});

	it("derives enum values from union-of-literal fields", () => {
		const clients = describeTable("clients");
		expect(clients!.fields.status.type).toBe("enum");
		expect(clients!.fields.status.enumValues?.slice().sort()).toEqual(
			["active", "archived", "inactive", "lead"].sort()
		);

		const quotes = describeTable("quotes");
		expect(quotes!.fields.status.type).toBe("enum");
		expect(quotes!.fields.status.enumValues).toEqual(
			expect.arrayContaining(["draft", "sent", "approved", "declined", "expired"])
		);
	});

	it("resolves id references to their target table", () => {
		const projects = describeTable("projects");
		expect(projects!.fields.clientId.type).toBe("id");
		expect(projects!.fields.clientId.of).toBe("clients");
	});

	it("returns null for tables that are not on the allowlist", () => {
		expect(describeTable("organizations")).toBeNull();
		expect(describeTable("stripeWebhookEvents")).toBeNull();
		expect(describeTable("nonexistentTable")).toBeNull();
		expect(isDescribableTable("clients")).toBe(true);
		expect(isDescribableTable("users")).toBe(false);
	});

	it("produces JSON-serializable output for every table", () => {
		for (const table of DESCRIBABLE_TABLES) {
			expect(() => JSON.stringify(describeTable(table))).not.toThrow();
		}
	});
});
