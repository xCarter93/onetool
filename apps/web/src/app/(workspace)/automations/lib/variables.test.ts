import { describe, it, expect } from "vitest";
import {
	getAllVariableOptions,
	getAvailableVariables,
	getScopeObjectType,
	getUpstreamFetchNodes,
} from "./variables";
import type {
	FetchNodeConfig,
	FormulaResource,
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

	it("offers trigger.record._id first, labeled with the trigger's entity type", () => {
		const target = actionNode("a1");
		const options = getAvailableVariables([target], statusChangedTrigger, "a1");
		const triggerOptions = options.filter((o) => o.group === "Trigger");
		expect(triggerOptions[0]).toEqual({
			path: "trigger.record._id",
			label: "Trigger → Client ID",
			group: "Trigger",
			fieldType: "id",
		});
	});

	it("suffixes id-type FK field labels with ' ID' to disambiguate from the related record", () => {
		const target = actionNode("a1");
		const taskTrigger: TriggerConfig = { type: "record_created", objectType: "task" };
		const options = getAvailableVariables([target], taskTrigger, "a1");
		const clientId = options.find((o) => o.path === "trigger.record.clientId");
		expect(clientId?.label).toBe("Trigger → Client ID");
		expect(clientId?.fieldType).toBe("id");
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

		const loopItemId = insideBody.find((o) => o.path === "loop.loop1.item._id");
		expect(loopItemId).toEqual({
			path: "loop.loop1.item._id",
			label: "Loop item → Project ID",
			group: "Loop item",
			fieldType: "id",
		});

		const outsideBody = getAvailableVariables(nodes, statusChangedTrigger, "after1");
		expect(outsideBody.some((o) => o.path.startsWith("loop.loop1."))).toBe(false);

		const atLoopItself = getAvailableVariables(nodes, statusChangedTrigger, "loop1");
		expect(atLoopItself.some((o) => o.path.startsWith("loop.loop1."))).toBe(false);
	});

	it("caveats user.* globals as empty on scheduled runs (populated on manual + user-caused event runs since Phase 1.4)", () => {
		const target = actionNode("a1");
		const options = getAvailableVariables([target], statusChangedTrigger, "a1");
		const userName = options.find((o) => o.path === "user.name");
		expect(userName?.label).toContain("(empty on scheduled runs)");
	});

	it("offers a formula referencing only trigger fields anywhere, but not one referencing a loop item outside the loop", () => {
		const fetch = fetchNode("f1", "project");
		const loop = loopNode("loop1", "f1", { bodyStartNodeId: "body1" });
		const bodyAction = actionNode("body1");
		const afterAction = actionNode("after1");
		const nodes = [fetch, loop, bodyAction, afterAction];

		const formulas: FormulaResource[] = [
			{
				id: "triggerOnly",
				name: "Trigger only",
				returnType: "text",
				expression: "{trigger.record.companyName}",
			},
			{
				id: "loopItem",
				name: "Loop item",
				returnType: "text",
				expression: "{loop.loop1.item.title}",
			},
		];

		const outsideLoop = getAvailableVariables(
			nodes,
			statusChangedTrigger,
			"after1",
			formulas
		);
		expect(outsideLoop.some((o) => o.path === "formula.triggerOnly")).toBe(true);
		expect(outsideLoop.some((o) => o.path === "formula.loopItem")).toBe(false);

		const insideLoop = getAvailableVariables(
			nodes,
			statusChangedTrigger,
			"body1",
			formulas
		);
		expect(insideLoop.some((o) => o.path === "formula.triggerOnly")).toBe(true);
		expect(insideLoop.some((o) => o.path === "formula.loopItem")).toBe(true);
	});
});

describe("getAllVariableOptions", () => {
	it("offers fetch/loop/computed variables regardless of graph position", () => {
		const fetch = fetchNode("f1", "project", { nextNodeId: "loop1" });
		const loop = loopNode("loop1", "f1", { bodyStartNodeId: "body1", nextNodeId: "after1" });
		const bodyAction = actionNode("body1");
		const afterAction = actionNode("after1");
		const nodes = [fetch, loop, bodyAction, afterAction];

		// Node.count is normally scoped to nodes downstream of the fetch; the
		// union catalog offers it everywhere, including "before" the fetch node.
		const options = getAllVariableOptions(nodes, statusChangedTrigger);
		expect(options.some((o) => o.path === "node.f1.count")).toBe(true);
		expect(options.some((o) => o.path === "loop.loop1.item.title")).toBe(true);
		expect(options.some((o) => o.path === "loop.loop1.index")).toBe(true);
		expect(options.some((o) => o.path === "trigger.record.companyName")).toBe(true);
		expect(options.some((o) => o.path === "workflow.now")).toBe(true);
	});

	it("includes every formula unfiltered, unlike getAvailableVariables", () => {
		const target = actionNode("a1");
		const formulas: FormulaResource[] = [
			{
				id: "loopItem",
				name: "Loop item",
				returnType: "text",
				expression: "{loop.someLoop.item.title}",
			},
		];

		const scoped = getAvailableVariables([target], statusChangedTrigger, "a1", formulas);
		expect(scoped.some((o) => o.path === "formula.loopItem")).toBe(false);

		const all = getAllVariableOptions([target], statusChangedTrigger, formulas);
		expect(all.some((o) => o.path === "formula.loopItem")).toBe(true);
	});
});

describe("getScopeObjectType", () => {
	const fetch = fetchNode("f1", "project");
	const loop = loopNode("loop1", "f1", { bodyStartNodeId: "body1" });
	const bodyAction = actionNode("body1", { nextNodeId: "body2" });
	const bodyAction2 = actionNode("body2");
	const afterAction = actionNode("after1");
	const nodes = [fetch, loop, bodyAction, bodyAction2, afterAction];

	it("returns the loop's fetched item type for nodes anywhere in the loop body", () => {
		expect(getScopeObjectType(nodes, "body1", "client")).toEqual({
			objectType: "project",
			inLoop: true,
			loopNodeId: "loop1",
		});
		expect(getScopeObjectType(nodes, "body2", "client")).toEqual({
			objectType: "project",
			inLoop: true,
			loopNodeId: "loop1",
		});
	});

	it("returns the trigger type for nodes outside any loop body", () => {
		expect(getScopeObjectType(nodes, "after1", "client")).toEqual({
			objectType: "client",
			inLoop: false,
			loopNodeId: null,
		});
	});

	it("treats the loop node itself as running in the enclosing (trigger) scope", () => {
		expect(getScopeObjectType(nodes, "loop1", "client")).toEqual({
			objectType: "client",
			inLoop: false,
			loopNodeId: null,
		});
	});

	it("stays in-loop but falls back to the trigger type when the fetch source is unresolved", () => {
		const looseLoop = loopNode("loop2", "missing", { bodyStartNodeId: "b1" });
		const body = actionNode("b1");
		expect(getScopeObjectType([looseLoop, body], "b1", "client")).toEqual({
			objectType: "client",
			inLoop: true,
			loopNodeId: "loop2",
		});
	});

	// condition-config.tsx builds ConditionNodeConfig.source from this result:
	// { loopNodeId } inside a loop body, "trigger" everywhere else.
	it("loopNodeId is the shape condition-config.tsx needs for ConditionNodeConfig.source", () => {
		const insideLoop = getScopeObjectType(nodes, "body1", "client");
		const sourceInLoop =
			insideLoop.inLoop && insideLoop.loopNodeId
				? { loopNodeId: insideLoop.loopNodeId }
				: "trigger";
		expect(sourceInLoop).toEqual({ loopNodeId: "loop1" });

		const outsideLoop = getScopeObjectType(nodes, "after1", "client");
		const sourceOutsideLoop =
			outsideLoop.inLoop && outsideLoop.loopNodeId
				? { loopNodeId: outsideLoop.loopNodeId }
				: "trigger";
		expect(sourceOutsideLoop).toBe("trigger");
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
