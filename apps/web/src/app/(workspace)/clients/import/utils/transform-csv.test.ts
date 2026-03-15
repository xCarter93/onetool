import { describe, it, expect } from "vitest";
import {
	buildImportRecords,
	validateImportRecords,
	transformValue,
} from "./transform-csv";
import type { FieldMapping } from "@/types/csv-import";

describe("buildImportRecords", () => {
	it("should produce contacts array from contact.firstName mapping", () => {
		const rows = [{ "First Name": "John", "Last Name": "Doe" }];
		const mappings: FieldMapping[] = [
			{
				csvColumn: "First Name",
				schemaField: "contact.firstName",
				confidence: 1,
				dataType: "string",
				isRequired: false,
			},
			{
				csvColumn: "Last Name",
				schemaField: "contact.lastName",
				confidence: 1,
				dataType: "string",
				isRequired: false,
			},
		];

		const records = buildImportRecords(rows, mappings);
		expect(records[0].contacts).toEqual([
			{ firstName: "John", lastName: "Doe" },
		]);
	});

	it("should produce properties array from property.streetAddress mapping", () => {
		const rows = [{ Address: "123 Main St" }];
		const mappings: FieldMapping[] = [
			{
				csvColumn: "Address",
				schemaField: "property.streetAddress",
				confidence: 1,
				dataType: "string",
				isRequired: false,
			},
		];

		const records = buildImportRecords(rows, mappings);
		expect(records[0].properties).toEqual([{ streetAddress: "123 Main St" }]);
	});

	it("should omit contacts array when all contact fields are empty/undefined", () => {
		const rows = [{ "Company Name": "Acme", "First Name": "" }];
		const mappings: FieldMapping[] = [
			{
				csvColumn: "Company Name",
				schemaField: "companyName",
				confidence: 1,
				dataType: "string",
				isRequired: true,
			},
			{
				csvColumn: "First Name",
				schemaField: "contact.firstName",
				confidence: 1,
				dataType: "string",
				isRequired: false,
			},
		];

		const records = buildImportRecords(rows, mappings);
		expect(records[0].contacts).toBeUndefined();
	});

	it("should omit properties array when all property fields are empty/undefined", () => {
		const rows = [{ "Company Name": "Acme", Street: "" }];
		const mappings: FieldMapping[] = [
			{
				csvColumn: "Company Name",
				schemaField: "companyName",
				confidence: 1,
				dataType: "string",
				isRequired: true,
			},
			{
				csvColumn: "Street",
				schemaField: "property.streetAddress",
				confidence: 1,
				dataType: "string",
				isRequired: false,
			},
		];

		const records = buildImportRecords(rows, mappings);
		expect(records[0].properties).toBeUndefined();
	});

	it("should handle plain client fields correctly", () => {
		const rows = [{ "Company Name": "Acme", Status: "active" }];
		const mappings: FieldMapping[] = [
			{
				csvColumn: "Company Name",
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

		const records = buildImportRecords(rows, mappings);
		expect(records[0].companyName).toBe("Acme");
		expect(records[0].status).toBe("active");
	});

	it("should exclude __skip__ mappings", () => {
		const rows = [{ "Company Name": "Acme", Junk: "ignore" }];
		const mappings: FieldMapping[] = [
			{
				csvColumn: "Company Name",
				schemaField: "companyName",
				confidence: 1,
				dataType: "string",
				isRequired: true,
			},
			{
				csvColumn: "Junk",
				schemaField: "__skip__",
				confidence: 0,
				dataType: "string",
				isRequired: false,
			},
		];

		const records = buildImportRecords(rows, mappings);
		expect(Object.keys(records[0])).not.toContain("__skip__");
		expect(Object.keys(records[0])).not.toContain("Junk");
	});
});

describe("validateImportRecords", () => {
	it("should return error for missing companyName", () => {
		const records = [
			{ companyName: "", status: "active" as const },
		];

		const errors = validateImportRecords(records);
		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0]).toMatchObject({
			rowIndex: 0,
			field: "companyName",
		});
	});

	it("should return error for invalid status value", () => {
		const records = [
			{ companyName: "Acme", status: "bogus" as any },
		];

		const errors = validateImportRecords(records);
		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0]).toMatchObject({
			rowIndex: 0,
			field: "status",
		});
	});

	it("should return empty array for valid records", () => {
		const records = [
			{ companyName: "Acme", status: "active" as const },
			{ companyName: "Beta", status: "lead" as const },
		];

		const errors = validateImportRecords(records);
		expect(errors).toEqual([]);
	});
});
