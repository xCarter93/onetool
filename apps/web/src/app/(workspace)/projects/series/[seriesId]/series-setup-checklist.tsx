"use client";

import { useId, useState, type ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import {
	CalendarClock,
	Check,
	ChevronDown,
	Circle,
	CircleAlert,
	CircleCheck,
	FileSignature,
	FileText,
	Pencil,
	Receipt,
} from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import type { ProjectRecurrenceRule } from "@onetool/backend/convex/lib/projectRecurrence";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/reui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	Frame,
	FrameHeader,
	FramePanel,
	FrameTitle,
} from "@/components/reui/frame";
import {
	Stepper,
	StepperIndicator,
	StepperItem,
	StepperNav,
	StepperSeparator,
} from "@/components/reui/stepper";
import { formatCalendarDate } from "@/lib/dates";
import { formatCurrency } from "@/lib/money";
import { cn } from "@/lib/utils";
import { describeRecurrence } from "../../components/recurrence/rule";

export const AGREEMENT_PANEL_ID = "recurring-agreement";

type RowStatus = "complete" | "todo" | "warning";

type Row = {
	label: string;
	detail: string;
	status: RowStatus;
	action?: (primary: boolean) => ReactNode;
};

const STEP_ICON: Record<string, typeof Circle> = {
	Schedule: CalendarClock,
	Quote: FileText,
	Agreement: FileSignature,
	Billing: Receipt,
};

const ROW_ICON: Record<RowStatus, { Icon: typeof Circle; className: string }> = {
	complete: { Icon: CircleCheck, className: "text-success-foreground" },
	warning: { Icon: CircleAlert, className: "text-warning-foreground" },
	todo: { Icon: Circle, className: "text-muted-foreground" },
};

const PENDING_DETAIL: Record<string, { detail: string; status: RowStatus }> = {
	draft: { detail: "Generate the PDF", status: "todo" },
	ready_to_send: { detail: "Send it to your client", status: "todo" },
	awaiting_approval: { detail: "Waiting for your client", status: "todo" },
	not_activated: {
		detail: "Marked approved by hand. Withdraw it and send again",
		status: "warning",
	},
	declined: {
		detail: "Your client declined it. Withdraw it and send again",
		status: "warning",
	},
	expired: {
		detail: "The request expired. Withdraw it and send again",
		status: "warning",
	},
	revoked: {
		detail: "The request was revoked. Withdraw it and send again",
		status: "warning",
	},
};

function storageKey(seriesId: string) {
	return `series-setup-checklist:${seriesId}`;
}

function LinkAction({
	href,
	primary = false,
	children,
}: {
	href: string;
	primary?: boolean;
	children: ReactNode;
}) {
	return (
		<Button
			nativeButton={false}
			size="sm"
			variant={primary ? "default" : "outline"}
			render={<Link href={href as Route} />}
		>
			{children}
		</Button>
	);
}

export function SeriesSetupChecklist({
	seriesId,
	rule,
	nextVisitId,
	canManage,
	scheduleLockReason,
	onEditSchedule,
}: {
	seriesId: Id<"projectSeries">;
	rule: ProjectRecurrenceRule;
	nextVisitId?: Id<"projects">;
	canManage: boolean;
	scheduleLockReason: string | null;
	onEditSchedule: () => void;
}) {
	const checklist = useQuery(api.projectSeries.getSetupChecklist, { seriesId });
	const agreement = useQuery(api.projectSeriesAgreements.getSeriesAgreement, {
		seriesId,
	});
	const [choice, setChoice] = useState<"expanded" | "collapsed" | null>(() => {
		try {
			const stored = localStorage.getItem(storageKey(seriesId));
			return stored === "expanded" || stored === "collapsed" ? stored : null;
		} catch {
			return null;
		}
	});

	const panelId = useId();
	const toggle = (next: boolean) => {
		setChoice(next ? "expanded" : "collapsed");
		try {
			localStorage.setItem(
				storageKey(seriesId),
				next ? "expanded" : "collapsed"
			);
		} catch {
			// Storage may be blocked; the choice simply does not persist.
		}
	};

	if (checklist === undefined || agreement === undefined) {
		return (
			<Frame>
				<FrameHeader>
					<FrameTitle>Setup</FrameTitle>
				</FrameHeader>
				<FramePanel className="space-y-3" aria-label="Loading setup">
					{[0, 1, 2, 3].map((index) => (
						<Skeleton key={index} className="h-9 w-full" />
					))}
				</FramePanel>
			</Frame>
		);
	}

	const { quote, billing } = checklist;
	const active = agreement.active;
	const pending = agreement.pending;
	const quoteHref = quote ? `/quotes/${quote._id}` : null;
	const panelHref = `#${AGREEMENT_PANEL_ID}`;

	const scheduleAction = !canManage ? null : scheduleLockReason ? (
		<Tooltip>
			<TooltipTrigger
				render={
					<span
						tabIndex={0}
						className="inline-flex rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
				}
			>
				<Button
					size="sm"
					variant="outline"
					disabled
					className="pointer-events-none"
				>
					<Pencil className="size-4" /> Edit schedule
				</Button>
			</TooltipTrigger>
			<TooltipContent className="px-2 py-1 text-xs">
				{scheduleLockReason}
			</TooltipContent>
		</Tooltip>
	) : (
		<Button size="sm" variant="outline" onClick={onEditSchedule}>
			<Pencil className="size-4" /> Edit schedule
		</Button>
	);

	const quoteDetail = quote
		? [quote.quoteNumber, quote.total !== undefined ? `${formatCurrency(quote.total)} per visit` : null]
				.filter(Boolean)
				.join(", ") || "Quote added"
		: "Add a quote to a visit";

	const agreementRow: Row = active
		? {
				label: "Agreement",
				detail: active.approvedAt
					? `Approved ${formatCalendarDate(active.approvedAt)}`
					: "Approved",
				status: "complete",
				action: () => <LinkAction href={panelHref}>Open agreement</LinkAction>,
			}
		: pending
			? {
					label: "Agreement",
					...(PENDING_DETAIL[pending.deliveryState] ?? {
						detail: "Review the agreement",
						status: "todo",
					}),
					action: (primary) =>
						pending.deliveryState === "draft" ||
						pending.deliveryState === "ready_to_send" ? (
							<LinkAction href={`/quotes/${pending.quoteId}`} primary={primary}>
								Open quote
							</LinkAction>
						) : (
							<LinkAction href={panelHref} primary={primary}>
								Open agreement
							</LinkAction>
						),
				}
			: {
					label: "Agreement",
					detail: "Set up the agreement from the quote",
					status: "todo",
					action: quoteHref
						? (primary) => (
								<LinkAction href={quoteHref} primary={primary}>
									Open quote
								</LinkAction>
							)
						: undefined,
				};

	const rows: Row[] = [
		{
			label: "Schedule",
			detail: describeRecurrence(rule),
			status: "complete",
			action: scheduleAction ? () => scheduleAction : undefined,
		},
		{
			label: "Quote",
			detail: quoteDetail,
			status: quote ? "complete" : "todo",
			action: quoteHref
				? () => <LinkAction href={quoteHref}>Open quote</LinkAction>
				: nextVisitId
					? (primary) => (
							<LinkAction href={`/projects/${nextVisitId}`} primary={primary}>
								Add quote
							</LinkAction>
						)
					: undefined,
		},
		agreementRow,
		{
			label: "Billing",
			detail: billing
				? `${billing.mode === "monthly" ? "Monthly" : "Per completed visit"}. Invoices draft automatically`
				: active
					? "Invoices draft automatically"
					: "Starts when the agreement is approved",
			status: active ? "complete" : "todo",
		},
	];
	const nextStep = rows.findIndex((row) => row.status !== "complete");
	const complete = nextStep === -1;
	// Open by default while there is something left to do; the user's choice wins.
	const open = choice ? choice === "expanded" : !complete;

	const list = (
		<ol className="divide-y divide-border">
			{rows.map((row, index) => {
				const { Icon, className } = ROW_ICON[row.status];
				const action = row.action?.(index === nextStep);
				return (
					<li
						key={row.label}
						className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
					>
						<Icon
							aria-hidden
							className={cn("size-5 shrink-0", className)}
						/>
						<span className="sr-only">
							{row.status === "complete"
								? "Complete"
								: row.status === "warning"
									? "Needs attention"
									: "Not started"}
						</span>
						<div className="min-w-0 flex-1">
							<p className="text-sm font-medium text-foreground">{row.label}</p>
							<p className="text-sm text-muted-foreground">{row.detail}</p>
						</div>
						{action && <div className="shrink-0">{action}</div>}
					</li>
				);
			})}
		</ol>
	);

	const summary = (
		<Stepper
			value={complete ? rows.length + 1 : nextStep + 1}
			indicators={{ completed: <Check className="size-3.5" /> }}
			className="min-w-0 flex-1"
		>
			<StepperNav aria-label="Setup progress" className="gap-3">
				{rows.map((row, index) => {
					const StepIcon = STEP_ICON[row.label] ?? Circle;
					const warning = row.status === "warning";
					return (
						<StepperItem
							key={row.label}
							step={index + 1}
							completed={row.status === "complete"}
							className="gap-3"
						>
							<div className="flex min-w-0 items-center gap-2.5">
								<StepperIndicator
									className={cn(
										"size-7 border-2 data-[state=inactive]:border-border data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground data-[state=completed]:bg-success data-[state=completed]:text-white",
										warning &&
											"border-warning bg-warning/20 text-warning-foreground data-[state=active]:bg-warning/20 data-[state=active]:text-warning-foreground"
									)}
								>
									{warning ? (
										<CircleAlert className="size-3.5" aria-hidden />
									) : (
										<StepIcon className="size-3.5" aria-hidden />
									)}
								</StepperIndicator>
								<span className="flex min-w-0 flex-col items-start gap-0.5 max-md:hidden">
									<span className="text-[10px] font-semibold uppercase leading-none text-muted-foreground">
										Step {index + 1}
									</span>
									<span className="whitespace-nowrap text-sm font-semibold leading-tight text-foreground group-data-[state=inactive]/step:text-muted-foreground">
										{row.label}
									</span>
									{row.status === "complete" ? (
										<Badge size="xs" variant="success-light">
											Complete
										</Badge>
									) : warning ? (
										<Badge size="xs" variant="warning-light">
											Needs attention
										</Badge>
									) : index === nextStep ? (
										<Badge size="xs" variant="primary-light">
											Next
										</Badge>
									) : (
										<Badge size="xs" variant="secondary" className="text-muted-foreground">
											Not started
										</Badge>
									)}
								</span>
								<span className="sr-only md:hidden">
									{row.label},{" "}
									{row.status === "complete"
										? "complete"
										: warning
											? "needs attention"
											: index === nextStep
												? "next"
												: "not started"}
								</span>
							</div>
							{index < rows.length - 1 && (
								<StepperSeparator className="group-data-[state=completed]/step:bg-success" />
							)}
						</StepperItem>
					);
				})}
			</StepperNav>
		</Stepper>
	);

	// Mirrors the sidebar getting-started card: header toggles, content slides on
	// height, and a round chevron hangs off the bottom edge.
	return (
		<div className="pb-3">
			<Frame className="relative overflow-visible pb-1">
				<button
					type="button"
					onClick={() => toggle(!open)}
					aria-expanded={open}
					aria-controls={panelId}
					className="flex w-full cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
				>
					<FrameHeader className="flex grow flex-row flex-wrap items-center gap-x-6 gap-y-3">
						<span className="flex min-w-0 shrink-0 items-center gap-2 md:w-40">
							{complete && (
								<CircleCheck aria-hidden className="size-5 shrink-0 text-success-foreground" />
							)}
							<span className="flex min-w-0 flex-col">
								<FrameTitle>{complete ? "Setup complete" : "Setup"}</FrameTitle>
								<span className="text-xs font-normal text-muted-foreground">
									{complete
										? "Visits draft their own invoices"
										: `${rows.filter((row) => row.status === "complete").length} of ${rows.length} done`}
								</span>
							</span>
						</span>
						{summary}
					</FrameHeader>
				</button>
				<div
					id={panelId}
					inert={!open}
					className={cn(
						"overflow-hidden transition-[max-height] duration-500 ease-in-out motion-reduce:transition-none",
						open ? "max-h-[32rem]" : "max-h-0"
					)}
				>
					<FramePanel>{list}</FramePanel>
				</div>
				<div className="absolute -bottom-3.5 left-1/2 -translate-x-1/2">
					<Button
						variant="outline"
						size="icon-sm"
						aria-expanded={open}
						aria-controls={panelId}
						onClick={() => toggle(!open)}
						className="rounded-full bg-background shadow-sm hover:bg-background"
					>
						<ChevronDown
							aria-hidden
							className={cn(
								"transition-transform duration-300 motion-reduce:transition-none",
								open && "rotate-180"
							)}
						/>
						<span className="sr-only">
							{open ? "Collapse" : "Expand"} setup steps
						</span>
					</Button>
				</div>
			</Frame>
		</div>
	);
}
