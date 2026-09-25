import ProgressBarItem, { ProgressStep } from "./progress-bar-item";

export type { ProgressStep };

interface ProgressBarProps {
	steps: ProgressStep[];
	className?: string;
}

function classNames(...classes: (string | boolean | undefined | null)[]) {
	return classes.filter(Boolean).join(" ");
}

export default function ProgressBar({ steps, className }: ProgressBarProps) {
	return (
		<div
			className={classNames(
				"lg:border-t lg:border-b lg:border-border/60 dark:lg:border-border/40",
				className
			)}
		>
			<nav
				aria-label="Progress"
				className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"
			>
				<ol
					role="list"
					className="overflow-hidden rounded-lg border border-border bg-card lg:flex"
				>
					{steps.map((step, stepIdx) => (
						<ProgressBarItem
							key={step.id}
							step={step}
							stepIdx={stepIdx}
							totalSteps={steps.length}
						/>
					))}
				</ol>
			</nav>
		</div>
	);
}
