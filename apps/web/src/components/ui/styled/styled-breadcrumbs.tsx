"use client";

import * as React from "react";
import {
	Breadcrumb,
	BreadcrumbList,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";

export interface StepBreadcrumbItem {
	id: string;
	label: string;
	href?: string;
	status: "complete" | "current" | "upcoming";
}

interface StyledStepBreadcrumbsProps {
	steps: StepBreadcrumbItem[];
	className?: string;
}

export function StyledStepBreadcrumbs({
	steps,
	className,
}: StyledStepBreadcrumbsProps) {
	return (
		<Breadcrumb className={cn("w-full", className)}>
			<BreadcrumbList className="flex-nowrap gap-1 sm:gap-2">
				{steps.map((step, index) => (
					<React.Fragment key={step.id}>
						<BreadcrumbItem>
							{step.status === "complete" && step.href ? (
								<BreadcrumbLink
									href={step.href}
									className="text-muted-foreground hover:text-foreground transition-colors text-sm"
								>
									<span className="inline-flex items-center gap-1.5">
										<span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-semibold">
											{step.id}
										</span>
										<span className="hidden sm:inline">{step.label}</span>
									</span>
								</BreadcrumbLink>
							) : step.status === "current" ? (
								<BreadcrumbPage className="text-foreground font-semibold text-sm">
									<span className="inline-flex items-center gap-1.5">
										<span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
											{step.id}
										</span>
										<span className="hidden sm:inline">{step.label}</span>
									</span>
								</BreadcrumbPage>
							) : (
								<BreadcrumbPage className="text-muted-foreground/50 font-normal text-sm">
									<span className="inline-flex items-center gap-1.5">
										<span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-muted text-muted-foreground/50 text-xs font-semibold">
											{step.id}
										</span>
										<span className="hidden sm:inline">{step.label}</span>
									</span>
								</BreadcrumbPage>
							)}
						</BreadcrumbItem>
						{index < steps.length - 1 && <BreadcrumbSeparator />}
					</React.Fragment>
				))}
			</BreadcrumbList>
		</Breadcrumb>
	);
}
