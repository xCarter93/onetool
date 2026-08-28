// @vitest-environment jsdom
// Pins the shared drill-in field picker (§8 d15 F1+F5): own fields first,
// nested relation pages along the FK DAG (one nav row per direct edge), and a
// search that flattens across paths.
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

/** Field/back/record rows render their text exactly; nav rows append a count. */
function row(text: string) {
	return screen.getAllByRole("option").find((el) => el.textContent === text);
}
function navRow(text: string) {
	return screen
		.getAllByRole("option")
		.find(
			(el) =>
				el.textContent?.replace(/\d+$/, "") === text && el.textContent !== text
		);
}

function search(term: string) {
	fireEvent.change(screen.getByPlaceholderText("Search fields..."), {
		target: { value: term },
	});
}

describe("ReportFieldPicker", () => {
	it("shows the entity's own fields and one nav row per direct edge", () => {
		render(
			<ReportFieldPicker entityType="payments" mode="filter" onSelect={vi.fn()} />
		);
		expect(row("Amount")).toBeInTheDocument();
		expect(navRow("Invoice")).toBeInTheDocument();
		expect(navRow("Invoice › Client")).toBeUndefined();
		expect(navRow("Invoice › Quote › Project")).toBeUndefined();
	});

	it("drills into a relation and offers that record's own edges", () => {
		render(
			<ReportFieldPicker entityType="payments" mode="filter" onSelect={vi.fn()} />
		);
		fireEvent.click(navRow("Invoice")!);
		expect(row("Invoice › Status")).toBeInTheDocument();
		expect(row("Amount")).toBeUndefined();
		expect(navRow("Client")).toBeInTheDocument();
		expect(navRow("Project")).toBeInTheDocument();
		expect(navRow("Quote")).toBeInTheDocument();
	});

	it("backs out one level at a time", () => {
		render(
			<ReportFieldPicker entityType="payments" mode="filter" onSelect={vi.fn()} />
		);
		fireEvent.click(navRow("Invoice")!);
		fireEvent.click(navRow("Client")!);
		expect(row("Invoice › Client › Lead Source")).toBeInTheDocument();

		fireEvent.click(row("Invoice › Client")!);
		expect(row("Invoice › Status")).toBeInTheDocument();
		expect(navRow("Client")).toBeInTheDocument();

		fireEvent.click(row("Invoice")!);
		expect(row("Amount")).toBeInTheDocument();
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

	it("selects a deep field found by search from the root", () => {
		const onSelect = vi.fn();
		render(
			<ReportFieldPicker
				entityType="payments"
				mode="filter"
				onSelect={onSelect}
			/>
		);
		search("quote project client lead source");
		fireEvent.click(row("Invoice › Quote › Project › Client › Lead Source")!);
		expect(onSelect).toHaveBeenCalledWith(
			"invoiceId.quoteId.projectId.clientId.leadSource"
		);
	});

	it("offers the record itself as the first row of its page in groupBy mode", () => {
		const onSelect = vi.fn();
		render(
			<ReportFieldPicker
				entityType="payments"
				mode="groupBy"
				onSelect={onSelect}
				directOptions={[{ value: "invoiceId", label: "Invoice" }]}
			/>
		);
		fireEvent.click(navRow("Invoice")!);
		fireEvent.click(navRow("Client")!);
		expect(row("Client record")).toBeInTheDocument();
		fireEvent.click(row("Client record")!);
		expect(onSelect).toHaveBeenCalledWith("invoiceId.clientId");
	});

	it("has no record row in filter mode", () => {
		render(
			<ReportFieldPicker entityType="payments" mode="filter" onSelect={vi.fn()} />
		);
		fireEvent.click(navRow("Invoice")!);
		fireEvent.click(navRow("Client")!);
		expect(row("Client record")).toBeUndefined();
		expect(row("Invoice › Client › Lead Source")).toBeInTheDocument();
	});
});
