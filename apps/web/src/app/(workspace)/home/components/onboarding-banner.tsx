"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { Check, ArrowRight, X, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

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
	id: number;
	title: string;
	description: string;
	completionKey: keyof JourneyProgress;
	href: string;
}

const journeySteps: JourneyStep[] = [
	{
		id: 1,
		title: "Create your Organization",
		description:
			"Complete your organization setup and customize OneTool for your business.",
		completionKey: "hasOrganization",
		href: "/organization/complete",
	},
	{
		id: 2,
		title: "Create Your First Client",
		description: "Add a client to manage their projects and services.",
		completionKey: "hasClient",
		href: "/clients",
	},
	{
		id: 3,
		title: "Create Your First Project",
		description: "Set up a project to organize tasks and track progress.",
		completionKey: "hasProject",
		href: "/projects",
	},
	{
		id: 4,
		title: "Create Your First Quote",
		description: "Create and send professional quotes with PDF generation.",
		completionKey: "hasQuote",
		href: "/quotes",
	},
	{
		id: 5,
		title: "Send Your First E-Signature Request",
		description: "Send documents for e-signature using BoldSign integration.",
		completionKey: "hasESignature",
		href: "/quotes",
	},
	{
		id: 6,
		title: "Create Your First Invoice",
		description: "Generate and send invoices to your clients.",
		completionKey: "hasInvoice",
		href: "/invoices",
	},
	{
		id: 7,
		title: "Set up your Stripe Connect Account",
		description: "Connect your Stripe account to accept online payments.",
		completionKey: "hasStripeConnect",
		href: "/organization",
	},
	{
		id: 8,
		title: "Collect Your First Payment",
		description: "Receive your first payment from a client.",
		completionKey: "hasPayment",
		href: "/invoices",
	},
];

export default function OnboardingBanner() {
	const [isDismissed, setIsDismissed] = useState(() => {
		if (typeof window === "undefined") return false;
		return localStorage.getItem("onboarding-banner-dismissed") === "true";
	});

	const handleDismiss = () => {
		localStorage.setItem("onboarding-banner-dismissed", "true");
		setIsDismissed(true);
	};
	const [isExpanded, setIsExpanded] = useState(false);

	const journeyProgress = useQuery(api.homeStats.getJourneyProgress);

	if (journeyProgress === undefined) {
		return null;
	}

	const completedCount = journeySteps.filter(
		(step) => journeyProgress?.[step.completionKey]
	).length;
	const totalSteps = journeySteps.length;
	const allComplete = completedCount === totalSteps;

	if (allComplete || isDismissed) {
		return null;
	}

	return (
		<Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
			<div className="bg-muted/50 border border-border rounded-lg px-4 py-3">
				<div className="flex items-center justify-between">
					<span className="text-sm text-muted-foreground">
						{completedCount} of {totalSteps} steps complete
					</span>
					<div className="flex items-center gap-2">
						<CollapsibleTrigger className="flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80">
							{isExpanded ? "Hide" : "Continue setup"}
							<ChevronDown
								className={cn(
									"h-3.5 w-3.5 transition-transform",
									isExpanded && "rotate-180"
								)}
							/>
						</CollapsibleTrigger>
						<button
							onClick={handleDismiss}
							className="text-muted-foreground hover:text-foreground"
							aria-label="Dismiss setup banner"
						>
							<X className="h-4 w-4" />
						</button>
					</div>
				</div>

				<CollapsibleContent>
					<Progress
						value={(completedCount / totalSteps) * 100}
						className="h-1.5 mt-3 mb-4"
					/>
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
						{journeySteps.map((step) => {
							const isComplete = journeyProgress?.[step.completionKey];
							if (isComplete) {
								return (
									<div
										key={step.id}
										className="flex items-center gap-2 text-sm text-muted-foreground"
									>
										<Check className="h-4 w-4 text-green-500 shrink-0" />
										<span className="line-through">{step.title}</span>
									</div>
								);
							}
							return (
								<a
									key={step.id}
									href={step.href}
									className="flex items-center gap-2 text-sm text-foreground hover:text-primary group"
								>
									<ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
									<span>{step.title}</span>
								</a>
							);
						})}
					</div>
				</CollapsibleContent>
			</div>
		</Collapsible>
	);
}
