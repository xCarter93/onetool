import {
	Briefcase,
	DollarSign,
	FileText,
	ListChecks,
	Receipt,
	Users,
	type LucideIcon,
} from "lucide-react";
import type { MetricDatum } from "@/components/line-chart-6";

/** Display order of the Overview metrics (Revenue leads as the default hero). */
export const OVERVIEW_METRIC_ORDER = [
	"revenue",
	"clients",
	"projects",
	"quotes",
	"invoices",
	"tasks",
] as const;

export type OverviewMetricKey = (typeof OVERVIEW_METRIC_ORDER)[number];

/** One shared accent for every icon and chart line — no per-metric coloring. */
export const ACCENT_COLOR = "var(--primary)";

/** Standard lucide glyph per metric (all rendered in the shared accent). */
export const METRIC_VISUALS: Record<string, { icon: LucideIcon }> = {
	revenue: { icon: DollarSign },
	clients: { icon: Users },
	projects: { icon: Briefcase },
	quotes: { icon: FileText },
	invoices: { icon: Receipt },
	tasks: { icon: ListChecks },
};

export function metricVisual(key: string) {
	return METRIC_VISUALS[key] ?? { icon: Users };
}

export type SeriesStats = {
	high: number;
	low: number;
	first: number;
	last: number;
	change: number;
};

/** High / Low / net Change across a metric's plotted series. */
export function getSeriesStats(
	data: MetricDatum[] | undefined,
	key: string
): SeriesStats {
	if (!data || data.length === 0) {
		return { high: 0, low: 0, first: 0, last: 0, change: 0 };
	}
	const values = data.map((d) => Number(d[key]) || 0);
	const high = Math.max(...values);
	const low = Math.min(...values);
	const first = values[0];
	const last = values[values.length - 1];
	return { high, low, first, last, change: last - first };
}

const dateLabelFormatter = new Intl.DateTimeFormat("en-US", {
	month: "short",
	day: "numeric",
});

/** "YYYY-MM-DD" -> "Mar 24" (parsed as local midnight). */
export function formatDayLabel(dateString: string) {
	if (!dateString) return "";
	const parsed = new Date(`${dateString}T00:00:00`);
	if (Number.isNaN(parsed.getTime())) return dateString;
	return dateLabelFormatter.format(parsed);
}
