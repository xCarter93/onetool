import { describe, it, expect } from "vitest";
import { REPORT_PRESETS } from "@onetool/backend/convex/lib/reportPresets";
import { REPORT_FIELDS, isGenericGroupBy } from "@onetool/backend/convex/lib/reportFields";
import { DATE_RANGE_PRESETS } from "@onetool/backend/convex/lib/reportConfig";
import { visualizationOptions } from "./report-config";
import { PRESET_LIST } from "./report-presets";

const validVizValues = new Set(visualizationOptions.map((o) => o.value));
const validDatePresets = new Set<string>(DATE_RANGE_PRESETS);

describe("REPORT_PRESETS — builder validity", () => {
	it.each(REPORT_PRESETS.map((p) => [p.id, p] as const))(
		"%s is a valid builder config",
		(_id, preset) => {
			const { config } = preset;
			const fields = Object.keys(REPORT_FIELDS[config.entityType].fields);

			// groupBy, when set, is a generic registry key — the magic keys
			// ("month", "client", "conversionRate") are gone from v2 presets.
			if (config.groupBy !== undefined) {
				expect(isGenericGroupBy(config.entityType, config.groupBy)).toBe(true);
			}

			// A preset date window uses a real DATE_RANGE_PRESETS value.
			if (config.date && config.date.range.kind === "preset") {
				expect(validDatePresets.has(config.date.range.preset)).toBe(true);
			}

			// visualization is one of the builder's viz types.
			expect(validVizValues.has(preset.visualization.type)).toBe(true);

			// columns, when set, are registry fields of this entity.
			if (config.columns) {
				for (const col of config.columns) {
					expect(fields).toContain(col);
				}
			}

			// Field-taking metrics name a registered field; ratio metrics carry a
			// ratioKey instead and are computed without a groupBy.
			const { metric } = config;
			if (metric.op === "ratio") {
				expect(metric.ratioKey).toBeDefined();
			} else if (metric.op !== "count") {
				expect(metric.field).toBeDefined();
				expect(fields).toContain(metric.field);
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
