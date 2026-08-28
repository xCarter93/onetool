import { describe, it, expect } from "vitest";
import type {
	ReportFilterGroup,
	ReportFilters,
} from "@onetool/backend/convex/lib/reportFilters";
import {
	MAX_RULES_PER_GROUP,
	countFilterRules,
	isDraftComplete,
	moveRuleBetweenGroups,
	reorderGroups,
	sanitizeReportFilters,
} from "../report-filter-model";

const rule = (field: string, value: string) => ({
	field,
	operator: "equals" as const,
	value,
});

const group = (...fields: string[]): ReportFilterGroup => ({
	logic: "and",
	rules: fields.map((f) => rule(f, "x")),
});

describe("sanitizeReportFilters", () => {
	it("returns undefined for undefined input", () => {
		expect(sanitizeReportFilters(undefined)).toBeUndefined();
	});

	it("returns undefined when all groups are empty", () => {
		const filters: ReportFilters = {
			logic: "and",
			groups: [{ logic: "and", rules: [] }],
		};
		expect(sanitizeReportFilters(filters)).toBeUndefined();
	});

	it("strips rules with missing/empty value", () => {
		const filters: ReportFilters = {
			logic: "and",
			groups: [
				{
					logic: "and",
					rules: [
						{ field: "status", operator: "equals", value: "active" },
						{ field: "companyName", operator: "equals", value: "" },
						{ field: "companyName", operator: "equals", value: undefined },
					],
				},
			],
		};
		expect(sanitizeReportFilters(filters)).toEqual({
			logic: "and",
			groups: [
				{
					logic: "and",
					rules: [{ field: "status", operator: "equals", value: "active" }],
				},
			],
		});
	});

	it("keeps is_empty/is_not_empty rules without a value", () => {
		const filters: ReportFilters = {
			logic: "and",
			groups: [
				{ logic: "and", rules: [{ field: "companyName", operator: "is_empty" }] },
			],
		};
		expect(sanitizeReportFilters(filters)).toEqual(filters);
	});

	it("drops a rule with no field selected", () => {
		const filters: ReportFilters = {
			logic: "and",
			groups: [
				{ logic: "and", rules: [{ field: "", operator: "equals", value: "x" }] },
			],
		};
		expect(sanitizeReportFilters(filters)).toBeUndefined();
	});

	it("drops empty groups but keeps non-empty ones, preserving top-level logic", () => {
		const filters: ReportFilters = {
			logic: "or",
			groups: [
				{ logic: "and", rules: [] },
				{
					logic: "and",
					rules: [{ field: "status", operator: "equals", value: "active" }],
				},
			],
		};
		expect(sanitizeReportFilters(filters)).toEqual({
			logic: "or",
			groups: [
				{
					logic: "and",
					rules: [{ field: "status", operator: "equals", value: "active" }],
				},
			],
		});
	});

	it("preserves numeric and boolean values (falsy but not empty)", () => {
		const filters: ReportFilters = {
			logic: "and",
			groups: [
				{
					logic: "and",
					rules: [
						{ field: "total", operator: "equals", value: 0 },
						{ field: "isActive", operator: "equals", value: false },
					],
				},
			],
		};
		expect(sanitizeReportFilters(filters)).toEqual(filters);
	});
});

describe("countFilterRules", () => {
	it("counts complete rules across every group", () => {
		expect(
			countFilterRules({ logic: "or", groups: [group("a", "b"), group("c")] })
		).toBe(3);
	});

	it("ignores incomplete rules and empty groups", () => {
		expect(
			countFilterRules({
				logic: "and",
				groups: [
					{ logic: "and", rules: [{ field: "", operator: "equals" }] },
					{ logic: "and", rules: [] },
				],
			})
		).toBe(0);
	});
});

describe("isDraftComplete", () => {
	it("is false without a field and false without a value", () => {
		expect(isDraftComplete({ field: "", operator: "equals", value: "x" })).toBe(
			false
		);
		expect(
			isDraftComplete({ field: "status", operator: "equals", value: undefined })
		).toBe(false);
	});

	it("is true for a valueless operator", () => {
		expect(isDraftComplete({ field: "status", operator: "is_empty" })).toBe(true);
	});
});

describe("moveRuleBetweenGroups (drag outcome)", () => {
	it("moves a rule into another group at the drop index", () => {
		const groups = [group("a", "b"), group("c", "d")];

		expect(
			moveRuleBetweenGroups(
				groups,
				{ groupIndex: 0, ruleIndex: 1 },
				{ groupIndex: 1, ruleIndex: 0 }
			)
		).toEqual([
			{ logic: "and", rules: [rule("a", "x")] },
			{ logic: "and", rules: [rule("b", "x"), rule("c", "x"), rule("d", "x")] },
		]);
	});

	it("appends when no drop index is given (the keyboard Move-to-group path)", () => {
		const groups = [group("a", "b"), group("c")];

		expect(
			moveRuleBetweenGroups(groups, { groupIndex: 0, ruleIndex: 0 }, { groupIndex: 1 })
		).toEqual([
			{ logic: "and", rules: [rule("b", "x")] },
			{ logic: "and", rules: [rule("c", "x"), rule("a", "x")] },
		]);
	});

	it("reorders within one group with arrayMove semantics", () => {
		const groups = [group("a", "b", "c")];

		expect(
			moveRuleBetweenGroups(
				groups,
				{ groupIndex: 0, ruleIndex: 0 },
				{ groupIndex: 0, ruleIndex: 2 }
			)
		).toEqual([
			{ logic: "and", rules: [rule("b", "x"), rule("c", "x"), rule("a", "x")] },
		]);
	});

	it("drops the source group when the move empties it", () => {
		const groups = [group("a"), group("b", "c")];

		expect(
			moveRuleBetweenGroups(
				groups,
				{ groupIndex: 0, ruleIndex: 0 },
				{ groupIndex: 1, ruleIndex: 1 }
			)
		).toEqual([
			{ logic: "and", rules: [rule("b", "x"), rule("a", "x"), rule("c", "x")] },
		]);
	});

	it("leaves an unrelated empty group alone", () => {
		const groups: ReportFilterGroup[] = [
			group("a", "b"),
			{ logic: "and", rules: [] },
			group("c"),
		];

		expect(
			moveRuleBetweenGroups(
				groups,
				{ groupIndex: 0, ruleIndex: 0 },
				{ groupIndex: 2 }
			)
		).toEqual([
			{ logic: "and", rules: [rule("b", "x")] },
			{ logic: "and", rules: [] },
			{ logic: "and", rules: [rule("c", "x"), rule("a", "x")] },
		]);
	});

	it("rejects a move into a group already at the rule cap", () => {
		const full = group(
			...Array.from({ length: MAX_RULES_PER_GROUP }, (_, i) => `f${i}`)
		);
		const groups = [group("a"), full];

		expect(
			moveRuleBetweenGroups(groups, { groupIndex: 0, ruleIndex: 0 }, { groupIndex: 1 })
		).toEqual(groups);
	});

	it("returns the input unchanged for an out-of-range source or target", () => {
		const groups = [group("a")];

		expect(
			moveRuleBetweenGroups(groups, { groupIndex: 0, ruleIndex: 5 }, { groupIndex: 0 })
		).toEqual(groups);
		expect(
			moveRuleBetweenGroups(groups, { groupIndex: 0, ruleIndex: 0 }, { groupIndex: 3 })
		).toEqual(groups);
	});
});

describe("reorderGroups (drag outcome)", () => {
	it("moves a group to a new position", () => {
		const groups = [group("a"), group("b"), group("c")];

		expect(reorderGroups(groups, 2, 0)).toEqual([
			group("c"),
			group("a"),
			group("b"),
		]);
	});

	it("returns the input unchanged for an out-of-range index", () => {
		const groups = [group("a"), group("b")];

		expect(reorderGroups(groups, 0, 4)).toEqual(groups);
		expect(reorderGroups(groups, -1, 1)).toEqual(groups);
	});
});
