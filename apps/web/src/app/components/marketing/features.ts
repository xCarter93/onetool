export type Feature = {
	key: string;
	label: string;
	description: string;
	href: `/help/${string}`;
};

// Slugs must match packages/help-content/categories.ts.
export const FEATURES: Feature[] = [
	{
		key: "clients",
		label: "Clients & properties",
		description: "Every client, contact, and property in one place",
		href: "/help/clients",
	},
	{
		key: "projects",
		label: "Projects & tasks",
		description: "A day plan your crew actually runs",
		href: "/help/projects-and-tasks",
	},
	{
		key: "quotes",
		label: "Quotes & e-sign",
		description: "Send quotes clients sign from their phone",
		href: "/help/quotes",
	},
	{
		key: "invoices",
		label: "Invoices & payments",
		description: "Flip the quote to an invoice, get paid online",
		href: "/help/invoices-and-payments",
	},
	{
		key: "portal",
		label: "Client portal",
		description: "Clients approve, sign and pay from one link",
		href: "/help/client-portal",
	},
	{
		key: "inbox",
		label: "Inbox & email",
		description: "Every client email in one shared inbox",
		href: "/help/inbox",
	},
	{
		key: "automations",
		label: "Automations",
		description: "Rules that run while you sleep",
		href: "/help/automations",
	},
	{
		key: "assistant",
		label: "AI assistant",
		description: "Ask in plain English, it does the work",
		href: "/help/ai-assistant",
	},
	{
		key: "routing",
		label: "Route planning",
		description: "Stops become an optimized route",
		href: "/help/routing",
	},
	{
		key: "reports",
		label: "Reports",
		description: "Live numbers without the spreadsheet",
		href: "/help/reports",
	},
	{
		key: "team",
		label: "Team & permissions",
		description: "Invite your crew and decide who sees what",
		href: "/help/settings-and-team",
	},
	{
		key: "mobile",
		label: "Mobile app",
		description: "Your jobs and route on iPhone and iPad",
		href: "/help/mobile-app",
	},
	{
		key: "community",
		label: "Community page",
		description: "A free public page for your business that captures leads",
		href: "/help/community",
	},
];
