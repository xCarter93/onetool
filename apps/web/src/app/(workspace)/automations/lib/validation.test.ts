import { describe, it, expect } from "vitest";
import type { Node } from "@xyflow/react";
import { validateWorkflowForSave } from "./validation";
import type {
	AggregateNodeConfig,
	DelayNodeConfig,
	FetchNodeConfig,
	TriggerConfig,
} from "./node-types";

// Record-scoped trigger so the workflow itself validates; the aggregate/fetch
// nodes below are the subjects under test.
const invoiceTrigger: TriggerConfig = {
	type: "record_created",
	objectType: "invoice",
};

function fetchRfNode(
	id: string,
	objectType: FetchNodeConfig["objectType"]
): Node {
	return {
		id,
		type: "fetchNode",
		position: { x: 0, y: 0 },
		data: {
			nodeType: "fetch_records",
			config: {
				kind: "fetch_records",
				objectType,
				filters: [],
			} satisfies FetchNodeConfig,
			triggerObjectType: objectType,
		},
	} as Node;
}

function aggregateRfNode(id: string, config: AggregateNodeConfig): Node {
	return {
		id,
		type: "aggregateNode",
		position: { x: 0, y: 0 },
		data: {
			nodeType: "aggregate",
			config,
			triggerObjectType: null,
		},
	} as Node;
}

function delayRfNode(id: string): Node {
	return {
		id,
		type: "delayNode",
		position: { x: 0, y: 0 },
		data: {
			nodeType: "delay",
			config: {
				kind: "delay",
				amount: 5,
				unit: "minutes",
			} satisfies DelayNodeConfig,
			triggerObjectType: null,
		},
	} as Node;
}

const AGG_FIELD_TYPE_MESSAGE = "Aggregate needs a number or currency field";

describe("validateWorkflowForSave — aggregate node", () => {
	it("passes when aggregating a currency field", () => {
		const nodes = [
			fetchRfNode("fetch1", "invoice"),
			aggregateRfNode("agg1", {
				kind: "aggregate",
				sourceNodeId: "fetch1",
				field: "total", // invoice.total is currency
				op: "sum",
			}),
		];
		const result = validateWorkflowForSave(invoiceTrigger, nodes);
		expect(result.valid).toBe(true);
		expect(result.errors).toHaveLength(0);
	});

	it("passes when aggregating a number field", () => {
		const nodes = [
			fetchRfNode("fetch1", "quote"),
			aggregateRfNode("agg1", {
				kind: "aggregate",
				sourceNodeId: "fetch1",
				field: "taxRate", // quote.taxRate is number
				op: "avg",
			}),
		];
		const result = validateWorkflowForSave(
			{ type: "record_created", objectType: "quote" },
			nodes
		);
		expect(result.valid).toBe(true);
		expect(result.errors).toHaveLength(0);
	});

	it("fails inline when aggregating a text field", () => {
		const nodes = [
			fetchRfNode("fetch1", "invoice"),
			aggregateRfNode("agg1", {
				kind: "aggregate",
				sourceNodeId: "fetch1",
				field: "invoiceNumber", // invoice.invoiceNumber is text
				op: "sum",
			}),
		];
		const result = validateWorkflowForSave(invoiceTrigger, nodes);
		expect(result.valid).toBe(false);
		expect(
			result.errors.some(
				(e) => e.nodeId === "agg1" && e.message === AGG_FIELD_TYPE_MESSAGE
			)
		).toBe(true);
	});

	it("fails inline when aggregating a date field", () => {
		const nodes = [
			fetchRfNode("fetch1", "invoice"),
			aggregateRfNode("agg1", {
				kind: "aggregate",
				sourceNodeId: "fetch1",
				field: "issuedDate", // invoice.issuedDate is date
				op: "max",
			}),
		];
		const result = validateWorkflowForSave(invoiceTrigger, nodes);
		expect(result.valid).toBe(false);
		expect(
			result.errors.some(
				(e) => e.nodeId === "agg1" && e.message === AGG_FIELD_TYPE_MESSAGE
			)
		).toBe(true);
	});

	it("fails inline for a field the object type does not define", () => {
		const nodes = [
			fetchRfNode("fetch1", "invoice"),
			aggregateRfNode("agg1", {
				kind: "aggregate",
				sourceNodeId: "fetch1",
				field: "nonexistentField",
				op: "sum",
			}),
		];
		const result = validateWorkflowForSave(invoiceTrigger, nodes);
		expect(result.valid).toBe(false);
		expect(
			result.errors.some(
				(e) => e.nodeId === "agg1" && e.message === AGG_FIELD_TYPE_MESSAGE
			)
		).toBe(true);
	});

	it("flags a missing source before checking the field type", () => {
		const nodes = [
			aggregateRfNode("agg1", {
				kind: "aggregate",
				sourceNodeId: "",
				field: "total",
				op: "sum",
			}),
		];
		const result = validateWorkflowForSave(invoiceTrigger, nodes);
		expect(result.valid).toBe(false);
		expect(
			result.errors.some(
				(e) =>
					e.nodeId === "agg1" &&
					e.message ===
						'Aggregates need a "Find records" step to run earlier in the workflow'
			)
		).toBe(true);
	});

	it("flags a source that is not a fetch_records node", () => {
		const nodes = [
			delayRfNode("delay1"),
			aggregateRfNode("agg1", {
				kind: "aggregate",
				sourceNodeId: "delay1",
				field: "total",
				op: "sum",
			}),
		];
		const result = validateWorkflowForSave(invoiceTrigger, nodes);
		expect(result.valid).toBe(false);
		expect(
			result.errors.some(
				(e) =>
					e.nodeId === "agg1" &&
					e.message ===
						'Aggregates need a "Find records" step to run earlier in the workflow'
			)
		).toBe(true);
	});

	it("flags an empty field before checking its type", () => {
		const nodes = [
			fetchRfNode("fetch1", "invoice"),
			aggregateRfNode("agg1", {
				kind: "aggregate",
				sourceNodeId: "fetch1",
				field: "",
				op: "sum",
			}),
		];
		const result = validateWorkflowForSave(invoiceTrigger, nodes);
		expect(result.valid).toBe(false);
		expect(
			result.errors.some(
				(e) => e.nodeId === "agg1" && e.message === "Choose a field to aggregate"
			)
		).toBe(true);
	});

	it("flags an invalid aggregate operation", () => {
		const nodes = [
			fetchRfNode("fetch1", "invoice"),
			aggregateRfNode("agg1", {
				kind: "aggregate",
				sourceNodeId: "fetch1",
				field: "total",
				op: "median" as AggregateNodeConfig["op"],
			}),
		];
		const result = validateWorkflowForSave(invoiceTrigger, nodes);
		expect(result.valid).toBe(false);
		expect(
			result.errors.some(
				(e) =>
					e.nodeId === "agg1" && e.message === "Choose an aggregate operation"
			)
		).toBe(true);
	});
});
