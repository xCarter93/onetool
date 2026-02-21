"use client";

import { Check, Clock, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
} from "@/components/ui/select";

export type StatusEvent = {
	type: string;
	timestamp?: number;
};

export type ProgressBarVariant = "success" | "destructive" | "in-progress";

export interface StatusStep {
	id: string;
	name: string;
	order: number;
}

export interface StatusOption {
	value: string;
	label: string;
}

export interface StatusProgressBarProps {
	/** Current status of the entity */
	status: string;
	/** Array of workflow steps in order */
	steps: StatusStep[];
	/** Optional events with timestamps */
	events?: StatusEvent[];
	/** Statuses that should be treated as failures/errors */
	failureStatuses?: string[];
	/** Statuses that should be treated as success */
	successStatuses?: string[];
	/** Optional override for color variant */
	variantOverride?: ProgressBarVariant;
	/** Show status change button */
	showStatusButton?: boolean;
	/** Status options for the select dropdown */
	statusOptions?: StatusOption[];
	/** Handler for status change */
	onStatusChange?: (status: string) => void;
	/** Label for the status button */
	statusButtonLabel?: string;
}

type StepStatus = "complete" | "current" | "upcoming";

interface StepClasses {
	bg: string;
	text: string;
	label: string;
	iconBg: string;
	iconRing: string;
	iconColor: string;
}

export function StatusProgressBar({
	status,
	steps: baseSteps,
	events = [],
	failureStatuses = [],
	successStatuses = [],
	variantOverride,
	showStatusButton = false,
	statusOptions = [],
	onStatusChange,
	statusButtonLabel = "Change Status",
}: StatusProgressBarProps) {
	// Check if we have a terminal failure state
	const isFailure = failureStatuses.includes(status);
	const isSuccess = successStatuses.includes(status);

	// If there's a failure status not in the normal flow, replace the last step
	const hasFailureStep = baseSteps.some((step) => step.id === status);
	const steps =
		isFailure && !hasFailureStep
			? [
					...baseSteps.slice(0, -1),
					{ id: status, name: status, order: baseSteps.length },
				]
			: baseSteps;

	// Determine the variant based on final status
	const variant: ProgressBarVariant =
		variantOverride ||
		(isSuccess ? "success" : isFailure ? "destructive" : "in-progress");

	// Helper to get event timestamp
	const getEventTimestamp = (eventType: string): number | undefined => {
		const event = events.find((e) => e.type === eventType);
		return event?.timestamp;
	};

	// Helper to determine step status
	const getStepStatus = (step: StatusStep): StepStatus => {
		const currentStatusStep = steps.find((s) => s.id === status);
		const currentOrder = currentStatusStep?.order || 1;

		if (step.id === status) {
			return "current";
		}

		if (step.order < currentOrder) {
			return "complete";
		}

		return "upcoming";
	};

	// Format timestamp
	const formatTimestamp = (timestamp?: number): string => {
		if (!timestamp) return "";
		const date = new Date(timestamp);
		return date.toLocaleString("en-US", {
			month: "short",
			day: "numeric",
			hour: "numeric",
			minute: "2-digit",
		});
	};

	// Get Tailwind classes for each step status
	const getStepClasses = (stepStatus: StepStatus): StepClasses => {
		if (stepStatus === "complete") {
			return {
				bg: "bg-emerald-500/10 dark:bg-emerald-500/20",
				text: "text-emerald-700 dark:text-emerald-300",
				label: "text-emerald-600/70 dark:text-emerald-400/70",
				iconBg: "bg-emerald-500/15 dark:bg-emerald-500/25",
				iconRing: "ring-emerald-500/30 dark:ring-emerald-400/40",
				iconColor: "text-emerald-600 dark:text-emerald-400",
			};
		}
		if (stepStatus === "current") {
			if (variant === "success") {
				return {
					bg: "bg-emerald-500/10 dark:bg-emerald-500/20",
					text: "text-emerald-700 dark:text-emerald-300",
					label: "text-emerald-600/70 dark:text-emerald-400/70",
					iconBg: "bg-emerald-500/15 dark:bg-emerald-500/25",
					iconRing: "ring-emerald-500/30 dark:ring-emerald-400/40",
					iconColor: "text-emerald-600 dark:text-emerald-400",
				};
			}
			if (variant === "destructive") {
				return {
					bg: "bg-rose-500/10 dark:bg-rose-500/20",
					text: "text-rose-700 dark:text-rose-300",
					label: "text-rose-600/70 dark:text-rose-400/70",
					iconBg: "bg-rose-500/15 dark:bg-rose-500/25",
					iconRing: "ring-rose-500/30 dark:ring-rose-400/40",
					iconColor: "text-rose-600 dark:text-rose-400",
				};
			}
			// In-progress
			return {
				bg: "bg-primary/10 dark:bg-primary/20",
				text: "text-primary dark:text-primary",
				label: "text-primary/60 dark:text-primary/70",
				iconBg: "bg-primary/15 dark:bg-primary/25",
				iconRing: "ring-primary/30 dark:ring-primary/40",
				iconColor: "text-primary dark:text-primary",
			};
		}
		// Upcoming
		return {
			bg: "bg-muted/50 dark:bg-muted/30",
			text: "text-muted-foreground",
			label: "text-muted-foreground/60",
			iconBg: "bg-muted dark:bg-muted/50",
			iconRing: "ring-border/50 dark:ring-border/40",
			iconColor: "text-muted-foreground/70",
		};
	};

	// Get the icon for a step
	const getStepIcon = (stepStatus: StepStatus, classes: StepClasses, step: StatusStep) => {
		if (stepStatus === "complete") {
			return <Check aria-hidden="true" className={cn("size-3 stroke-[2.5]", classes.iconColor)} />;
		}
		if (stepStatus === "current") {
			if (variant === "success") {
				return <Check aria-hidden="true" className={cn("size-3 stroke-[2.5]", classes.iconColor)} />;
			}
			if (variant === "destructive") {
				return <XCircle aria-hidden="true" className={cn("size-3", classes.iconColor)} />;
			}
			return <Clock aria-hidden="true" className={cn("size-3", classes.iconColor)} />;
		}
		return <span className={cn("text-[9px] font-semibold", classes.iconColor)}>{step.order}</span>;
	};

	return (
		<nav aria-label="Progress" className="w-full">
			<div
				className={cn(
					"flex items-stretch rounded-xl overflow-hidden",
					"backdrop-blur-sm bg-white/80 dark:bg-white/5",
					"ring-1 ring-border/30 dark:ring-border/50",
					"shadow-sm"
				)}
			>
				<ol role="list" className="flex items-stretch flex-1">
					{steps.map((step, stepIdx) => {
						const stepStatus = getStepStatus(step);
						const timestamp = getEventTimestamp(step.id);
						const classes = getStepClasses(stepStatus);
						const isLast = stepIdx === steps.length - 1;

						return (
							<li
								key={step.id}
								className={cn(
									"relative flex flex-1 transition-all duration-200",
									classes.bg,
									!isLast && "border-r border-border/30 dark:border-border/20"
								)}
							>
								<div className="relative flex w-full items-center justify-between px-2 py-1">
									<span className="flex items-center gap-1.5">
										{/* Icon badge */}
										<span
											className={cn(
												"flex size-5 shrink-0 items-center justify-center rounded-full ring-1",
												classes.iconBg,
												classes.iconRing
											)}
										>
											{getStepIcon(stepStatus, classes, step)}
										</span>

										{/* Step name */}
										<span
											className={cn(
												"text-xs font-medium whitespace-nowrap",
												classes.text
											)}
										>
											{step.name}
										</span>
									</span>

									{/* Timestamp */}
									{timestamp && (
										<span
											className={cn(
												"text-[10px] font-medium ml-2 whitespace-nowrap",
												classes.label
											)}
										>
											{formatTimestamp(timestamp)}
										</span>
									)}
								</div>
							</li>
						);
					})}
				</ol>
				{showStatusButton && statusOptions.length > 0 && onStatusChange && (
					<div
						className={cn(
							"relative flex items-center",
							"border-l border-border/30 dark:border-border/20",
							"bg-muted/50 dark:bg-muted/30"
						)}
					>
						<Select value={status} onValueChange={onStatusChange}>
							<SelectTrigger
								className={cn(
									"w-auto whitespace-nowrap border-0 transition-all duration-200",
									"text-xs font-semibold h-full px-3 shadow-none focus:ring-0",
									"bg-transparent text-muted-foreground hover:text-foreground"
								)}
							>
								{statusButtonLabel}
							</SelectTrigger>
							<SelectContent>
								{statusOptions.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										{option.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				)}
			</div>
		</nav>
	);
}
