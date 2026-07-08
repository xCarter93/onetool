import { describe, it, expect } from "vitest";
import type { Node } from "@xyflow/react";
import { validateWorkflowForSave } from "./validation";
import type {
	AggregateNodeConfig,
	AutomationObjectType,
	ConditionNodeConfig,
	DelayNodeConfig,
	FetchNodeConfig,
	LoopNodeConfig,
	TriggerConfig,
	WorkflowNode,
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

/**
 * RF node carrying `_dbNode` (the persisted next/else/bodyStart pointers) —
 * required for loop-body membership checks (collectLoopBody/getScopeObjectType)
 * inside validateWorkflowForSave. Plain fixtures above omit this because they
 * don't exercise loop scoping.
 */
function dbRfNode(
	dbNode: WorkflowNode,
	triggerObjectType: AutomationObjectType | null = null
): Node {
	return {
		id: dbNode.id,
		type: `${dbNode.type}Node`,
		position: { x: 0, y: 0 },
		data: {
			nodeType: dbNode.type,
			config: dbNode.config,
			triggerObjectType,
			_dbNode: dbNode,
		},
	} as Node;
}

function conditionRule(
	field: string,
	operator: ConditionNodeConfig["groups"][number]["rules"][number]["operator"]
): ConditionNodeConfig {
	return {
		kind: "condition",
		logic: "and",
		groups: [
			{
				logic: "and",
				rules: [{ field, operator, value: { kind: "static", value: "pending" } }],
			},
		],
	};
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

describe("validateWorkflowForSave — condition node loop scope", () => {
	// Trigger has no resolvable object type (scheduled trigger — see
	// validateTrigger's "scheduled" branch) so the loop's fetched object type
	// ("task") is the *only* correct source of field/operator validation.
	// Pre-fix, validateConditionNode was handed the trigger's (null) object
	// type here, which made isRuleComplete skip the operator check entirely
	// and let invalid operators through.
	const scheduledTrigger: TriggerConfig = {
		type: "scheduled",
		schedule: { frequency: "daily", timezone: "UTC", time: "09:00" },
	};

	function loopOverTasksNodes(config: ConditionNodeConfig): Node[] {
		const fetch: WorkflowNode = {
			id: "fetch1",
			type: "fetch_records",
			config: { kind: "fetch_records", objectType: "task", filters: [] },
		};
		const loop: WorkflowNode = {
			id: "loop1",
			type: "loop",
			config: { kind: "loop", sourceNodeId: "fetch1" } satisfies LoopNodeConfig,
			bodyStartNodeId: "cond1",
		};
		const condition: WorkflowNode = { id: "cond1", type: "condition", config };
		return [dbRfNode(fetch), dbRfNode(loop), dbRfNode(condition)];
	}

	it("passes when the condition's operator is valid for the loop's fetched (task) object type", () => {
		// task.status is a select field — "equals" is a valid select operator.
		const nodes = loopOverTasksNodes(conditionRule("status", "equals"));
		const result = validateWorkflowForSave(scheduledTrigger, nodes);
		expect(result.errors.some((e) => e.nodeId === "cond1")).toBe(false);
	});

	it("fails when the operator is invalid for the loop object type's field, now that scope resolves correctly", () => {
		// "greater_than" isn't a valid operator for task.status (select).
		const nodes = loopOverTasksNodes(conditionRule("status", "greater_than"));
		const result = validateWorkflowForSave(scheduledTrigger, nodes);
		expect(
			result.errors.some(
				(e) => e.nodeId === "cond1" && e.message === "Finish configuring the condition"
			)
		).toBe(true);
	});
});

describe("validateWorkflowForSave — dangling false branch inside a loop", () => {
	const DANGLING_WARNING =
		"The No branch ends this loop iteration for the current item. Add a step to the No branch if that's not intended.";

	it("warns when a condition inside a loop body has no else (No) branch", () => {
		const fetch: WorkflowNode = {
			id: "fetch1",
			type: "fetch_records",
			config: { kind: "fetch_records", objectType: "task", filters: [] },
		};
		const loop: WorkflowNode = {
			id: "loop1",
			type: "loop",
			config: { kind: "loop", sourceNodeId: "fetch1" } satisfies LoopNodeConfig,
			bodyStartNodeId: "cond1",
		};
		const condition: WorkflowNode = {
			id: "cond1",
			type: "condition",
			config: conditionRule("status", "equals"),
			// No elseNodeId — the dangling case.
		};
		const nodes = [dbRfNode(fetch), dbRfNode(loop), dbRfNode(condition)];
		const result = validateWorkflowForSave(
			{ type: "scheduled", schedule: { frequency: "daily", timezone: "UTC", time: "09:00" } },
			nodes
		);
		expect(result.valid).toBe(true); // warning only — must not block publish
		expect(
			result.warnings.some((w) => w.nodeId === "cond1" && w.message === DANGLING_WARNING)
		).toBe(true);
	});

	it("does not warn when the loop condition has a configured else (No) branch", () => {
		const fetch: WorkflowNode = {
			id: "fetch1",
			type: "fetch_records",
			config: { kind: "fetch_records", objectType: "task", filters: [] },
		};
		const loop: WorkflowNode = {
			id: "loop1",
			type: "loop",
			config: { kind: "loop", sourceNodeId: "fetch1" } satisfies LoopNodeConfig,
			bodyStartNodeId: "cond1",
		};
		const condition: WorkflowNode = {
			id: "cond1",
			type: "condition",
			config: conditionRule("status", "equals"),
			elseNodeId: "handleNo",
		};
		const handleNo: WorkflowNode = {
			id: "handleNo",
			type: "action",
			config: {
				kind: "action",
				action: {
					type: "update_field",
					target: "self",
					field: "status",
					value: { kind: "static", value: "cancelled" },
				},
			},
		};
		const nodes = [dbRfNode(fetch), dbRfNode(loop), dbRfNode(condition), dbRfNode(handleNo)];
		const result = validateWorkflowForSave(
			{ type: "scheduled", schedule: { frequency: "daily", timezone: "UTC", time: "09:00" } },
			nodes
		);
		expect(result.warnings.some((w) => w.nodeId === "cond1")).toBe(false);
	});

	it("does not warn about a dangling No branch outside any loop", () => {
		const condition: WorkflowNode = {
			id: "cond1",
			type: "condition",
			config: conditionRule("status", "equals"),
			// No elseNodeId, but not inside a loop body.
		};
		const nodes = [dbRfNode(condition, "invoice")];
		const result = validateWorkflowForSave(invoiceTrigger, nodes);
		expect(result.warnings.some((w) => w.nodeId === "cond1")).toBe(false);
	});
});

describe("validateWorkflowForSave — end / next_item loop placement", () => {
	const END_INSIDE_LOOP_MESSAGE =
		'An End step inside a loop stops the entire run — use "Next item" to skip to the next record';
	const NEXT_ITEM_OUTSIDE_LOOP_MESSAGE = '"Next item" only works inside a loop';

	function loopOverTasksNodes(bodyNode: WorkflowNode): Node[] {
		const fetch: WorkflowNode = {
			id: "fetch1",
			type: "fetch_records",
			config: { kind: "fetch_records", objectType: "task", filters: [] },
		};
		const loop: WorkflowNode = {
			id: "loop1",
			type: "loop",
			config: { kind: "loop", sourceNodeId: "fetch1" } satisfies LoopNodeConfig,
			bodyStartNodeId: bodyNode.id,
		};
		return [dbRfNode(fetch), dbRfNode(loop), dbRfNode(bodyNode)];
	}

	it("flags an End step inside a loop body as an error", () => {
		const end: WorkflowNode = { id: "end1", type: "end", config: { kind: "end" } };
		const nodes = loopOverTasksNodes(end);
		const result = validateWorkflowForSave(invoiceTrigger, nodes);
		expect(result.valid).toBe(false);
		expect(
			result.errors.some(
				(e) =>
					e.nodeId === "end1" &&
					e.type === "end_inside_loop" &&
					e.message === END_INSIDE_LOOP_MESSAGE
			)
		).toBe(true);
	});

	it("flags a Next item step outside any loop as an error", () => {
		const nextItem: WorkflowNode = {
			id: "next1",
			type: "next_item",
			config: { kind: "next_item" },
		};
		const nodes = [dbRfNode(nextItem, "invoice")];
		const result = validateWorkflowForSave(invoiceTrigger, nodes);
		expect(result.valid).toBe(false);
		expect(
			result.errors.some(
				(e) =>
					e.nodeId === "next1" &&
					e.type === "next_item_outside_loop" &&
					e.message === NEXT_ITEM_OUTSIDE_LOOP_MESSAGE
			)
		).toBe(true);
	});

	it("does not error on a Next item step inside a loop body", () => {
		const nextItem: WorkflowNode = {
			id: "next1",
			type: "next_item",
			config: { kind: "next_item" },
		};
		const nodes = loopOverTasksNodes(nextItem);
		const result = validateWorkflowForSave(invoiceTrigger, nodes);
		expect(result.errors.some((e) => e.nodeId === "next1")).toBe(false);
	});
});

describe("validateWorkflowForSave — trigger entry criteria", () => {
	function triggerWith(
		entryCriteria: TriggerConfig["entryCriteria"]
	): TriggerConfig {
		return { type: "record_created", objectType: "invoice", entryCriteria };
	}

	// A minimal valid workflow so trigger validation is the only variable.
	const endNodes = [
		dbRfNode({ id: "end1", type: "end", config: { kind: "end" } }, "invoice"),
	];

	it("absent entry criteria is valid", () => {
		const result = validateWorkflowForSave(triggerWith(undefined), endNodes);
		expect(result.valid).toBe(true);
	});

	it("complete entry criteria are valid", () => {
		const result = validateWorkflowForSave(
			triggerWith({
				logic: "and",
				groups: [
					{
						logic: "and",
						rules: [
							{
								field: "status",
								operator: "equals",
								value: { kind: "static", value: "draft" },
							},
						],
					},
				],
			}),
			endNodes
		);
		expect(result.valid).toBe(true);
	});

	it("an incomplete entry-criteria rule blocks save", () => {
		const result = validateWorkflowForSave(
			triggerWith({
				logic: "and",
				groups: [
					{
						logic: "and",
						rules: [
							{
								field: "status",
								operator: "equals",
								value: { kind: "static", value: "" },
							},
						],
					},
				],
			}),
			endNodes
		);
		expect(result.valid).toBe(false);
		expect(
			result.errors.some((e) =>
				e.message.includes("entry criteria")
			)
		).toBe(true);
	});
});
