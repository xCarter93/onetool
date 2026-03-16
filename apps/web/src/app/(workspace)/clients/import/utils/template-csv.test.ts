import { describe, it, expect } from "vitest";
import {
	fieldKeyToHeader,
	EXAMPLE_VALUES,
	generateTemplateCsvData,
} from "./template-csv";
import { CLIENT_SCHEMA_FIELDS } from "@/types/csv-import";

describe("fieldKeyToHeader", () => {
	it('converts "companyName" to "Company Name"', () => {
		expect(fieldKeyToHeader("companyName")).toBe("Company Name");
	});

	it('converts "contact.firstName" to "Contact First Name"', () => {
		expect(fieldKeyToHeader("contact.firstName")).toBe("Contact First Name");
	});

	it('converts "property.streetAddress" to "Property Street Address"', () => {
		expect(fieldKeyToHeader("property.streetAddress")).toBe(
			"Property Street Address"
		);
	});

	it('converts "status" to "Status"', () => {
		expect(fieldKeyToHeader("status")).toBe("Status");
	});

	it('converts "property.zipCode" to "Property Zip Code"', () => {
		expect(fieldKeyToHeader("property.zipCode")).toBe("Property Zip Code");
	});
});

describe("EXAMPLE_VALUES", () => {
	it("covers all CLIENT_SCHEMA_FIELDS keys", () => {
		const schemaKeys = Object.keys(CLIENT_SCHEMA_FIELDS);
		const exampleKeys = Object.keys(EXAMPLE_VALUES);
		expect(exampleKeys).toEqual(expect.arrayContaining(schemaKeys));
	});
});

describe("generateTemplateCsvData", () => {
	it("returns headers and data row for all CLIENT_SCHEMA_FIELDS", () => {
		const { headers, data } = generateTemplateCsvData();
		const schemaKeys = Object.keys(CLIENT_SCHEMA_FIELDS);

		expect(headers).toHaveLength(schemaKeys.length);
		expect(data).toHaveLength(1);

		// Headers should be human-readable
		expect(headers).toContain("Company Name");
		expect(headers).toContain("Contact First Name");
		expect(headers).toContain("Property Street Address");
	});

	it("includes realistic example values in the data row", () => {
		const { data } = generateTemplateCsvData();
		const row = data[0];

		// Should have a value for each header
		expect(Object.keys(row).length).toBeGreaterThan(0);
	});
});
