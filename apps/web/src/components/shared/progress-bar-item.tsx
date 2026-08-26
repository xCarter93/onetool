import { CheckIcon } from "@heroicons/react/24/solid";
import type { Route } from "next";
import Link from "next/link";

export interface ProgressStep {
	id: string;
	name: string;
	description: string;
	href?: Route;
	status: "complete" | "current" | "upcoming";
}

interface ProgressBarItemProps {
	step: ProgressStep;
	stepIdx: number;
	totalSteps: number;
}

function classNames(...classes: (string | boolean | undefined | null)[]) {
	return classes.filter(Boolean).join(" ");
}

export default function ProgressBarItem({
	step,
	stepIdx,
	totalSteps,
}: ProgressBarItemProps) {
	return (
		<li className="relative overflow-hidden lg:flex-1">
			<div
				className={classNames(
					stepIdx === 0 ? "rounded-t-xl border-b-0" : "",
					stepIdx === totalSteps - 1 ? "rounded-b-xl border-t-0" : "",
					"overflow-hidden border border-border/40 dark:border-border/30 lg:border-0 bg-linear-to-b from-background/50 to-background/30"
				)}
			>
				{step.status === "complete" ? (
					<Link href={step.href || "#"} className="group">
						<span
							aria-hidden="true"
							className="absolute top-0 left-0 h-full w-1.5 bg-transparent group-hover:bg-primary/30 lg:top-auto lg:bottom-0 lg:h-1.5 lg:w-full transition-colors duration-200"
						/>
						<span
							className={classNames(
								stepIdx !== 0 ? "lg:pl-9" : "",
								"flex items-start px-6 py-5 text-sm font-medium"
							)}
						>
							<span className="shrink-0">
								<span className="flex size-10 items-center justify-center rounded-full bg-linear-to-br from-primary to-primary/80 shadow-md ring-2 ring-primary/20">
									<CheckIcon
										aria-hidden="true"
										className="size-5 text-primary-foreground"
									/>
								</span>
							</span>
							<span className="mt-0.5 ml-4 flex min-w-0 flex-col">
								<span className="text-sm font-semibold text-foreground">
									{step.name}
								</span>
								<span className="text-xs font-medium text-muted-foreground">
									{step.description}
								</span>
							</span>
						</span>
					</Link>
				) : step.status === "current" ? (
					<Link href={step.href || "#"} aria-current="step">
						<span
							aria-hidden="true"
							className="absolute top-0 left-0 h-full w-1.5 bg-linear-to-b from-primary to-primary/80 lg:top-auto lg:bottom-0 lg:h-1.5 lg:w-full shadow-sm"
						/>
						<span
							className={classNames(
								stepIdx !== 0 ? "lg:pl-9" : "",
								"flex items-start px-6 py-5 text-sm font-medium"
							)}
						>
							<span className="shrink-0">
								<span className="flex size-10 items-center justify-center rounded-full border-2 border-primary bg-primary/10 shadow-md ring-2 ring-primary/20">
									<span className="text-sm font-bold text-primary">
										{step.id}
									</span>
								</span>
							</span>
							<span className="mt-0.5 ml-4 flex min-w-0 flex-col">
								<span className="text-sm font-semibold text-primary">
									{step.name}
								</span>
								<span className="text-xs font-medium text-muted-foreground">
									{step.description}
								</span>
							</span>
						</span>
					</Link>
				) : (
					<Link href={step.href || "#"} className="group">
						<span
							aria-hidden="true"
							className="absolute top-0 left-0 h-full w-1.5 bg-transparent group-hover:bg-muted-foreground/20 lg:top-auto lg:bottom-0 lg:h-1.5 lg:w-full transition-colors duration-200"
						/>
						<span
							className={classNames(
								stepIdx !== 0 ? "lg:pl-9" : "",
								"flex items-start px-6 py-5 text-sm font-medium"
							)}
						>
							<span className="shrink-0">
								<span className="flex size-10 items-center justify-center rounded-full border-2 border-border/60 bg-muted/30 shadow-sm group-hover:border-border transition-colors duration-200">
									<span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors duration-200">
										{step.id}
									</span>
								</span>
							</span>
							<span className="mt-0.5 ml-4 flex min-w-0 flex-col">
								<span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors duration-200">
									{step.name}
								</span>
								<span className="text-xs font-medium text-muted-foreground/70">
									{step.description}
								</span>
							</span>
						</span>
					</Link>
				)}

				{stepIdx !== 0 ? (
					<>
						{/* Enhanced Separator */}
						<div
							aria-hidden="true"
							className="absolute inset-0 top-0 left-0 hidden w-3 lg:block"
						>
							<svg
								fill="none"
								viewBox="0 0 12 82"
								preserveAspectRatio="none"
								className="size-full text-border/60 dark:text-border/40"
							>
								<path
									d="M0.5 0V31L10.5 41L0.5 51V82"
									stroke="currentcolor"
									vectorEffect="non-scaling-stroke"
									strokeWidth="1.5"
								/>
							</svg>
						</div>
					</>
				) : null}
			</div>
		</li>
	);
}
