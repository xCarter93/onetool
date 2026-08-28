// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(() => cleanup());

// jsdom has no ResizeObserver; Base UI popups and MultiSelector need one to mount.
class ResizeObserverStub {
	observe() {}
	unobserve() {}
	disconnect() {}
}
const originalResizeObserver = globalThis.ResizeObserver;
const originalScrollIntoView = Element.prototype.scrollIntoView;
const originalMatchMedia = window.matchMedia;
beforeAll(() => {
	globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
	Element.prototype.scrollIntoView = () => {};
	// jsdom ships no matchMedia; report the wide viewport the rail is built for.
	window.matchMedia = ((query: string) => ({
		matches: query.includes("min-width: 1024px"),
		media: query,
		addEventListener() {},
		removeEventListener() {},
	})) as unknown as typeof window.matchMedia;
});
afterAll(() => {
	globalThis.ResizeObserver = originalResizeObserver;
	Element.prototype.scrollIntoView = originalScrollIntoView;
	window.matchMedia = originalMatchMedia;
});

// The builder doesn't query, but ReportPreview and ReportUtilityBar do —
// undefined keeps them in their loading state so no chart ever mounts.
vi.mock("convex/react", () => ({
	useQuery: vi.fn(),
}));

import { AssistantOpenerContext } from "@/components/assistant/assistant-opener-context";
import { ReportBuilder, type ReportBuilderInitial } from "../report-builder";
import type { ReportMetric } from "../../report-config";

function renderBuilder(initial: ReportBuilderInitial) {
	return render(
		<ReportBuilder
			mode="create"
			initial={initial}
			saving={false}
			onSave={() => {}}
			onBack={() => {}}
		/>
	);
}

/** Config rail sections share generic labels with the canvas and each other, so scope by heading. */
function section(title: string) {
	const heading = screen.getByText(title, { selector: "h4" });
	const el = heading.closest("section");
	if (!el) throw new Error(`No section wrapper for "${title}"`);
	return within(el);
}

function openVisualizationMenu() {
	fireEvent.click(section("Visualization").getByRole("combobox"));
}

/** Base UI select items only commit on a click that follows a pointer sequence. */
async function pickVisualization(label: string) {
	openVisualizationMenu();
	const option = await screen.findByRole("option", { name: label });
	fireEvent.pointerDown(option, { pointerType: "mouse" });
	fireEvent.pointerUp(option, { pointerType: "mouse" });
	fireEvent.click(option);
}

const clientsChartInitial: ReportBuilderInitial = {
	name: "Clients by status",
	description: "",
	config: {
		version: 2,
		entityType: "clients",
		metric: { op: "count" },
		groupBy: "status",
	},
	visualization: { type: "bar" },
};

const clientsTableInitial: ReportBuilderInitial = {
	name: "All clients",
	description: "",
	config: {
		version: 2,
		entityType: "clients",
		metric: { op: "count" },
	},
	visualization: { type: "table" },
};

describe("ReportBuilder — visualization dropdown (F1, d15)", () => {
	it("blank start: canvas prompts for a source, Save is disabled, config sections stay hidden", () => {
		renderBuilder({
			name: "",
			description: "",
			visualization: { type: "table" },
		});

		expect(
			within(screen.getByRole("main")).getByText("Select a data source")
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /Save report/ })).toBeDisabled();
		expect(screen.queryByText("Metric", { selector: "h4" })).toBeNull();
		expect(screen.queryByText("Date", { selector: "h4" })).toBeNull();
		expect(screen.queryByText("per")).toBeNull();
	});

	it("lists every visualization type, Single metric first", async () => {
		renderBuilder(clientsChartInitial);

		openVisualizationMenu();
		await screen.findByRole("option", { name: "Single metric" });

		expect(
			screen.getAllByRole("option").map((o) => o.textContent?.trim())
		).toEqual([
			"Single metric",
			"Table",
			"Bar",
			"Column",
			"Area",
			"Pie",
			"Radar",
			"Radial",
		]);
	});

	it("Single metric clears grouping: the per row disappears", async () => {
		renderBuilder(clientsChartInitial);

		expect(section("Metric").getByText("per")).toBeInTheDocument();

		await pickVisualization("Single metric");

		expect(section("Metric").queryByText("per")).toBeNull();
		expect(section("Visualization").getByRole("combobox")).toHaveTextContent(
			"Single metric"
		);
	});

	it("a chart pick auto-applies the entity's default groupBy in place of raw rows", async () => {
		renderBuilder(clientsTableInitial);

		expect(section("Metric").getByText("None (raw rows)")).toBeInTheDocument();

		await pickVisualization("Column");

		const metric = section("Metric");
		expect(metric.getByText("Status")).toBeInTheDocument();
		expect(metric.queryByText("None (raw rows)")).toBeNull();
	});

	it("dirty indicator: absent on hydrate, appears after a visualization change", async () => {
		renderBuilder(clientsChartInitial);

		expect(screen.queryByText("Unsaved changes")).toBeNull();

		await pickVisualization("Single metric");

		expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
	});

	it("Table keeps the raw-rows grouping option and the source-backed canvas", () => {
		renderBuilder(clientsTableInitial);

		expect(
			within(screen.getByRole("main")).queryByText("Select a data source")
		).toBeNull();
		expect(section("Visualization").getByRole("combobox")).toHaveTextContent(
			"Table"
		);
		expect(section("Metric").getByText("None (raw rows)")).toBeInTheDocument();
	});

	it("the Columns picker rides in the Metric section; charts get Chart options instead", () => {
		renderBuilder(clientsTableInitial);

		expect(section("Metric").getByText("Columns")).toBeInTheDocument();
		expect(screen.queryByText("Table options", { selector: "h4" })).toBeNull();
		expect(screen.queryByText("Chart options", { selector: "h4" })).toBeNull();
	});

	it("a chart shows Chart options with no chart-type field of its own", () => {
		renderBuilder(clientsChartInitial);

		const chartOptions = section("Chart options");
		expect(chartOptions.getByText("Series limit")).toBeInTheDocument();
		expect(chartOptions.getByText("Sort")).toBeInTheDocument();
		expect(chartOptions.queryByText("Chart type")).toBeNull();
		expect(screen.queryByText("Table options", { selector: "h4" })).toBeNull();
	});

	it("Single metric shows neither options section", async () => {
		renderBuilder(clientsChartInitial);

		await pickVisualization("Single metric");

		expect(screen.queryByText("Chart options", { selector: "h4" })).toBeNull();
		expect(screen.queryByText("Table options", { selector: "h4" })).toBeNull();
	});
});

/** cmdk rows render their breadcrumb across two spans; nav rows append a count. */
function pickerRow(text: string) {
	return screen
		.getAllByRole("option")
		.find((el) => el.textContent?.replace(/\d+$/, "") === text);
}

function lineItemsChart(groupBy: string): ReportBuilderInitial {
	return {
		name: "Line items",
		description: "",
		config: {
			version: 2,
			entityType: "quoteLineItems",
			metric: { op: "count" },
			groupBy,
		},
		visualization: { type: "bar" },
	};
}

describe("ReportBuilder — group-by field picker (F5, d15)", () => {
	it("the group-by control is a button labeled with the current selection", () => {
		renderBuilder(lineItemsChart("skuId"));

		expect(section("Metric").getByRole("button", { name: "SKU" })).toBeInTheDocument();
	});

	it("picking a dotted timestamp path keeps the day/week/month granularity control", () => {
		renderBuilder(lineItemsChart("skuId"));

		fireEvent.click(section("Metric").getByRole("button", { name: "SKU" }));
		fireEvent.change(screen.getByPlaceholderText("Search fields..."), {
			target: { value: "start date" },
		});
		fireEvent.click(pickerRow("Quote › Project › Start Date")!);

		const metricSection = section("Metric");
		expect(
			metricSection.getByRole("button", { name: "Quote › Project › Start Date" })
		).toBeInTheDocument();
		expect(
			metricSection.getByRole("button", { name: "Month", pressed: true })
		).toBeInTheDocument();
	});

	it("a dotted terminal with options keeps the Include empty values switch", () => {
		renderBuilder(lineItemsChart("quoteId.status"));

		expect(section("Metric").getByText("Include empty values")).toBeInTheDocument();
	});

	it("a dotted timestamp grouping offers no Include empty values switch", () => {
		renderBuilder(lineItemsChart("quoteId.projectId.startDate_month"));

		expect(section("Metric").queryByText("Include empty values")).toBeNull();
	});

	it("an fk-terminal path hides A-to-Z sorting, like a direct FK grouping", async () => {
		renderBuilder(lineItemsChart("quoteId.projectId"));

		fireEvent.click(section("Chart options").getByRole("combobox"));
		await screen.findByRole("option", { name: "Highest first" });

		expect(screen.queryByRole("option", { name: "A to Z" })).toBeNull();
	});

	it("a dotted field terminal still offers A-to-Z sorting", async () => {
		renderBuilder(lineItemsChart("quoteId.status"));

		fireEvent.click(section("Chart options").getByRole("combobox"));

		expect(await screen.findByRole("option", { name: "A to Z" })).toBeInTheDocument();
	});
});

function quotesReport(
	metric: ReportMetric,
	over: { groupBy?: string; type?: "bar" | "number" } = {}
): ReportBuilderInitial {
	return {
		name: "Quotes",
		description: "",
		config: {
			version: 2,
			entityType: "quotes",
			metric,
			...(over.groupBy ? { groupBy: over.groupBy } : {}),
		},
		visualization: { type: over.type ?? "bar" },
	};
}

function metricControls() {
	return section("Metric").getAllByRole("combobox");
}

/** Base UI select items only commit on a click that follows a pointer sequence. */
async function pickFrom(combobox: HTMLElement, label: string) {
	fireEvent.click(combobox);
	const option = await screen.findByRole("option", { name: label });
	fireEvent.pointerDown(option, { pointerType: "mouse" });
	fireEvent.pointerUp(option, { pointerType: "mouse" });
	fireEvent.click(option);
}

describe("ReportBuilder — metric target + aggregation (d15 amendment)", () => {
	it("an aggregated field metric renders a target picker and an aggregation dropdown", () => {
		renderBuilder(quotesReport({ op: "sum", field: "total" }, { groupBy: "status" }));

		const [target, agg] = metricControls();
		expect(metricControls()).toHaveLength(2);
		expect(target).toHaveTextContent("Total");
		expect(agg).toHaveTextContent("Sum");
	});

	it("Count of records hides the aggregation dropdown", () => {
		renderBuilder(quotesReport({ op: "count" }, { groupBy: "status" }));

		expect(metricControls()).toHaveLength(1);
		expect(metricControls()[0]).toHaveTextContent("Count of records");
	});

	it("a ratio target hides the aggregation dropdown and the per row", () => {
		renderBuilder(
			quotesReport({ op: "ratio", ratioKey: "conversionRate" }, { groupBy: undefined })
		);

		expect(metricControls()).toHaveLength(1);
		expect(metricControls()[0]).toHaveTextContent("Conversion rate");
		expect(section("Metric").queryByText("per")).toBeNull();
	});

	it("changing the aggregation keeps the target and marks the report dirty", async () => {
		renderBuilder(quotesReport({ op: "sum", field: "total" }, { groupBy: "status" }));

		await pickFrom(metricControls()[1], "Average");

		const [target, agg] = metricControls();
		expect(target).toHaveTextContent("Total");
		expect(agg).toHaveTextContent("Average");
		expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
	});

	it("switching to another aggregatable target keeps the aggregation", async () => {
		renderBuilder(quotesReport({ op: "avg", field: "total" }, { groupBy: "status" }));

		await pickFrom(metricControls()[0], "Subtotal");

		const [target, agg] = metricControls();
		expect(target).toHaveTextContent("Subtotal");
		expect(agg).toHaveTextContent("Average");
	});

	it("a target that carries no aggregation resets the dropdown to Sum on the way back", async () => {
		renderBuilder(quotesReport({ op: "avg", field: "total" }, { groupBy: "status" }));

		await pickFrom(metricControls()[0], "Count of records");
		expect(metricControls()).toHaveLength(1);

		await pickFrom(metricControls()[0], "Total");
		expect(metricControls()[1]).toHaveTextContent("Sum");
	});

});

function quotesTable(
	metric: ReportMetric,
	over: { groupBy?: string; columns?: string[] } = {}
): ReportBuilderInitial {
	return {
		name: "Quotes",
		description: "",
		config: {
			version: 2,
			entityType: "quotes",
			metric,
			...(over.groupBy ? { groupBy: over.groupBy } : {}),
			...(over.columns ? { columns: over.columns } : {}),
		},
		visualization: { type: "table" },
	};
}

/** Columns rides inside the merged Metric section, so scope to its own field. */
function columnsField() {
	const label = screen.getByText("Columns", { selector: "label" });
	const field = label.parentElement;
	if (!field) throw new Error("No field wrapper for the Columns picker");
	return within(field);
}

function columnsPicker() {
	return columnsField().getByRole("button");
}

/** The group-by control: the only button in the "per" row. */
function groupByTrigger() {
	const label = screen.getByText("per", { selector: "span" });
	const row = label.parentElement;
	if (!row) throw new Error("No per row around the group-by control");
	return within(row).getByRole("button");
}

describe("ReportBuilder — Table raw-rows legibility", () => {
	it("a ratio metric makes the Columns picker inert too", () => {
		renderBuilder(quotesTable({ op: "ratio", ratioKey: "conversionRate" }));

		expect(columnsPicker()).toBeDisabled();
	});

	it("count with no grouping keeps the picker live and names what columns do", () => {
		renderBuilder(quotesTable({ op: "count" }));

		expect(columnsPicker()).toBeEnabled();
		expect(
			columnsField().getByText("Pick the columns each row shows.")
		).toBeInTheDocument();
		expect(
			section("Metric").getByText(
				"Counting records with no grouping — the table lists each record as a row."
			)
		).toBeInTheDocument();
	});

	it("a grouped table keeps the picker live: columns are the way into raw rows", () => {
		renderBuilder(quotesTable({ op: "count" }, { groupBy: "status" }));

		expect(columnsPicker()).toBeEnabled();
		expect(
			columnsField().getByText(
				"Showing one row per group. Picking columns switches to raw rows."
			)
		).toBeInTheDocument();
	});

	it("a table saved with both a grouping and columns lands on columns, unmodified", () => {
		renderBuilder(
			quotesTable({ op: "count" }, { groupBy: "status", columns: ["quoteNumber"] })
		);

		expect(groupByTrigger()).toHaveTextContent("None (raw rows)");
		expect(
			columnsField().getByText("Pick the columns each row shows.")
		).toBeInTheDocument();
		// Normalizing on hydrate must not read as an edit the user made.
		expect(screen.queryByText("Unsaved changes")).toBeNull();
	});

	it("a field metric with no grouping says the metric is not what the table shows", () => {
		renderBuilder(quotesTable({ op: "sum", field: "total" }));

		expect(columnsPicker()).toBeEnabled();
		expect(
			section("Metric").getByText(
				"The table lists raw rows. This metric applies once the table is grouped."
			)
		).toBeInTheDocument();
	});

	it("charts get no table-consequence helper", () => {
		renderBuilder(quotesReport({ op: "count" }, { groupBy: "status" }));

		expect(section("Metric").queryByText(/the table/i)).toBeNull();
	});

	it("Single metric gets no table-consequence helper", () => {
		renderBuilder(quotesReport({ op: "count" }, { type: "number" }));

		expect(section("Metric").queryByText(/the table/i)).toBeNull();
	});
});

describe("ReportBuilder — Group by and Columns are mutually exclusive", () => {
	it("choosing a grouping clears the picked columns", () => {
		renderBuilder(quotesTable({ op: "count" }, { columns: ["quoteNumber"] }));

		expect(columnsPicker()).toHaveTextContent("Quote Number");

		fireEvent.click(groupByTrigger());
		fireEvent.change(screen.getByPlaceholderText("Search fields..."), {
			target: { value: "status" },
		});
		fireEvent.click(pickerRow("Status")!);

		expect(groupByTrigger()).toHaveTextContent("Status");
		expect(columnsPicker()).toHaveTextContent("Default columns");
		expect(
			columnsField().getByText(
				"Showing one row per group. Picking columns switches to raw rows."
			)
		).toBeInTheDocument();
	});

	it("a round trip through a chart comes back to columns, not the chart's grouping", async () => {
		renderBuilder(quotesTable({ op: "count" }, { columns: ["quoteNumber"] }));

		await pickVisualization("Column");
		await pickVisualization("Table");

		expect(groupByTrigger()).toHaveTextContent("None (raw rows)");
		expect(columnsPicker()).toHaveTextContent("Quote Number");
	});

	it("picking a column drops the grouping to None", async () => {
		renderBuilder(quotesTable({ op: "count" }, { groupBy: "status" }));

		fireEvent.click(columnsPicker());
		fireEvent.click(await screen.findByRole("option", { name: "Quote Number" }));

		expect(groupByTrigger()).toHaveTextContent("None (raw rows)");
		expect(columnsPicker()).toHaveTextContent("Quote Number");
	});
});

describe("ReportBuilder — one Metric section (metric, per, columns)", () => {
	it("the rail asks one question: the metric, then per what, then which columns", () => {
		renderBuilder(quotesTable({ op: "count" }, { groupBy: "status" }));

		const metric = section("Metric");
		expect(metric.getAllByRole("combobox")[0]).toHaveTextContent(
			"Count of records"
		);
		expect(metric.getByText("per")).toBeInTheDocument();
		expect(groupByTrigger()).toHaveTextContent("Status");
		expect(metric.getByText("Columns")).toBeInTheDocument();
		expect(screen.queryByText("Group by", { selector: "h4" })).toBeNull();
		expect(screen.queryByText("Table options", { selector: "h4" })).toBeNull();
	});

	it("a grouping's dependents ride with it into the Metric section", () => {
		renderBuilder(quotesTable({ op: "count" }, { groupBy: "_creationTime_month" }));

		const metric = section("Metric");
		expect(
			metric.getByRole("button", { name: "Month", pressed: true })
		).toBeInTheDocument();
		expect(metric.queryByText("Include empty values")).toBeNull();

		cleanup();
		renderBuilder(quotesTable({ op: "count" }, { groupBy: "status" }));

		expect(section("Metric").getByText("Include empty values")).toBeInTheDocument();
	});

	it("a ratio metric keeps the metric row and drops the per row", () => {
		renderBuilder(quotesTable({ op: "ratio", ratioKey: "conversionRate" }));

		const metric = section("Metric");
		expect(metric.getAllByRole("combobox")[0]).toHaveTextContent(
			"Conversion rate"
		);
		expect(metric.queryByText("per")).toBeNull();
		expect(metric.getByText("Columns")).toBeInTheDocument();
	});
});

describe("ReportBuilder — assistant entry point (F4, d15)", () => {
	it("no longer renders an Ask AI card in the config rail", () => {
		// With an opener in context the old rail card would render; the dock's
		// contextual frame is the entry point now.
		render(
			<AssistantOpenerContext.Provider value={() => {}}>
				<ReportBuilder
					mode="create"
					initial={clientsChartInitial}
					saving={false}
					onSave={() => {}}
					onBack={() => {}}
				/>
			</AssistantOpenerContext.Provider>
		);
		expect(screen.queryByRole("button", { name: "Ask AI" })).toBeNull();
		expect(screen.queryByText(/Describe the report you want/i)).toBeNull();
	});
});

function comparableChart(
	over: {
		type?: "column" | "pie" | "radar" | "radial" | "table";
		allTime?: boolean;
		groupBy?: string | null;
	} = {}
): ReportBuilderInitial {
	const groupBy = over.groupBy === null ? undefined : (over.groupBy ?? "status");
	return {
		name: "Clients",
		description: "",
		config: {
			version: 2,
			// clients has two non-time, non-FK groupings, so Segment by is offered.
			entityType: "clients",
			metric: { op: "count" },
			...(groupBy ? { groupBy } : {}),
			...(over.allTime
				? {}
				: { date: { range: { kind: "preset" as const, preset: "this_year" as const } } }),
		},
		visualization: { type: over.type ?? "column" },
	};
}

/** PanelField wraps label + control + helper in one div, so scope from the label. */
function compareField() {
	const label = section("Date").queryByText("Compare");
	return label ? within(label.parentElement!) : null;
}

function segmentControl() {
	return section("Segment by").getByRole("combobox");
}

describe("ReportBuilder — comparison range control (R11)", () => {
	it("offers None, Previous period, Previous year, and Custom range", async () => {
		renderBuilder(comparableChart());

		fireEvent.click(compareField()!.getByRole("combobox"));
		await screen.findByRole("option", { name: "None" });
		expect(
			screen.getAllByRole("option").map((o) => o.textContent?.trim())
		).toEqual(["None", "Previous period", "Previous year", "Custom range"]);
	});

	it("is hidden on pie, radar, and radial — they have no second-series encoding", () => {
		for (const type of ["pie", "radar", "radial"] as const) {
			renderBuilder(comparableChart({ type }));
			expect(compareField()).toBeNull();
			cleanup();
		}
	});

	it("is hidden in raw-rows detail mode", () => {
		renderBuilder(comparableChart({ type: "table", groupBy: null }));
		expect(compareField()).toBeNull();
	});

	it("All Time disables it and says why", () => {
		renderBuilder(comparableChart({ allTime: true }));

		expect(compareField()!.getByRole("combobox")).toBeDisabled();
		expect(
			compareField()!.getByText(
				"Comparison needs a date range with a start and an end."
			)
		).toBeInTheDocument();
	});

	it("a bounded range enables it with no cause copy", () => {
		renderBuilder(comparableChart());

		expect(compareField()!.getByRole("combobox")).not.toBeDisabled();
		expect(
			compareField()!.queryByText(
				"Comparison needs a date range with a start and an end."
			)
		).toBeNull();
	});

	it("setting a comparison clears Segment by", async () => {
		renderBuilder(comparableChart());

		await pickFrom(segmentControl(), "Lead Source");
		expect(segmentControl()).toHaveTextContent("Lead Source");

		await pickFrom(compareField()!.getByRole("combobox"), "Previous period");

		expect(compareField()!.getByRole("combobox")).toHaveTextContent(
			"Previous period"
		);
		expect(segmentControl()).toHaveTextContent("None");
	});

	it("setting Segment by clears the comparison", async () => {
		renderBuilder(comparableChart());

		await pickFrom(compareField()!.getByRole("combobox"), "Previous year");
		expect(compareField()!.getByRole("combobox")).toHaveTextContent(
			"Previous year"
		);

		await pickFrom(segmentControl(), "Lead Source");

		expect(compareField()!.getByRole("combobox")).toHaveTextContent("None");
	});

	it("choosing a comparison marks the report dirty", async () => {
		renderBuilder(comparableChart());
		expect(screen.queryByText("Unsaved changes")).toBeNull();

		await pickFrom(compareField()!.getByRole("combobox"), "Previous period");

		expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
	});
});
