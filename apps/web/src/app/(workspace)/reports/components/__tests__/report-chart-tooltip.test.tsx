// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeAll, afterAll } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	Cell,
	Pie,
	PieChart,
	PolarAngleAxis,
	Radar,
	RadarChart,
	RadialBar,
	RadialBarChart,
	XAxis,
	YAxis,
} from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { CHART_CATEGORICAL, getChartColor } from "@/lib/chart-colors";
import { ChartStripeDefs, stripeId } from "@/components/charts/chart-stripe-defs";
import {
	ReportChartTooltip,
	measureLabel,
	reportChartConfig,
} from "../report-chart-tooltip";
import { ReportPieChart } from "../report-pie-chart";

afterEach(() => cleanup());

class ResizeObserverStub {
	observe() {}
	unobserve() {}
	disconnect() {}
}
const originalResizeObserver = globalThis.ResizeObserver;
let originalOffsetWidth: PropertyDescriptor | undefined;
let originalOffsetHeight: PropertyDescriptor | undefined;
let originalGetBoundingClientRect: PropertyDescriptor | undefined;
beforeAll(() => {
	globalThis.ResizeObserver = ResizeObserverStub;
	originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
	originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
	originalGetBoundingClientRect = Object.getOwnPropertyDescriptor(
		HTMLElement.prototype,
		"getBoundingClientRect"
	);
	Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, value: 600 });
	Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, value: 400 });
	Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
		configurable: true,
		value: () => ({
			width: 600,
			height: 400,
			top: 0,
			left: 0,
			right: 600,
			bottom: 400,
			x: 0,
			y: 0,
			toJSON: () => ({}),
		}),
	});
});
afterAll(() => {
	globalThis.ResizeObserver = originalResizeObserver;
	if (originalOffsetWidth) Object.defineProperty(HTMLElement.prototype, "offsetWidth", originalOffsetWidth);
	if (originalOffsetHeight) Object.defineProperty(HTMLElement.prototype, "offsetHeight", originalOffsetHeight);
	// getBoundingClientRect is inherited from Element.prototype, so there is no
	// HTMLElement descriptor to restore — deleting the stub restores inheritance.
	if (originalGetBoundingClientRect) {
		Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", originalGetBoundingClientRect);
	} else {
		delete (HTMLElement.prototype as Partial<HTMLElement>).getBoundingClientRect;
	}
});

const DATA = [
	{ name: "Draft", value: 1200 },
	{ name: "Sent", value: 800 },
	{ name: "Paid", value: 400 },
];
const COLOR_0 = getChartColor(0, CHART_CATEGORICAL);
const COLOR_1 = getChartColor(1, CHART_CATEGORICAL);
const HOVERED = 1;

// Reading a rendered tooltip: heading + row text, and the chip's color, which
// ChartTooltipContent sets as a --color-bg custom property.
function tooltip(container: HTMLElement) {
	const root = container.querySelector(".cn-chart-tooltip");
	const chip = root?.querySelector<HTMLElement>("[style*='--color-bg']");
	return {
		text: root?.textContent ?? "",
		heading: root?.querySelector(".font-medium")?.textContent ?? "",
		chipColor: chip?.style.getPropertyValue("--color-bg").trim(),
		values: Array.from(root?.querySelectorAll(".font-mono") ?? []).map((n) => n.textContent),
	};
}

// The wrappers own their recharts trees; these mirror the parts that decide
// tooltip payload shape (dataKey/nameKey, Cell fills, config), which is what
// ReportChartTooltip reads. Kept in sync with report-*-chart.tsx by hand.
function PieReplica({ isCurrency }: { isCurrency: boolean }) {
	const prefix = React.useId();
	return (
		<ChartContainer config={reportChartConfig(DATA.map((d) => d.name), isCurrency)}>
			<PieChart>
				<ChartStripeDefs idPrefix={prefix} colors={DATA.map((_, i) => getChartColor(i, CHART_CATEGORICAL))} />
				<Pie data={DATA} dataKey="value" nameKey="name" isAnimationActive={false}>
					{DATA.map((_, i) => (
						<Cell key={i} fill={`url(#${stripeId(prefix, i)})`} stroke={getChartColor(i, CHART_CATEGORICAL)} strokeWidth={1} />
					))}
				</Pie>
				<ChartTooltip defaultIndex={HOVERED} content={<ReportChartTooltip nameKey="value" isCurrency={isCurrency} />} />
			</PieChart>
		</ChartContainer>
	);
}

function RadialReplica({ isCurrency }: { isCurrency: boolean }) {
	const prefix = React.useId();
	const chartData = DATA.map((item, i) => ({ ...item, fill: `url(#${stripeId(prefix, i)})` }));
	return (
		<ChartContainer config={reportChartConfig(DATA.map((d) => d.name), isCurrency)}>
			<RadialBarChart data={chartData}>
				<ChartStripeDefs idPrefix={prefix} colors={DATA.map((_, i) => getChartColor(i, CHART_CATEGORICAL))} />
				<ChartTooltip defaultIndex={HOVERED} content={<ReportChartTooltip isCurrency={isCurrency} />} />
				<RadialBar dataKey="value" isAnimationActive={false}>
					{chartData.map((entry, i) => (
						<Cell key={i} fill={entry.fill} stroke={getChartColor(i, CHART_CATEGORICAL)} strokeWidth={1} />
					))}
				</RadialBar>
			</RadialBarChart>
		</ChartContainer>
	);
}

function ColumnReplica({ isCurrency }: { isCurrency: boolean }) {
	const prefix = React.useId();
	return (
		<ChartContainer config={reportChartConfig(DATA.map((d) => d.name), isCurrency)}>
			<BarChart data={DATA}>
				<ChartStripeDefs idPrefix={prefix} colors={DATA.map((_, i) => getChartColor(i, CHART_CATEGORICAL))} />
				<XAxis dataKey="name" />
				<YAxis />
				<ChartTooltip defaultIndex={HOVERED} content={<ReportChartTooltip isCurrency={isCurrency} />} />
				<Bar dataKey="value">
					{DATA.map((_, i) => (
						<Cell key={i} fill={`url(#${stripeId(prefix, i)})`} stroke={getChartColor(i, CHART_CATEGORICAL)} strokeWidth={1} />
					))}
				</Bar>
			</BarChart>
		</ChartContainer>
	);
}

const SEGMENTS = [
	{ key: "paid", label: "Paid" },
	{ key: "unpaid", label: "Unpaid" },
];
const WIDE = [
	{ name: "Jan", value: 30, paid: 10, unpaid: 20 },
	{ name: "Feb", value: 50, paid: 20, unpaid: 30 },
];

function StackedReplica() {
	const prefix = React.useId();
	const config = SEGMENTS.reduce((acc, segment, index) => {
		acc[segment.key] = { label: segment.label, color: getChartColor(index, CHART_CATEGORICAL) };
		return acc;
	}, {} as ChartConfig);
	return (
		<ChartContainer config={config}>
			<BarChart data={WIDE}>
				<ChartStripeDefs idPrefix={prefix} colors={SEGMENTS.map((_, i) => getChartColor(i, CHART_CATEGORICAL))} />
				<XAxis dataKey="name" />
				<YAxis />
				<ChartTooltip defaultIndex={HOVERED} content={<ReportChartTooltip />} />
				{SEGMENTS.map((segment, index) => (
					<Bar key={segment.key} dataKey={segment.key} stackId="segments" fill={getChartColor(index, CHART_CATEGORICAL)}>
						{WIDE.map((_, bucket) => (
							<Cell key={bucket} fill={`url(#${stripeId(prefix, index)})`} stroke={getChartColor(index, CHART_CATEGORICAL)} strokeWidth={1} />
						))}
					</Bar>
				))}
			</BarChart>
		</ChartContainer>
	);
}

function RadarReplica({ isCurrency }: { isCurrency: boolean }) {
	const prefix = React.useId();
	return (
		<ChartContainer config={{ value: { label: measureLabel(isCurrency), color: COLOR_0 } }}>
			<RadarChart data={DATA}>
				<ChartStripeDefs idPrefix={prefix} colors={[COLOR_0]} />
				<PolarAngleAxis dataKey="name" />
				<ChartTooltip defaultIndex={HOVERED} content={<ReportChartTooltip isCurrency={isCurrency} />} />
				<Radar dataKey="value" fill={`url(#${stripeId(prefix, 0)})`} stroke={COLOR_0} strokeWidth={2} fillOpacity={1} />
			</RadarChart>
		</ChartContainer>
	);
}

function AreaReplica({ isCurrency }: { isCurrency: boolean }) {
	const prefix = React.useId();
	return (
		<ChartContainer config={{ value: { label: measureLabel(isCurrency), color: COLOR_0 } }}>
			<AreaChart data={DATA}>
				<ChartStripeDefs idPrefix={prefix} colors={[COLOR_0]} />
				<XAxis dataKey="name" />
				<YAxis />
				<ChartTooltip defaultIndex={HOVERED} content={<ReportChartTooltip isCurrency={isCurrency} />} />
				<Area type="monotone" dataKey="value" stroke={COLOR_0} strokeWidth={2} fill={`url(#${stripeId(prefix, 0)})`} />
			</AreaChart>
		</ChartContainer>
	);
}

describe("measureLabel", () => {
	it("names the measure row after the value type", () => {
		expect(measureLabel(true)).toBe("Amount");
		expect(measureLabel(false)).toBe("Count");
	});
});

describe("reportChartConfig", () => {
	it("gives every bucket its palette color and adds the measure row entry", () => {
		const config = reportChartConfig(["Draft", "Sent"], true);
		expect(config.Draft).toEqual({ label: "Draft", color: COLOR_0 });
		expect(config.Sent).toEqual({ label: "Sent", color: COLOR_1 });
		expect(config.value?.label).toBe("Amount");
	});
});

describe("ReportChartTooltip", () => {
	it("pie: bucket heading, measure row, hovered slice color, currency value", () => {
		const t = tooltip(render(<PieReplica isCurrency />).container);
		expect(t.heading).toBe("Sent");
		expect(t.text).toBe("SentAmount$800");
		expect(t.chipColor).toBe(COLOR_1);
	});

	it("radial: same treatment — no literal 'value' row, no paint-server chip", () => {
		const t = tooltip(render(<RadialReplica isCurrency />).container);
		expect(t.heading).toBe("Sent");
		expect(t.text).toBe("SentAmount$800");
		expect(t.chipColor).toBe(COLOR_1);
	});

	it("column: same treatment, count values stay unformatted", () => {
		const t = tooltip(render(<ColumnReplica isCurrency={false} />).container);
		expect(t.heading).toBe("Sent");
		expect(t.text).toBe("SentCount800");
		expect(t.chipColor).toBe(COLOR_1);
	});

	it("radar: unchanged arrangement, now currency-aware", () => {
		const t = tooltip(render(<RadarReplica isCurrency />).container);
		expect(t.heading).toBe("Sent");
		expect(t.text).toBe("SentAmount$800");
		expect(t.chipColor).toBe(COLOR_0);
	});

	it("area: same treatment as radar", () => {
		const t = tooltip(render(<AreaReplica isCurrency />).container);
		expect(t.heading).toBe("Sent");
		expect(t.text).toBe("SentAmount$800");
		expect(t.chipColor).toBe(COLOR_0);
	});

	it("stacked: one row per segment, each keeping its own segment color", () => {
		const t = tooltip(render(<StackedReplica />).container);
		expect(t.heading).toBe("Feb");
		expect(t.text).toBe("FebPaid20Unpaid30");
		expect(t.values).toEqual(["20", "30"]);
	});

	// Only the item-mode charts activate on hover in jsdom; the axis-mode ones
	// (bar, column, area, radar) need real layout, so replicas cover those.
	it("wires into ReportPieChart itself, not just a replica", () => {
		const { container } = render(
			<ReportPieChart data={DATA} total={2400} entityType="invoices" itemValueIsCurrency />
		);
		fireEvent.mouseOver(container.querySelectorAll(".recharts-pie-sector")[HOVERED], {
			clientX: 300,
			clientY: 200,
		});
		expect(tooltip(container).text).toBe("SentAmount$800");
	});
});
