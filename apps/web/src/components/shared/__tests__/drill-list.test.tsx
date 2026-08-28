// @vitest-environment jsdom
// Pins the shared cmdk drill-down: nested pages, one-level back, and the
// parentless-only shape the automations pickers still render.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { DrillList, type DrillGroup, type DrillPage } from "../drill-list";

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

/** Field/back rows render their text exactly; nav rows append a count. */
function row(text: string) {
	return screen.getAllByRole("option").find((el) => el.textContent === text);
}
function navRow(text: string) {
	return screen
		.getAllByRole("option")
		.find((el) => el.textContent?.replace(/\d+$/, "") === text && el.textContent !== text);
}

const rootGroups: DrillGroup[] = [
	{
		id: "fields",
		heading: "Fields",
		items: [
			{ id: "amount", value: "amount", label: "Amount", onSelect: vi.fn() },
		],
	},
];

const nestedPages: DrillPage[] = [
	{
		id: "invoiceId",
		navLabel: "Invoice",
		items: [
			{
				id: "invoiceId.status",
				value: "invoice status",
				label: "Invoice › Status",
				onSelect: vi.fn(),
			},
		],
	},
	{
		id: "invoiceId.clientId",
		parentId: "invoiceId",
		navLabel: "Invoice › Client",
		navRowLabel: "Client",
		items: [
			{
				id: "invoiceId.clientId.companyName",
				value: "invoice client company name",
				label: "Invoice › Client › Company Name",
				onSelect: vi.fn(),
			},
		],
	},
];

function renderNested() {
	render(
		<DrillList
			rootGroups={rootGroups}
			pages={nestedPages}
			open
			emptyText="No fields found."
			placeholder="Search fields..."
		/>
	);
}

describe("DrillList", () => {
	it("lists only parentless pages at the root", () => {
		renderNested();
		expect(navRow("Invoice")).toBeInTheDocument();
		expect(navRow("Client")).toBeUndefined();
		expect(navRow("Invoice › Client")).toBeUndefined();
	});

	it("renders child nav rows inside an active page", () => {
		renderNested();
		fireEvent.click(navRow("Invoice")!);
		expect(row("Invoice › Status")).toBeInTheDocument();
		expect(navRow("Client")).toBeInTheDocument();
		expect(row("Amount")).toBeUndefined();
	});

	it("backs out one level at a time", () => {
		renderNested();
		fireEvent.click(navRow("Invoice")!);
		fireEvent.click(navRow("Client")!);
		expect(row("Invoice › Client › Company Name")).toBeInTheDocument();

		fireEvent.click(row("Invoice › Client")!);
		expect(row("Invoice › Status")).toBeInTheDocument();
		expect(row("Amount")).toBeUndefined();

		fireEvent.click(row("Invoice")!);
		expect(row("Amount")).toBeInTheDocument();
	});

	it("pops one level on backspace with an empty search", () => {
		renderNested();
		fireEvent.click(navRow("Invoice")!);
		fireEvent.click(navRow("Client")!);

		fireEvent.keyDown(screen.getByPlaceholderText("Search fields..."), {
			key: "Backspace",
		});
		expect(row("Invoice › Status")).toBeInTheDocument();
		expect(row("Amount")).toBeUndefined();
	});

	it("renders a parentless-only page as a back row plus its items", () => {
		const { container } = render(
			<DrillList
				rootGroups={rootGroups}
				pages={[nestedPages[0]]}
				open
				emptyText="No fields found."
				placeholder="Search fields..."
			/>
		);
		fireEvent.click(navRow("Invoice")!);
		expect(
			container.querySelectorAll('[data-slot="command-group"]')
		).toHaveLength(2);
	});
});
