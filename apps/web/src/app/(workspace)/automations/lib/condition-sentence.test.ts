import { describe, it, expect } from "vitest";
import {
	conditionSentence,
	conditionSentenceParts,
} from "./condition-sentence";
import type { ConditionGroup } from "./node-types";

function rule(
	field: string,
	operator: string,
	value?: string | number | boolean
): ConditionGroup["rules"][number] {
	return {
		field,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		operator: operator as any,
		...(value !== undefined
			? { value: { kind: "static" as const, value } }
			: {}),
	};
}

describe("conditionSentence", () => {
	it('renders the "1 AND (2 OR 3)" shape with group parentheses', () => {
		const groups: ConditionGroup[] = [
			{ logic: "and", rules: [rule("status", "equals", "sent")] },
			{
				logic: "or",
				rules: [
					rule("title", "contains", "Kitchen"),
					rule("total", "gte", 500),
				],
			},
		];
		expect(conditionSentence("and", groups, "quote")).toBe(
			'Status equals Sent and (Title contains "Kitchen" or Total is at least 500)'
		);
	});

	it("renders a single group without parentheses", () => {
		const groups: ConditionGroup[] = [
			{
				logic: "and",
				rules: [
					rule("status", "equals", "sent"),
					rule("total", "gte", 500),
				],
			},
		];
		expect(conditionSentence("and", groups, "quote")).toBe(
			"Status equals Sent and Total is at least 500"
		);
	});

	it("renders valueless operators without a value", () => {
		const groups: ConditionGroup[] = [
			{ logic: "and", rules: [rule("title", "is_not_empty")] },
		];
		expect(conditionSentence("and", groups, "quote")).toBe(
			"Title is not empty"
		);
	});

	it("falls back to the raw field key when the object type is unknown", () => {
		const groups: ConditionGroup[] = [
			{ logic: "and", rules: [rule("customThing", "equals", "x")] },
		];
		expect(conditionSentence("and", groups, null)).toBe(
			'customThing equals "x"'
		);
	});

	it("renders trigger.record._id as a plain-English record ID reference", () => {
		const groups: ConditionGroup[] = [
			{
				logic: "and",
				rules: [
					{
						field: "clientId",
						operator: "equals" as const,
						value: { kind: "var", path: "trigger.record._id" },
					},
				],
			},
		];
		expect(conditionSentence("and", groups, "task")).toBe(
			"Client equals Trigger record ID"
		);
	});

	it("skips incomplete rules and empty groups", () => {
		const groups: ConditionGroup[] = [
			{ logic: "and", rules: [rule("", "equals", "x")] },
			{ logic: "and", rules: [rule("status", "equals", "sent")] },
			{ logic: "and", rules: [] },
		];
		// Only one group survives, so no parentheses appear.
		expect(conditionSentence("or", groups, "quote")).toBe(
			"Status equals Sent"
		);
	});

	it("returns no parts when nothing is complete", () => {
		const groups: ConditionGroup[] = [
			{ logic: "and", rules: [rule("status", "equals", "")] },
		];
		expect(conditionSentenceParts("and", groups, "quote")).toEqual([]);
	});

	it("marks rule phrases as rule parts and connectors as text", () => {
		const groups: ConditionGroup[] = [
			{
				logic: "and",
				rules: [
					rule("status", "equals", "sent"),
					rule("total", "gte", 500),
				],
			},
		];
		const parts = conditionSentenceParts("and", groups, "quote");
		expect(parts.map((p) => p.kind)).toEqual(["rule", "text", "rule"]);
		expect(parts[1].text).toBe(" and ");
	});
});
