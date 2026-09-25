"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type MetricFrameItem = {
	label: string;
	value: React.ReactNode;
	hint?: string;
	icon: React.ReactNode;
	accent?: string;
};

export interface MetricFrameProps {
	metrics: MetricFrameItem[];
	summary?: React.ReactNode;
	loading?: boolean;
	className?: string;
}

export function MetricFrame({ metrics, summary, loading = false, className }: MetricFrameProps) {
	return (
		<div className={cn("workspace-metrics", className)}>
			<div className="workspace-metrics-grid" style={{ "--metric-columns": metrics.length } as React.CSSProperties}>
				{metrics.map((metric) => (
					<div key={metric.label} className="workspace-metric">
						<div className="workspace-metric-label">
							<span aria-hidden="true" style={{ color: metric.accent ?? "var(--primary)" }}>{metric.icon}</span>
							<span>{metric.label}</span>
						</div>
						<div className="workspace-metric-value">
							{loading ? <span className="inline-block h-8 w-20 animate-pulse rounded-sm bg-secondary" /> : metric.value}
						</div>
						{metric.hint && <div className="workspace-metric-hint">{metric.hint}</div>}
					</div>
				))}
			</div>
			{summary && <div className="workspace-metric-summary">{summary}</div>}
		</div>
	);
}
