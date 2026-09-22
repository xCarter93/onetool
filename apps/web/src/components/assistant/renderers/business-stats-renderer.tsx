"use client";

import { Progress } from "@/components/ui/progress";
import { formatCurrency } from "@/lib/money";
import type { ToolRendererProps } from "./index";

// Mirrors HomeStats in convex/homeStats.ts (only the fields shown here).
interface HomeStatsOutput {
	totalClients: { current: number };
	completedProjects: { current: number; totalValue: number };
	approvedQuotes: { current: number; totalValue: number };
	invoicesPaid: { current: number; totalValue: number; outstanding: number };
	revenueGoal: { percentage: number; current: number; target: number };
	pendingTasks: { total: number; dueThisWeek: number };
}

function Figure({
	label,
	value,
	secondary,
}: {
	label: string;
	value: string;
	secondary?: string;
}) {
	return (
		<div>
			<p className="text-[11px] text-muted-foreground">{label}</p>
			<p className="text-sm font-medium text-foreground tabular-nums">{value}</p>
			{secondary && (
				<p className="text-xs text-muted-foreground tabular-nums">{secondary}</p>
			)}
		</div>
	);
}

export function BusinessStatsRenderer({ output }: ToolRendererProps) {
	const stats = output as HomeStatsOutput;
	if (!stats?.totalClients || !stats.revenueGoal) return null;

	return (
		<div className="rounded-xl border border-border bg-card px-3.5 py-2.5">
			<div className="grid grid-cols-2 gap-x-4 gap-y-3">
				<Figure label="Clients" value={stats.totalClients.current.toLocaleString("en-US")} />
				<Figure
					label="Completed projects"
					value={stats.completedProjects.current.toLocaleString("en-US")}
					secondary={formatCurrency(stats.completedProjects.totalValue, { whole: true })}
				/>
				<Figure
					label="Approved quotes"
					value={stats.approvedQuotes.current.toLocaleString("en-US")}
					secondary={formatCurrency(stats.approvedQuotes.totalValue, { whole: true })}
				/>
				<Figure
					label="Invoices paid"
					value={stats.invoicesPaid.current.toLocaleString("en-US")}
					secondary={formatCurrency(stats.invoicesPaid.totalValue, { whole: true })}
				/>
				<Figure
					label="Outstanding"
					value={formatCurrency(stats.invoicesPaid.outstanding, { whole: true })}
				/>
				<Figure
					label="Pending tasks"
					value={stats.pendingTasks.total.toLocaleString("en-US")}
					secondary={`${stats.pendingTasks.dueThisWeek} due this week`}
				/>
			</div>
			{stats.revenueGoal.target > 0 && (
				<div className="mt-3 border-t border-border/60 pt-3">
					<div className="flex items-baseline justify-between text-xs">
						<span className="text-muted-foreground">Revenue goal</span>
						<span className="text-foreground tabular-nums">
							{formatCurrency(stats.revenueGoal.current, { whole: true })} of{" "}
							{formatCurrency(stats.revenueGoal.target, { whole: true })}
						</span>
					</div>
					<Progress
						value={Math.min(stats.revenueGoal.percentage, 100)}
						className="mt-1.5 [&_[data-slot=progress-track]]:h-1.5"
					/>
				</div>
			)}
		</div>
	);
}
