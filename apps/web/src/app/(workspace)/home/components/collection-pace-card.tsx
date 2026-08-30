"use client";

import { useId, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { Settings2 } from "lucide-react";
import {
	Area,
	CartesianGrid,
	ComposedChart,
	Line,
	ReferenceLine,
	XAxis,
	YAxis,
} from "recharts";

import { ChartStripeDefs, stripeId } from "@/components/charts/chart-stripe-defs";
import { EmptyState } from "@/components/domain/empty-state";
import { Frame, FramePanel } from "@/components/reui/frame";
import { Button } from "@/components/ui/button";
import {
	ChartContainer,
	ChartTooltip,
	type ChartConfig,
} from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverDescription,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsOrgSwitching } from "@/hooks/use-is-org-switching";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatCurrency, parseCurrencyInput } from "@/lib/money";
import {
	periodLabel,
	usePeriodRange,
	type DashboardPeriod,
} from "./dashboard-period";

const INVOICED_COLOR = "var(--chart-1)";
const COLLECTED_COLOR = "var(--chart-6)";

const chartConfig: ChartConfig = {
	invoiced: { label: "Invoiced", color: INVOICED_COLOR },
	collected: { label: "Collected", color: COLLECTED_COLOR },
};

type PacePoint = { date: string; invoiced: number; collected: number };

function formatBucket(date: string): string {
	const parts = date.split("-");
	if (parts.length === 2) {
		return new Date(Number(parts[0]), Number(parts[1]) - 1, 1).toLocaleDateString(
			"en-US",
			{ month: "short" }
		);
	}
	return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
	});
}

function PaceTooltip({
	active,
	payload,
}: {
	active?: boolean;
	payload?: Array<{ dataKey: string; value: number; payload: PacePoint }>;
}) {
	if (!active || !payload?.length) return null;
	const point = payload[0].payload;
	return (
		<div className="rounded-lg border bg-popover p-2.5 shadow-lg">
			<div className="text-[11px] font-medium text-muted-foreground">
				{formatBucket(point.date)}
			</div>
			<div className="mt-1.5 space-y-1">
				{(
					[
						["Invoiced", point.invoiced, INVOICED_COLOR],
						["Collected", point.collected, COLLECTED_COLOR],
					] as const
				).map(([label, value, color]) => (
					<div key={label} className="flex items-center gap-1.5">
						<span
							aria-hidden
							className="size-1.5 rounded-full"
							style={{ backgroundColor: color }}
						/>
						<span className="text-xs text-muted-foreground">{label}</span>
						<span className="ml-auto text-sm font-semibold tabular-nums text-popover-foreground">
							{formatCurrency(value)}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

function TargetPopover({ current }: { current: number | null }) {
	const [open, setOpen] = useState(false);
	const [value, setValue] = useState("");
	const [isSaving, setIsSaving] = useState(false);
	const setTarget = useMutation(api.organizations.setMonthlyRevenueTarget);
	const toast = useToast();
	const inputId = useId();

	const submit = async (target: number | null) => {
		setIsSaving(true);
		try {
			await setTarget({ target });
			toast.success(
				target === null ? "Target cleared" : "Target saved",
				target === null
					? "The pace chart no longer shows a target."
					: `Monthly revenue target set to ${formatCurrency(target, { whole: true })}.`
			);
			setOpen(false);
		} catch {
			toast.error("Could not save target", "Please try again.");
		} finally {
			setIsSaving(false);
		}
	};

	const parsed = parseCurrencyInput(value);
	// Validate the raw text: parseCurrencyInput falls back to 0 on garbage,
	// which would silently save a $0 target. An explicit "0" stays allowed.
	const cleaned = value.replace(/[$,\s]/g, "");
	const canSave =
		cleaned !== "" && Number.isFinite(Number(cleaned)) && parsed >= 0;

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (next) setValue(current === null ? "" : String(current));
			}}
		>
			<PopoverTrigger
				render={
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label="Set monthly revenue target"
					/>
				}
			>
				<Settings2 aria-hidden="true" />
			</PopoverTrigger>
			<PopoverContent align="end" className="w-72">
				<PopoverHeader>
					<PopoverTitle>Monthly revenue target</PopoverTitle>
					<PopoverDescription>
						Drawn on the Month view of the pace chart as the line to beat by
						month end.
					</PopoverDescription>
				</PopoverHeader>
				<form
					className="mt-3 space-y-3"
					onSubmit={(event) => {
						event.preventDefault();
						if (canSave) void submit(parsed);
					}}
				>
					<div className="space-y-1.5">
						<Label htmlFor={inputId}>Target</Label>
						<Input
							id={inputId}
							inputMode="decimal"
							placeholder="50,000"
							value={value}
							onChange={(event) => setValue(event.target.value)}
							autoFocus
						/>
					</div>
					<div className="flex gap-2">
						<Button
							type="submit"
							size="sm"
							className="flex-1"
							disabled={!canSave || isSaving}
						>
							Save
						</Button>
						<Button
							type="button"
							size="sm"
							variant="outline"
							disabled={current === null || isSaving}
							onClick={() => void submit(null)}
						>
							Clear
						</Button>
					</div>
				</form>
			</PopoverContent>
		</Popover>
	);
}

export function CollectionPaceCard({
	period,
	className,
}: {
	period: DashboardPeriod;
	className?: string;
}) {
	const isOrgSwitching = useIsOrgSwitching();
	const range = usePeriodRange(period);
	const patternPrefix = useId();
	const dotGridId = `${patternPrefix}-pace-dots`.replace(/:/g, "");

	const pace = useQuery(api.dashboardStats.getCollectionPace, {
		startDate: range.startDate,
		endDate: range.endDate,
		granularity: range.granularity,
	});
	const currentUser = useQuery(api.users.current);
	const organization = useQuery(api.organizations.get, {});
	const isOwner =
		!!organization && !!currentUser && organization.ownerUserId === currentUser._id;

	// Running totals: the chart reads as money climbing toward the target, not
	// as daily spikes.
	const data: PacePoint[] = useMemo(() => {
		if (!pace) return [];
		const collectedByDate = new Map(
			pace.collected.map((bucket) => [bucket.date, bucket.value])
		);
		let invoicedRunning = 0;
		let collectedRunning = 0;
		return pace.invoiced.map((bucket) => {
			invoicedRunning += bucket.value;
			collectedRunning += collectedByDate.get(bucket.date) ?? 0;
			return {
				date: bucket.date,
				invoiced: invoicedRunning,
				collected: collectedRunning,
			};
		});
	}, [pace]);

	// The stored target is monthly, so it only maps onto a monthly window.
	const goal = pace?.goal ?? null;
	const showGoal = goal !== null && period === "month";
	const variance = showGoal ? (pace?.totals.collected ?? 0) - goal : null;

	const isLoading = isOrgSwitching || pace === undefined;
	const hasActivity =
		data.length > 0 && data.some((d) => d.invoiced > 0 || d.collected > 0);

	return (
		<Frame className={cn("w-full", className)}>
			<FramePanel className="flex grow flex-col gap-4">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<h3 className="text-base font-semibold text-foreground">
							Collection pace
						</h3>
						<p className="mt-0.5 text-xs text-muted-foreground">
							What you billed {periodLabel(period)} and how much of it has
							landed.
						</p>
					</div>
					{isOwner && <TargetPopover current={goal} />}
				</div>

				<div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
					<div>
						<div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
							Collected
						</div>
						{isLoading ? (
							<Skeleton className="mt-1 h-7 w-28" />
						) : (
							<div className="text-2xl font-bold tabular-nums text-foreground">
								{formatCurrency(pace?.totals.collected ?? 0, { whole: true })}
							</div>
						)}
					</div>
					<div>
						<div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
							Invoiced
						</div>
						{isLoading ? (
							<Skeleton className="mt-1 h-7 w-24" />
						) : (
							<div className="text-2xl font-semibold tabular-nums text-muted-foreground">
								{formatCurrency(pace?.totals.invoiced ?? 0, { whole: true })}
							</div>
						)}
					</div>
					{variance !== null && (
						<div>
							<div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
								vs. target
							</div>
							<div
								className={cn(
									"text-2xl font-semibold tabular-nums",
									variance >= 0 ? "text-success" : "text-destructive"
								)}
							>
								{variance >= 0 ? "+" : "−"}
								{formatCurrency(Math.abs(variance), { whole: true })}
							</div>
						</div>
					)}
				</div>

				{isLoading ? (
					<Skeleton className="h-[220px] w-full rounded-lg" />
				) : !hasActivity ? (
					<EmptyState
						illustration="report-chart-no-data"
						title="No billing activity yet"
						description="Send an invoice and this chart tracks how fast it gets paid."
						className="min-h-[220px] justify-center"
					/>
				) : (
					<ChartContainer
						config={chartConfig}
						// flex-1 so the chart absorbs the row height set by its neighbor
						className="aspect-auto min-h-[220px] w-full flex-1 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-initial"
						style={{ width: "100%" }}
					>
						<ComposedChart
							data={data}
							margin={{ top: 12, right: 12, left: 4, bottom: 8 }}
						>
							<ChartStripeDefs
								idPrefix={patternPrefix}
								colors={[INVOICED_COLOR, COLLECTED_COLOR]}
							/>
							<defs>
								<pattern
									id={dotGridId}
									x="0"
									y="0"
									width="20"
									height="20"
									patternUnits="userSpaceOnUse"
								>
									<circle
										cx="10"
										cy="10"
										r="1"
										fill="var(--input)"
										fillOpacity="0.6"
									/>
								</pattern>
							</defs>
							<rect
								x="0"
								y="0"
								width="100%"
								height="100%"
								fill={`url(#${dotGridId})`}
								style={{ pointerEvents: "none" }}
							/>

							<CartesianGrid
								strokeDasharray="4 8"
								stroke="var(--border)"
								horizontal
								vertical={false}
							/>

							<XAxis
								dataKey="date"
								axisLine={false}
								tickLine={false}
								tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
								tickMargin={12}
								interval="preserveStartEnd"
								minTickGap={28}
								tickFormatter={formatBucket}
							/>
							<YAxis
								axisLine={false}
								tickLine={false}
								tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
								tickMargin={8}
								width={56}
								tickCount={5}
								tickFormatter={(value: number) =>
									formatCurrency(value, { compact: true })
								}
							/>

							<ChartTooltip
								content={<PaceTooltip />}
								cursor={{
									strokeDasharray: "3 3",
									stroke: "var(--muted-foreground)",
									strokeOpacity: 0.5,
								}}
							/>

							<Area
								type="monotone"
								dataKey="collected"
								stroke="none"
								fill={`url(#${stripeId(patternPrefix, 1)})`}
								isAnimationActive={false}
							/>
							<Line
								type="monotone"
								dataKey="invoiced"
								stroke={INVOICED_COLOR}
								strokeWidth={2}
								strokeDasharray="5 4"
								dot={false}
								isAnimationActive={false}
							/>
							<Line
								type="monotone"
								dataKey="collected"
								stroke={COLLECTED_COLOR}
								strokeWidth={2.5}
								dot={false}
								activeDot={{
									r: 5,
									fill: COLLECTED_COLOR,
									stroke: "var(--card)",
									strokeWidth: 2,
								}}
								isAnimationActive={false}
							/>

							{showGoal && goal !== null && (
								<ReferenceLine
									y={goal}
									ifOverflow="extendDomain"
									stroke="var(--muted-foreground)"
									strokeDasharray="6 6"
									strokeOpacity={0.8}
									label={{
										value: `Target ${formatCurrency(goal, { whole: true })}`,
										position: "insideTopLeft",
										fill: "var(--muted-foreground)",
										fontSize: 11,
									}}
								/>
							)}
						</ComposedChart>
					</ChartContainer>
				)}

				<div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
					<span className="flex items-center gap-1.5">
						<span
							aria-hidden
							className="h-0.5 w-4 rounded-full"
							style={{ backgroundColor: COLLECTED_COLOR }}
						/>
						Collected
					</span>
					<span className="flex items-center gap-1.5">
						<span
							aria-hidden
							className="h-0.5 w-4 rounded-full opacity-70"
							style={{
								backgroundImage: `repeating-linear-gradient(to right, ${INVOICED_COLOR} 0 5px, transparent 5px 9px)`,
							}}
						/>
						Invoiced
					</span>
				</div>
			</FramePanel>
		</Frame>
	);
}
