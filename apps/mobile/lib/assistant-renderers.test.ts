import { describe, expect, it } from "vitest";
import {
	buildReportView,
	buildScheduleRows,
	formatUtcDay,
	helpArticleUrl,
	hiddenCount,
	invoiceRow,
	isRenderableOutput,
	quoteRow,
	toolChipLabels,
} from "@/lib/assistant-renderers";

describe("buildReportView", () => {
	const output = {
		data: [
			{ label: "Jun 2026", value: 23 },
			{ label: "Jul 2026", value: 74 },
			{ label: "Aug 2026", value: 41 },
			{ label: "Sep 2026", value: 23 },
		],
		total: 161,
		visualization: "line",
	};

	it("ranks largest first but keeps backend order for the line chart", () => {
		const view = buildReportView(output)!;
		expect(view.ranked.map((r) => r.label)[0]).toBe("Jul 2026");
		expect(view.ordered.map((r) => r.label)).toEqual([
			"Jun 2026",
			"Jul 2026",
			"Aug 2026",
			"Sep 2026",
		]);
	});

	it("computes share of the item sum and bar length against the max", () => {
		const top = buildReportView(output)!.ranked[0];
		expect(top.percent).toBe("46.0%");
		expect(top.ratio).toBe(1);
	});

	it("uses report.total for the headline, not the item sum", () => {
		const view = buildReportView({ ...output, total: 9 })!;
		expect(view.totalText).toBe("9");
		expect(view.averageText).toBe("40.3");
	});

	it("formats currency only when the metadata flags say so", () => {
		const view = buildReportView({
			data: [{ label: "Paid", value: 1500 }],
			total: 1500,
			metadata: { totalIsCurrency: true, itemValueIsCurrency: true },
		})!;
		expect(view.totalText).toBe("$1,500");
		expect(view.ranked[0].valueText).toBe("$1,500");
		expect(view.visualization).toBe("bar");
	});

	it("returns null for a malformed payload", () => {
		expect(buildReportView(undefined)).toBeNull();
		expect(buildReportView({ total: 3 })).toBeNull();
	});
});

describe("record rows", () => {
	it("formats ISO days in UTC so they never shift a day", () => {
		expect(formatUtcDay("2026-09-01")).toBe("Sep 1");
		expect(
			invoiceRow({
				id: "i1",
				invoiceNumber: "INV-000002",
				status: "sent",
				total: 7800,
				dueDate: "2026-09-30",
			}).secondary,
		).toBe("Due Sep 30");
	});

	it("falls back to the quote number when a quote has no title", () => {
		const row = quoteRow({ id: "q1", quoteNumber: "Q-7", status: "draft", total: 10 });
		expect(row.primary).toBe("Quote Q-7");
		expect(row.href).toBe("/quotes/q1");
	});

	it("counts rows past the cap using the larger of totalCount and items", () => {
		expect(hiddenCount(12, 30)).toBe(22);
		expect(hiddenCount(5, undefined)).toBe(0);
		expect(hiddenCount(10, 3)).toBe(2);
	});
});

describe("buildScheduleRows", () => {
	it("sorts by day with undated entries last", () => {
		const { tasks } = buildScheduleRows({
			projects: [],
			tasks: [
				{ id: "a", title: "Undated", status: "pending", clientName: "A" },
				{ id: "b", title: "Later", date: "2026-10-02", status: "pending", clientName: "B" },
				{ id: "c", title: "Sooner", date: "2026-09-28", startTime: "9:00 AM", status: "pending", clientName: "C" },
			],
		});
		expect(tasks.map((t) => t.id)).toEqual(["c", "b", "a"]);
		expect(tasks[0].when).toBe("Mon, Sep 28 · 9:00 AM");
	});
});

describe("helpArticleUrl", () => {
	it("points at the public help center article", () => {
		expect(helpArticleUrl("ai-assistant/meet-the-assistant")).toBe(
			"https://onetool.biz/help/ai-assistant/meet-the-assistant",
		);
	});
});

describe("ratio reports", () => {
	it("shows the rate as a percentage and drops the count average", () => {
		const view = buildReportView({
			data: [
				{ label: "Approved", value: 21 },
				{ label: "Not Approved", value: 29 },
			],
			total: 42,
			metadata: { groupBy: "conversionRate" },
		})!;
		expect(view.totalText).toBe("42%");
		expect(view.averageText).toBeUndefined();
	});
});

describe("isRenderableOutput", () => {
	it("rejects malformed or missing output for tools with a renderer", () => {
		expect(isRenderableOutput("runReport", {})).toBe(false);
		expect(isRenderableOutput("runReport", undefined)).toBe(false);
		expect(isRenderableOutput("getBusinessStats", { totalClients: { current: 1 } })).toBe(false);
		expect(isRenderableOutput("listClients", { items: [] })).toBe(true);
		expect(isRenderableOutput("getSchedule", { tasks: [], projects: [] })).toBe(true);
	});

	it("never claims a tool without a renderer", () => {
		expect(isRenderableOutput("getTasks", { items: [] })).toBe(false);
	});
});

describe("toolChipLabels", () => {
	it("uses a present-progressive verb while running", () => {
		expect(toolChipLabels("getSchedule")).toEqual({
			done: "Checked schedule",
			active: "Checking schedule…",
		});
		expect(toolChipLabels("frobnicate")).toEqual({
			done: "Ran frobnicate",
			active: "Running frobnicate…",
		});
	});
});
