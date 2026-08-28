// @vitest-environment jsdom
// Pins the shared drill-in field picker (§8 d15 F1+F5): own fields first,
// relation pages along the FK DAG, and a search that flattens across paths.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ReportFieldPicker } from "../report-field-picker";

afterEach(() => cleanup());

// jsdom lacks both; cmdk measures its list and scrolls the active item.
class ResizeObserverStub {
	observe() {}
	unobserve() {}
	disconnect() {}
}
const originalResizeObserver = globalThis.ResizeObserver;
const originalScrollIntoView = Element.prototype.scrollIntoView;
beforeAll(() => {
	globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
	Element.prototype.scrollIntoView = () => {};
});
afterAll(() => {
	globalThis.ResizeObserver = originalResizeObserver;
	Element.prototype.scrollIntoView = originalScrollIntoView;
});

/** Rows render their breadcrumb across two spans; nav rows append a count. */
function row(text: string) {
	return screen
		.getAllByRole("option")
		.find((el) => el.textContent?.replace(/\d+$/, "") === text);
}

function search(term: string) {
	fireEvent.change(screen.getByPlaceholderText("Search fields..."), {
		target: { value: term },
	});
}

describe("ReportFieldPicker", () => {
	it("shows the entity's own fields and one entry per relation path", () => {
		render(
			<ReportFieldPicker
				entityType="quoteLineItems"
				mode="filter"
				onSelect={vi.fn()}
			/>
		);
		expect(row("Description")).toBeInTheDocument();
		expect(row("Quote")).toBeInTheDocument();
		expect(row("Quote › Project")).toBeInTheDocument();
		expect(row("Quote › Project › Client")).toBeInTheDocument();
	});

	it("drills into a relation and backs out via the breadcrumb", () => {
		render(
			<ReportFieldPicker
				entityType="quoteLineItems"
				mode="filter"
				onSelect={vi.fn()}
			/>
		);
		fireEvent.click(row("Quote")!);
		expect(row("Quote › Status")).toBeInTheDocument();
		expect(row("Description")).toBeUndefined();

		fireEvent.click(row("Quote")!);
		expect(row("Description")).toBeInTheDocument();
		expect(row("Quote › Status")).toBeUndefined();
	});

	it("searches flat across every path without drilling", () => {
		render(
			<ReportFieldPicker
				entityType="quoteLineItems"
				mode="filter"
				onSelect={vi.fn()}
			/>
		);
		search("start date");
		expect(row("Quote › Project › Start Date")).toBeInTheDocument();
		expect(row("Description")).toBeUndefined();
	});

	it("selects with the dotted path", () => {
		const onSelect = vi.fn();
		render(
			<ReportFieldPicker
				entityType="quoteLineItems"
				mode="filter"
				onSelect={onSelect}
			/>
		);
		search("start date");
		fireEvent.click(row("Quote › Project › Start Date")!);
		expect(onSelect).toHaveBeenCalledWith("quoteId.projectId.startDate");

		cleanup();
		render(
			<ReportFieldPicker
				entityType="quoteLineItems"
				mode="filter"
				onSelect={onSelect}
			/>
		);
		fireEvent.click(row("Description")!);
		expect(onSelect).toHaveBeenCalledWith("description");
	});

	it("offers parent records as buckets in groupBy mode only", () => {
		const onSelect = vi.fn();
		render(
			<ReportFieldPicker
				entityType="quoteLineItems"
				mode="groupBy"
				onSelect={onSelect}
				directOptions={[{ value: "skuId", label: "SKU" }]}
			/>
		);
		expect(row("SKU")).toBeInTheDocument();
		fireEvent.click(row("Quote")!);
		fireEvent.click(row("Quote › Project")!);
		expect(onSelect).toHaveBeenCalledWith("quoteId.projectId");

		cleanup();
		render(
			<ReportFieldPicker
				entityType="quoteLineItems"
				mode="filter"
				onSelect={onSelect}
			/>
		);
		fireEvent.click(row("Quote")!);
		expect(row("Quote › Project")).toBeUndefined();
		expect(row("Quote › Status")).toBeInTheDocument();
	});
});
