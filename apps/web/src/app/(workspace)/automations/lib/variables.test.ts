import { describe, it, expect } from "vitest";
import { getAvailableVariables, getUpstreamFetchNodes } from "./variables";
import type {
	FetchNodeConfig,
	LoopNodeConfig,
	TriggerConfig,
	WorkflowNode,
} from "./node-types";

const actionNode = (
	id: string,
	overrides?: Partial<WorkflowNode>
): WorkflowNode => ({
	id,
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
	...overrides,
});

const fetchNode = (
	id: string,
	objectType: FetchNodeConfig["objectType"],
	overrides?: Partial<WorkflowNode>
): WorkflowNode => ({
	id,
	type: "fetch_records",
	config: { kind: "fetch_records", objectType, filters: [] },
	...overrides,
});

const loopNode = (
	id: string,
	sourceNodeId: string,
	overrides?: Partial<WorkflowNode>
): WorkflowNode => ({
	id,
	type: "loop",
	config: { kind: "loop", sourceNodeId } satisfies LoopNodeConfig,
	...overrides,
});

const statusChangedTrigger: TriggerConfig = {
	type: "status_changed",
	objectType: "client",
	toStatus: "active",
};

describe("getAvailableVariables", () => {
	it("includes trigger.record.<field> for the trigger's object type", () => {
		const target = actionNode("a1");
		const options = getAvailableVariables([target], statusChangedTrigger, "a1");
		const companyName = options.find(
			(o) => o.path === "trigger.record.companyName"
		);
		expect(companyName).toBeDefined();
		expect(companyName?.label).toBe("Trigger → Company Name");
		expect(companyName?.group).toBe("Trigger");
	});

	it("includes trigger.event.oldValue/newValue only for status_changed triggers", () => {
		const target = actionNode("a1");
		const statusChangedOptions = getAvailableVariables(
			[target],
			statusChangedTrigger,
			"a1"
		);
		expect(
			statusChangedOptions.some((o) => o.path === "trigger.event.oldValue")
		).toBe(true);
		expect(
			statusChangedOptions.some((o) => o.path === "trigger.event.newValue")
		).toBe(true);

		const recordCreatedOptions = getAvailableVariables(
			[target],
			{ type: "record_created", objectType: "client" },
			"a1"
		);
		expect(
			recordCreatedOptions.some((o) => o.path === "trigger.event.oldValue")
		).toBe(false);
	});

	it("exposes node.<fetchNodeId>.count only for fetch nodes upstream of the target", () => {
		const fetch = fetchNode("f1", "project", { nextNodeId: "a1" });
		const target = actionNode("a1");
		const options = getAvailableVariables([fetch, target], statusChangedTrigger, "a1");
		const count = options.find((o) => o.path === "node.f1.count");
		expect(count).toBeDefined();
		expect(count?.label).toBe("Found records (Project) → Count");
		expect(count?.group).toBe("Found records");

		// Not upstream of the fetch node itself.
		const optionsAtFetch = getAvailableVariables(
			[fetch, target],
			statusChangedTrigger,
			"f1"
		);
		expect(optionsAtFetch.some((o) => o.path === "node.f1.count")).toBe(false);
	});

	it("excludes fetch nodes that run after the target (downstream, not upstream)", () => {
		const target = actionNode("a1", { nextNodeId: "f1" });
		const fetch = fetchNode("f1", "project");
		const options = getAvailableVariables([target, fetch], statusChangedTrigger, "a1");
		expect(options.some((o) => o.path === "node.f1.count")).toBe(false);
	});

	it("exposes loop.<loopNodeId>.item.<field> and .index only inside that loop's body", () => {
		const fetch = fetchNode("f1", "project");
		const loop = loopNode("loop1", "f1", { bodyStartNodeId: "body1" });
		const bodyAction = actionNode("body1");
		const afterAction = actionNode("after1");
		const nodes = [fetch, loop, bodyAction, afterAction];

		const insideBody = getAvailableVariables(nodes, statusChangedTrigger, "body1");
		const item = insideBody.find((o) => o.path === "loop.loop1.item.title");
		expect(item).toBeDefined();
		expect(item?.label).toBe("Loop item → Title");
		expect(insideBody.some((o) => o.path === "loop.loop1.index")).toBe(true);

		const outsideBody = getAvailableVariables(nodes, statusChangedTrigger, "after1");
		expect(outsideBody.some((o) => o.path.startsWith("loop.loop1."))).toBe(false);

		const atLoopItself = getAvailableVariables(nodes, statusChangedTrigger, "loop1");
		expect(atLoopItself.some((o) => o.path.startsWith("loop.loop1."))).toBe(false);
	});
});

describe("getUpstreamFetchNodes", () => {
	it("returns fetch nodes reachable to the target node", () => {
		const fetch = fetchNode("f1", "invoice", { nextNodeId: "loop1" });
		const loop = loopNode("loop1", "f1");
		const upstream = getUpstreamFetchNodes([fetch, loop], "loop1");
		expect(upstream).toEqual([{ id: "f1", objectType: "invoice" }]);
	});

	it("excludes fetch nodes that are not upstream of the target", () => {
		const loop = loopNode("loop1", "f1", { nextNodeId: "f1" });
		const fetch = fetchNode("f1", "invoice");
		const upstream = getUpstreamFetchNodes([loop, fetch], "loop1");
		expect(upstream).toEqual([]);
	});
});
