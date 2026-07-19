import { describe, it, expect } from "vitest";
import {
	collectRelationRefs,
	dottedRuleFieldCandidates,
} from "./relationRefs";
import type { ConditionGroup, FormulaResource } from "./workflowTypes";

describe("collectRelationRefs (C6)", () => {
	it("collects trigger relations from ValueRef paths and templates", () => {
		const nodes = [
			{
				id: "act-1",
				type: "action",
				config: {
					kind: "action",
					action: {
						type: "update_field",
						target: "self",
						field: "description",
						value: {
							kind: "var",
							path: "trigger.record.client.companyName",
						},
					},
				},
			},
			{
				id: "act-2",
				type: "action",
				config: {
					kind: "action",
					action: {
						type: "send_notification",
						recipient: "org_admins",
						message:
							"Project {{trigger.record.title}} for {{trigger.record.client.companyName}}",
					},
				},
			},
		];
		const refs = collectRelationRefs(nodes, undefined, undefined);
		expect([...refs.trigger]).toEqual(["client"]);
		expect(refs.loops.size).toBe(0);
	});

	it("collects loop-item relations keyed by loop node id", () => {
		const nodes = [
			{
				id: "act-1",
				type: "action",
				config: {
					kind: "action",
					action: {
						type: "send_notification",
						recipient: "org_admins",
						message: "{{loop.loop-1.item.client.companyName}}",
					},
				},
			},
		];
		const refs = collectRelationRefs(nodes, undefined, undefined);
		expect(refs.trigger.size).toBe(0);
		expect([...(refs.loops.get("loop-1") ?? [])]).toEqual(["client"]);
	});

	it("collects relations referenced from trigger entry criteria value refs", () => {
		const trigger = {
			type: "record_updated",
			objectType: "project",
			entryCriteria: {
				logic: "and",
				groups: [
					{
						logic: "and",
						rules: [
							{
								field: "title",
								operator: "equals",
								value: {
									kind: "var",
									path: "trigger.record.client.companyName",
								},
							},
						],
					},
				],
			},
		};
		const refs = collectRelationRefs([], trigger, undefined);
		expect([...refs.trigger]).toEqual(["client"]);
	});

	it("collects relations referenced inside formula expressions", () => {
		const formulas: FormulaResource[] = [
			{
				id: "f1",
				name: "Client name",
				expression: "{trigger.record.client.companyName}",
				returnType: "text",
			},
		];
		const refs = collectRelationRefs([], undefined, formulas);
		expect([...refs.trigger]).toEqual(["client"]);
	});

	it("ignores flat paths, globals, and unparseable formulas", () => {
		const nodes = [
			{
				id: "act-1",
				config: {
					kind: "action",
					action: {
						message: "{{trigger.record.title}} at {{workflow.now}}",
						value: { kind: "var", path: "node.fetch-1.count" },
					},
				},
			},
		];
		const formulas: FormulaResource[] = [
			{
				id: "f1",
				name: "Broken",
				expression: "{{{not a formula",
				returnType: "number",
			},
		];
		const refs = collectRelationRefs(nodes, undefined, formulas);
		expect(refs.trigger.size).toBe(0);
		expect(refs.loops.size).toBe(0);
	});
});

describe("dottedRuleFieldCandidates (C6)", () => {
	it("returns the first segment of dotted rule fields only", () => {
		const groups: ConditionGroup[] = [
			{
				logic: "and",
				rules: [
					{ field: "status", operator: "equals" },
					{ field: "client.companyName", operator: "contains" },
					{ field: "project.title", operator: "is_not_empty" },
				] as ConditionGroup["rules"],
			},
		];
		expect([...dottedRuleFieldCandidates(groups)].sort()).toEqual([
			"client",
			"project",
		]);
	});

	it("returns empty for flat-only groups", () => {
		const groups: ConditionGroup[] = [
			{
				logic: "or",
				rules: [{ field: "status", operator: "is_empty" }] as ConditionGroup["rules"],
			},
		];
		expect(dottedRuleFieldCandidates(groups).size).toBe(0);
	});
});
