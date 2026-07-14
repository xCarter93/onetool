"use client";

import type { ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { Frame, FramePanel } from "@/components/reui/frame";
import { Activity, Timer, CheckCircle2, Power } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDuration, formatPercent } from "../lib/run-format";

const WINDOW_DAYS = 30;

function StatTile({
	icon,
	iconBg,
	label,
	value,
	sub,
	loading,
}: {
	icon: ReactNode;
	iconBg: string;
	label: string;
	value: ReactNode;
	sub?: ReactNode;
	loading?: boolean;
}) {
	return (
		<FramePanel className="flex flex-col">
			<div
				className={cn(
					"mb-3.5 flex size-9 items-center justify-center rounded-lg border-2 border-background shadow-[0_1px_3px_0_rgba(0,0,0,0.14)] dark:border [&_svg]:size-4.5 [&_svg]:text-white",
					iconBg
				)}
				aria-hidden
			>
				{icon}
			</div>
			<div className="text-muted-foreground text-xs font-medium">{label}</div>
			{loading ? (
				<div className="mt-1.5 h-7 w-20 rounded-md bg-muted motion-safe:animate-pulse" />
			) : (
				<div className="mt-1 text-2xl leading-none font-semibold tabular-nums text-foreground">
					{value}
				</div>
			)}
			{sub && !loading ? (
				<p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">
					{sub}
				</p>
			) : null}
		</FramePanel>
	);
}

export function RunMetricsTiles() {
	const metrics = useQuery(api.automations.getRunMetrics, {
		windowDays: WINDOW_DAYS,
	});
	const loading = metrics === undefined;

	return (
		<Frame className="w-full">
			<div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
				<StatTile
					icon={<Activity />}
					iconBg="bg-blue-500"
					label="Total runs"
					loading={loading}
					value={(metrics?.totalRuns ?? 0).toLocaleString()}
					sub={`Last ${WINDOW_DAYS} days`}
				/>
				<StatTile
					icon={<Timer />}
					iconBg="bg-violet-500"
					label="Avg latency"
					loading={loading}
					value={formatDuration(metrics?.avgActiveMs)}
					sub={
						metrics?.p95ActiveMs != null
							? `p95 ${formatDuration(metrics.p95ActiveMs)} · active execution time`
							: "Active execution time"
					}
				/>
				<StatTile
					icon={<CheckCircle2 />}
					iconBg="bg-emerald-500"
					label="Success rate"
					loading={loading}
					value={formatPercent(metrics?.successRate)}
					sub={
						metrics
							? `${metrics.failedCount.toLocaleString()} failed${
									metrics.withErrorsCount > 0
										? ` · ${metrics.withErrorsCount.toLocaleString()} partial`
										: ""
								} of ${(
									metrics.successCount +
									metrics.failedCount +
									metrics.withErrorsCount
								).toLocaleString()}`
							: undefined
					}
				/>
				<StatTile
					icon={<Power />}
					iconBg="bg-amber-500"
					label="Active automations"
					loading={loading}
					value={(metrics?.activeAutomationCount ?? 0).toLocaleString()}
					sub="Currently enabled"
				/>
			</div>
		</Frame>
	);
}
