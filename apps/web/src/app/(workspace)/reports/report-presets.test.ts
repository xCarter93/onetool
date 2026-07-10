import { describe, it, expect } from "vitest";
import { REPORT_PRESETS } from "@onetool/backend/convex/lib/reportPresets";
import { REPORT_FIELDS, isGenericGroupBy } from "@onetool/backend/convex/lib/reportFields";
import { dateRangeOptions, groupByOptions, visualizationOptions } from "./report-config";
import { PRESET_LIST } from "./report-presets";

const validVizValues = new Set(visualizationOptions.map((o) => o.value));
const validDateRangeValues = new Set(
	dateRangeOptions.map((o) => o.value).filter((v) => v !== "custom")
);

describe("REPORT_PRESETS — builder validity", () => {
	it.each(REPORT_PRESETS.map((p) => [p.id, p] as const))(
		"%s is a valid builder config",
		(_id, preset) => {
			// groupBy is null or a registered Group-by option for this entity.
			if (preset.groupBy !== null) {
				const options = groupByOptions[preset.entityType]?.map((o) => o.value) ?? [];
				expect(options).toContain(preset.groupBy);
			}

			// dateRangePreset is a real, non-custom dateRangeOptions value.
			expect(validDateRangeValues.has(preset.dateRangePreset)).toBe(true);

			// visualization is one of the builder's viz types.
			expect(validVizValues.has(preset.visualization)).toBe(true);

			// columns, when set, are registry fields of this entity.
			if (preset.columns) {
				const fields = Object.keys(REPORT_FIELDS[preset.entityType].fields);
				for (const col of preset.columns) {
					expect(fields).toContain(col);
				}
			}

			// A non-count measure requires groupBy to be null or generic-safe —
			// legacy-only groupBy values ignore measures entirely.
			if (preset.measure && preset.measure.op !== "count") {
				expect(preset.measure.field).not.toBeNull();
				const groupByIsSafe =
					preset.groupBy === null || isGenericGroupBy(preset.entityType, preset.groupBy);
				expect(groupByIsSafe).toBe(true);
			}
		}
	);

	it("every preset appears exactly once in PRESET_LIST with a category assigned", () => {
		expect(PRESET_LIST.length).toBe(REPORT_PRESETS.length);
		for (const preset of PRESET_LIST) {
			expect(preset.categoryId).toBeDefined();
			expect(["revenue", "sales", "operations"]).toContain(preset.categoryId);
		}
	});
});
