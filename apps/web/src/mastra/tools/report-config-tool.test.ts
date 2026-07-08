import { describe, it, expect } from "vitest";
import { reportConfigTool } from "./report-config-tool";

describe("reportConfigTool", () => {
	it("output schema does not declare filters or aggregations fields", () => {
		const configShape = reportConfigTool.outputSchema.shape.config.shape;
		expect(configShape).not.toHaveProperty("filters");
		expect(configShape).not.toHaveProperty("aggregations");
	});

	it("input schema does not accept filters or aggregationField", () => {
		const inputShape = reportConfigTool.inputSchema.shape;
		expect(inputShape).not.toHaveProperty("filters");
		expect(inputShape).not.toHaveProperty("aggregationField");
	});

	it("execute() returns a config with only entityType/groupBy/dateRange — matches executeReport's supported args", async () => {
		const result = await reportConfigTool.execute({
			intent: "Show me client counts by status",
			entityType: "clients",
			groupBy: "status",
			aggregation: "count",
			dateRangeType: "all_time",
			visualizationType: "pie",
		});

		if ("error" in result) throw new Error("unexpected validation error");

		expect(result.config).not.toHaveProperty("filters");
		expect(result.config).not.toHaveProperty("aggregations");
		expect(Object.keys(result.config).sort()).toEqual(
			["dateRange", "entityType", "groupBy"].sort()
		);
	});
});
