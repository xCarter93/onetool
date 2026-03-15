import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the ai module before importing the tool
vi.mock("ai", () => ({
	generateObject: vi.fn(),
}));

vi.mock("@ai-sdk/openai", () => ({
	openai: vi.fn(() => "mock-model"),
}));

import { generateObject } from "ai";
import { mapSchemaTool } from "./map-schema-tool";

const mockedGenerateObject = vi.mocked(generateObject);

// Test fixtures
const sampleHeaders = [
	"Company",
	"First Name",
	"Email",
	"Street",
	"City",
	"Unknown Col",
];

const sampleRows = [
	{
		Company: "Acme Inc",
		"First Name": "John",
		Email: "john@acme.com",
		Street: "123 Main St",
		City: "Springfield",
		"Unknown Col": "foo",
	},
];

const validLlmResponse = {
	mappings: [
		{
			csvColumn: "Company",
			schemaField: "companyName",
			confidence: 0.95,
			sampleValue: "Acme Inc",
		},
		{
			csvColumn: "First Name",
			schemaField: "contact.firstName",
			confidence: 0.92,
			sampleValue: "John",
		},
		{
			csvColumn: "Email",
			schemaField: "contact.email",
			confidence: 0.98,
			sampleValue: "john@acme.com",
		},
		{
			csvColumn: "Street",
			schemaField: "property.streetAddress",
			confidence: 0.85,
			sampleValue: "123 Main St",
		},
		{
			csvColumn: "City",
			schemaField: "property.city",
			confidence: 0.97,
			sampleValue: "Springfield",
		},
	],
	unmappedColumns: ["Unknown Col"],
};

const responseWithInvalidField = {
	mappings: [
		{
			csvColumn: "Company",
			schemaField: "companyName",
			confidence: 0.95,
			sampleValue: "Acme Inc",
		},
		{
			csvColumn: "First Name",
			schemaField: "nonExistentField",
			confidence: 0.9,
			sampleValue: "John",
		},
	],
	unmappedColumns: ["Email", "Street", "City", "Unknown Col"],
};

const responseWithDuplicateField = {
	mappings: [
		{
			csvColumn: "Company",
			schemaField: "companyName",
			confidence: 0.95,
			sampleValue: "Acme Inc",
		},
		{
			csvColumn: "First Name",
			schemaField: "companyName",
			confidence: 0.7,
			sampleValue: "John",
		},
	],
	unmappedColumns: ["Email", "Street", "City", "Unknown Col"],
};

describe("mapSchemaTool (LLM-powered)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("Test 1: returns enriched mappings with dataType, isRequired, and sampleValue from schema when generateObject returns valid mappings", async () => {
		mockedGenerateObject.mockResolvedValueOnce({
			object: validLlmResponse,
		} as never);

		const result = await mapSchemaTool.execute({
			entityType: "clients",
			headers: sampleHeaders,
			sampleRows,
		});

		// Should not be an error result
		expect(result).not.toHaveProperty("error");

		const { mappings, unmappedColumns, missingRequiredFields } = result as {
			mappings: Array<{
				csvColumn: string;
				schemaField: string;
				confidence: number;
				dataType: string;
				isRequired: boolean;
				sampleValue?: string;
			}>;
			unmappedColumns: string[];
			missingRequiredFields: string[];
		};

		expect(mappings).toHaveLength(5);

		// Check enrichment from schema
		const companyMapping = mappings.find((m) => m.csvColumn === "Company");
		expect(companyMapping).toBeDefined();
		expect(companyMapping!.schemaField).toBe("companyName");
		expect(companyMapping!.dataType).toBe("string");
		expect(companyMapping!.isRequired).toBe(true);
		expect(companyMapping!.confidence).toBe(0.95);
		expect(companyMapping!.sampleValue).toBe("Acme Inc");

		const emailMapping = mappings.find((m) => m.csvColumn === "Email");
		expect(emailMapping).toBeDefined();
		expect(emailMapping!.schemaField).toBe("contact.email");
		expect(emailMapping!.dataType).toBe("string");
		expect(emailMapping!.isRequired).toBe(false);

		expect(unmappedColumns).toContain("Unknown Col");

		// companyName and status are required; companyName is mapped, status is not
		expect(missingRequiredFields).toContain("status");
		expect(missingRequiredFields).not.toContain("companyName");
	});

	it("Test 2: moves column to unmappedColumns when LLM returns a schemaField that does not exist in CLIENT_SCHEMA_FIELDS", async () => {
		mockedGenerateObject.mockResolvedValueOnce({
			object: responseWithInvalidField,
		} as never);

		const result = await mapSchemaTool.execute({
			entityType: "clients",
			headers: sampleHeaders,
			sampleRows,
		});

		const { mappings, unmappedColumns } = result as {
			mappings: Array<{ csvColumn: string; schemaField: string }>;
			unmappedColumns: string[];
		};

		// "First Name" mapped to nonExistentField should be moved to unmapped
		expect(mappings.find((m) => m.schemaField === "nonExistentField")).toBeUndefined();
		expect(unmappedColumns).toContain("First Name");

		// "Company" with valid schemaField should remain
		expect(mappings.find((m) => m.csvColumn === "Company")).toBeDefined();
	});

	it("Test 3: resolves duplicate field assignments by keeping highest confidence mapping", async () => {
		mockedGenerateObject.mockResolvedValueOnce({
			object: responseWithDuplicateField,
		} as never);

		const result = await mapSchemaTool.execute({
			entityType: "clients",
			headers: sampleHeaders,
			sampleRows,
		});

		const { mappings, unmappedColumns } = result as {
			mappings: Array<{
				csvColumn: string;
				schemaField: string;
				confidence: number;
			}>;
			unmappedColumns: string[];
		};

		// Only one mapping for companyName — the higher-confidence one (Company at 0.95)
		const companyNameMappings = mappings.filter(
			(m) => m.schemaField === "companyName"
		);
		expect(companyNameMappings).toHaveLength(1);
		expect(companyNameMappings[0].csvColumn).toBe("Company");
		expect(companyNameMappings[0].confidence).toBe(0.95);

		// "First Name" (lower confidence duplicate) should be in unmapped
		expect(unmappedColumns).toContain("First Name");
	});

	it("Test 4: returns empty mappings with all headers in unmappedColumns and llmFailed: true when generateObject throws API error", async () => {
		mockedGenerateObject.mockRejectedValueOnce(
			new Error("OpenAI API rate limit exceeded")
		);

		const result = await mapSchemaTool.execute({
			entityType: "clients",
			headers: sampleHeaders,
			sampleRows,
		});

		const { mappings, unmappedColumns, missingRequiredFields, llmFailed } = result as {
			mappings: Array<unknown>;
			unmappedColumns: string[];
			missingRequiredFields: string[];
			llmFailed: boolean;
		};

		expect(mappings).toHaveLength(0);
		expect(unmappedColumns).toEqual(expect.arrayContaining(sampleHeaders));
		expect(unmappedColumns).toHaveLength(sampleHeaders.length);

		// All required fields should be listed as missing
		expect(missingRequiredFields).toContain("companyName");
		expect(missingRequiredFields).toContain("status");

		// LLM failure flag must be set
		expect(llmFailed).toBe(true);
	});

	it("Test 5: returns graceful fallback with llmFailed: true when generateObject throws AbortError (timeout)", async () => {
		mockedGenerateObject.mockRejectedValueOnce(
			new DOMException("signal timed out", "AbortError")
		);

		const result = await mapSchemaTool.execute({
			entityType: "clients",
			headers: sampleHeaders,
			sampleRows,
		});

		const { mappings, unmappedColumns, missingRequiredFields, llmFailed } = result as {
			mappings: Array<unknown>;
			unmappedColumns: string[];
			missingRequiredFields: string[];
			llmFailed: boolean;
		};

		expect(mappings).toHaveLength(0);
		expect(unmappedColumns).toEqual(expect.arrayContaining(sampleHeaders));
		expect(missingRequiredFields).toContain("companyName");
		expect(missingRequiredFields).toContain("status");

		// LLM failure flag must be set
		expect(llmFailed).toBe(true);
	});

	it("Test 6: prompt passed to generateObject includes all schema field names and mentions dot-namespace convention", async () => {
		mockedGenerateObject.mockResolvedValueOnce({
			object: validLlmResponse,
		} as never);

		await mapSchemaTool.execute({
			entityType: "clients",
			headers: sampleHeaders,
			sampleRows,
		});

		expect(mockedGenerateObject).toHaveBeenCalledTimes(1);

		const callArgs = mockedGenerateObject.mock.calls[0][0] as {
			prompt: string;
		};
		const prompt = callArgs.prompt;

		// Must include key schema field names
		expect(prompt).toContain("companyName");
		expect(prompt).toContain("contact.firstName");
		expect(prompt).toContain("property.streetAddress");

		// Must mention dot-namespace convention
		expect(prompt).toMatch(/dot[- ]?not/i);
	});

	it("Test 7: required schema fields not present in LLM mappings appear in missingRequiredFields", async () => {
		// Only map one non-required field — both required fields (companyName, status) unmapped
		const partialResponse = {
			mappings: [
				{
					csvColumn: "Email",
					schemaField: "contact.email",
					confidence: 0.95,
					sampleValue: "john@acme.com",
				},
			],
			unmappedColumns: [
				"Company",
				"First Name",
				"Street",
				"City",
				"Unknown Col",
			],
		};

		mockedGenerateObject.mockResolvedValueOnce({
			object: partialResponse,
		} as never);

		const result = await mapSchemaTool.execute({
			entityType: "clients",
			headers: sampleHeaders,
			sampleRows,
		});

		const { missingRequiredFields } = result as {
			missingRequiredFields: string[];
		};

		expect(missingRequiredFields).toContain("companyName");
		expect(missingRequiredFields).toContain("status");
		expect(missingRequiredFields).not.toContain("contact.email");
	});

	it("Test 8: returns llmFailed: true when generateObject throws any error", async () => {
		mockedGenerateObject.mockRejectedValueOnce(
			new Error("Connection refused")
		);

		const result = await mapSchemaTool.execute({
			entityType: "clients",
			headers: sampleHeaders,
			sampleRows,
		});

		const { llmFailed } = result as { llmFailed: boolean };
		expect(llmFailed).toBe(true);
	});

	it("Test 9: returns llmFailed: false when generateObject succeeds", async () => {
		mockedGenerateObject.mockResolvedValueOnce({
			object: validLlmResponse,
		} as never);

		const result = await mapSchemaTool.execute({
			entityType: "clients",
			headers: sampleHeaders,
			sampleRows,
		});

		const { llmFailed } = result as { llmFailed: boolean };
		expect(llmFailed).toBe(false);
	});
});
