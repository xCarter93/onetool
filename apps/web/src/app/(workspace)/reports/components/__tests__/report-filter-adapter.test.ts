// @vitest-environment jsdom
// Pins R9's filter-adapter surface: timestamp fields are finally filterable
// (the R7 backend operators become reachable), and rule summaries stay honest.
// F1+F5 adds dotted related paths, which resolve through their terminal def.
import { createElement, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { FilterAdapter } from "@/components/shared/filter-adapter";
import { reportFilterAdapter } from "../report-filter-adapter";

// A one-button stand-in so the day-boundary encoding is assertable without
// driving a calendar.
vi.mock("@/components/ui/date-picker", () => ({
	DatePicker: ({ onChange }: { onChange: (date: Date | undefined) => void }) =>
		createElement(
			"button",
			{ onClick: () => onChange(new Date(2026, 7, 27)) },
			"pick"
		),
}));

function pickDate(adapter: FilterAdapter, field: string, operator: string) {
	let captured: string | number | boolean | undefined;
	render(
		adapter.renderValue({
			field,
			operator,
			value: undefined,
			onChange: (value) => {
				captured = value;
			},
		}) as ReactElement
	);
	fireEvent.click(screen.getByRole("button"));
	cleanup();
	return captured;
}

describe("reportFilterAdapter", () => {
	it("offers timestamp fields with the R7 date operators", () => {
		const adapter = reportFilterAdapter("invoices");
		expect(adapter.fields.some((f) => f.value === "issuedDate")).toBe(true);
		expect(adapter.operatorsFor("issuedDate").map((o) => o.value)).toEqual([
			"before",
			"after",
			"on",
			"is_empty",
			"is_not_empty",
		]);
	});

	it("keeps the pre-R9 operator sets for non-timestamp types", () => {
		const adapter = reportFilterAdapter("invoices");
		expect(adapter.operatorsFor("total").map((o) => o.value)).toEqual([
			"equals",
			"not_equals",
			"greater_than",
			"greater_than_or_equal",
			"less_than",
			"less_than_or_equal",
		]);
		expect(adapter.operatorsFor("status").map((o) => o.value)).toContain(
			"contains"
		);
	});

	it("valueless operators need no value; the rest do", () => {
		const adapter = reportFilterAdapter("invoices");
		expect(adapter.needsValue("is_empty")).toBe(false);
		expect(adapter.needsValue("before")).toBe(true);
	});

	it("summarizes timestamp rules with a formatted date, not raw ms", () => {
		const adapter = reportFilterAdapter("invoices");
		const summary = adapter.summarizeRule({
			field: "issuedDate",
			operator: "before",
			value: new Date(2026, 7, 27, 12).getTime(),
		});
		expect(summary).toBe("is before Aug 27, 2026");
	});
});

describe("reportFilterAdapter — related paths", () => {
	const adapter = reportFilterAdapter("quoteLineItems");

	it("keeps the flat field list direct-only", () => {
		expect(adapter.fields.every((f) => !f.value.includes("."))).toBe(true);
	});

	it("takes operators and defaults from the path's terminal def", () => {
		expect(adapter.operatorsFor("quoteId.status").map((o) => o.value)).toEqual([
			"equals",
			"not_equals",
			"contains",
			"is_empty",
			"is_not_empty",
		]);
		expect(adapter.operatorsFor("quoteId.total").map((o) => o.value)).toContain(
			"greater_than"
		);
		expect(adapter.defaultOperatorFor("quoteId.projectId.startDate")).toBe(
			"before"
		);
		expect(adapter.valueDependsOnOperator("quoteId.projectId.startDate")).toBe(
			true
		);
		expect(adapter.valueDependsOnOperator("quoteId.status")).toBe(false);
	});

	it("encodes a dotted timestamp on the same day boundaries as a direct one", () => {
		const day = new Date(2026, 7, 27).getTime();
		const field = "quoteId.projectId.startDate";
		expect(pickDate(adapter, field, "before")).toBe(day);
		expect(pickDate(adapter, field, "after")).toBe(
			new Date(2026, 7, 27, 23, 59, 59, 999).getTime()
		);
		expect(pickDate(adapter, field, "on")).toBe(
			new Date(2026, 7, 27, 12).getTime()
		);
	});

	it("labels and summarizes a dotted rule as a breadcrumb", () => {
		expect(adapter.fieldLabel("quoteId.projectId.startDate")).toBe(
			"Quote › Project › Start Date"
		);
		expect(adapter.fieldLabel("description")).toBe("Description");
		expect(
			adapter.summarizeRule({
				field: "quoteId.projectId.startDate",
				operator: "after",
				value: new Date(2026, 7, 27, 12).getTime(),
			})
		).toBe("is after Aug 27, 2026");
	});

	it("degrades quietly on a path a registry change invalidated", () => {
		expect(adapter.operatorsFor("quoteId.gone")).toEqual([]);
		expect(adapter.defaultOperatorFor("quoteId.gone")).toBe("equals");
		expect(adapter.defaultValueFor("quoteId.gone")).toBeUndefined();
		expect(adapter.valueDependsOnOperator("quoteId.gone")).toBe(false);
		expect(adapter.renderValue({
			field: "quoteId.gone",
			operator: "equals",
			value: undefined,
			onChange: () => {},
		})).toBeNull();
		expect(adapter.fieldLabel("skuId.name")).toBe("skuId.name");
	});
});
