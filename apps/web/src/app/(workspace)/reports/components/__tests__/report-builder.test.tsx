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

import { ReportBuilder, type ReportBuilderInitial } from "../report-builder";

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
		expect(screen.queryByText("Group by", { selector: "h4" })).toBeNull();
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

	it("Single metric clears grouping: the Group by section disappears", async () => {
		renderBuilder(clientsChartInitial);

		expect(screen.getByText("Group by", { selector: "h4" })).toBeInTheDocument();

		await pickVisualization("Single metric");

		expect(screen.queryByText("Group by", { selector: "h4" })).toBeNull();
		expect(section("Visualization").getByRole("combobox")).toHaveTextContent(
			"Single metric"
		);
	});

	it("a chart pick auto-applies the entity's default groupBy in place of raw rows", async () => {
		renderBuilder(clientsTableInitial);

		expect(section("Group by").getByText("None (raw rows)")).toBeInTheDocument();

		await pickVisualization("Column");

		const groupBy = section("Group by");
		expect(groupBy.getByText("Status")).toBeInTheDocument();
		expect(groupBy.queryByText("None (raw rows)")).toBeNull();
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
		expect(section("Group by").getByText("None (raw rows)")).toBeInTheDocument();
	});

	it("Table options hold the Columns picker; charts get Chart options instead", () => {
		renderBuilder(clientsTableInitial);

		expect(section("Table options").getByText("Columns")).toBeInTheDocument();
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

		expect(section("Group by").getByRole("button", { name: "SKU" })).toBeInTheDocument();
	});

	it("picking a dotted timestamp path keeps the day/week/month granularity control", () => {
		renderBuilder(lineItemsChart("skuId"));

		fireEvent.click(section("Group by").getByRole("button", { name: "SKU" }));
		fireEvent.change(screen.getByPlaceholderText("Search fields..."), {
			target: { value: "start date" },
		});
		fireEvent.click(pickerRow("Quote › Project › Start Date")!);

		const groupBy = section("Group by");
		expect(
			groupBy.getByRole("button", { name: "Quote › Project › Start Date" })
		).toBeInTheDocument();
		expect(groupBy.getByRole("button", { name: "Month", pressed: true })).toBeInTheDocument();
	});

	it("a dotted terminal with options keeps the Include empty values switch", () => {
		renderBuilder(lineItemsChart("quoteId.status"));

		expect(section("Group by").getByText("Include empty values")).toBeInTheDocument();
	});

	it("a dotted timestamp grouping offers no Include empty values switch", () => {
		renderBuilder(lineItemsChart("quoteId.projectId.startDate_month"));

		expect(section("Group by").queryByText("Include empty values")).toBeNull();
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
