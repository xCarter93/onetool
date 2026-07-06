import { describe, it, expect } from "vitest";
import {
	FIELD_REGISTRY,
	OPERATORS_BY_TYPE,
	RELATED_OBJECTS,
	RELATION_FIELD,
	getFieldDefinition,
	getWritableFields,
	getFilterableFields,
	operatorsForField,
	getStatusOptions,
} from "./fieldRegistry";
import { AUTOMATION_OBJECT_TYPES } from "./workflowTypes";

/**
 * Expected field keys hardcoded from schema.ts table validators. If the schema
 * drifts (fields renamed/removed), this test breaks INTENTIONALLY — update both
 * the registry and these lists together.
 */
const SCHEMA_KEYS = {
	client: [
		"orgId",
		"companyName",
		"companyDescription",
		"status",
		"leadSource",
		"isActive",
		"communicationPreference",
		"tags",
		"notes",
		"portalAccessId",
		"archivedAt",
	],
	project: [
		"orgId",
		"clientId",
		"title",
		"description",
		"projectNumber",
		"status",
		"projectType",
		"startDate",
		"endDate",
		"completedAt",
		"assignedUserIds",
	],
	quote: [
		"orgId",
		"clientId",
		"projectId",
		"title",
		"quoteNumber",
		"status",
		"subtotal",
		"discountEnabled",
		"discountAmount",
		"discountType",
		"taxEnabled",
		"taxRate",
		"taxAmount",
		"total",
		"validUntil",
		"clientMessage",
		"terms",
		"sentAt",
		"approvedAt",
		"declinedAt",
		"pdfSettings",
		"latestDocumentId",
		"requiresCountersignature",
		"countersignerId",
		"signingOrder",
	],
	invoice: [
		"orgId",
		"clientId",
		"projectId",
		"quoteId",
		"invoiceNumber",
		"status",
		"subtotal",
		"discountAmount",
		"taxAmount",
		"total",
		"issuedDate",
		"dueDate",
		"paidAt",
		"stripeSessionId",
		"stripePaymentIntentId",
		"publicToken",
	],
	task: [
		"orgId",
		"projectId",
		"clientId",
		"type",
		"title",
		"description",
		"date",
		"startTime",
		"endTime",
		"assigneeUserId",
		"status",
		"completedAt",
		"repeat",
		"repeatUntil",
		"parentTaskId",
	],
} as const;

/** Exact status enum values from schema.ts, in declaration order. */
const SCHEMA_STATUS_VALUES = {
	client: ["lead", "active", "inactive", "archived"],
	project: ["planned", "in-progress", "completed", "cancelled"],
	quote: ["draft", "sent", "approved", "declined", "expired"],
	invoice: ["draft", "sent", "paid", "overdue", "cancelled"],
	task: ["pending", "in-progress", "completed", "cancelled"],
} as const;

describe("FIELD_REGISTRY", () => {
	it("covers all automation object types", () => {
		for (const objectType of AUTOMATION_OBJECT_TYPES) {
			expect(FIELD_REGISTRY[objectType].length).toBeGreaterThan(0);
		}
	});

	it.each(AUTOMATION_OBJECT_TYPES)(
		"%s registry keys are a subset of schema keys",
		(objectType) => {
			const schemaKeys = new Set<string>(SCHEMA_KEYS[objectType]);
			for (const field of FIELD_REGISTRY[objectType]) {
				expect(schemaKeys, `${objectType}.${field.key} not in schema`).toContain(
					field.key
				);
			}
		}
	);

	it.each(AUTOMATION_OBJECT_TYPES)("%s field keys are unique", (objectType) => {
		const keys = FIELD_REGISTRY[objectType].map((f) => f.key);
		expect(new Set(keys).size).toBe(keys.length);
	});

	it("every select field has non-empty options", () => {
		for (const objectType of AUTOMATION_OBJECT_TYPES) {
			for (const field of FIELD_REGISTRY[objectType]) {
				if (field.type === "select") {
					expect(
						field.options?.length,
						`${objectType}.${field.key} missing options`
					).toBeGreaterThan(0);
				} else {
					expect(
						field.options,
						`${objectType}.${field.key} has options but is not a select`
					).toBeUndefined();
				}
			}
		}
	});

	it("non-writable fields document a write exclusion reason", () => {
		for (const objectType of AUTOMATION_OBJECT_TYPES) {
			for (const field of FIELD_REGISTRY[objectType]) {
				if (!field.writable) {
					expect(
						field.writeExclusionReason,
						`${objectType}.${field.key} missing writeExclusionReason`
					).toBeTruthy();
				}
			}
		}
	});
});

describe("status options", () => {
	it.each(AUTOMATION_OBJECT_TYPES)(
		"%s status options match schema enum exactly",
		(objectType) => {
			expect(getStatusOptions(objectType).map((o) => o.value)).toEqual([
				...SCHEMA_STATUS_VALUES[objectType],
			]);
		}
	);
});

describe("operatorsForField", () => {
	it("returns text operators for text fields", () => {
		expect(operatorsForField("client", "companyName")).toEqual([
			"equals",
			"not_equals",
			"contains",
			"not_contains",
			"is_empty",
			"is_not_empty",
		]);
	});

	it("returns numeric operators for currency fields", () => {
		expect(operatorsForField("invoice", "total")).toEqual([
			"equals",
			"not_equals",
			"greater_than",
			"less_than",
			"gte",
			"lte",
			"is_empty",
			"is_not_empty",
		]);
	});

	it("returns numeric operators for number fields", () => {
		expect(operatorsForField("quote", "taxRate")).toEqual(
			OPERATORS_BY_TYPE.number
		);
	});

	it("returns boolean operators for boolean fields", () => {
		expect(operatorsForField("client", "isActive")).toEqual([
			"is_true",
			"is_false",
		]);
	});

	it("returns date operators for date fields", () => {
		expect(operatorsForField("task", "date")).toEqual([
			"before",
			"after",
			"is_empty",
			"is_not_empty",
		]);
	});

	it("returns select operators for select fields", () => {
		expect(operatorsForField("project", "status")).toEqual([
			"equals",
			"not_equals",
			"is_empty",
			"is_not_empty",
		]);
	});

	it("returns id operators for id fields", () => {
		expect(operatorsForField("task", "projectId")).toEqual([
			"equals",
			"not_equals",
			"is_empty",
			"is_not_empty",
		]);
	});

	it("returns [] for unknown fields", () => {
		expect(operatorsForField("client", "nonexistent")).toEqual([]);
		expect(operatorsForField("task", "scheduledDate")).toEqual([]);
	});
});

describe("helpers", () => {
	it("getFieldDefinition finds known fields and misses unknown ones", () => {
		expect(getFieldDefinition("quote", "status")?.type).toBe("select");
		expect(getFieldDefinition("quote", "bogus")).toBeUndefined();
	});

	it("getWritableFields excludes system-managed fields", () => {
		const keys = getWritableFields("invoice").map((f) => f.key);
		expect(keys).toContain("status");
		expect(keys).toContain("dueDate");
		expect(keys).not.toContain("total");
		expect(keys).not.toContain("paidAt");
		expect(keys).not.toContain("stripePaymentIntentId");
	});

	it("getFilterableFields excludes non-filterable fields", () => {
		const keys = getFilterableFields("invoice").map((f) => f.key);
		expect(keys).toContain("total");
		expect(keys).not.toContain("stripeSessionId");
		expect(keys).not.toContain("stripePaymentIntentId");
	});
});

describe("relations", () => {
	it("RELATED_OBJECTS matches schema FKs", () => {
		expect(RELATED_OBJECTS.client).toEqual([]);
		expect(RELATED_OBJECTS.project).toEqual(["client"]);
		expect(RELATED_OBJECTS.quote).toEqual(["client", "project"]);
		expect(RELATED_OBJECTS.invoice).toEqual(["client", "project", "quote"]);
		expect(RELATED_OBJECTS.task).toEqual(["project", "client"]);
	});

	it("every related object has a relation field, and vice versa", () => {
		for (const objectType of AUTOMATION_OBJECT_TYPES) {
			const related = RELATED_OBJECTS[objectType];
			const fieldMap = RELATION_FIELD[objectType];
			expect(Object.keys(fieldMap).sort()).toEqual([...related].sort());
		}
	});

	it("relation FK fields are real schema fields", () => {
		for (const objectType of AUTOMATION_OBJECT_TYPES) {
			for (const [target, fkField] of Object.entries(
				RELATION_FIELD[objectType]
			)) {
				const schemaKeys: readonly string[] = SCHEMA_KEYS[objectType];
				expect(
					schemaKeys,
					`${objectType} -> ${target} FK "${fkField}" not in schema`
				).toContain(fkField);
			}
		}
	});
});
