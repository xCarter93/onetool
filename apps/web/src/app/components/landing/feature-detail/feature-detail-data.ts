/* ---------------------------------------------------------------------------
 * A-502 - the capability track. The copy script for the capability sheet.
 *
 * One card per product surface — the full navbar feature list plus the portal
 * and the inbox. Mobile is not its own card: it is the same visit opened on a
 * phone, so it lives in the scheduling and routing cards.
 *
 * DRAFT copy. Every claim traces to shipped behaviour: BoldSign e-sign on
 * quotes, `createFromQuote` (invoices.ts) off an approved quote, portal card
 * payments over Stripe Connect, the "Status changes" trigger with the "Create
 * task" action (node-types.ts / workflowTypes.ts), and `runReport` on invoices.
 * No counts, no metrics.
 *
 * `refCode`, never `ref` — reserved in React 19, and a `ref` key spread into
 * props breaks the RSC prerender of this section.
 * ------------------------------------------------------------------------- */

import type { MiniatureKey } from "../feature-miniatures";

export type CapabilityIcon =
	| "clients"
	| "quotes"
	| "schedule"
	| "routing"
	| "invoices"
	| "portal"
	| "automations"
	| "inbox"
	| "assistant";

export type CapabilityCard = {
	readonly id: string;
	readonly refCode: string;
	readonly title: string;
	readonly body: string;
	readonly icon: CapabilityIcon;
	/**
	 * Line-art vignette (see `../feature-miniatures`). All nine surfaces carry
	 * one; the field stays optional so a future card can ship copy first rather
	 * than take a stand-in drawing, which would read as filler.
	 */
	readonly miniature?: MiniatureKey;
};

export const CAPABILITY_CARDS: readonly CapabilityCard[] = [
	{
		id: "clients",
		refCode: "CAP 01",
		title: "Clients",
		body: "One record per client: contacts, addresses, properties and every job you have ever done for them. Nothing lives in a spreadsheet you have to remember to open.",
		icon: "clients",
		miniature: "clients",
	},
	{
		id: "quotes",
		refCode: "CAP 02",
		title: "Quotes & e-signatures",
		body: "Build a quote from line items with your own branding, send it for signature, and get back an approval you can act on. No printing, no chasing paper.",
		icon: "quotes",
		miniature: "quotes",
	},
	{
		id: "schedule",
		refCode: "CAP 03",
		title: "Scheduling & tasks",
		body: "An approved quote turns into scheduled visits and tasks on the calendar. The crew opens that same visit on their phone, with the address and the notes already on it.",
		icon: "schedule",
		miniature: "schedule",
	},
	{
		id: "routing",
		refCode: "CAP 04",
		title: "Route planning",
		body: "Pick the day's visits and get them back as an ordered route on a real map, then drive it stop by stop from the phone instead of eyeballing addresses.",
		icon: "routing",
		miniature: "routing",
	},
	{
		id: "invoices",
		refCode: "CAP 05",
		title: "Invoices & payments",
		body: "Convert the approved quote into an invoice off the same numbers, then take card payments through Stripe. The money lands in your own bank account.",
		icon: "invoices",
		miniature: "invoices",
	},
	{
		id: "portal",
		refCode: "CAP 06",
		title: "Client portal",
		body: "Your clients get a portal of their own to review the quote, sign it, read the invoice and pay it, under your business name, not ours.",
		icon: "portal",
		miniature: "portal",
	},
	{
		id: "automations",
		refCode: "CAP 07",
		title: "Automations",
		body: "Rules watch for things like a quote moving from sent to approved, then do the next step for you: create the task, send the email. Follow-ups stop waiting on your memory.",
		icon: "automations",
		miniature: "automations",
	},
	{
		id: "inbox",
		refCode: "CAP 08",
		title: "Inbox & email",
		body: "Email to and from a client stays on one thread beside their jobs. Send from the record, and the reply lands back on it. No more digging through a personal inbox.",
		icon: "inbox",
		miniature: "inbox",
	},
	{
		id: "assistant",
		refCode: "CAP 09",
		title: "Assistant & reports",
		body: "Ask in plain English: schedule the follow-up, plan the route, or chart revenue by month. Reports read your real quotes and invoices, not an export.",
		icon: "assistant",
		miniature: "assistant",
	},
];

/**
 * The accessible summary that precedes the track. The cards themselves are real
 * DOM text; this only states the shape of the set, which the horizontal
 * scrolling would otherwise hide.
 */
export const CAPABILITY_SUMMARY =
	"Nine capabilities, in the order one job travels through them: clients, quotes and e-signatures, scheduling and tasks, route planning, invoices and payments, the client portal, automations, the shared inbox, and the assistant with reports.";
