import type { ComponentType } from "react";
import {
	Building2,
	Users,
	FolderKanban,
	FileText,
	FileSignature,
	Receipt,
	CreditCard,
	DollarSign,
} from "lucide-react-native";

export interface JourneyStep {
	id: number;
	title: string;
	description: string;
	icon: ComponentType<{ size?: number; color?: string }>;
	completionKey: string;
}

// Onboarding milestones, shared by the Home JourneyCard gauge + the /journey sheet.
export const journeySteps: JourneyStep[] = [
	{
		id: 1,
		title: "Create organization",
		description: "Set up your business workspace",
		icon: Building2,
		completionKey: "hasOrganization",
	},
	{
		id: 2,
		title: "First client",
		description: "Add a client to work with",
		icon: Users,
		completionKey: "hasClient",
	},
	{
		id: 3,
		title: "First project",
		description: "Create your first project",
		icon: FolderKanban,
		completionKey: "hasProject",
	},
	{
		id: 4,
		title: "First quote",
		description: "Send a quote for approval",
		icon: FileText,
		completionKey: "hasQuote",
	},
	{
		id: 5,
		title: "E-signature",
		description: "Get a document signed",
		icon: FileSignature,
		completionKey: "hasESignature",
	},
	{
		id: 6,
		title: "First invoice",
		description: "Bill a client for work",
		icon: Receipt,
		completionKey: "hasInvoice",
	},
	{
		id: 7,
		title: "Connect Stripe",
		description: "Enable online payments",
		icon: CreditCard,
		completionKey: "hasStripeConnect",
	},
	{
		id: 8,
		title: "First payment",
		description: "Receive money from a client",
		icon: DollarSign,
		completionKey: "hasPayment",
	},
];

// Count of completed milestones for a getJourneyProgress result (typed object
// from Convex has no index signature — accept unknown and narrow here).
export function countCompletedSteps(progress: unknown): number {
	if (!progress || typeof progress !== "object") return 0;
	const rec = progress as Record<string, unknown>;
	return journeySteps.filter((step) => Boolean(rec[step.completionKey])).length;
}
