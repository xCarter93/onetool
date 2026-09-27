export type BentoCopy = {
	title: string;
	body: string;
	href: `/help/${string}`;
};

// Shared by each cell and its server-rendered placeholder so both show the same copy.
export const BENTO_COPY = {
	schedule: {
		title: "The whole week on one calendar",
		body: "Projects and tasks land on your week calendar. Drag one to a new day and your crew sees the change right away.",
		href: "/help/projects-and-tasks/creating-and-managing-projects",
	},
	inbox: {
		title: "Every client email in one inbox",
		body: "Client replies to your quotes and invoices land in your team's shared inbox. Each one stays in its thread, filed under that client.",
		href: "/help/inbox/unified-inbox",
	},
	payments: {
		title: "Get paid from the invoice",
		body: "Clients pay by card from the link in their invoice email. The money goes to your Stripe account, and the invoice marks itself paid.",
		href: "/help/invoices-and-payments/getting-paid",
	},
	automation: {
		title: "Rules that run while you sleep",
		body: "When a quote is approved, email the client and set up the project. Build the rule once and OneTool runs it every time.",
		href: "/help/automations/automations-overview",
	},
	assistant: {
		title: "Ask in plain English",
		body: "Ask about your schedule, clients and invoices and get answers from your live data. It can also create tasks and update projects.",
		href: "/help/ai-assistant/meet-the-assistant",
	},
	command: {
		title: "Find anything with ⌘K",
		body: "Jump to a client, project or quote, or start a new one, from wherever you are.",
		href: "/help/getting-started/search-your-workspace",
	},
	import: {
		title: "Bring your spreadsheet with you",
		body: "Upload a CSV and OneTool matches its columns to client fields, flags likely duplicates and creates the rest in one pass.",
		href: "/help/clients/importing-clients",
	},
	sync: {
		title: "Your books stay in QuickBooks",
		body: "Clients, invoices, payments and refunds sync to QuickBooks Online, so nobody re-types them at month end.",
		href: "/help/settings-and-team/quickbooks-sync",
	},
} satisfies Record<string, BentoCopy>;

export type BentoKey = keyof typeof BENTO_COPY;
