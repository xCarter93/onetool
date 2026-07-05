"use client";

import { Check } from "lucide-react";
import {
	Stepper,
	StepperIndicator,
	StepperItem,
	StepperNav,
	StepperSeparator,
	StepperTitle,
	StepperTrigger,
} from "@/components/reui/stepper";

export type ImportStep = "upload" | "map" | "review";

const STEP_ORDER: ImportStep[] = ["upload", "map", "review"];

const STEP_LABELS: Record<ImportStep, string> = {
	upload: "Upload file",
	map: "Map columns",
	review: "Review & import",
};

interface ImportStepNavProps {
	currentStep: ImportStep;
	onStepClick: (step: ImportStep) => void;
	/** Locks step navigation (e.g. while an import is running). */
	disabled?: boolean;
}

/**
 * Horizontal step timeline shown inside the import Frame. Completed steps are
 * clickable to jump back; upcoming steps are disabled so users can't skip the gate.
 */
export function ImportStepNav({
	currentStep,
	onStepClick,
	disabled = false,
}: ImportStepNavProps) {
	const currentIndex = STEP_ORDER.indexOf(currentStep);

	return (
		<Stepper
			value={currentIndex + 1}
			onValueChange={(value) => {
				if (disabled) return;
				const step = STEP_ORDER[value - 1];
				// Only allow navigating back to an already-completed step.
				if (step && value - 1 < currentIndex) {
					onStepClick(step);
				}
			}}
			indicators={{ completed: <Check className="size-3.5" /> }}
		>
			<StepperNav className="gap-3.5">
				{STEP_ORDER.map((step, index) => {
					const isActive = index === currentIndex;
					return (
						<StepperItem
							key={step}
							step={index + 1}
							disabled={disabled || index > currentIndex}
							className="gap-3.5"
						>
							<StepperTrigger
								className="gap-2.5"
								aria-label={`${STEP_LABELS[step]}, step ${index + 1} of ${STEP_ORDER.length}`}
							>
								<span className="relative inline-flex items-center justify-center">
									{isActive && (
										<span
											aria-hidden
											className="pointer-events-none absolute -inset-[3px] rounded-full border-2 border-dashed border-primary/70 animate-spin [animation-duration:3s] motion-reduce:animate-none"
										/>
									)}
									<StepperIndicator className="size-7 text-sm font-semibold">
										{index + 1}
									</StepperIndicator>
								</span>
								<StepperTitle className="max-sm:hidden whitespace-nowrap text-sm font-medium data-[state=active]:text-foreground data-[state=inactive]:text-muted-foreground">
									{STEP_LABELS[step]}
								</StepperTitle>
							</StepperTrigger>
							{index < STEP_ORDER.length - 1 && (
								<StepperSeparator className="data-[state=completed]:bg-primary" />
							)}
						</StepperItem>
					);
				})}
			</StepperNav>
		</Stepper>
	);
}
