// Pins R9's filter-adapter surface: timestamp fields are finally filterable
// (the R7 backend operators become reachable), and rule summaries stay honest.
import { describe, expect, it } from "vitest";
import { reportFilterAdapter } from "../report-filter-adapter";

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
