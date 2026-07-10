import { describe, it, expect } from "vitest";
import { sanitizeReportFilters } from "../report-filters-editor";
import type { ReportFilters } from "@onetool/backend/convex/lib/reportFilters";

describe("sanitizeReportFilters", () => {
	it("returns undefined for undefined input", () => {
		expect(sanitizeReportFilters(undefined)).toBeUndefined();
	});

	it("returns undefined when all groups are empty", () => {
		const filters: ReportFilters = { logic: "and", groups: [{ logic: "and", rules: [] }] };
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
				{ logic: "and", rules: [{ field: "status", operator: "equals", value: "active" }] },
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
			groups: [{ logic: "and", rules: [{ field: "", operator: "equals", value: "x" }] }],
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
				{ logic: "and", rules: [{ field: "status", operator: "equals", value: "active" }] },
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
