import { describe, it, expect } from "vitest";
import {
	cellKey,
	initializeCellValues,
	rebuildRecordsFromCells,
	validateCells,
	getFieldMeta,
} from "./editable-cells";
import type { FieldMapping } from "@/types/csv-import";

describe("cellKey", () => {
	it("returns rowIndex-field format", () => {
		expect(cellKey(0, "companyName")).toBe("0-companyName");
		expect(cellKey(3, "contact.firstName")).toBe("3-contact.firstName");
	});
});

describe("initializeCellValues", () => {
	it("creates Map with entries for each row x column combination", () => {
		const records: Record<string, unknown>[] = [
			{ companyName: "Acme", status: "active" },
			{ companyName: "Beta", status: "lead" },
		];
		const columns = ["companyName", "status"];

		const result = initializeCellValues(records, columns);

		expect(result.size).toBe(4);
		expect(result.get("0-companyName")).toBe("Acme");
		expect(result.get("0-status")).toBe("active");
		expect(result.get("1-companyName")).toBe("Beta");
		expect(result.get("1-status")).toBe("lead");
	});

	it("handles dot-namespaced fields by resolving from nested structure", () => {
		const records: Record<string, unknown>[] = [
			{
				companyName: "Acme",
				contacts: [{ firstName: "John", lastName: "Doe" }],
			},
		];
		const columns = ["companyName", "contact.firstName", "contact.lastName"];

		const result = initializeCellValues(records, columns);

		expect(result.get("0-contact.firstName")).toBe("John");
		expect(result.get("0-contact.lastName")).toBe("Doe");
	});

	it("stores empty string for undefined/null values", () => {
		const records: Record<string, unknown>[] = [
			{ companyName: "Acme" },
		];
		const columns = ["companyName", "notes"];

		const result = initializeCellValues(records, columns);

		expect(result.get("0-notes")).toBe("");
	});
});

describe("rebuildRecordsFromCells", () => {
	it("reconstructs ImportRecord[] from cellValues", () => {
		const cellValues = new Map<string, string>([
			["0-companyName", "Acme Corp"],
			["0-status", "active"],
			["1-companyName", "Beta LLC"],
			["1-status", "lead"],
		]);
		const mappings: FieldMapping[] = [
			{
				csvColumn: "Company",
				schemaField: "companyName",
				confidence: 1,
				dataType: "string",
				isRequired: true,
			},
			{
				csvColumn: "Status",
				schemaField: "status",
				confidence: 1,
				dataType: "string",
				isRequired: true,
			},
		];

		const records = rebuildRecordsFromCells(cellValues, mappings, 2);

		expect(records).toHaveLength(2);
		expect(records[0].companyName).toBe("Acme Corp");
		expect(records[0].status).toBe("active");
		expect(records[1].companyName).toBe("Beta LLC");
		expect(records[1].status).toBe("lead");
	});

	it("reconstructs nested contacts from dot-namespaced keys", () => {
		const cellValues = new Map<string, string>([
			["0-companyName", "Acme"],
			["0-status", "active"],
			["0-contact.firstName", "John"],
			["0-contact.lastName", "Doe"],
		]);
		const mappings: FieldMapping[] = [
			{
				csvColumn: "Company",
				schemaField: "companyName",
				confidence: 1,
				dataType: "string",
				isRequired: true,
			},
			{
				csvColumn: "Status",
				schemaField: "status",
				confidence: 1,
				dataType: "string",
				isRequired: true,
			},
			{
				csvColumn: "First",
				schemaField: "contact.firstName",
				confidence: 1,
				dataType: "string",
				isRequired: false,
			},
			{
				csvColumn: "Last",
				schemaField: "contact.lastName",
				confidence: 1,
				dataType: "string",
				isRequired: false,
			},
		];

		const records = rebuildRecordsFromCells(cellValues, mappings, 1);

		expect(records[0].contacts).toEqual([
			{ firstName: "John", lastName: "Doe" },
		]);
	});

	it("omits contacts/properties arrays when all sub-fields are empty", () => {
		const cellValues = new Map<string, string>([
			["0-companyName", "Acme"],
			["0-status", "active"],
			["0-contact.firstName", ""],
			["0-contact.lastName", ""],
		]);
		const mappings: FieldMapping[] = [
			{
				csvColumn: "Company",
				schemaField: "companyName",
				confidence: 1,
				dataType: "string",
				isRequired: true,
			},
			{
				csvColumn: "Status",
				schemaField: "status",
				confidence: 1,
				dataType: "string",
				isRequired: true,
			},
			{
				csvColumn: "First",
				schemaField: "contact.firstName",
				confidence: 1,
				dataType: "string",
				isRequired: false,
			},
			{
				csvColumn: "Last",
				schemaField: "contact.lastName",
				confidence: 1,
				dataType: "string",
				isRequired: false,
			},
		];

		const records = rebuildRecordsFromCells(cellValues, mappings, 1);

		expect(records[0].contacts).toBeUndefined();
	});
});

describe("validateCells", () => {
	it("returns Map keyed by cellKey with error messages", () => {
		const cellValues = new Map<string, string>([
			["0-companyName", ""],
			["0-status", "invalid-status"],
		]);
		const mappings: FieldMapping[] = [
			{
				csvColumn: "Company",
				schemaField: "companyName",
				confidence: 1,
				dataType: "string",
				isRequired: true,
			},
			{
				csvColumn: "Status",
				schemaField: "status",
				confidence: 1,
				dataType: "string",
				isRequired: true,
			},
		];

		const errors = validateCells(cellValues, mappings, 1);

		expect(errors.get("0-companyName")).toBe("Company name is required");
		expect(errors.get("0-status")).toContain("Status must be one of");
	});

	it("returns empty map for valid records", () => {
		const cellValues = new Map<string, string>([
			["0-companyName", "Acme"],
			["0-status", "active"],
		]);
		const mappings: FieldMapping[] = [
			{
				csvColumn: "Company",
				schemaField: "companyName",
				confidence: 1,
				dataType: "string",
				isRequired: true,
			},
			{
				csvColumn: "Status",
				schemaField: "status",
				confidence: 1,
				dataType: "string",
				isRequired: true,
			},
		];

		const errors = validateCells(cellValues, mappings, 1);

		expect(errors.size).toBe(0);
	});
});

describe("getFieldMeta", () => {
	it('returns meta for enum field "status"', () => {
		const meta = getFieldMeta("status");
		expect(meta).toBeDefined();
		expect(meta!.type).toBe("enum");
		expect(meta!.required).toBe(true);
		expect(meta!.options).toContain("active");
		expect(meta!.options).toContain("lead");
	});

	it('returns meta for dot-namespaced field "contact.firstName"', () => {
		const meta = getFieldMeta("contact.firstName");
		expect(meta).toBeDefined();
		expect(meta!.type).toBe("string");
		expect(meta!.required).toBe(false);
	});

	it("returns undefined for unknown field", () => {
		expect(getFieldMeta("unknownField")).toBeUndefined();
	});
});
