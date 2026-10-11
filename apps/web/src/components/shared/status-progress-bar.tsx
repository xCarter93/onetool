"use client";

import {
	Check,
	CircleDashed,
	CircleDotDashed,
	CircleX,
	TriangleAlert,
	type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type StatusEvent = {
	type: string;
	timestamp?: number;
};

export type ProgressBarVariant =
	| "success"
	| "destructive"
	| "warning"
	| "in-progress";

export interface StatusStep {
	id: string;
	name: string;
	order: number;
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
}

type StepTone = "complete" | "current" | "destructive" | "warning" | "upcoming";

// Solid fills mark the live step; warning stays tinted because small text fails AA on solid amber.
const TONES: Record<StepTone, { fill: string; text: string; Icon: LucideIcon }> = {
	complete: {
		fill: "bg-success/20",
		text: "text-success-foreground dark:text-success",
		Icon: Check,
	},
	current: {
		fill: "bg-primary",
		text: "text-primary-foreground",
		Icon: CircleDotDashed,
	},
	destructive: {
		fill: "bg-danger",
		text: "text-primary-foreground",
		Icon: CircleX,
	},
	warning: {
		fill: "bg-warning/20",
		text: "text-warning-foreground",
		Icon: TriangleAlert,
	},
	upcoming: {
		fill: "bg-input/40",
		text: "text-foreground",
		Icon: CircleDashed,
	},
};

// From ReUI c-stepper-33: --notch cuts the start edge, --arrow points out the end.
const CHEVRON_CLIP =
	"[clip-path:polygon(calc(var(--notch)*0.26)_0,calc(100%_-_var(--arrow)*1.29)_0,calc(100%_-_var(--arrow)*1.04)_calc(var(--arrow)*0.07),calc(100%_-_var(--arrow)*0.86)_calc(var(--arrow)*0.25),calc(100%_-_var(--arrow)*0.14)_calc(50%_-_var(--arrow)*0.25),calc(100%_-_var(--arrow)*0.08)_50%,calc(100%_-_var(--arrow)*0.14)_calc(50%_+_var(--arrow)*0.25),calc(100%_-_var(--arrow)*0.86)_calc(100%_-_var(--arrow)*0.25),calc(100%_-_var(--arrow)*1.04)_calc(100%_-_var(--arrow)*0.07),calc(100%_-_var(--arrow)*1.29)_100%,calc(var(--notch)*0.26)_100%,calc(var(--notch)*0.13)_calc(100%_-_var(--notch)*0.07),calc(var(--notch)*0.13)_calc(100%_-_var(--notch)*0.22),calc(var(--notch)*0.86)_calc(50%_+_var(--notch)*0.25),calc(var(--notch)*0.92)_50%,calc(var(--notch)*0.86)_calc(50%_-_var(--notch)*0.25),calc(var(--notch)*0.13)_calc(var(--notch)*0.22),calc(var(--notch)*0.13)_calc(var(--notch)*0.07))]";

function formatTimestamp(timestamp: number): string {
	return new Date(timestamp).toLocaleString("en-US", {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

export function StatusProgressBar({
	status,
	steps: baseSteps,
	events = [],
	failureStatuses = [],
	successStatuses = [],
	variantOverride,
}: StatusProgressBarProps) {
	const isFailure = failureStatuses.includes(status);
	const isSuccess = successStatuses.includes(status);

	// A failure status outside the normal flow takes over the last step.
	const hasFailureStep = baseSteps.some((step) => step.id === status);
	const steps =
		isFailure && !hasFailureStep
			? [
					...baseSteps.slice(0, -1),
					{ id: status, name: status, order: baseSteps.length },
				]
			: baseSteps;

	const variant: ProgressBarVariant =
		variantOverride ||
		(isSuccess ? "success" : isFailure ? "destructive" : "in-progress");

	const currentOrder = steps.find((s) => s.id === status)?.order || 1;

	const getTone = (step: StatusStep): StepTone => {
		if (
			step.order < currentOrder ||
			(step.id === status && variant === "success")
		) {
			return "complete";
		}
		if (step.id !== status) return "upcoming";
		if (variant === "destructive") return "destructive";
		if (variant === "warning") return "warning";
		return "current";
	};

	return (
		<nav aria-label="Progress" className="@container w-full">
			<ol
				role="list"
				className="flex w-full gap-1 overflow-x-auto rounded-sm border border-input/50 bg-background p-1"
			>
				{steps.map((step) => {
					const tone = getTone(step);
					const { fill, text, Icon } = TONES[tone];
					const isCurrent = step.id === status;
					// Upcoming steps skip stale timestamps left by a status revert.
					const timestamp =
						tone !== "upcoming"
							? events.find((e) => e.type === step.id)?.timestamp
							: undefined;

					return (
						<li
							key={step.id}
							aria-current={isCurrent ? "step" : undefined}
							className={cn(
								"group relative isolate flex h-7 flex-1 items-center gap-1.5 whitespace-nowrap ps-1.5 pe-4 text-sm font-medium",
								"[--arrow:--spacing(2)] [--notch:--spacing(2)] first:ps-2 first:[--notch:0px] last:pe-2.5 last:[--arrow:0px]",
								text
							)}
						>
							{/* Bleeds back over the gap so neighboring chevrons nest. */}
							<span
								aria-hidden="true"
								className={cn(
									"absolute inset-y-0 -start-(--notch) end-0 -z-10 group-first:rounded-l-xs group-last:rounded-r-xs",
									CHEVRON_CLIP,
									fill
								)}
							/>
							<Icon aria-hidden="true" className="size-3.5 shrink-0" />
							{step.name}
							{tone === "complete" && <span className="sr-only">, completed</span>}
							{timestamp && (
								<span className="ms-auto text-2xs opacity-80 @max-xl:hidden">
									{formatTimestamp(timestamp)}
								</span>
							)}
						</li>
					);
				})}
			</ol>
		</nav>
	);
}
