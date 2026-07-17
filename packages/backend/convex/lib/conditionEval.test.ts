import { describe, it, expect, vi } from "vitest";

// Wrap parseFormula with a spy (delegating to the real parser) so the AST-cache
// test can assert it runs once per formula across many references.
const { parseSpy } = vi.hoisted(() => ({ parseSpy: vi.fn() }));
vi.mock("./formula", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./formula")>();
	parseSpy.mockImplementation(actual.parseFormula);
	return { ...actual, parseFormula: parseSpy };
});

import {
	evaluateConditionGroups,
	evaluateGroup,
	evaluateRule,
	interpolateTemplate,
	resolveValueRef,
	type VariableScope,
} from "./conditionEval";
import type { ConditionGroup, ConditionRule, ValueRef } from "./workflowTypes";

const emptyScope: VariableScope = {};

function staticRef(value: string | number | boolean | null): ValueRef {
	return { kind: "static", value };
}

function rule(
	field: string,
	operator: ConditionRule["operator"],
	value?: ValueRef
): ConditionRule {
	return { field, operator, value };
}

describe("resolveValueRef", () => {
	const scope: VariableScope = {
		trigger: {
			record: { status: "active", amount: 150, "weird.key": "dotted" },
			event: { oldValue: "lead", newValue: "active" },
		},
		loops: {
			loop1: { item: { title: "Task A", done: false }, index: 3, count: 12 },
		},
		nodes: {
			fetch1: { count: 7 },
			calc1: { result: 42.5 },
		},
		workflow: { now: 1_700_000_000_000 },
		org: { id: "org123", name: "Acme Co" },
		user: { id: "user123", name: "Ada", email: "ada@acme.test" },
		run: {
			automationName: "Nightly cleanup",
			automationId: "auto123",
			executionId: "exec123",
			triggerType: "scheduled",
		},
	};

	it("returns static values as-is", () => {
		expect(resolveValueRef(staticRef("hello"), scope)).toBe("hello");
		expect(resolveValueRef(staticRef(42), scope)).toBe(42);
		expect(resolveValueRef(staticRef(false), scope)).toBe(false);
		expect(resolveValueRef(staticRef(null), scope)).toBe(null);
	});

	it("resolves trigger.record.<field>", () => {
		expect(
			resolveValueRef({ kind: "var", path: "trigger.record.status" }, scope)
		).toBe("active");
		expect(
			resolveValueRef({ kind: "var", path: "trigger.record.amount" }, scope)
		).toBe(150);
	});

	it("resolves field keys that contain dots via prefix matching", () => {
		expect(
			resolveValueRef({ kind: "var", path: "trigger.record.weird.key" }, scope)
		).toBe("dotted");
	});

	it("resolves trigger.event.oldValue and newValue", () => {
		expect(
			resolveValueRef({ kind: "var", path: "trigger.event.oldValue" }, scope)
		).toBe("lead");
		expect(
			resolveValueRef({ kind: "var", path: "trigger.event.newValue" }, scope)
		).toBe("active");
	});

	it("resolves loop.<id>.item.<field> and loop.<id>.index", () => {
		expect(
			resolveValueRef({ kind: "var", path: "loop.loop1.item.title" }, scope)
		).toBe("Task A");
		expect(
			resolveValueRef({ kind: "var", path: "loop.loop1.item.done" }, scope)
		).toBe(false);
		expect(
			resolveValueRef({ kind: "var", path: "loop.loop1.index" }, scope)
		).toBe(3);
	});

	it("resolves loop.<id>.position (1-based) and loop.<id>.count", () => {
		// position is index + 1; count is the loop's total item size.
		expect(
			resolveValueRef({ kind: "var", path: "loop.loop1.position" }, scope)
		).toBe(4);
		expect(
			resolveValueRef({ kind: "var", path: "loop.loop1.count" }, scope)
		).toBe(12);
	});

	it("resolves run.* metadata globals", () => {
		expect(
			resolveValueRef({ kind: "var", path: "run.automationName" }, scope)
		).toBe("Nightly cleanup");
		expect(
			resolveValueRef({ kind: "var", path: "run.automationId" }, scope)
		).toBe("auto123");
		expect(
			resolveValueRef({ kind: "var", path: "run.executionId" }, scope)
		).toBe("exec123");
		expect(
			resolveValueRef({ kind: "var", path: "run.triggerType" }, scope)
		).toBe("scheduled");
	});

	it("resolves node.<id>.count", () => {
		expect(
			resolveValueRef({ kind: "var", path: "node.fetch1.count" }, scope)
		).toBe(7);
	});

	it("resolves node.<id>.result (aggregate/adjust-time output)", () => {
		expect(
			resolveValueRef({ kind: "var", path: "node.calc1.result" }, scope)
		).toBe(42.5);
	});

	it("resolves built-in globals (workflow / org / user)", () => {
		expect(
			resolveValueRef({ kind: "var", path: "workflow.now" }, scope)
		).toBe(1_700_000_000_000);
		expect(resolveValueRef({ kind: "var", path: "org.id" }, scope)).toBe(
			"org123"
		);
		expect(resolveValueRef({ kind: "var", path: "org.name" }, scope)).toBe(
			"Acme Co"
		);
		expect(resolveValueRef({ kind: "var", path: "user.id" }, scope)).toBe(
			"user123"
		);
		expect(resolveValueRef({ kind: "var", path: "user.name" }, scope)).toBe(
			"Ada"
		);
		expect(resolveValueRef({ kind: "var", path: "user.email" }, scope)).toBe(
			"ada@acme.test"
		);
	});

	it("returns fallback for globals missing on the scope (e.g. user on scheduled runs)", () => {
		expect(
			resolveValueRef(
				{ kind: "var", path: "user.email", fallback: "none" },
				emptyScope
			)
		).toBe("none");
	});

	it("returns undefined for unknown or malformed paths", () => {
		expect(resolveValueRef({ kind: "var", path: "bogus.path" }, scope)).toBe(
			undefined
		);
		expect(
			resolveValueRef({ kind: "var", path: "trigger.record.missing" }, scope)
		).toBe(undefined);
		expect(
			resolveValueRef({ kind: "var", path: "loop.nope.item.title" }, scope)
		).toBe(undefined);
		expect(
			resolveValueRef({ kind: "var", path: "loop.loop1.bogus" }, scope)
		).toBe(undefined);
		expect(
			resolveValueRef({ kind: "var", path: "node.fetch1.total" }, scope)
		).toBe(undefined);
		expect(resolveValueRef({ kind: "var", path: "trigger.record." }, scope)).toBe(
			undefined
		);
	});

	it("returns undefined when scope sections are absent", () => {
		expect(
			resolveValueRef({ kind: "var", path: "trigger.record.status" }, emptyScope)
		).toBe(undefined);
		expect(
			resolveValueRef({ kind: "var", path: "trigger.event.oldValue" }, emptyScope)
		).toBe(undefined);
		expect(
			resolveValueRef({ kind: "var", path: "node.fetch1.count" }, emptyScope)
		).toBe(undefined);
	});

	it("uses the fallback when the path is missing", () => {
		expect(
			resolveValueRef(
				{ kind: "var", path: "trigger.record.missing", fallback: "default" },
				scope
			)
		).toBe("default");
		expect(
			resolveValueRef(
				{ kind: "var", path: "node.nope.count", fallback: 0 },
				scope
			)
		).toBe(0);
	});

	it("prefers the resolved value over the fallback", () => {
		expect(
			resolveValueRef(
				{ kind: "var", path: "trigger.record.status", fallback: "default" },
				scope
			)
		).toBe("active");
	});

	it("applies the fallback to a resolved null (B4-4)", () => {
		// Optional Convex fields make null the common "missing" shape, so a null
		// resolution takes the fallback just like undefined does.
		const nullScope: VariableScope = {
			trigger: { record: { status: null } },
		};
		expect(
			resolveValueRef(
				{ kind: "var", path: "trigger.record.status", fallback: "default" },
				nullScope
			)
		).toBe("default");
	});

	it("returns null (not the value coerced) when null resolves without a fallback", () => {
		const nullScope: VariableScope = {
			trigger: { record: { status: null } },
		};
		expect(
			resolveValueRef({ kind: "var", path: "trigger.record.status" }, nullScope)
		).toBe(null);
	});

	it("never overrides a resolved empty string with the fallback (B4-4)", () => {
		// An empty string is a real value (a cleared field), not "missing".
		const emptyStringScope: VariableScope = {
			trigger: { record: { status: "" } },
		};
		expect(
			resolveValueRef(
				{ kind: "var", path: "trigger.record.status", fallback: "default" },
				emptyStringScope
			)
		).toBe("");
	});
});

describe("interpolateTemplate", () => {
	const scope: VariableScope = {
		trigger: { record: { name: "Acme", total: 99.5 } },
		loops: { l1: { item: { title: "Mow lawn" }, index: 0 } },
	};

	it("replaces multiple tokens", () => {
		expect(
			interpolateTemplate(
				"Client {{trigger.record.name}}: {{loop.l1.item.title}}",
				scope
			)
		).toBe("Client Acme: Mow lawn");
	});

	it("renders missing values as empty string", () => {
		expect(
			interpolateTemplate("Hello {{trigger.record.missing}}!", scope)
		).toBe("Hello !");
		expect(interpolateTemplate("{{bogus.path}}", scope)).toBe("");
	});

	it("stringifies non-string values", () => {
		expect(interpolateTemplate("Total: {{trigger.record.total}}", scope)).toBe(
			"Total: 99.5"
		);
		expect(interpolateTemplate("Index: {{loop.l1.index}}", scope)).toBe(
			"Index: 0"
		);
	});

	it("tolerates whitespace inside the braces", () => {
		expect(interpolateTemplate("{{ trigger.record.name }}", scope)).toBe(
			"Acme"
		);
	});

	it("leaves templates without tokens untouched", () => {
		expect(interpolateTemplate("no tokens here", scope)).toBe(
			"no tokens here"
		);
	});

	it("renders workflow.now as a readable date/time, not a raw timestamp", () => {
		// 1_700_000_000_000 = 2023-11-14T22:13:20Z
		const out = interpolateTemplate("Completed at {{workflow.now}}", {
			workflow: { now: 1_700_000_000_000, tz: "UTC" },
		});
		expect(out).not.toContain("1700000000000");
		expect(out).toContain("Nov");
		expect(out).toContain("2023");
	});

	it("formats date globals in the run timezone", () => {
		const utc = interpolateTemplate("{{workflow.now}}", {
			workflow: { now: 1_700_000_000_000, tz: "UTC" },
		});
		const la = interpolateTemplate("{{workflow.now}}", {
			workflow: { now: 1_700_000_000_000, tz: "America/Los_Angeles" },
		});
		expect(utc).not.toBe(la);
	});

	it("does not date-format non-date numeric fields (e.g. large amounts)", () => {
		expect(
			interpolateTemplate("Total: {{trigger.record.total}}", {
				trigger: { record: { total: 1_700_000_000_000 } },
			})
		).toBe("Total: 1700000000000");
	});
});

describe("evaluateRule", () => {
	describe("equals / not_equals", () => {
		const record = {
			status: "active",
			amount: 100,
			flag: true,
			nothing: null,
		};

		it("strict equality on strings, numbers, booleans, null", () => {
			expect(
				evaluateRule(rule("status", "equals", staticRef("active")), record, emptyScope)
			).toBe(true);
			expect(
				evaluateRule(rule("status", "equals", staticRef("Active")), record, emptyScope)
			).toBe(false);
			expect(
				evaluateRule(rule("amount", "equals", staticRef(100)), record, emptyScope)
			).toBe(true);
			expect(
				evaluateRule(rule("flag", "equals", staticRef(true)), record, emptyScope)
			).toBe(true);
			expect(
				evaluateRule(rule("nothing", "equals", staticRef(null)), record, emptyScope)
			).toBe(true);
		});

		it("coerces numeric strings when compared to numbers (both directions)", () => {
			expect(
				evaluateRule(rule("amount", "equals", staticRef("100")), record, emptyScope)
			).toBe(true);
			const stringRecord = { amount: "100" };
			expect(
				evaluateRule(rule("amount", "equals", staticRef(100)), stringRecord, emptyScope)
			).toBe(true);
			expect(
				evaluateRule(rule("amount", "equals", staticRef("abc")), record, emptyScope)
			).toBe(false);
			// Empty string does not coerce to 0.
			expect(
				evaluateRule(rule("amount", "equals", staticRef("")), { amount: 0 }, emptyScope)
			).toBe(false);
		});

		it("does not treat boolean/number pairs as equal", () => {
			expect(
				evaluateRule(rule("flag", "equals", staticRef(1)), record, emptyScope)
			).toBe(false);
		});

		it("missing field equals only an undefined comparison", () => {
			// No rule.value => comparison is undefined => undefined === undefined.
			expect(evaluateRule(rule("missing", "equals"), record, emptyScope)).toBe(
				true
			);
			expect(
				evaluateRule(rule("missing", "equals", staticRef(null)), record, emptyScope)
			).toBe(false);
		});

		it("not_equals negates", () => {
			expect(
				evaluateRule(rule("status", "not_equals", staticRef("lead")), record, emptyScope)
			).toBe(true);
			expect(
				evaluateRule(rule("amount", "not_equals", staticRef("100")), record, emptyScope)
			).toBe(false);
		});

		describe("array-valued fields match on membership (B8)", () => {
			// project.assignedUserIds is an array; "Assigned team equals Alice"
			// has to mean "Alice is on the team", not "the array IS Alice".
			const team = { assignedUserIds: ["u1", "u2"], empty: [] as string[] };

			it("equals is true for any member, false for a non-member", () => {
				expect(
					evaluateRule(
						rule("assignedUserIds", "equals", staticRef("u1")),
						team,
						emptyScope
					)
				).toBe(true);
				expect(
					evaluateRule(
						rule("assignedUserIds", "equals", staticRef("u2")),
						team,
						emptyScope
					)
				).toBe(true);
				expect(
					evaluateRule(
						rule("assignedUserIds", "equals", staticRef("u3")),
						team,
						emptyScope
					)
				).toBe(false);
			});

			it("not_equals negates membership", () => {
				expect(
					evaluateRule(
						rule("assignedUserIds", "not_equals", staticRef("u3")),
						team,
						emptyScope
					)
				).toBe(true);
				expect(
					evaluateRule(
						rule("assignedUserIds", "not_equals", staticRef("u1")),
						team,
						emptyScope
					)
				).toBe(false);
			});

			it("an empty array matches nothing and reads as empty", () => {
				expect(
					evaluateRule(rule("empty", "equals", staticRef("u1")), team, emptyScope)
				).toBe(false);
				expect(evaluateRule(rule("empty", "is_empty"), team, emptyScope)).toBe(
					true
				);
				expect(
					evaluateRule(rule("assignedUserIds", "is_empty"), team, emptyScope)
				).toBe(false);
			});
		});

		describe("array compare values match on membership (B8 symmetric)", () => {
			// The array can sit on the value side too: "task.assigneeUserId
			// equals {{loop.x.item.assignedUserIds}}" means "assignee is one of
			// the team", not strict equality against the array.
			const teamScope: VariableScope = {
				trigger: { record: { assignedUserIds: ["u1", "u2"], noTeam: [] } },
			};
			const teamRef: ValueRef = {
				kind: "var",
				path: "trigger.record.assignedUserIds",
			};

			it("equals is true for a member field, false for a non-member", () => {
				expect(
					evaluateRule(
						rule("assigneeUserId", "equals", teamRef),
						{ assigneeUserId: "u2" },
						teamScope
					)
				).toBe(true);
				expect(
					evaluateRule(
						rule("assigneeUserId", "equals", teamRef),
						{ assigneeUserId: "u3" },
						teamScope
					)
				).toBe(false);
			});

			it("not_equals negates membership", () => {
				expect(
					evaluateRule(
						rule("assigneeUserId", "not_equals", teamRef),
						{ assigneeUserId: "u3" },
						teamScope
					)
				).toBe(true);
				expect(
					evaluateRule(
						rule("assigneeUserId", "not_equals", teamRef),
						{ assigneeUserId: "u1" },
						teamScope
					)
				).toBe(false);
			});

			it("two arrays match when they share at least one member", () => {
				expect(
					evaluateRule(
						rule("assignedUserIds", "equals", teamRef),
						{ assignedUserIds: ["u2", "u9"] },
						teamScope
					)
				).toBe(true);
				expect(
					evaluateRule(
						rule("assignedUserIds", "equals", teamRef),
						{ assignedUserIds: ["u8", "u9"] },
						teamScope
					)
				).toBe(false);
				expect(
					evaluateRule(
						rule("assignedUserIds", "equals", teamRef),
						{ assignedUserIds: [] },
						teamScope
					)
				).toBe(false);
			});

			it("an empty array value matches nothing", () => {
				expect(
					evaluateRule(
						rule("assigneeUserId", "equals", {
							kind: "var",
							path: "trigger.record.noTeam",
						}),
						{ assigneeUserId: "u1" },
						teamScope
					)
				).toBe(false);
			});
		});
	});

	describe("contains / not_contains", () => {
		const record = {
			description: "Weekly Lawn Care",
			tags: ["vip", "priority"],
			counts: [1, 2, 3],
			amount: 42,
			nothing: null,
		};

		it("string contains is case-insensitive", () => {
			expect(
				evaluateRule(rule("description", "contains", staticRef("lawn")), record, emptyScope)
			).toBe(true);
			expect(
				evaluateRule(rule("description", "contains", staticRef("LAWN CARE")), record, emptyScope)
			).toBe(true);
			expect(
				evaluateRule(rule("description", "contains", staticRef("hvac")), record, emptyScope)
			).toBe(false);
		});

		it("array contains checks membership", () => {
			expect(
				evaluateRule(rule("tags", "contains", staticRef("vip")), record, emptyScope)
			).toBe(true);
			expect(
				evaluateRule(rule("tags", "contains", staticRef("gold")), record, emptyScope)
			).toBe(false);
			expect(
				evaluateRule(rule("counts", "contains", staticRef(2)), record, emptyScope)
			).toBe(true);
		});

		it("non-string/array field is never contains", () => {
			expect(
				evaluateRule(rule("amount", "contains", staticRef("4")), record, emptyScope)
			).toBe(false);
			expect(
				evaluateRule(rule("nothing", "contains", staticRef("x")), record, emptyScope)
			).toBe(false);
			expect(
				evaluateRule(rule("missing", "contains", staticRef("x")), record, emptyScope)
			).toBe(false);
		});

		it("not_contains is true when the field is missing or non-containable", () => {
			expect(
				evaluateRule(rule("missing", "not_contains", staticRef("x")), record, emptyScope)
			).toBe(true);
			expect(
				evaluateRule(rule("nothing", "not_contains", staticRef("x")), record, emptyScope)
			).toBe(true);
			expect(
				evaluateRule(rule("tags", "not_contains", staticRef("vip")), record, emptyScope)
			).toBe(false);
			expect(
				evaluateRule(rule("description", "not_contains", staticRef("hvac")), record, emptyScope)
			).toBe(true);
		});
	});

	describe("is_empty / is_not_empty", () => {
		const record = {
			empty: "",
			nothing: null,
			list: [] as unknown[],
			full: "x",
			items: [1],
			zero: 0,
			no: false,
		};

		it("undefined, null, empty string, and empty array are empty", () => {
			expect(evaluateRule(rule("missing", "is_empty"), record, emptyScope)).toBe(true);
			expect(evaluateRule(rule("empty", "is_empty"), record, emptyScope)).toBe(true);
			expect(evaluateRule(rule("nothing", "is_empty"), record, emptyScope)).toBe(true);
			expect(evaluateRule(rule("list", "is_empty"), record, emptyScope)).toBe(true);
		});

		it("zero, false, and non-empty values are not empty", () => {
			expect(evaluateRule(rule("zero", "is_empty"), record, emptyScope)).toBe(false);
			expect(evaluateRule(rule("no", "is_empty"), record, emptyScope)).toBe(false);
			expect(evaluateRule(rule("full", "is_empty"), record, emptyScope)).toBe(false);
			expect(evaluateRule(rule("items", "is_empty"), record, emptyScope)).toBe(false);
		});

		it("is_not_empty negates", () => {
			expect(evaluateRule(rule("full", "is_not_empty"), record, emptyScope)).toBe(true);
			expect(evaluateRule(rule("missing", "is_not_empty"), record, emptyScope)).toBe(false);
			expect(evaluateRule(rule("list", "is_not_empty"), record, emptyScope)).toBe(false);
		});
	});

	describe("numeric comparisons (greater_than / less_than / gte / lte)", () => {
		const record = { amount: 100, price: "99.5", bad: "abc", nothing: null };

		it("compares numbers", () => {
			expect(
				evaluateRule(rule("amount", "greater_than", staticRef(50)), record, emptyScope)
			).toBe(true);
			expect(
				evaluateRule(rule("amount", "greater_than", staticRef(100)), record, emptyScope)
			).toBe(false);
			expect(
				evaluateRule(rule("amount", "less_than", staticRef(200)), record, emptyScope)
			).toBe(true);
			expect(
				evaluateRule(rule("amount", "gte", staticRef(100)), record, emptyScope)
			).toBe(true);
			expect(
				evaluateRule(rule("amount", "lte", staticRef(100)), record, emptyScope)
			).toBe(true);
			expect(
				evaluateRule(rule("amount", "lte", staticRef(99)), record, emptyScope)
			).toBe(false);
		});

		it("Number()-coerces numeric strings on either side", () => {
			expect(
				evaluateRule(rule("price", "greater_than", staticRef(99)), record, emptyScope)
			).toBe(true);
			expect(
				evaluateRule(rule("amount", "less_than", staticRef("150")), record, emptyScope)
			).toBe(true);
		});

		it("NaN on either side is false", () => {
			expect(
				evaluateRule(rule("bad", "greater_than", staticRef(1)), record, emptyScope)
			).toBe(false);
			expect(
				evaluateRule(rule("amount", "greater_than", staticRef("abc")), record, emptyScope)
			).toBe(false);
			expect(
				evaluateRule(rule("missing", "less_than", staticRef(1)), record, emptyScope)
			).toBe(false);
			expect(evaluateRule(rule("amount", "gte"), record, emptyScope)).toBe(false);
		});
	});

	describe("is_true / is_false", () => {
		const record = {
			yes: true,
			no: false,
			truthy: 1,
			falsy: 0,
			word: "true",
			nothing: null,
		};

		it("is_true only for boolean true", () => {
			expect(evaluateRule(rule("yes", "is_true"), record, emptyScope)).toBe(true);
			expect(evaluateRule(rule("truthy", "is_true"), record, emptyScope)).toBe(false);
			expect(evaluateRule(rule("word", "is_true"), record, emptyScope)).toBe(false);
			expect(evaluateRule(rule("missing", "is_true"), record, emptyScope)).toBe(false);
		});

		it("is_false only for boolean false", () => {
			expect(evaluateRule(rule("no", "is_false"), record, emptyScope)).toBe(true);
			expect(evaluateRule(rule("falsy", "is_false"), record, emptyScope)).toBe(false);
			expect(evaluateRule(rule("nothing", "is_false"), record, emptyScope)).toBe(false);
			expect(evaluateRule(rule("missing", "is_false"), record, emptyScope)).toBe(false);
		});
	});

	describe("before / after", () => {
		const jan1 = Date.parse("2026-01-01T00:00:00.000Z");
		const record = {
			dueEpoch: jan1,
			dueString: "2026-01-01T00:00:00.000Z",
			bad: "not a date",
			nothing: null,
		};

		it("compares epoch numbers", () => {
			expect(
				evaluateRule(rule("dueEpoch", "before", staticRef(jan1 + 1000)), record, emptyScope)
			).toBe(true);
			expect(
				evaluateRule(rule("dueEpoch", "after", staticRef(jan1 - 1000)), record, emptyScope)
			).toBe(true);
			expect(
				evaluateRule(rule("dueEpoch", "before", staticRef(jan1)), record, emptyScope)
			).toBe(false);
			expect(
				evaluateRule(rule("dueEpoch", "after", staticRef(jan1)), record, emptyScope)
			).toBe(false);
		});

		it("parses date strings on either side", () => {
			expect(
				evaluateRule(
					rule("dueString", "before", staticRef("2026-06-15")),
					record,
					emptyScope
				)
			).toBe(true);
			expect(
				evaluateRule(
					rule("dueEpoch", "after", staticRef("2025-12-31T00:00:00.000Z")),
					record,
					emptyScope
				)
			).toBe(true);
			expect(
				evaluateRule(rule("dueString", "after", staticRef(jan1 - 1)), record, emptyScope)
			).toBe(true);
		});

		it("invalid dates are false", () => {
			expect(
				evaluateRule(rule("bad", "before", staticRef(jan1)), record, emptyScope)
			).toBe(false);
			expect(
				evaluateRule(rule("dueEpoch", "before", staticRef("nope")), record, emptyScope)
			).toBe(false);
			expect(
				evaluateRule(rule("nothing", "after", staticRef(jan1)), record, emptyScope)
			).toBe(false);
			expect(
				evaluateRule(rule("missing", "before", staticRef(jan1)), record, emptyScope)
			).toBe(false);
			expect(evaluateRule(rule("dueEpoch", "before"), record, emptyScope)).toBe(false);
		});
	});

	describe("var comparison values", () => {
		it("compares a record field against a trigger event value", () => {
			const scope: VariableScope = {
				trigger: {
					record: { status: "active" },
					event: { oldValue: "lead", newValue: "active" },
				},
			};
			const record = { status: "active" };
			expect(
				evaluateRule(
					rule("status", "equals", { kind: "var", path: "trigger.event.newValue" }),
					record,
					scope
				)
			).toBe(true);
			expect(
				evaluateRule(
					rule("status", "equals", { kind: "var", path: "trigger.event.oldValue" }),
					record,
					scope
				)
			).toBe(false);
		});

		it("uses the var fallback when the path is missing", () => {
			const record = { amount: 10 };
			expect(
				evaluateRule(
					rule("amount", "gte", {
						kind: "var",
						path: "trigger.record.threshold",
						fallback: 5,
					}),
					record,
					emptyScope
				)
			).toBe(true);
		});
	});
});

describe("evaluateGroup", () => {
	const record = { status: "active", amount: 100 };
	const statusMatch = rule("status", "equals", staticRef("active"));
	const statusMiss = rule("status", "equals", staticRef("lead"));
	const amountMatch = rule("amount", "gte", staticRef(50));
	const amountMiss = rule("amount", "greater_than", staticRef(500));

	it("AND truth table", () => {
		expect(
			evaluateGroup({ logic: "and", rules: [statusMatch, amountMatch] }, record, emptyScope)
		).toBe(true);
		expect(
			evaluateGroup({ logic: "and", rules: [statusMatch, amountMiss] }, record, emptyScope)
		).toBe(false);
		expect(
			evaluateGroup({ logic: "and", rules: [statusMiss, amountMiss] }, record, emptyScope)
		).toBe(false);
	});

	it("OR truth table", () => {
		expect(
			evaluateGroup({ logic: "or", rules: [statusMatch, amountMiss] }, record, emptyScope)
		).toBe(true);
		expect(
			evaluateGroup({ logic: "or", rules: [statusMiss, amountMatch] }, record, emptyScope)
		).toBe(true);
		expect(
			evaluateGroup({ logic: "or", rules: [statusMiss, amountMiss] }, record, emptyScope)
		).toBe(false);
	});

	it("empty rules array is true for both logics", () => {
		expect(evaluateGroup({ logic: "and", rules: [] }, record, emptyScope)).toBe(true);
		expect(evaluateGroup({ logic: "or", rules: [] }, record, emptyScope)).toBe(true);
	});
});

describe("evaluateConditionGroups", () => {
	const record = { status: "active", amount: 100, priority: "high" };

	const passingGroup: ConditionGroup = {
		logic: "and",
		rules: [rule("status", "equals", staticRef("active"))],
	};
	const failingGroup: ConditionGroup = {
		logic: "and",
		rules: [rule("amount", "greater_than", staticRef(500))],
	};

	it("AND across groups", () => {
		expect(
			evaluateConditionGroups("and", [passingGroup, passingGroup], record, emptyScope)
		).toBe(true);
		expect(
			evaluateConditionGroups("and", [passingGroup, failingGroup], record, emptyScope)
		).toBe(false);
	});

	it("OR across groups", () => {
		expect(
			evaluateConditionGroups("or", [failingGroup, passingGroup], record, emptyScope)
		).toBe(true);
		expect(
			evaluateConditionGroups("or", [failingGroup, failingGroup], record, emptyScope)
		).toBe(false);
	});

	it("empty groups array is true for both logics", () => {
		expect(evaluateConditionGroups("and", [], record, emptyScope)).toBe(true);
		expect(evaluateConditionGroups("or", [], record, emptyScope)).toBe(true);
	});

	it("nested two-level logic: OR of (AND-group, OR-group)", () => {
		// Group A (and): status=active AND amount>500 -> false
		// Group B (or): priority=high OR amount>500   -> true
		// OR across groups -> true; AND across groups -> false.
		const groupA: ConditionGroup = {
			logic: "and",
			rules: [
				rule("status", "equals", staticRef("active")),
				rule("amount", "greater_than", staticRef(500)),
			],
		};
		const groupB: ConditionGroup = {
			logic: "or",
			rules: [
				rule("priority", "equals", staticRef("high")),
				rule("amount", "greater_than", staticRef(500)),
			],
		};
		expect(evaluateConditionGroups("or", [groupA, groupB], record, emptyScope)).toBe(true);
		expect(evaluateConditionGroups("and", [groupA, groupB], record, emptyScope)).toBe(false);
	});

	it("nested two-level logic: AND of (OR-group with empty rules, OR-group)", () => {
		const emptyGroup: ConditionGroup = { logic: "or", rules: [] };
		const groupB: ConditionGroup = {
			logic: "or",
			rules: [rule("status", "equals", staticRef("lead"))],
		};
		// Empty group is vacuously true, so the result hinges on groupB.
		expect(
			evaluateConditionGroups("and", [emptyGroup, groupB], record, emptyScope)
		).toBe(false);
		expect(
			evaluateConditionGroups("or", [emptyGroup, groupB], record, emptyScope)
		).toBe(true);
	});
});

describe("formula resolution (formula.<id>)", () => {
	const scope: VariableScope = {
		trigger: { record: { amount: 150 } },
		workflow: { now: Date.parse("2026-07-04T12:00:00Z"), tz: "UTC" },
		formulas: [
			{
				id: "f1",
				name: "Double amount",
				returnType: "number",
				expression: "{trigger.record.amount} * 2",
			},
			{
				id: "f2",
				name: "Plus ten",
				returnType: "number",
				// References another formula → nested resolution.
				expression: "{formula.f1} + 10",
			},
			{
				id: "money",
				name: "Split three ways",
				returnType: "currency",
				expression: "{trigger.record.amount} / 3",
			},
			{
				id: "greeting",
				name: "Greeting",
				returnType: "text",
				expression: 'CONCAT("Owes ", {trigger.record.amount})',
			},
		],
	};

	it("evaluates a formula against the scope", () => {
		expect(
			resolveValueRef({ kind: "var", path: "formula.f1" }, scope)
		).toBe(300);
	});

	it("resolves nested formula references", () => {
		expect(
			resolveValueRef({ kind: "var", path: "formula.f2" }, scope)
		).toBe(310);
	});

	it("rounds currency results to cents", () => {
		expect(
			resolveValueRef({ kind: "var", path: "formula.money" }, scope)
		).toBe(50);
	});

	it("interpolates formulas in text templates", () => {
		expect(interpolateTemplate("{{formula.greeting}}", scope)).toBe("Owes 150");
	});

	it("returns fallback for an unknown formula id", () => {
		expect(
			resolveValueRef(
				{ kind: "var", path: "formula.nope", fallback: "n/a" },
				scope
			)
		).toBe("n/a");
	});

	it("throws on a formula reference cycle (fails closed)", () => {
		const cyclic: VariableScope = {
			formulas: [
				{ id: "a", name: "A", returnType: "number", expression: "{formula.b} + 1" },
				{ id: "b", name: "B", returnType: "number", expression: "{formula.a} + 1" },
			],
		};
		expect(() =>
			resolveValueRef({ kind: "var", path: "formula.a" }, cyclic)
		).toThrow(/cycle/i);
	});

	it("parses each formula once across many references (AST cache)", () => {
		parseSpy.mockClear();
		const memoScope: VariableScope = {
			trigger: { record: { amount: 5 } },
			formulas: [
				{
					id: "dbl",
					name: "Double",
					returnType: "number",
					expression: "{trigger.record.amount} * 2",
				},
			],
		};
		// Simulate a loop body resolving the same formula on every iteration.
		for (let i = 0; i < 50; i++) {
			expect(
				resolveValueRef({ kind: "var", path: "formula.dbl" }, memoScope)
			).toBe(10);
		}
		// The AST is memoized on the scope, so the expression parses exactly once.
		expect(parseSpy).toHaveBeenCalledTimes(1);
	});
});
