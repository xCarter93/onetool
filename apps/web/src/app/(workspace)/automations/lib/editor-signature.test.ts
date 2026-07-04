import { describe, it, expect } from "vitest";
import { definitionSignature } from "./editor-signature";
import type { TriggerConfig, WorkflowNode } from "./node-types";

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
