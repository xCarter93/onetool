import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
	CheckCircleIcon,
	UserIcon,
	BriefcaseIcon,
	DocumentTextIcon,
	CurrencyDollarIcon,
	ClipboardDocumentListIcon,
	BuildingOfficeIcon,
	UserGroupIcon,
	EnvelopeIcon,
} from "@heroicons/react/24/solid";
import { Doc } from "@onetool/backend/convex/_generated/dataModel";

// Real activity data from Convex
export interface ActivityWithUser extends Doc<"activities"> {
	user: {
		name: string;
		email: string;
		image: string;
	};
}

interface Person {
	name: string;
	href: string;
}

interface CommentActivity {
	id: number;
	type: "comment";
	person: Person;
	imageUrl: string;
	comment: string;
	date: string;
}

interface AssignmentActivity {
	id: number;
	type: "assignment";
	person: Person;
	assigned: Person;
	date: string;
}

interface Tag {
	name: string;
	href: string;
	color: string;
}

interface TagsActivity {
	id: number;
	type: "tags";
	person: Person;
	tags: Tag[];
	date: string;
}

interface ClientCreatedActivity {
	id: number;
	type: "client_created";
	person: Person;
	imageUrl: string;
	clientName: string;
	date: string;
}

interface ProjectCreatedActivity {
	id: number;
	type: "project_created";
	person: Person;
	projectName: string;
	clientName: string;
	date: string;
}

interface ProjectUpdatedActivity {
	id: number;
	type: "project_updated";
	person: Person;
	projectName: string;
	status: string;
	date: string;
}

interface ClientUpdatedActivity {
	id: number;
	type: "client_updated";
	person: Person;
	clientName: string;
	action: string;
	date: string;
}

interface QuoteCreatedActivity {
	id: number;
	type: "quote_created";
	person: Person;
	quoteAmount: string;
	clientName: string;
	date: string;
}

interface QuoteApprovedActivity {
	id: number;
	type: "quote_approved";
	person: Person;
	quoteAmount: string;
	clientName: string;
	date: string;
}

interface QuoteSentActivity {
	id: number;
	type: "quote_sent";
	person: Person;
	quoteAmount: string;
	clientName: string;
	date: string;
}

interface InvoiceSentActivity {
	id: number;
	type: "invoice_sent";
	person: Person;
	invoiceAmount: string;
	clientName: string;
	date: string;
}

interface InvoicePaidActivity {
	id: number;
	type: "invoice_paid";
	person: Person;
	invoiceAmount: string;
	clientName: string;
	date: string;
}

type LegacyActivityItemType =
	| CommentActivity
	| AssignmentActivity
	| TagsActivity
	| ClientCreatedActivity
	| ProjectCreatedActivity
	| ProjectUpdatedActivity
	| ClientUpdatedActivity
	| QuoteCreatedActivity
	| QuoteApprovedActivity
	| QuoteSentActivity
	| InvoiceSentActivity
	| InvoicePaidActivity;

type ActivityItemType = LegacyActivityItemType | ActivityWithUser;

interface ActivityItemProps {
	activity: ActivityItemType;
	isLast: boolean;
}

function classNames(
	...classes: (string | boolean | undefined | null)[]
): string {
	return classes.filter(Boolean).join(" ");
}

function getInitials(name: string): string {
	return name
		.split(" ")
		.map((part) => part.charAt(0))
		.join("")
		.toUpperCase()
		.slice(0, 2);
}

// Helper function to check if activity is from Convex
function isConvexActivity(
	activity: ActivityItemType
): activity is ActivityWithUser {
	return "activityType" in activity && "user" in activity;
}

// Helper function to get formatted date
function formatDate(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;

	const minutes = Math.floor(diff / (1000 * 60));
	const hours = Math.floor(diff / (1000 * 60 * 60));
	const days = Math.floor(diff / (1000 * 60 * 60 * 24));

	if (minutes < 60) {
		return `${minutes}m ago`;
	} else if (hours < 24) {
		return `${hours}h ago`;
	} else {
		return `${days}d ago`;
	}
}

// Helper function to get activity amount from metadata
function getActivityAmount(activity: ActivityWithUser): string | null {
	if (activity.metadata && typeof activity.metadata === "object") {
		const metadata = activity.metadata as Record<string, unknown>;
		if (typeof metadata.total === "number") {
			return `$${metadata.total.toLocaleString()}`;
		}
	}
	return null;
}

// Get icon and color scheme for each activity type
function getActivityStyle(activityType: string): {
	icon: typeof UserIcon | null;
	iconColor: string;
	bgColor: string;
	ringColor: string;
} {
	// Success states — green
	if (
		activityType === "invoice_paid" ||
		activityType === "project_completed" ||
		activityType === "quote_approved" ||
		activityType === "payment_paid" ||
		activityType === "task_completed"
	) {
		const icon =
			activityType === "invoice_paid" || activityType === "payment_paid"
				? CurrencyDollarIcon
				: activityType === "project_completed"
					? BriefcaseIcon
					: activityType === "task_completed"
						? ClipboardDocumentListIcon
						: DocumentTextIcon;
		return {
			icon,
			iconColor: "text-green-600 dark:text-green-400",
			bgColor: "bg-green-100 dark:bg-green-900/30",
			ringColor: "ring-green-200 dark:ring-green-800/50",
		};
	}

	// Financial — amber/orange
	if (
		activityType === "invoice_created" ||
		activityType === "invoice_sent" ||
		activityType === "payment_created" ||
		activityType === "payment_updated" ||
		activityType === "payments_configured" ||
		activityType === "payment_cancelled"
	) {
		return {
			icon: CurrencyDollarIcon,
			iconColor: "text-amber-600 dark:text-amber-400",
			bgColor: "bg-amber-100 dark:bg-amber-900/30",
			ringColor: "ring-amber-200 dark:ring-amber-800/50",
		};
	}

	// Quotes — primary
	if (
		activityType === "quote_created" ||
		activityType === "quote_sent" ||
		activityType === "quote_declined" ||
		activityType === "quote_pdf_generated"
	) {
		return {
			icon: DocumentTextIcon,
			iconColor: "text-primary",
			bgColor: "bg-primary/10",
			ringColor: "ring-primary/20",
		};
	}

	// Projects — blue
	if (
		activityType === "project_created" ||
		activityType === "project_updated"
	) {
		return {
			icon: BriefcaseIcon,
			iconColor: "text-blue-600 dark:text-blue-400",
			bgColor: "bg-blue-100 dark:bg-blue-900/30",
			ringColor: "ring-blue-200 dark:ring-blue-800/50",
		};
	}

	// Clients — primary
	if (activityType === "client_created" || activityType === "client_updated") {
		return {
			icon: UserIcon,
			iconColor: "text-primary",
			bgColor: "bg-primary/10",
			ringColor: "ring-primary/20",
		};
	}

	// Tasks — primary
	if (activityType === "task_created") {
		return {
			icon: ClipboardDocumentListIcon,
			iconColor: "text-primary",
			bgColor: "bg-primary/10",
			ringColor: "ring-primary/20",
		};
	}

	// Email — primary
	if (
		activityType === "email_sent" ||
		activityType === "email_delivered" ||
		activityType === "email_opened" ||
		activityType === "email_received"
	) {
		return {
			icon: EnvelopeIcon,
			iconColor: "text-primary",
			bgColor: "bg-primary/10",
			ringColor: "ring-primary/20",
		};
	}

	// Team — primary
	if (activityType === "user_invited" || activityType === "user_removed") {
		return {
			icon: UserGroupIcon,
			iconColor: "text-primary",
			bgColor: "bg-primary/10",
			ringColor: "ring-primary/20",
		};
	}

	if (activityType === "organization_updated") {
		return {
			icon: BuildingOfficeIcon,
			iconColor: "text-primary",
			bgColor: "bg-primary/10",
			ringColor: "ring-primary/20",
		};
	}

	// Default fallback
	return {
		icon: null,
		iconColor: "text-muted-foreground",
		bgColor: "bg-muted",
		ringColor: "ring-border",
	};
}

// Format the activity type into a readable label
function getActivityLabel(activityType: string): string | null {
	const labels: Record<string, string> = {
		client_created: "Client",
		client_updated: "Client",
		project_created: "Project",
		project_updated: "Project",
		project_completed: "Completed",
		quote_created: "Quote",
		quote_sent: "Quote Sent",
		quote_approved: "Approved",
		quote_declined: "Declined",
		quote_pdf_generated: "PDF",
		invoice_created: "Invoice",
		invoice_sent: "Invoice Sent",
		invoice_paid: "Paid",
		payment_created: "Payment",
		payment_updated: "Payment",
		payment_paid: "Paid",
		payment_cancelled: "Cancelled",
		payments_configured: "Payments",
		task_created: "Task",
		task_completed: "Completed",
		email_sent: "Email",
		email_delivered: "Delivered",
		email_opened: "Opened",
		email_received: "Received",
		user_invited: "Team",
		user_removed: "Team",
		organization_updated: "Org",
	};
	return labels[activityType] || null;
}

function describeEvent(activity: ActivityItemType): string {
	if (isConvexActivity(activity)) {
		// For Convex activities, use the description directly
		return activity.description;
	}

	// Legacy activity handling
	switch (activity.type) {
		case "client_created":
			return "created the client.";
		case "project_created":
			return "created the project.";
		case "project_updated":
			return `updated the project${"status" in activity && (activity as ProjectUpdatedActivity).status ? ` to ${(activity as ProjectUpdatedActivity).status}.` : "."}`;
		case "client_updated":
			return "updated client details.";
		case "quote_created":
			return "created a quote.";
		case "quote_sent":
			return "sent the quote.";
		case "quote_approved":
			return "approved the quote.";
		case "invoice_sent":
			return "sent the invoice.";
		case "invoice_paid":
			return "paid the invoice.";
		case "assignment":
			return "made an assignment.";
		case "tags":
			return "added tags.";
		default:
			return "performed an action.";
	}
}

export default function ActivityItem({ activity, isLast }: ActivityItemProps) {
	const isConvex = isConvexActivity(activity);
	const activityType = isConvex ? activity.activityType : activity.type;
	const style = getActivityStyle(activityType);

	// Extract common data based on activity type
	const userName = isConvex ? activity.user.name : activity.person.name;
	const activityDate = isConvex
		? formatDate(activity.timestamp)
		: activity.date;

	// Success states get special treatment
	const isSuccess =
		activityType === "invoice_paid" ||
		activityType === "project_completed" ||
		activityType === "quote_approved" ||
		activityType === "payment_paid" ||
		activityType === "task_completed";

	// For Convex activities, build inline badge + amount
	const label = isConvex ? getActivityLabel(activityType) : null;
	const amount =
		isConvex &&
		(activityType.includes("quote") ||
			activityType.includes("invoice") ||
			activityType.includes("payment"))
			? getActivityAmount(activity)
			: null;

	return (
		<li className="relative flex gap-x-3 items-start">
			{/* Timeline line */}
			<div
				className={classNames(
					isLast ? "h-6" : "-bottom-5",
					"absolute left-0 top-0 flex w-8 justify-center"
				)}
			>
				<div className="w-px bg-primary/15" />
			</div>

			{activityType === "comment" && !isConvex ? (
				<>
					<Avatar className="relative size-8 flex-none ring-4 ring-background">
						<AvatarImage
							src={(activity as CommentActivity).imageUrl}
							alt={(activity as CommentActivity).person.name}
						/>
						<AvatarFallback className="bg-primary/10 text-primary text-xs">
							{getInitials((activity as CommentActivity).person.name)}
						</AvatarFallback>
					</Avatar>
					<div className="flex-auto rounded-lg border border-border bg-muted/30 p-3">
						<div className="flex justify-between gap-x-4">
							<div className="text-sm text-muted-foreground">
								<span className="font-medium text-foreground">
									{(activity as CommentActivity).person.name}
								</span>{" "}
								commented
							</div>
							<span className="flex-none text-xs text-muted-foreground">
								{(activity as CommentActivity).date}
							</span>
						</div>
						<p className="text-sm text-foreground/80 mt-1">
							{(activity as CommentActivity).comment}
						</p>
					</div>
				</>
			) : (
				<>
					{/* Icon with colored background + opaque ring to cover the timeline line */}
					<div
						className={classNames(
							"relative flex size-8 flex-none items-center justify-center rounded-full ring-4 ring-background",
							style.bgColor
						)}
					>
						{isSuccess ? (
							<CheckCircleIcon
								aria-hidden="true"
								className="size-4 text-green-600 dark:text-green-400"
							/>
						) : style.icon ? (
							<style.icon
								aria-hidden="true"
								className={classNames("size-3.5", style.iconColor)}
							/>
						) : (
							<div className="size-1.5 rounded-full bg-primary/40" />
						)}
					</div>

					{/* Content — description + badge + amount + timestamp */}
					<div className="flex-auto flex flex-wrap items-start gap-x-2 gap-y-1 min-w-0 py-1">
						<p className="text-sm text-muted-foreground leading-snug min-w-0">
							<span className="font-medium text-foreground">{userName}</span>{" "}
							{describeEvent(activity)}
						</p>

						{/* Inline badge */}
						{label && (
							<span
								className={classNames(
									"inline-flex items-center px-1.5 py-0.5 text-xs font-medium rounded shrink-0",
									isSuccess
										? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
										: activityType.includes("invoice") || activityType.includes("payment")
											? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
											: "bg-primary/10 text-primary"
								)}
							>
								{label}
							</span>
						)}

						{/* Inline amount */}
						{amount && (
							<span className="inline-flex items-center px-1.5 py-0.5 text-xs font-semibold rounded shrink-0 bg-foreground/5 text-foreground">
								{amount}
							</span>
						)}

						<span className="flex-none text-xs text-muted-foreground whitespace-nowrap ml-auto">
							{activityDate}
						</span>
					</div>
				</>
			)}
		</li>
	);
}
