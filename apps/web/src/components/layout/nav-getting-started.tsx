"use client";

import * as React from "react";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { Check, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
	SidebarGroup,
	SidebarGroupContent,
	useSidebar,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Frame,
	FrameHeader,
	FramePanel,
	FrameTitle,
} from "@/components/reui/frame";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useIsOrgSwitching } from "@/hooks/use-is-org-switching";

interface JourneyProgress {
	hasOrganization: boolean;
	hasClient: boolean;
	hasProject: boolean;
	hasQuote: boolean;
	hasESignature: boolean;
	hasInvoice: boolean;
	hasStripeConnect: boolean;
	hasPayment: boolean;
}

interface JourneyStep {
	id: string;
	label: string;
	completionKey: keyof JourneyProgress;
}

const journeySteps: JourneyStep[] = [
	{ id: "org", label: "Set up organization", completionKey: "hasOrganization" },
	{ id: "client", label: "Create a client", completionKey: "hasClient" },
	{ id: "project", label: "Create a project", completionKey: "hasProject" },
	{ id: "quote", label: "Create a quote", completionKey: "hasQuote" },
	{ id: "esign", label: "Send e-signature", completionKey: "hasESignature" },
	{ id: "invoice", label: "Create an invoice", completionKey: "hasInvoice" },
	{ id: "stripe", label: "Connect Stripe", completionKey: "hasStripeConnect" },
	{ id: "payment", label: "Collect payment", completionKey: "hasPayment" },
];

function getEncouragingMessage(percentage: number): string {
	if (percentage === 0) return "Let's get started!";
	if (percentage <= 25) return "Nice start!";
	if (percentage <= 50) return "Making progress!";
	if (percentage <= 75) return "Keep going!";
	if (percentage < 100) return "Almost there!";
	return "All done!";
}

/**
 * Mini circular progress indicator with the completion % in the center.
 * Frosted-blue: translucent primary track + arc, primary label. Rotated -90°
 * so the arc sweeps clockwise from 12 o'clock.
 */
function ProgressRing({
	percentage,
	size = 36,
	strokeWidth = 3,
}: {
	percentage: number;
	size?: number;
	strokeWidth?: number;
}) {
	const radius = (size - strokeWidth) / 2;
	const circumference = 2 * Math.PI * radius;
	const offset = circumference - (percentage / 100) * circumference;

	return (
		<div
			className="relative shrink-0"
			style={{ width: size, height: size }}
			role="img"
			aria-label={`${percentage}% complete`}
		>
			<svg width={size} height={size} className="-rotate-90" aria-hidden="true">
				<circle
					cx={size / 2}
					cy={size / 2}
					r={radius}
					fill="none"
					strokeWidth={strokeWidth}
					className="stroke-primary/15"
				/>
				<circle
					cx={size / 2}
					cy={size / 2}
					r={radius}
					fill="none"
					strokeWidth={strokeWidth}
					strokeDasharray={circumference}
					strokeDashoffset={offset}
					strokeLinecap="round"
					className="stroke-primary/70 transition-[stroke-dashoffset] duration-500 ease-out"
				/>
			</svg>
			<span
				aria-hidden="true"
				className="text-primary absolute inset-0 flex items-center justify-center text-[0.625rem] font-semibold leading-none tabular-nums"
			>
				{percentage}%
			</span>
		</div>
	);
}

export function NavGettingStarted() {
	const isOrgSwitching = useIsOrgSwitching();
	const journeyProgress = useQuery(api.homeStats.getJourneyProgress);
	const { state } = useSidebar();

	// Don't render in collapsed sidebar mode
	if (state === "collapsed") {
		return null;
	}

	// Loading state
	if (isOrgSwitching || !journeyProgress) {
		return <NavGettingStartedSkeleton />;
	}

	// Calculate completion
	const completedCount = journeySteps.filter(
		(step) => journeyProgress[step.completionKey]
	).length;
	const totalSteps = journeySteps.length;
	const percentage = Math.round((completedCount / totalSteps) * 100);

	// Hide when 100% complete
	if (percentage === 100) {
		return null;
	}

	return (
		<SidebarGroup className="mt-auto pt-0">
			<SidebarGroupContent>
				<Frame stacked dense spacing="sm" className="w-full">
					<Collapsible defaultOpen>
						<CollapsibleTrigger className="flex w-full cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
							<FrameHeader className="flex grow flex-row items-center justify-between gap-2">
								<div className="flex min-w-0 items-center gap-2.5">
									{/* Frosted-blue progress ring with % in the center */}
									<ProgressRing percentage={percentage} />
									<div className="flex min-w-0 flex-col items-start gap-0.5">
										<FrameTitle className="text-sm font-medium">
											Getting started
										</FrameTitle>
										<span className="text-muted-foreground truncate text-xs font-normal">
											{getEncouragingMessage(percentage)}
										</span>
									</div>
								</div>
								<ChevronRight
									aria-hidden="true"
									className="text-muted-foreground size-4 shrink-0 transition-transform in-data-open:rotate-90"
								/>
							</FrameHeader>
						</CollapsibleTrigger>
						<CollapsibleContent>
							<FramePanel>
								{/* Checklist */}
								<div className="space-y-0.5">
									{journeySteps.map((step) => {
										const isCompleted = journeyProgress[step.completionKey];
										return (
											<div
												key={step.id}
												className={cn(
													"flex items-center gap-2 rounded-md px-1 py-1 text-sm",
													isCompleted
														? "text-muted-foreground"
														: "text-foreground"
												)}
											>
												{/* Completed steps use the frosted-blue treatment */}
												<div
													className={cn(
														"flex size-4 shrink-0 items-center justify-center rounded-full border",
														isCompleted
															? "border-primary/30 bg-primary/10 text-primary shadow-sm backdrop-blur-sm"
															: "border-border"
													)}
												>
													{isCompleted && <Check className="size-2.5" />}
												</div>
												<span
													className={cn(
														"truncate",
														isCompleted && "line-through"
													)}
												>
													{step.label}
												</span>
											</div>
										);
									})}
								</div>
							</FramePanel>
						</CollapsibleContent>
					</Collapsible>
				</Frame>
			</SidebarGroupContent>
		</SidebarGroup>
	);
}

function NavGettingStartedSkeleton() {
	const { state } = useSidebar();

	if (state === "collapsed") {
		return null;
	}

	return (
		<SidebarGroup className="mt-auto pt-0">
			<SidebarGroupContent>
				<Frame stacked dense spacing="sm" className="w-full">
					<FrameHeader className="flex flex-row items-center justify-between gap-2">
						<div className="flex min-w-0 items-center gap-2.5">
							<Skeleton className="size-9 shrink-0 rounded-full" />
							<div className="flex flex-col gap-1">
								<Skeleton className="h-4 w-24" />
								<Skeleton className="h-3 w-20" />
							</div>
						</div>
						<Skeleton className="size-4 shrink-0 rounded-full" />
					</FrameHeader>
				</Frame>
			</SidebarGroupContent>
		</SidebarGroup>
	);
}
