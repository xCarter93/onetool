"use client";

import {
	StyledStepBreadcrumbs,
	type StepBreadcrumbItem,
} from "@/components/ui/styled/styled-breadcrumbs";

export type ImportStep = "upload" | "map" | "review";

const STEP_ORDER: ImportStep[] = ["upload", "map", "review"];

const STEP_LABELS: Record<ImportStep, string> = {
	upload: "Upload file",
	map: "Map columns",
	review: "Review & Import",
};

interface ImportStepNavProps {
	currentStep: ImportStep;
	onStepClick: (step: ImportStep) => void;
}

export function ImportStepNav({ currentStep, onStepClick }: ImportStepNavProps) {
	const currentIndex = STEP_ORDER.indexOf(currentStep);

	const steps: StepBreadcrumbItem[] = STEP_ORDER.map((step, index) => {
		let status: StepBreadcrumbItem["status"];
		if (index < currentIndex) {
			status = "complete";
		} else if (index === currentIndex) {
			status = "current";
		} else {
			status = "upcoming";
		}

		return {
			id: String(index + 1),
			label: STEP_LABELS[step],
			href: status === "complete" ? `?step=${step}` : undefined,
			status,
		};
	});

	return (
		<div onClick={(e) => {
			const target = e.target as HTMLElement;
			const link = target.closest("a");
			if (link) {
				e.preventDefault();
				const url = new URL(link.href);
				const step = url.searchParams.get("step") as ImportStep;
				if (step && STEP_ORDER.includes(step)) {
					onStepClick(step);
				}
			}
		}}>
			<StyledStepBreadcrumbs steps={steps} />
		</div>
	);
}
