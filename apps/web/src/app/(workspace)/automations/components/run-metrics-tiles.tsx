"use client";

import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { Activity, Timer, CheckCircle2, Power } from "lucide-react";
import { MetricFrame } from "@/components/metric-frame";
import { formatDuration, formatPercent } from "../lib/run-format";

const WINDOW_DAYS = 30;

export function RunMetricsTiles() {
	const metrics = useQuery(api.automations.getRunMetrics, {
		windowDays: WINDOW_DAYS,
	});

	return (
		<MetricFrame
			loading={metrics === undefined}
			metrics={[
				{
					icon: <Activity />,
					label: "Total runs",
					value: (metrics?.totalRuns ?? 0).toLocaleString(),
					hint: `Last ${WINDOW_DAYS} days`,
				},
				{
					icon: <Timer />,
					label: "Avg latency",
					value: formatDuration(metrics?.avgActiveMs),
					hint:
						metrics?.p95ActiveMs != null
							? `p95 ${formatDuration(metrics.p95ActiveMs)} · active execution time`
							: "Active execution time",
				},
				{
					icon: <CheckCircle2 />,
					label: "Success rate",
					value: formatPercent(metrics?.successRate),
					hint: metrics
						? `${metrics.failedCount.toLocaleString()} failed${
								metrics.withErrorsCount > 0
									? ` · ${metrics.withErrorsCount.toLocaleString()} partial`
									: ""
							} of ${(
								metrics.successCount +
								metrics.failedCount +
								metrics.withErrorsCount
							).toLocaleString()}`
						: undefined,
				},
				{
					icon: <Power />,
					label: "Active automations",
					value: (metrics?.activeAutomationCount ?? 0).toLocaleString(),
					hint: "Currently enabled",
				},
			]}
		/>
	);
}
