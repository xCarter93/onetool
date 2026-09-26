
export const SCENE_COUNT = 12;
export const CHAPTER_OFFSET = 2;
export const PACE_VH = 64;

export const MINUTES = [358, 362, 375, 425, 520, 615, 750, 850, 945, 990, 1068, 1170, 1195] as const;
export const RAIL_START = 360;
export const RAIL_END = 1200;

export const NAV = [
	{ label: "Home", d: "M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z" },
	{ label: "Schedule", d: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" },
	{ label: "Routes", d: "M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM6 15V9a3 3 0 0 1 3-3h7M18 9v6a3 3 0 0 1-3 3H8" },
	{ label: "Clients", d: "M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 20v-1a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" },
	{ label: "Quotes", d: "M14 3H6v18h12V7zM14 3v4h4M9 13h6M9 17h6" },
	{ label: "Visits", d: "M4 7h3l2-3h6l2 3h3v13H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" },
	{ label: "Invoices", d: "M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2zM9 8h6M9 12h6" },
	{ label: "Automations", d: "M13 2 4 14h7l-1 8 9-12h-7z" },
	{ label: "Assistant", d: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" },
	{ label: "Reports", d: "M4 20V10M10 20V4M16 20v-7M22 20H2" },
] as const;

export const SCENE_NAV = [0, 3, 1, 2, 3, 4, 5, 6, 7, 8, 9, 1] as const;

export const CRUMB = [
	"Home",
	"Clients / Whitfield Property Group",
	"Schedule / Today",
	"Routes / Tuesday route",
	"Clients / New client",
	"Quotes / #1042",
	"Visits / Whitfield #3",
	"Invoices / #1042",
	"Automations / Overdue invoice chase",
	"Assistant",
	"Reports",
	"Schedule / Wednesday",
] as const;

export type ChapterKey =
	| "plan"
	| "route"
	| "lead"
	| "quote"
	| "visit"
	| "paid"
	| "followup"
	| "ask"
	| "numbers"
	| "tomorrow";

export interface Chapter {
	key: ChapterKey;
	n: string;
	eyebrow: string;
	title: string;
	body: string;
	before: string;
	railTime: string;
	railLabel: string;
}

export const OLD_WAY = {
	eyebrow: "The old way",
	title: "Five places to look. One job to do.",
	body: "A notebook, a spreadsheet, the group text, a voicemail and a sticky note on the dash. None of them talk to each other.",
} as const;

export const CHAPTERS: readonly Chapter[] = [
	{
		key: "plan",
		n: "01",
		eyebrow: "Morning plan",
		title: "Your day, already planned.",
		body: "Every visit, address and gate code for every crew. The same screen in the office and the truck.",
		before: "A whiteboard photo in the group chat",
		railTime: "6:15",
		railLabel: "Plan",
	},
	{
		key: "route",
		n: "02",
		eyebrow: "Routing",
		title: "The route plans itself.",
		body: "Put the day's stops in order along real streets. Your crew takes the route with them on their phone.",
		before: "“who's taking Kerr Road?”",
		railTime: "7:05",
		railLabel: "Route",
	},
	{
		key: "lead",
		n: "03",
		eyebrow: "New lead",
		title: "The call becomes a client.",
		body: "Name, number, property and why they called. Typed once, then used by every quote, visit and invoice after it.",
		before: "A number on the back of a receipt",
		railTime: "8:40",
		railLabel: "New lead",
	},
	{
		key: "quote",
		n: "04",
		eyebrow: "Quote & e-sign",
		title: "Quoted and signed in the driveway.",
		body: "Build the quote on your phone and send it. They sign on theirs before you're back in the truck.",
		before: "“I'll email it over tonight.”",
		railTime: "10:15",
		railLabel: "Quote",
	},
	{
		key: "visit",
		n: "05",
		eyebrow: "On site",
		title: "Before and after, on the record.",
		body: "Photos and notes attach to the visit, so the office sees what the crew saw.",
		before: "212 unlabeled photos in your camera roll",
		railTime: "12:30",
		railLabel: "On site",
	},
	{
		key: "paid",
		n: "06",
		eyebrow: "Invoice & pay",
		title: "Paid before you pull away.",
		body: "Turn the signed quote into an invoice. Your client pays online, and Stripe handles the payout to your bank.",
		before: "“The check's in the mail.”",
		railTime: "2:10",
		railLabel: "Paid",
	},
	{
		key: "followup",
		n: "07",
		eyebrow: "Follow-up",
		title: "The follow-up sends itself.",
		body: "Set a rule for overdue invoices. Send a reminder for recent ones and create a call task for the late ones.",
		before: "Your third awkward phone call this week",
		railTime: "3:45",
		railLabel: "Follow-up",
	},
	{
		key: "ask",
		n: "08",
		eyebrow: "AI assistant",
		title: "Ask it like you'd ask the office.",
		body: "Ask about clients, jobs or money in plain English. It answers, then offers to do the work for you.",
		before: "Twenty minutes scrolling a spreadsheet",
		railTime: "4:30",
		railLabel: "Ask",
	},
	{
		key: "numbers",
		n: "09",
		eyebrow: "End of day",
		title: "The numbers, without the spreadsheet.",
		body: "Revenue, collections and what's still owed. It updates the moment anything changes.",
		before: "Adding it all up on Sunday night",
		railTime: "5:48",
		railLabel: "Numbers",
	},
	{
		key: "tomorrow",
		n: "10",
		eyebrow: "Tomorrow",
		title: "Tomorrow's already done.",
		body: "Recurring jobs are booked, routes are set and reminders are queued. Go home.",
		before: "Planning tomorrow at the kitchen table",
		railTime: "7:30",
		railLabel: "Tomorrow",
	},
];

export const RAIL_MINUTES = MINUTES.slice(CHAPTER_OFFSET, CHAPTER_OFFSET + CHAPTERS.length);
