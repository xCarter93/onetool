import { describe, it, expect } from "vitest";
import { definitionSignature } from "./editor-signature";
import {
	automationToReactFlow,
	reactFlowToFlatArray,
	serializeEditorNodes,
} from "./flow-adapter";
import { legacyNodeToV2, legacyTriggerToDraft } from "./legacy-load";
import type {
	AutomationTrigger,
	ConditionNodeConfig,
	FetchNodeConfig,
	TriggerConfig,
	WorkflowNode,
} from "./node-types";

const trigger: TriggerConfig = {
	type: "record_created",
	objectType: "client",
};

function node(id: string, next?: string): WorkflowNode {
	return {
		id,
		type: "action",
		config: {
			kind: "action",
			action: {
				type: "update_field",
				target: "self",
				field: "notes",
				value: { kind: "static", value: "hi" },
			},
		},
		nextNodeId: next,
	};
}

describe("definitionSignature", () => {
	it("is independent of node order", () => {
		const a = definitionSignature(trigger, [node("n1", "n2"), node("n2")]);
		const b = definitionSignature(trigger, [node("n2"), node("n1", "n2")]);
		expect(a).toBe(b);
	});

	it("ignores layout position", () => {
		const positioned: WorkflowNode = {
			...node("n1"),
			position: { x: 10, y: 20 },
		};
		const withPos = definitionSignature(trigger, [positioned]);
		const withoutPos = definitionSignature(trigger, [node("n1")]);
		expect(withPos).toBe(withoutPos);
	});

	it("changes when a node's config changes", () => {
		const base = definitionSignature(trigger, [node("n1")]);
		const edited = definitionSignature(trigger, [
			{
				...node("n1"),
				config: {
					kind: "action",
					action: {
						type: "update_field",
						target: "self",
						field: "notes",
						value: { kind: "static", value: "changed" },
					},
				},
			},
		]);
		expect(base).not.toBe(edited);
	});

	it("changes when the trigger changes", () => {
		const a = definitionSignature(trigger, [node("n1")]);
		const b = definitionSignature(
			{ type: "record_created", objectType: "project" },
			[node("n1")]
		);
		expect(a).not.toBe(b);
	});

	it("treats explicit-undefined keys the same as omitted keys", () => {
		// legacy-load sets optional trigger keys explicitly (fromStatus: undefined)
		// while fresh drafts omit them — both must hash identically or a no-op
		// edit shows a false "unpublished changes" banner.
		const explicit = definitionSignature(
			{
				type: "status_changed",
				objectType: "client",
				toStatus: "active",
				fromStatus: undefined,
			} as TriggerConfig,
			[node("n1")]
		);
		const omitted = definitionSignature(
			{
				type: "status_changed",
				objectType: "client",
				toStatus: "active",
			} as TriggerConfig,
			[node("n1")]
		);
		expect(explicit).toBe(omitted);
	});

	it("is stable regardless of object key insertion order", () => {
		const a = definitionSignature({ objectType: "client", type: "record_created" } as TriggerConfig, [node("n1")]);
		const b = definitionSignature({ type: "record_created", objectType: "client" } as TriggerConfig, [node("n1")]);
		expect(a).toBe(b);
	});
});

// #16 — the editor computes isDirty by comparing the load-time signature to the
// signature of the working definition, which round-trips through
// automationToReactFlow -> reactFlowToFlatArray before being re-signed (see
// use-automation-editor.ts). Nested arrays (fetch filters, condition
// groups/rules) must survive that round-trip in the same order, or a freshly
// loaded automation would falsely report unpublished changes.
describe("definitionSignature — load round-trip stability", () => {
	const invoiceTrigger: TriggerConfig = {
		type: "status_changed",
		objectType: "invoice",
		toStatus: "overdue",
	};

	// A fetch with multiple filter groups (multiple rules each) and a condition
	// with multiple groups — the array-order-sensitive shapes #16 is about.
	const fetchConfig: FetchNodeConfig = {
		kind: "fetch_records",
		objectType: "invoice",
		filters: [
			{
				logic: "and",
				rules: [
					{
						field: "status",
						operator: "equals",
						value: { kind: "static", value: "overdue" },
					},
					{
						field: "total",
						operator: "gte",
						value: { kind: "static", value: 100 },
					},
				],
			},
			{
				logic: "or",
				rules: [
					{
						field: "dueDate",
						operator: "before",
						value: { kind: "static", value: "2026-01-01" },
					},
				],
			},
		],
	};

	const conditionConfig: ConditionNodeConfig = {
		kind: "condition",
		logic: "and",
		groups: [
			{
				logic: "and",
				rules: [
					{
						field: "status",
						operator: "equals",
						value: { kind: "static", value: "overdue" },
					},
					{
						field: "total",
						operator: "greater_than",
						value: { kind: "static", value: 50 },
					},
				],
			},
			{
				logic: "or",
				rules: [{ field: "invoiceNumber", operator: "is_not_empty" }],
			},
		],
	};

	const nodes: WorkflowNode[] = [
		{
			id: "fetch1",
			type: "fetch_records",
			config: fetchConfig,
			nextNodeId: "cond1",
		},
		{
			id: "cond1",
			type: "condition",
			config: conditionConfig,
			nextNodeId: "action1",
		},
		{
			id: "action1",
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
		},
	];

	it("keeps the signature stable across automationToReactFlow -> reactFlowToFlatArray", () => {
		// Load-time signature (editor state right after the row loads — the real
		// editor always maps stored nodes through legacyNodeToV2 first, which
		// canonicalizes legacy configs).
		const loadedSig = definitionSignature(
			invoiceTrigger,
			nodes.map(legacyNodeToV2)
		);

		// Working signature: what the editor re-signs after the RF round-trip.
		const { nodes: rfNodes, edges: rfEdges } = automationToReactFlow(
			invoiceTrigger,
			nodes
		);
		const serialized = reactFlowToFlatArray(rfNodes, rfEdges);
		const workingSig = definitionSignature(
			serialized.trigger,
			serialized.nodes
		);

		// Stable => isDirty would be false immediately after load.
		expect(workingSig).toBe(loadedSig);
	});
});

describe("stored scheduled triggers with a legacy objectType (A1)", () => {
	it("signs identically with and without the stored objectType", () => {
		// Old rows carry objectType on scheduled triggers; the save path strips
		// it. If load kept it, the published signature could never equal the
		// draft signature and every stored scheduled automation would wear a
		// "Publish changes" badge forever.
		const schedule = {
			frequency: "daily",
			timezone: "UTC",
			time: "09:00",
		} as const;
		const legacyStored = {
			type: "scheduled",
			objectType: "quote",
			schedule,
		} as unknown as AutomationTrigger;
		const cleanStored = {
			type: "scheduled",
			schedule,
		} as unknown as AutomationTrigger;

		const nodes: WorkflowNode[] = [node("n1")];
		const legacySig = definitionSignature(
			legacyTriggerToDraft(legacyStored),
			nodes
		);
		const cleanSig = definitionSignature(
			legacyTriggerToDraft(cleanStored),
			nodes
		);
		expect(legacySig).toBe(cleanSig);
	});
});

describe("stored single-field update_field upgrades (B2)", () => {
	it("signs identically at load and at save — never permanently dirty", () => {
		// The editor upgrades a legacy single-field config to a one-row
		// update_fields. Load (legacyNodeToV2) and save (serializeEditorNodes)
		// must BOTH apply it, or every stored automation with an update_field
		// wears an "unsaved changes" badge it can never shed.
		const stored = node("n1");
		const loaded = [legacyNodeToV2(stored)];
		const savedSig = definitionSignature(trigger, loaded);
		const workingSig = definitionSignature(
			trigger,
			serializeEditorNodes(loaded)
		);
		expect(workingSig).toBe(savedSig);

		// And the upgrade really happened: both sides sign the multi-field shape.
		const upgraded: WorkflowNode = {
			...stored,
			config: {
				kind: "action",
				action: {
					type: "update_fields",
					target: "self",
					fields: [{ field: "notes", value: { kind: "static", value: "hi" } }],
				},
			},
		};
		expect(savedSig).toBe(definitionSignature(trigger, [upgraded]));
	});

	it("save normalizes even when a raw update_field sneaks into editor state", () => {
		// serializeEditorNodes must canonicalize on its own — signature symmetry
		// cannot depend on every state producer having gone through load.
		const raw = node("n1");
		const serialized = serializeEditorNodes([raw]);
		expect(serialized[0].config).toEqual({
			kind: "action",
			action: {
				type: "update_fields",
				target: "self",
				fields: [{ field: "notes", value: { kind: "static", value: "hi" } }],
			},
		});
	});
});
