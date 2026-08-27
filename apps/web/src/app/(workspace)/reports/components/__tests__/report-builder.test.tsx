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
beforeAll(() => {
	globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
});
afterAll(() => {
	globalThis.ResizeObserver = originalResizeObserver;
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

describe("ReportBuilder — config rail coercions (R8b, d14)", () => {
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

	it("Number clears grouping: the Group by section disappears", () => {
		renderBuilder(clientsChartInitial);

		expect(screen.getByText("Group by", { selector: "h4" })).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Number" }));

		expect(screen.queryByText("Group by", { selector: "h4" })).toBeNull();
	});

	it("Chart auto-applies the entity's default groupBy in place of raw rows", () => {
		renderBuilder(clientsTableInitial);

		expect(section("Group by").getByText("None (raw rows)")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Chart" }));

		const groupBy = section("Group by");
		expect(groupBy.getByText("Status")).toBeInTheDocument();
		expect(groupBy.queryByText("None (raw rows)")).toBeNull();
	});

	it("dirty indicator: absent on hydrate, appears after a report-type change", () => {
		renderBuilder(clientsChartInitial);

		expect(screen.queryByText("Unsaved changes")).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: "Number" }));

		expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
	});

	it("Table keeps the raw-rows grouping option and the source-backed canvas", () => {
		renderBuilder(clientsTableInitial);

		expect(
			within(screen.getByRole("main")).queryByText("Select a data source")
		).toBeNull();
		expect(
			section("Report type").getByRole("button", { name: "Table" })
		).toHaveAttribute("aria-pressed", "true");
		expect(section("Group by").getByText("None (raw rows)")).toBeInTheDocument();
	});
});
