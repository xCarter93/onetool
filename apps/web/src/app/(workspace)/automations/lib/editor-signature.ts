import type { TriggerConfig, WorkflowNode } from "./node-types";

/**
 * Content signatures for the editor's dirty / needs-publish state.
 *
 * Both compared sides are the backend node shape, so a signature is stable
 * across renders and independent of node order and object key order.
 */

function stableStringify(value: unknown): string {
	if (value === null || typeof value !== "object") {
		return JSON.stringify(value) ?? "null";
	}
	if (Array.isArray(value)) {
		return `[${value.map(stableStringify).join(",")}]`;
	}
	// Skip undefined-valued keys so `{a: 1}` and `{a: 1, b: undefined}` hash
	// identically (drafts built by hand vs. loaded rows differ in key presence).
	const keys = Object.keys(value as Record<string, unknown>)
		.filter((k) => (value as Record<string, unknown>)[k] !== undefined)
		.sort();
	const entries = keys.map(
		(k) =>
			`${JSON.stringify(k)}:${stableStringify(
				(value as Record<string, unknown>)[k]
			)}`
	);
	return `{${entries.join(",")}}`;
}

type DefinitionNode = Pick<
	WorkflowNode,
	"id" | "type" | "config" | "nextNodeId" | "elseNodeId" | "bodyStartNodeId"
>;

/**
 * Canonical signature of a workflow definition (trigger + nodes), dropping
 * layout-only `position` and normalizing node order.
 */
export function definitionSignature(
	trigger: TriggerConfig | null | undefined,
	nodes: DefinitionNode[]
): string {
	return stableStringify({
		trigger: trigger ?? null,
		nodes: [...nodes]
			.map((n) => ({
				id: n.id,
				type: n.type,
				config: n.config ?? null,
				nextNodeId: n.nextNodeId ?? null,
				elseNodeId: n.elseNodeId ?? null,
				bodyStartNodeId: n.bodyStartNodeId ?? null,
			}))
			.sort((a, b) => a.id.localeCompare(b.id)),
	});
}
