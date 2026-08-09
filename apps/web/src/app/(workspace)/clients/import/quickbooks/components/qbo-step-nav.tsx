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

export type QboImportStep = "fetch" | "review" | "done";

const STEP_ORDER: QboImportStep[] = ["fetch", "review", "done"];

const STEP_LABELS: Record<QboImportStep, string> = {
	fetch: "Fetch",
	review: "Review",
	done: "Done",
};

/**
 * Progress timeline for the QuickBooks import. Unlike the CSV wizard the steps
 * are not navigable: the run's status decides where you are, so each step is
 * rendered as static text rather than a tab you can click.
 */
export function QboStepNav({ currentStep }: { currentStep: QboImportStep }) {
	const currentIndex = STEP_ORDER.indexOf(currentStep);

	return (
		<Stepper
			value={currentIndex + 1}
			indicators={{ completed: <Check className="size-3.5" /> }}
		>
			<StepperNav className="gap-3.5">
				{STEP_ORDER.map((step, index) => {
					const isActive = index === currentIndex;
					return (
						<StepperItem key={step} step={index + 1} className="gap-3.5">
							<StepperTrigger asChild className="inline-flex items-center gap-2.5">
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
