// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("convex/react", () => ({ useQuery: vi.fn() }));

const downloadCsv = vi.fn();
vi.mock("@/lib/csv-export", async () => {
	const actual = await vi.importActual<typeof import("@/lib/csv-export")>(
		"@/lib/csv-export"
	);
	return { ...actual, downloadCsv: (...args: unknown[]) => downloadCsv(...args) };
});

import { useQuery } from "convex/react";
import { ReportContributingSheet } from "../report-contributing-sheet";
import type { ReportConfigV2 } from "../../report-config";

const mockedUseQuery = vi.mocked(useQuery);

// Base UI's dialog measures the viewport and locks scroll; jsdom ships neither.
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

afterEach(() => {
	cleanup();
	mockedUseQuery.mockReset();
	downloadCsv.mockReset();
});

const invoicesByStatus: ReportConfigV2 = {
	version: 2,
	entityType: "invoices",
	metric: { op: "count" },
	groupBy: "status",
};

function detailResult(
	overrides: Partial<{
		columns: { field: string; label: string; type: string }[];
		rows: Record<string, unknown>[];
		totalMatched: number;
		rowsTruncated: boolean;
		truncated: boolean;
	}> = {}
) {
	return {
		data: [],
		total: overrides.totalMatched ?? 2,
		metadata: {
			entityType: "invoices",
			truncated: overrides.truncated ?? false,
		},
		detail: {
			columns: overrides.columns ?? [
				{ field: "invoiceNumber", label: "Invoice Number", type: "string" },
				{ field: "total", label: "Total", type: "currency" },
				{ field: "issuedDate", label: "Issued Date", type: "timestamp" },
				{ field: "isActive", label: "Active", type: "boolean" },
			],
			rows: overrides.rows ?? [
				{
					id: "inv_1",
					invoiceNumber: "INV-1",
					total: 1234.5,
					issuedDate: Date.UTC(2026, 0, 15, 12),
					isActive: true,
				},
			],
			totalMatched: overrides.totalMatched ?? 2,
			rowsTruncated: overrides.rowsTruncated ?? false,
		},
	};
}

function renderSheet(
	props: Partial<React.ComponentProps<typeof ReportContributingSheet>> = {}
) {
	return render(
		<ReportContributingSheet
			scope={{}}
			onClose={() => {}}
			config={invoicesByStatus}
			visualization={{ type: "bar" }}
			reportName="Invoice report"
			{...props}
		/>
	);
}

describe("ReportContributingSheet — rows", () => {
	it("formats cells by type and links the leading cell to the record", () => {
		mockedUseQuery.mockReturnValue(detailResult());
		renderSheet();

		const link = screen.getByRole("link", { name: "INV-1" });
		expect(link).toHaveAttribute("href", "/invoices/inv_1");
		// Record-level currency shows exact cents, not the chart's whole dollars.
		expect(screen.getByText("$1,234.50")).toBeInTheDocument();
		expect(screen.getByText("Jan 15, 2026")).toBeInTheDocument();
		expect(screen.getByText("Yes")).toBeInTheDocument();
	});

	it("a page-less entity links its leading cell to the parent record via refs", () => {
		mockedUseQuery.mockReturnValue({
			...detailResult({
				columns: [{ field: "description", label: "Description", type: "string" }],
				rows: [
					{ id: "qli_1", refs: { quoteId: "q_1" }, description: "Mulch" },
					{ id: "qli_2", description: "Orphan" },
				],
			}),
		});
		renderSheet({
			config: { ...invoicesByStatus, entityType: "quoteLineItems" },
		});

		expect(screen.getByRole("link", { name: "Mulch" })).toHaveAttribute(
			"href",
			"/quotes/q_1"
		);
		// No parent ref — the label still shows, just not as a link.
		expect(screen.queryByRole("link", { name: "Orphan" })).not.toBeInTheDocument();
		expect(screen.getByText("Orphan")).toBeInTheDocument();
	});

	it("activity rows are never linked", () => {
		mockedUseQuery.mockReturnValue(
			detailResult({
				columns: [{ field: "description", label: "Description", type: "string" }],
				rows: [{ id: "act_1", description: "Sent invoice" }],
			})
		);
		renderSheet({ config: { ...invoicesByStatus, entityType: "activities" } });

		expect(screen.queryByRole("link")).not.toBeInTheDocument();
		expect(screen.getByText("Sent invoice")).toBeInTheDocument();
	});
});

describe("ReportContributingSheet — header and states", () => {
	it("names the entity and the bucket, and counts the records", () => {
		mockedUseQuery.mockReturnValue(detailResult({ totalMatched: 12 }));
		renderSheet({ scope: { bucketKey: "paid", bucketLabel: "March 2026" } });

		expect(screen.getByText("Invoices · March 2026")).toBeInTheDocument();
		expect(screen.getByText("12 records")).toBeInTheDocument();
	});

	it("says how many rows it is showing when the row cap truncated them", () => {
		// Row count comes from the payload, not the requested cap — a small
		// fixture stands in for the 1,000 rows the server would really send.
		mockedUseQuery.mockReturnValue(
			detailResult({
				rows: [
					{ id: "inv_1", invoiceNumber: "INV-1" },
					{ id: "inv_2", invoiceNumber: "INV-2" },
					{ id: "inv_3", invoiceNumber: "INV-3" },
				],
				columns: [
					{ field: "invoiceNumber", label: "Invoice Number", type: "string" },
				],
				totalMatched: 4200,
				rowsTruncated: true,
			})
		);
		renderSheet();

		expect(
			screen.getByText("Showing first 3 of 4,200 records")
		).toBeInTheDocument();
	});

	it("warns separately when the scan itself hit its ceiling", () => {
		mockedUseQuery.mockReturnValue(detailResult({ truncated: true }));
		renderSheet();

		expect(screen.getByText(/results may be incomplete/i)).toBeInTheDocument();
	});

	it("renders an empty state when nothing is behind the selection", () => {
		mockedUseQuery.mockReturnValue(
			detailResult({ rows: [], totalMatched: 0 })
		);
		renderSheet();

		expect(
			screen.getByText("No records behind this selection.")
		).toBeInTheDocument();
	});

	it("renders skeleton rows while the query is in flight", () => {
		mockedUseQuery.mockReturnValue(undefined);
		const { baseElement } = renderSheet();

		expect(
			baseElement.querySelectorAll('[data-slot="skeleton"]').length
		).toBeGreaterThan(0);
	});
});

describe("ReportContributingSheet — query args", () => {
	it("scopes rows to the clicked bucket", () => {
		mockedUseQuery.mockReturnValue(detailResult());
		renderSheet({ scope: { bucketKey: "paid", bucketLabel: "Paid" } });

		expect(mockedUseQuery.mock.calls[0][1]).toMatchObject({
			entityType: "invoices",
			detail: { limit: 1000, bucketKey: "paid" },
		});
	});

	it("never sends a bucketKey for an ungrouped config", () => {
		mockedUseQuery.mockReturnValue(detailResult());
		const { groupBy: _groupBy, ...ungrouped } = invoicesByStatus;
		renderSheet({ config: ungrouped, scope: { bucketKey: "paid" } });

		expect(mockedUseQuery.mock.calls[0][1]).not.toHaveProperty(
			"detail.bucketKey"
		);
	});

	it("skips the query while closed", () => {
		mockedUseQuery.mockReturnValue(undefined);
		renderSheet({ scope: null });

		expect(mockedUseQuery.mock.calls[0][1]).toBe("skip");
	});
});

describe("ReportContributingSheet — CSV", () => {
	it("has no download button unless the surface offers one", () => {
		mockedUseQuery.mockReturnValue(detailResult());
		renderSheet();

		expect(
			screen.queryByRole("button", { name: /Download CSV/ })
		).not.toBeInTheDocument();
	});

	it("exports the rows, naming the file after the report and the bucket", () => {
		mockedUseQuery.mockReturnValue(detailResult());
		renderSheet({
			showCsvDownload: true,
			scope: { bucketKey: "paid", bucketLabel: "Paid" },
		});

		fireEvent.click(screen.getByRole("button", { name: /Download CSV/ }));

		expect(downloadCsv).toHaveBeenCalledTimes(1);
		const [filename, csv] = downloadCsv.mock.calls[0];
		expect(filename).toBe("Invoice report - Paid.csv");
		expect(csv).toContain("Invoice Number");
		expect(csv).toContain("INV-1");
	});
});
