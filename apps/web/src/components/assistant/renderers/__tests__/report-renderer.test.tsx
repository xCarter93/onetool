// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeAll, afterAll } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(() => cleanup());

// jsdom has no ResizeObserver; recharts' ResponsiveContainer needs one to
// mount. Scoped to this file (save/restore) so it can't leak into other
// test files sharing the same worker.
class ResizeObserverStub {
	observe() {}
	unobserve() {}
	disconnect() {}
}
const originalResizeObserver = globalThis.ResizeObserver;
beforeAll(() => {
	globalThis.ResizeObserver = ResizeObserverStub;
});
afterAll(() => {
	globalThis.ResizeObserver = originalResizeObserver;
});

import { ReportRenderer } from "../report-renderer";

describe("ReportRenderer", () => {
	it("renders the truncation notice when metadata.truncated is true", () => {
		render(
			<ReportRenderer
				input={{ entityType: "clients", groupBy: "status" }}
				output={{
					data: [{ label: "Active", value: 7 }],
					total: 10000,
					visualization: "table",
					metadata: { entityType: "clients", groupBy: "status", truncated: true },
				}}
			/>
		);

		expect(
			screen.getByText(/results may be incomplete/i)
		).toBeInTheDocument();
	});

	it("does not render the truncation notice when metadata.truncated is absent", () => {
		render(
			<ReportRenderer
				input={{ entityType: "clients", groupBy: "status" }}
				output={{
					data: [{ label: "Active", value: 7 }],
					total: 10,
					visualization: "table",
					metadata: { entityType: "clients", groupBy: "status" },
				}}
			/>
		);

		expect(screen.queryByText(/results may be incomplete/i)).not.toBeInTheDocument();
	});

	it("prefers explicit metadata.totalIsCurrency over the getReportValueTypes fallback", () => {
		render(
			<ReportRenderer
				input={{ entityType: "clients", groupBy: "status" }}
				output={{
					data: [{ name: "Active", label: "Active", value: 7, metadata: { totalValue: 500 } }],
					total: 500,
					visualization: "table",
					// clients/status normally falls back to totalIsCurrency: false —
					// the explicit flag must win and render as currency.
					metadata: { entityType: "clients", groupBy: "status", totalIsCurrency: true },
				}}
			/>
		);

		expect(screen.getByText("Total: $500")).toBeInTheDocument();
	});
});
