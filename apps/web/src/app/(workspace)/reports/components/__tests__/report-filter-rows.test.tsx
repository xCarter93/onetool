// @vitest-environment jsdom
// Pins the compact rail filter rows (§8 d15 F1+F5): inline field/operator/value
// rows, one global And/Or connector, and the auto-collapse to Advanced filter.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { ReportEntityType } from "@onetool/backend/convex/lib/reportFields";
import type { ReportFilters } from "@onetool/backend/convex/lib/reportFilters";
import { ReportFilterRows } from "../report-filter-rows";

afterEach(() => cleanup());

// jsdom lacks both; Base UI popups and cmdk measure and scroll.
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
	// jsdom ships no matchMedia; report the wide viewport so the advanced editor
	// takes its popover host rather than the narrow-width sheet.
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

function renderRows(
	entityType: ReportEntityType,
	filters: ReportFilters | undefined
) {
	const onChange = vi.fn();
	const result = render(
		<ReportFilterRows
			entityType={entityType}
			filters={filters}
			onChange={onChange}
		/>
	);
	const rerenderWith = (next: ReportFilters | undefined) =>
		result.rerender(
			<ReportFilterRows
				entityType={entityType}
				filters={next}
				onChange={onChange}
			/>
		);
	return { onChange, rerenderWith };
}

/** cmdk rows render their breadcrumb across two spans; nav rows append a count. */
function pickerRow(text: string) {
	return screen
		.getAllByRole("option")
		.find((el) => el.textContent?.replace(/\d+$/, "") === text);
}

/** Base UI select items only commit on a click that follows a pointer sequence. */
async function pickOption(name: string) {
	const option = await screen.findByRole("option", { name });
	fireEvent.pointerDown(option, { pointerType: "mouse" });
	fireEvent.pointerUp(option, { pointerType: "mouse" });
	fireEvent.click(option);
}

const oneGroup = (
	rules: ReportFilters["groups"][number]["rules"],
	logic: "and" | "or" = "and"
): ReportFilters => ({ logic: "and", groups: [{ logic, rules }] });

describe("ReportFilterRows — compact rows", () => {
	it("renders one row per rule, labeled with the path breadcrumb", () => {
		renderRows(
			"quoteLineItems",
			oneGroup([
				{ field: "description", operator: "contains", value: "install" },
				{ field: "quoteId.status", operator: "equals", value: "sent" },
			])
		);

		expect(screen.getByRole("button", { name: "Description" })).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Quote › Status" })
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Add filter" })).toBeInTheDocument();
	});

	it("the And/Or connector is global — clicking one chip flips the whole set", () => {
		const { onChange, rerenderWith } = renderRows(
			"clients",
			oneGroup([
				{ field: "status", operator: "equals", value: "active" },
				{ field: "companyName", operator: "contains", value: "a" },
				{ field: "companyName", operator: "contains", value: "b" },
			])
		);

		const chips = screen.getAllByRole("button", { name: "And" });
		expect(chips).toHaveLength(2);

		fireEvent.click(chips[1]);

		expect(onChange).toHaveBeenCalledWith(
			expect.objectContaining({
				groups: [expect.objectContaining({ logic: "or" })],
			})
		);

		rerenderWith(onChange.mock.calls[0][0]);
		expect(screen.getAllByRole("button", { name: "Or" })).toHaveLength(2);
		expect(screen.queryByRole("button", { name: "And" })).toBeNull();
	});

	it("no connector renders for a single rule", () => {
		renderRows(
			"clients",
			oneGroup([{ field: "status", operator: "equals", value: "active" }])
		);

		expect(screen.queryByRole("button", { name: "And" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Or" })).toBeNull();
	});

	it("Add filter appends a row and opens the field picker immediately", () => {
		renderRows("clients", undefined);

		fireEvent.click(screen.getByRole("button", { name: "Add filter" }));

		expect(screen.getByPlaceholderText("Search fields...")).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Select a field" })
		).toBeInTheDocument();
	});

	it("picking a field derives the adapter's default operator and value", () => {
		const { onChange } = renderRows("quotes", undefined);

		fireEvent.click(screen.getByRole("button", { name: "Add filter" }));
		fireEvent.change(screen.getByPlaceholderText("Search fields..."), {
			target: { value: "valid until" },
		});
		fireEvent.click(pickerRow("Valid Until")!);

		expect(onChange).toHaveBeenCalledWith(
			oneGroup([{ field: "validUntil", operator: "before", value: undefined }])
		);
	});

	it("changing the operator clears a value that encoded the old one", async () => {
		const { onChange } = renderRows(
			"quotes",
			oneGroup([
				{ field: "validUntil", operator: "before", value: 1750000000000 },
			])
		);

		fireEvent.click(screen.getByRole("combobox", { name: "Operator" }));
		await pickOption("is after");

		expect(onChange).toHaveBeenCalledWith(
			oneGroup([{ field: "validUntil", operator: "after", value: undefined }])
		);
	});

	it("removing the last row clears filters entirely", () => {
		const { onChange } = renderRows(
			"clients",
			oneGroup([{ field: "status", operator: "equals", value: "active" }])
		);

		fireEvent.click(screen.getByRole("button", { name: "Remove Status filter" }));

		expect(onChange).toHaveBeenCalledWith(undefined);
	});

	it("offers the advanced editor from compact mode", () => {
		renderRows(
			"clients",
			oneGroup([{ field: "status", operator: "equals", value: "active" }])
		);

		expect(
			screen.getByRole("button", { name: "Advanced filters" })
		).toBeInTheDocument();
	});
});

describe("ReportFilterRows — advanced collapse (Q9)", () => {
	const twoGroups: ReportFilters = {
		logic: "or",
		groups: [
			{
				logic: "and",
				rules: [
					{ field: "status", operator: "equals", value: "active" },
					{ field: "companyName", operator: "contains", value: "a" },
				],
			},
			{
				logic: "and",
				rules: [{ field: "companyName", operator: "contains", value: "b" }],
			},
		],
	};

	it("collapses to Advanced filter (N) once the config has two groups", () => {
		renderRows("clients", twoGroups);

		expect(
			screen.getByRole("button", { name: "Advanced filter (3)" })
		).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Add filter" })).toBeNull();
	});

	it("re-expands to compact rows when the config simplifies back to one group", () => {
		const { rerenderWith } = renderRows("clients", twoGroups);

		expect(
			screen.getByRole("button", { name: "Advanced filter (3)" })
		).toBeInTheDocument();

		rerenderWith(
			oneGroup([{ field: "status", operator: "equals", value: "active" }])
		);

		expect(screen.queryByRole("button", { name: /Advanced filter \(/ })).toBeNull();
		expect(screen.getByRole("button", { name: "Status" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Add filter" })).toBeInTheDocument();
	});

	it("ignores an empty second group — an unfinished group is not advanced", () => {
		renderRows("clients", {
			logic: "and",
			groups: [
				{
					logic: "and",
					rules: [{ field: "status", operator: "equals", value: "active" }],
				},
				{ logic: "and", rules: [] },
			],
		});

		expect(screen.getByRole("button", { name: "Add filter" })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /Advanced filter \(/ })).toBeNull();
	});

	it("reads the surviving group, not index 0, when the editor left an empty one behind", () => {
		const { onChange } = renderRows("clients", {
			logic: "and",
			groups: [
				{ logic: "and", rules: [] },
				{
					logic: "or",
					rules: [
						{ field: "status", operator: "equals", value: "active" },
						{ field: "companyName", operator: "contains", value: "a" },
					],
				},
			],
		});

		expect(screen.getByRole("button", { name: "Status" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Or" })).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Remove Status filter" }));

		expect(onChange).toHaveBeenCalledWith(
			oneGroup([{ field: "companyName", operator: "contains", value: "a" }], "or")
		);
	});

	it("opens the grouped editor from the collapsed row", () => {
		renderRows("clients", twoGroups);

		fireEvent.click(screen.getByRole("button", { name: "Advanced filter (3)" }));

		expect(screen.getByRole("button", { name: "Add group" })).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Clear all filters" })
		).toBeInTheDocument();
	});
});
