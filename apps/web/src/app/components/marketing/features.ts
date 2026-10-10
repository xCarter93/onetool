/** The landing story chapter (sections/how-it-works.tsx) a feature belongs to. */
export type Chapter = "win" | "run" | "paid" | "ahead";

export const CHAPTERS: { id: Chapter; label: string }[] = [
	{ id: "win", label: "Win the work" },
	{ id: "run", label: "Run the day" },
	{ id: "paid", label: "Get paid" },
	{ id: "ahead", label: "Follow up" },
];

export type Feature = {
	key: string;
	chapter: Chapter;
	label: string;
	description: string;
	href: `/help/${string}`;
};

// Slugs must match packages/help-content/categories.ts.
export const FEATURES: Feature[] = [
	{
		key: "clients",
		chapter: "win",
		label: "Clients & properties",
		description: "Contacts, properties and past jobs",
		href: "/help/clients",
	},
	{
		key: "projects",
		chapter: "run",
		label: "Projects & tasks",
		description: "Assign tasks and see what’s overdue",
		href: "/help/projects-and-tasks",
	},
	{
		key: "quotes",
		chapter: "win",
		label: "Quotes & e-sign",
		description: "Send quotes clients sign from their phone",
		href: "/help/quotes",
	},
	{
		key: "invoices",
		chapter: "paid",
		label: "Invoices & payments",
		description: "Turn signed quotes into paid invoices",
		href: "/help/invoices-and-payments",
	},
	{
		key: "portal",
		chapter: "win",
		label: "Client portal",
		description: "Clients sign and pay from one link",
		href: "/help/client-portal",
	},
	{
		key: "inbox",
		chapter: "ahead",
		label: "Inbox & email",
		description: "Client emails and replies in a shared inbox",
		href: "/help/inbox",
	},
	{
		key: "automations",
		chapter: "ahead",
		label: "Automations",
		description: "Email the client when a quote is approved",
		href: "/help/automations",
	},
	{
		key: "assistant",
		chapter: "ahead",
		label: "AI assistant",
		description: "Answers from your numbers, adds tasks",
		href: "/help/ai-assistant",
	},
	{
		key: "routing",
		chapter: "run",
		label: "Route planning",
		description: "Put the day’s stops in driving order",
		href: "/help/routing",
	},
	{
		key: "reports",
		chapter: "ahead",
		label: "Reports",
		description: "Charts from your quotes and invoices",
		href: "/help/reports",
	},
	{
		key: "team",
		chapter: "run",
		label: "Team & permissions",
		description: "Invite your crew and set permissions",
		href: "/help/settings-and-team",
	},
	{
		key: "mobile",
		chapter: "run",
		label: "Mobile app",
		description: "Your jobs and route on iPhone and iPad",
		href: "/help/mobile-app",
	},
	{
		key: "community",
		chapter: "win",
		label: "Community page",
		description: "A free public page for quote requests",
		href: "/help/community",
	},
];

/** Listed in the landing feature index only; the nav menu splits FEATURES by position. */
export const MORE_GUIDES: Feature[] = [
	{
		key: "quickbooks",
		chapter: "paid",
		label: "QuickBooks sync",
		description: "Invoices and payments, synced on Business",
		href: "/help/settings-and-team/quickbooks-sync",
	},
	{
		key: "search",
		chapter: "ahead",
		label: "Search",
		description: "Find any record with ⌘K",
		href: "/help/getting-started/search-your-workspace",
	},
];
