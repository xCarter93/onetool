// @vitest-environment jsdom
// Pins the shared drill-in field picker (§8 d15 F1+F5): own fields and relation
// branches in one root run, nesting along the FK DAG, and a search that reaches
// every level below the one you are standing on.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ReportFieldPicker } from "../report-field-picker";

afterEach(() => cleanup());

// jsdom has none of these; the cascader measures its list, scrolls the active
// row, and Base UI's scroll area waits on the viewport's running animations.
class ResizeObserverStub {
	observe() {}
	unobserve() {}
	disconnect() {}
}
const originalResizeObserver = globalThis.ResizeObserver;
const originalScrollIntoView = Element.prototype.scrollIntoView;
const originalGetAnimations = Element.prototype.getAnimations;
beforeAll(() => {
	globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
	Element.prototype.scrollIntoView = () => {};
	Element.prototype.getAnimations = () => [];
});
afterAll(() => {
	globalThis.ResizeObserver = originalResizeObserver;
	Element.prototype.scrollIntoView = originalScrollIntoView;
	Element.prototype.getAnimations = originalGetAnimations;
});

/** A row's visible label, without the count, screen-reader details or search path. */
function labelOf(el: Element) {
	const clone = el.cloneNode(true) as Element;
	for (const extra of clone.querySelectorAll("[data-slot^='cascader-item-']")) {
		extra.remove();
	}
	return clone.textContent?.trim() ?? "";
}

/** A row by its own label; `trail` is the ancestor path a search hit adds under it. */
function row(label: string, trail?: string) {
	return screen.getAllByRole("option").find((el) => {
		const path = el.querySelector('[data-slot="cascader-item-path"]');
		return (
			labelOf(el) === label && (trail === undefined || path?.textContent === trail)
		);
	});
}

/** Opens a branch. A committable branch commits on row press, so drilling is the chevron. */
function drill(label: string) {
	const branch = row(label);
	const chevron = branch?.querySelector('[data-slot="cascader-item-chevron"]');
	fireEvent.click(chevron ?? branch!);
}

function search(term: string) {
	fireEvent.change(screen.getByPlaceholderText("Search fields..."), {
		target: { value: term },
	});
}

describe("ReportFieldPicker", () => {
	it("shows the entity's own fields and one branch per direct edge", () => {
		render(
			<ReportFieldPicker entityType="payments" mode="filter" onSelect={vi.fn()} />
		);
		expect(row("Amount")).toBeInTheDocument();
		expect(row("Invoice")).toBeInTheDocument();
		// Deeper edges belong to the level they hang off, not the root.
		expect(row("Client")).toBeUndefined();
		expect(row("Project")).toBeUndefined();
	});

	it("drills into a relation and offers that record's own edges", () => {
		render(
			<ReportFieldPicker entityType="payments" mode="filter" onSelect={vi.fn()} />
		);
		drill("Invoice");
		expect(row("Status")).toBeInTheDocument();
		expect(row("Amount")).toBeUndefined();
		expect(row("Client")).toBeInTheDocument();
		expect(row("Project")).toBeInTheDocument();
		expect(row("Quote")).toBeInTheDocument();
	});

	it("backs out one level at a time", () => {
		render(
			<ReportFieldPicker entityType="payments" mode="filter" onSelect={vi.fn()} />
		);
		drill("Invoice");
		drill("Client");
		expect(row("Lead Source")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: /back/i }));
		expect(row("Status")).toBeInTheDocument();
		expect(row("Client")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: /back/i }));
		expect(row("Amount")).toBeInTheDocument();
	});

	it("searches every level below the root without drilling", () => {
		render(
			<ReportFieldPicker
				entityType="quoteLineItems"
				mode="filter"
				onSelect={vi.fn()}
			/>
		);
		search("start date");
		expect(row("Start Date", "Quote›Project")).toBeInTheDocument();
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
		fireEvent.click(row("Start Date", "Quote›Project")!);
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
			<ReportFieldPicker entityType="payments" mode="filter" onSelect={onSelect} />
		);
		search("lead source");
		fireEvent.click(row("Lead Source", "Invoice›Quote›Project›Client")!);
		expect(onSelect).toHaveBeenCalledWith(
			"invoiceId.quoteId.projectId.clientId.leadSource"
		);
	});

	it("commits the relation itself in groupBy mode", () => {
		const onSelect = vi.fn();
		render(
			<ReportFieldPicker
				entityType="payments"
				mode="groupBy"
				onSelect={onSelect}
				directOptions={[{ value: "invoiceId", label: "Invoice" }]}
			/>
		);
		drill("Invoice");
		fireEvent.click(row("Client")!);
		expect(onSelect).toHaveBeenCalledWith("invoiceId.clientId");
	});

	it("leaves a relation uncommittable in filter mode", () => {
		const onSelect = vi.fn();
		render(
			<ReportFieldPicker entityType="payments" mode="filter" onSelect={onSelect} />
		);
		drill("Invoice");
		fireEvent.click(row("Client")!);
		// Pressing an uncommittable branch drills instead of selecting.
		expect(onSelect).not.toHaveBeenCalled();
		expect(row("Lead Source")).toBeInTheDocument();
	});
});
