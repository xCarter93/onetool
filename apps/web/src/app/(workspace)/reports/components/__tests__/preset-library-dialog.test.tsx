// @vitest-environment jsdom
import { afterEach, afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { REPORT_PRESETS } from "@onetool/backend/convex/lib/reportPresets";

afterEach(() => cleanup());

// jsdom has no ResizeObserver; @radix-ui/react-scroll-area needs one to mount
// (see report-table.test.tsx for the same pattern).
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

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
vi.mock("next/navigation", () => ({
	useRouter: () => ({ push: pushMock }),
}));

beforeEach(() => {
	pushMock.mockClear();
});

import { PresetLibraryDialog } from "../preset-library-dialog";

describe("PresetLibraryDialog", () => {
	it("renders all 14 presets under 'All presets'", () => {
		render(<PresetLibraryDialog open onOpenChange={() => {}} />);
		expect(REPORT_PRESETS.length).toBe(14);
		for (const preset of REPORT_PRESETS) {
			expect(screen.getByText(preset.name)).toBeInTheDocument();
		}
	});

	it("category selection filters the visible presets", () => {
		render(<PresetLibraryDialog open onOpenChange={() => {}} />);
		expect(screen.getByText("Revenue by month")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("radio", { name: /Sales pipeline/i }));

		expect(screen.queryByText("Revenue by month")).not.toBeInTheDocument();
		expect(screen.getByText("Quote conversion rate")).toBeInTheDocument();
	});

	it("search filters the visible presets by name/description/entity", () => {
		render(<PresetLibraryDialog open onOpenChange={() => {}} />);

		fireEvent.change(screen.getByPlaceholderText("Search presets..."), {
			target: { value: "overdue" },
		});

		expect(screen.getByText("Overdue invoices")).toBeInTheDocument();
		expect(screen.queryByText("Revenue by month")).not.toBeInTheDocument();
	});

	it("shows the empty state when a search matches nothing", () => {
		render(<PresetLibraryDialog open onOpenChange={() => {}} />);

		fireEvent.change(screen.getByPlaceholderText("Search presets..."), {
			target: { value: "zzz-no-match" },
		});

		expect(screen.getByText("No presets match")).toBeInTheDocument();
	});

	it("'Use preset' is disabled until a row is selected, then navigates to /reports/new?preset=<id>", () => {
		render(<PresetLibraryDialog open onOpenChange={() => {}} />);
		const usePresetButton = screen.getByRole("button", { name: "Use preset" });
		expect(usePresetButton).toBeDisabled();

		fireEvent.click(screen.getByText("Revenue by month"));
		expect(usePresetButton).not.toBeDisabled();

		fireEvent.click(usePresetButton);
		expect(pushMock).toHaveBeenCalledWith("/reports/new?preset=revenue-by-month");
	});

	it("double-clicking a row navigates directly to that preset", () => {
		render(<PresetLibraryDialog open onOpenChange={() => {}} />);
		fireEvent.doubleClick(screen.getByText("Overdue invoices"));
		expect(pushMock).toHaveBeenCalledWith("/reports/new?preset=overdue-invoices");
	});

	it("'Start blank' navigates to /reports/new with no preset id", () => {
		render(<PresetLibraryDialog open onOpenChange={() => {}} />);
		fireEvent.click(screen.getByRole("button", { name: "Start blank" }));
		expect(pushMock).toHaveBeenCalledWith("/reports/new");
	});

	it("renders nothing when closed", () => {
		render(<PresetLibraryDialog open={false} onOpenChange={() => {}} />);
		expect(screen.queryByText("Start from a preset")).not.toBeInTheDocument();
	});
});
