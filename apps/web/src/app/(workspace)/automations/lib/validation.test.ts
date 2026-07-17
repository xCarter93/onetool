import { describe, it, expect } from "vitest";
import { validateWorkflowForSave } from "./validation";
import { LOOP_FETCH_ONLY_ERROR } from "./node-types";
import type {
	AggregateNodeConfig,
	AutomationObjectType,
	ConditionNodeConfig,
	FetchNodeConfig,
	LoopNodeConfig,
	TriggerConfig,
	ValueRef,
	WorkflowNode,
} from "./node-types";

// Record-scoped trigger so the workflow itself validates; the aggregate/fetch
// nodes below are the subjects under test.
const invoiceTrigger: TriggerConfig = {
	type: "record_created",
	objectType: "invoice",
};

function fetchNode(
	id: string,
	objectType: FetchNodeConfig["objectType"]
): WorkflowNode {
	return {
		id,
		type: "fetch_records",
		config: {
			kind: "fetch_records",
			objectType,
			filters: [],
		} satisfies FetchNodeConfig,
	};
}

function aggregateNode(id: string, config: AggregateNodeConfig): WorkflowNode {
	return {
		id,
		type: "aggregate",
		config,
	};
}

function delayNode(id: string): WorkflowNode {
	return {
		id,
		type: "delay",
		config: {
			kind: "delay",
			amount: 5,
			unit: "minutes",
		},
	};
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
			fetchNode("fetch1", "invoice"),
			aggregateNode("agg1", {
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
			fetchNode("fetch1", "quote"),
			aggregateNode("agg1", {
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
			fetchNode("fetch1", "invoice"),
			aggregateNode("agg1", {
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
			fetchNode("fetch1", "invoice"),
			aggregateNode("agg1", {
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
			fetchNode("fetch1", "invoice"),
			aggregateNode("agg1", {
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
			aggregateNode("agg1", {
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
			delayNode("delay1"),
			aggregateNode("agg1", {
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
			fetchNode("fetch1", "invoice"),
			aggregateNode("agg1", {
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
			fetchNode("fetch1", "invoice"),
			aggregateNode("agg1", {
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

	function loopOverTasksNodes(config: ConditionNodeConfig): WorkflowNode[] {
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
		return [fetch, loop, condition];
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

describe("validateWorkflowForSave — loops over fetch-only types (B7)", () => {
	// Line items are fetch+aggregate only. A loop hands each item to actions as
	// the record in scope, which a line item can never be — so the loop itself
	// is rejected. Parity with the backend publish validator, which throws the
	// same shared LOOP_FETCH_ONLY_ERROR string.
	const scheduledTrigger: TriggerConfig = {
		type: "scheduled",
		schedule: { frequency: "daily", timezone: "UTC", time: "09:00" },
	};

	function loopOverNodes(objectType: AutomationObjectType): WorkflowNode[] {
		return [
			{
				id: "fetch1",
				type: "fetch_records",
				config: { kind: "fetch_records", objectType, filters: [] },
			},
			{
				id: "loop1",
				type: "loop",
				config: { kind: "loop", sourceNodeId: "fetch1" } satisfies LoopNodeConfig,
				bodyStartNodeId: "act1",
			},
			{
				id: "act1",
				type: "action",
				config: {
					kind: "action",
					action: {
						type: "send_notification",
						recipient: { allMembers: true },
						message: "hi",
					},
				},
			},
		] as WorkflowNode[];
	}

	it.each(["quote_line_item", "invoice_line_item"] as const)(
		"rejects a loop whose source fetches %s",
		(objectType) => {
			const result = validateWorkflowForSave(
				scheduledTrigger,
				loopOverNodes(objectType)
			);
			expect(
				result.errors.some(
					(e) => e.nodeId === "loop1" && e.message === LOOP_FETCH_ONLY_ERROR
				)
			).toBe(true);
		}
	);

	it("still allows a loop over a normal fetched type", () => {
		const result = validateWorkflowForSave(scheduledTrigger, loopOverNodes("task"));
		expect(
			result.errors.some((e) => e.message === LOOP_FETCH_ONLY_ERROR)
		).toBe(false);
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
		const nodes = [fetch, loop, condition];
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
		const nodes = [fetch, loop, condition, handleNo];
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
		const nodes = [condition];
		const result = validateWorkflowForSave(invoiceTrigger, nodes);
		expect(result.warnings.some((w) => w.nodeId === "cond1")).toBe(false);
	});
});

describe("validateWorkflowForSave — end / next_item loop placement", () => {
	const END_INSIDE_LOOP_MESSAGE =
		'An End step inside a loop stops the entire run — use "Next item" to skip to the next record';
	const NEXT_ITEM_OUTSIDE_LOOP_MESSAGE = '"Next item" only works inside a loop';

	function loopOverTasksNodes(bodyNode: WorkflowNode): WorkflowNode[] {
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
		return [fetch, loop, bodyNode];
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
		const nodes = [nextItem];
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
	const endNodes: WorkflowNode[] = [
		{ id: "end1", type: "end", config: { kind: "end" } },
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

describe("validateWorkflowForSave — scheduled triggers have no record (A1)", () => {
	const scheduled: TriggerConfig = {
		type: "scheduled",
		schedule: { frequency: "daily", timezone: "UTC", time: "09:00" },
	};

	const updateSelf: WorkflowNode = {
		id: "act1",
		type: "action",
		config: {
			kind: "action",
			action: {
				type: "update_field",
				target: "self",
				field: "status",
				value: { kind: "static", value: "active" },
			},
		},
	};

	function conditionNode(id: string, config: ConditionNodeConfig): WorkflowNode {
		return { id, type: "condition", config };
	}

	it("rejects a top-level update_field, and says why", () => {
		const result = validateWorkflowForSave(scheduled, [updateSelf]);
		const error = result.errors.find((e) => e.nodeId === "act1");
		expect(error?.type).toBe("no_trigger_record");
		expect(error?.message).toMatch(/no record to update/i);
	});

	it("rejects a top-level condition that reads a record field", () => {
		const nodes = [conditionNode("cond1", conditionRule("status", "equals"))];
		const result = validateWorkflowForSave(scheduled, nodes);
		expect(
			result.errors.some(
				(e) => e.nodeId === "cond1" && e.type === "no_trigger_record"
			)
		).toBe(true);
	});

	it("accepts a top-level condition whose left side is a step result", () => {
		const nodes = [
			fetchNode("fetch1", "invoice"),
			aggregateNode("agg1", {
				kind: "aggregate",
				sourceNodeId: "fetch1",
				field: "total",
				op: "sum",
			}),
			conditionNode("cond1", {
				kind: "condition",
				logic: "and",
				groups: [
					{
						logic: "and",
						rules: [
							{
								field: "",
								left: { kind: "var", path: "node.agg1.result" },
								operator: "greater_than",
								value: { kind: "static", value: 10000 },
							},
						],
					},
				],
			}),
		];
		const result = validateWorkflowForSave(scheduled, nodes);
		expect(result.errors.filter((e) => e.nodeId === "cond1")).toHaveLength(0);
	});

	it("rejects a {{trigger.record.*}} token inside a message template", () => {
		const notify: WorkflowNode = {
			id: "notify1",
			type: "action",
			config: {
				kind: "action",
				action: {
					type: "send_notification",
					recipient: "org_admins",
					message: "Total is {{trigger.record.total}}",
				},
			},
		};
		const result = validateWorkflowForSave(scheduled, [notify]);
		const error = result.errors.find((e) => e.nodeId === "notify1");
		expect(error?.type).toBe("no_trigger_record");
		expect(error?.message).toMatch(/always empty/i);
	});

	it("rejects a formula that reads the trigger record", () => {
		const notify: WorkflowNode = {
			id: "notify1",
			type: "action",
			config: {
				kind: "action",
				action: {
					type: "send_notification",
					recipient: "org_admins",
					message: "hi",
				},
			},
		};
		const result = validateWorkflowForSave(scheduled, [notify], [
			{
				id: "f1",
				name: "Doubled",
				returnType: "number",
				expression: "{trigger.record.budget} * 2",
			},
		]);
		expect(result.errors.some((e) => e.type === "no_trigger_record")).toBe(true);
	});

	it("leaves a correctly-built fetch -> loop -> update alone", () => {
		const nodes: WorkflowNode[] = [
			fetchNode("fetch1", "project"),
			{
				id: "loop1",
				type: "loop",
				config: { kind: "loop", sourceNodeId: "fetch1" } satisfies LoopNodeConfig,
				bodyStartNodeId: "act1",
			},
			updateSelf,
		];
		const result = validateWorkflowForSave(scheduled, nodes);
		expect(result.errors.some((e) => e.type === "no_trigger_record")).toBe(false);
	});
});

describe("validateWorkflowForSave — update_fields (B2)", () => {
	const clientTrigger: TriggerConfig = {
		type: "record_created",
		objectType: "client",
	};

	function updateFieldsNode(
		id: string,
		fields: Array<{ field: string; value: string | number | boolean | null }>
	): WorkflowNode {
		return {
			id,
			type: "action",
			config: {
				kind: "action",
				action: {
					type: "update_fields",
					target: "self",
					fields: fields.map(({ field, value }) => ({
						field,
						value: { kind: "static", value },
					})),
				},
			},
		};
	}

	it("accepts a multi-field update", () => {
		const result = validateWorkflowForSave(clientTrigger, [
			updateFieldsNode("act1", [
				{ field: "notes", value: "swept" },
				{ field: "status", value: "inactive" },
			]),
		]);
		expect(result.errors.filter((e) => e.nodeId === "act1")).toHaveLength(0);
	});

	it("rejects a duplicated field", () => {
		const result = validateWorkflowForSave(clientTrigger, [
			updateFieldsNode("act1", [
				{ field: "notes", value: "a" },
				{ field: "notes", value: "b" },
			]),
		]);
		expect(
			result.errors.some(
				(e) => e.nodeId === "act1" && /more than once/i.test(e.message)
			)
		).toBe(true);
	});

	it("rejects an empty row list", () => {
		const result = validateWorkflowForSave(clientTrigger, [
			updateFieldsNode("act1", []),
		]);
		expect(
			result.errors.some(
				(e) => e.nodeId === "act1" && /at least one field/i.test(e.message)
			)
		).toBe(true);
	});

	it("rejects an empty value on a non-boolean row", () => {
		const result = validateWorkflowForSave(clientTrigger, [
			updateFieldsNode("act1", [{ field: "notes", value: null }]),
		]);
		expect(
			result.errors.some(
				(e) => e.nodeId === "act1" && /set a value/i.test(e.message)
			)
		).toBe(true);
	});

	it("rejects a null value on a boolean row", () => {
		const result = validateWorkflowForSave(clientTrigger, [
			updateFieldsNode("act1", [{ field: "isActive", value: null }]),
		]);
		expect(
			result.errors.some(
				(e) => e.nodeId === "act1" && /set a value/i.test(e.message)
			)
		).toBe(true);
	});

	it("rejects an empty-string value on a boolean row", () => {
		const result = validateWorkflowForSave(clientTrigger, [
			updateFieldsNode("act1", [{ field: "isActive", value: "" }]),
		]);
		expect(
			result.errors.some(
				(e) => e.nodeId === "act1" && /set a value/i.test(e.message)
			)
		).toBe(true);
	});

	it("accepts a false value on a boolean row", () => {
		const result = validateWorkflowForSave(clientTrigger, [
			updateFieldsNode("act1", [{ field: "isActive", value: false }]),
		]);
		expect(result.errors.filter((e) => e.nodeId === "act1")).toHaveLength(0);
	});

	it("rejects a top-level update_fields on a scheduled trigger", () => {
		const scheduled: TriggerConfig = {
			type: "scheduled",
			schedule: { frequency: "daily", timezone: "UTC", time: "09:00" },
		};
		const result = validateWorkflowForSave(scheduled, [
			updateFieldsNode("act1", [{ field: "notes", value: "x" }]),
		]);
		const error = result.errors.find((e) => e.nodeId === "act1");
		expect(error?.type).toBe("no_trigger_record");
	});
});

describe("validateWorkflowForSave — create_record (Phase B1)", () => {
	const taskTrigger: TriggerConfig = {
		type: "record_created",
		objectType: "task",
	};
	const clientTrigger: TriggerConfig = {
		type: "record_created",
		objectType: "client",
	};
	const scheduled: TriggerConfig = {
		type: "scheduled",
		schedule: { frequency: "daily", timezone: "UTC", time: "09:00" },
	};

	function createRecordNode(
		id: string,
		objectType: "client" | "project" | "quote" | "invoice" | "task",
		fields: Array<{ field: string; value: string | number | boolean | null }>,
		linkToScope?: boolean
	): WorkflowNode {
		return {
			id,
			type: "action",
			config: {
				kind: "action",
				action: {
					type: "create_record",
					objectType,
					fields: fields.map((f) => ({
						field: f.field,
						value: { kind: "static", value: f.value },
					})),
					linkToScope,
				},
			},
		};
	}

	it("accepts a task create with a title", () => {
		const result = validateWorkflowForSave(taskTrigger, [
			createRecordNode("act1", "task", [{ field: "title", value: "Do it" }]),
		]);
		expect(result.errors.some((e) => e.nodeId === "act1")).toBe(false);
	});

	it("rejects a project create missing its required client", () => {
		const result = validateWorkflowForSave(taskTrigger, [
			createRecordNode("act1", "project", [{ field: "title", value: "X" }]),
		]);
		const error = result.errors.find((e) => e.nodeId === "act1");
		expect(error?.message).toMatch(/client is required/i);
	});

	it("accepts a project create when linkToScope supplies the client", () => {
		const result = validateWorkflowForSave(clientTrigger, [
			createRecordNode(
				"act1",
				"project",
				[{ field: "title", value: "X" }],
				true
			),
		]);
		expect(result.errors.some((e) => e.nodeId === "act1")).toBe(false);
	});

	it("rejects a non-creatable object type (quote)", () => {
		const result = validateWorkflowForSave(taskTrigger, [
			createRecordNode("act1", "quote", [{ field: "title", value: "X" }]),
		]);
		const error = result.errors.find((e) => e.nodeId === "act1");
		expect(error?.message).toMatch(/isn't supported/i);
	});

	it("rejects linkToScope on a scheduled top-level create", () => {
		const result = validateWorkflowForSave(scheduled, [
			createRecordNode(
				"act1",
				"task",
				[{ field: "title", value: "X" }],
				true
			),
		]);
		const error = result.errors.find((e) => e.nodeId === "act1");
		expect(error?.type).toBe("no_trigger_record");
	});

	it("allows an unlinked create on a scheduled top-level", () => {
		const result = validateWorkflowForSave(scheduled, [
			createRecordNode("act1", "task", [{ field: "title", value: "X" }]),
		]);
		expect(result.errors.some((e) => e.nodeId === "act1")).toBe(false);
	});
});

describe("validateWorkflowForSave — typed variable fallback (B3)", () => {
	const clientTrigger: TriggerConfig = {
		type: "record_created",
		objectType: "client",
	};

	function updateNode(
		id: string,
		field: string,
		value: ValueRef
	): WorkflowNode {
		return {
			id,
			type: "action",
			config: {
				kind: "action",
				action: {
					type: "update_fields",
					target: "self",
					fields: [{ field, value }],
				},
			},
		};
	}

	it("rejects a string fallback on a boolean field", () => {
		const result = validateWorkflowForSave(clientTrigger, [
			updateNode("act1", "isActive", {
				kind: "var",
				path: "node.n1.result",
				fallback: "yes",
			}),
		]);
		expect(
			result.errors.some(
				(e) => e.nodeId === "act1" && /true or false/i.test(e.message)
			)
		).toBe(true);
	});

	it("accepts a boolean fallback on a boolean field", () => {
		const result = validateWorkflowForSave(clientTrigger, [
			updateNode("act1", "isActive", {
				kind: "var",
				path: "node.n1.result",
				fallback: false,
			}),
		]);
		expect(result.errors.filter((e) => e.nodeId === "act1")).toHaveLength(0);
	});

	it("accepts a var with no fallback on a boolean field", () => {
		const result = validateWorkflowForSave(clientTrigger, [
			updateNode("act1", "isActive", {
				kind: "var",
				path: "node.n1.result",
			}),
		]);
		expect(result.errors.filter((e) => e.nodeId === "act1")).toHaveLength(0);
	});

	it("accepts a string fallback on a text field", () => {
		const result = validateWorkflowForSave(clientTrigger, [
			updateNode("act1", "notes", {
				kind: "var",
				path: "node.n1.result",
				fallback: "n/a",
			}),
		]);
		expect(result.errors.filter((e) => e.nodeId === "act1")).toHaveLength(0);
	});

	it("rejects a boolean fallback on a text field", () => {
		const result = validateWorkflowForSave(clientTrigger, [
			updateNode("act1", "notes", {
				kind: "var",
				path: "node.n1.result",
				fallback: true,
			}),
		]);
		expect(
			result.errors.some(
				(e) => e.nodeId === "act1" && /must be text/i.test(e.message)
			)
		).toBe(true);
	});

	it("rejects a number fallback on a text field", () => {
		const result = validateWorkflowForSave(clientTrigger, [
			updateNode("act1", "notes", {
				kind: "var",
				path: "node.n1.result",
				fallback: 5,
			}),
		]);
		expect(
			result.errors.some(
				(e) => e.nodeId === "act1" && /must be text/i.test(e.message)
			)
		).toBe(true);
	});

	it("rejects a boolean fallback on a select field", () => {
		const result = validateWorkflowForSave(clientTrigger, [
			updateNode("act1", "status", {
				kind: "var",
				path: "node.n1.result",
				fallback: true,
			}),
		]);
		expect(
			result.errors.some(
				(e) => e.nodeId === "act1" && /must be text/i.test(e.message)
			)
		).toBe(true);
	});

	it("rejects a number fallback on a select field", () => {
		const result = validateWorkflowForSave(clientTrigger, [
			updateNode("act1", "status", {
				kind: "var",
				path: "node.n1.result",
				fallback: 5,
			}),
		]);
		expect(
			result.errors.some(
				(e) => e.nodeId === "act1" && /must be text/i.test(e.message)
			)
		).toBe(true);
	});

	it("accepts a string fallback on a select field", () => {
		const result = validateWorkflowForSave(clientTrigger, [
			updateNode("act1", "status", {
				kind: "var",
				path: "node.n1.result",
				fallback: "active",
			}),
		]);
		expect(result.errors.filter((e) => e.nodeId === "act1")).toHaveLength(0);
	});

	// id destinations have no writable field in the registry, so exercise
	// create_record's creatable id field (project.clientId) instead.
	function createRecordWithClientIdNode(
		id: string,
		clientIdValue: ValueRef
	): WorkflowNode {
		return {
			id,
			type: "action",
			config: {
				kind: "action",
				action: {
					type: "create_record",
					objectType: "project",
					fields: [
						{ field: "title", value: { kind: "static", value: "New project" } },
						{ field: "clientId", value: clientIdValue },
					],
				},
			},
		};
	}

	it("rejects a boolean fallback on an id field", () => {
		const result = validateWorkflowForSave(clientTrigger, [
			createRecordWithClientIdNode("act1", {
				kind: "var",
				path: "node.n1.result",
				fallback: true,
			}),
		]);
		expect(
			result.errors.some(
				(e) => e.nodeId === "act1" && /must be text/i.test(e.message)
			)
		).toBe(true);
	});

	it("rejects a number fallback on an id field", () => {
		const result = validateWorkflowForSave(clientTrigger, [
			createRecordWithClientIdNode("act1", {
				kind: "var",
				path: "node.n1.result",
				fallback: 5,
			}),
		]);
		expect(
			result.errors.some(
				(e) => e.nodeId === "act1" && /must be text/i.test(e.message)
			)
		).toBe(true);
	});

	it("accepts a string fallback on an id field", () => {
		const result = validateWorkflowForSave(clientTrigger, [
			createRecordWithClientIdNode("act1", {
				kind: "var",
				path: "node.n1.result",
				fallback: "k17abc",
			}),
		]);
		expect(result.errors.filter((e) => e.nodeId === "act1")).toHaveLength(0);
	});
});
