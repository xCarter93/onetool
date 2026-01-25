"use client";

import * as React from "react";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { Check, Minus, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
	SidebarGroup,
	SidebarGroupContent,
	useSidebar,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";

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

export function NavGettingStarted() {
	const journeyProgress = useQuery(api.homeStats.getJourneyProgress);
	const [isOpen, setIsOpen] = React.useState(false);
	const { state } = useSidebar();

	// Don't render in collapsed sidebar mode
	if (state === "collapsed") {
		return null;
	}

	// Loading state
	if (!journeyProgress) {
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
				<div className="rounded-lg border border-border/50 bg-sidebar-accent/30 overflow-hidden">
					{/* Header */}
					<button
						onClick={() => setIsOpen(!isOpen)}
						className="flex w-full items-center justify-between px-3 py-2.5 hover:bg-sidebar-accent/50 transition-colors"
					>
						<div className="flex flex-col items-start gap-0.5">
							<span className="text-sm font-medium text-sidebar-foreground">
								Getting started
							</span>
							<span className="text-xs text-muted-foreground">
								{percentage}% completed · {getEncouragingMessage(percentage)}
							</span>
						</div>
						<motion.div
							animate={{ rotate: isOpen ? 0 : -90 }}
							transition={{ duration: 0.2, ease: "easeInOut" }}
							className="flex items-center"
						>
							{isOpen ? (
								<Minus className="size-4 text-muted-foreground" />
							) : (
								<ChevronDown className="size-4 text-muted-foreground" />
							)}
						</motion.div>
					</button>

					{/* Progress bar */}
					<div className="px-3 pb-2">
						<div className="h-1 w-full rounded-full bg-border/50 overflow-hidden">
							<div
								className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
								style={{ width: `${percentage}%` }}
							/>
						</div>
					</div>

					{/* Checklist with animation */}
					<AnimatePresence initial={false}>
						{isOpen && (
							<motion.div
								initial={{ height: 0, opacity: 0 }}
								animate={{ height: "auto", opacity: 1 }}
								exit={{ height: 0, opacity: 0 }}
								transition={{
									height: { duration: 0.25, ease: [0.4, 0, 0.2, 1] },
									opacity: { duration: 0.2, ease: "easeInOut" },
								}}
								className="overflow-hidden"
							>
								<div className="px-2 pb-2 space-y-0.5">
									{journeySteps.map((step, index) => {
										const isCompleted = journeyProgress[step.completionKey];
										return (
											<motion.div
												key={step.id}
												initial={{ opacity: 0, x: -10 }}
												animate={{ opacity: 1, x: 0 }}
												transition={{
													duration: 0.2,
													delay: index * 0.03,
													ease: "easeOut",
												}}
												className={cn(
													"flex items-center gap-2 px-2 py-1.5 rounded-md text-sm",
													isCompleted
														? "text-muted-foreground"
														: "text-sidebar-foreground"
												)}
											>
												<div
													className={cn(
														"flex size-4 items-center justify-center rounded-full border shrink-0",
														isCompleted
															? "bg-primary border-primary"
															: "border-border"
													)}
												>
													{isCompleted && (
														<Check className="size-2.5 text-primary-foreground" />
													)}
												</div>
												<span
													className={cn(
														"truncate",
														isCompleted && "line-through"
													)}
												>
													{step.label}
												</span>
											</motion.div>
										);
									})}
								</div>
							</motion.div>
						)}
					</AnimatePresence>
				</div>
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
				<div className="rounded-lg border border-border/50 bg-sidebar-accent/30 p-3">
					<Skeleton className="h-4 w-24 mb-1" />
					<Skeleton className="h-3 w-32 mb-2" />
					<Skeleton className="h-1 w-full rounded-full" />
				</div>
			</SidebarGroupContent>
		</SidebarGroup>
	);
}
