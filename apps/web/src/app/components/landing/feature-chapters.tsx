import { FeatureChaptersClient } from "./feature-rail";
import type { RailChapter } from "./feature-rail";

/**
 * A-101 — "How it works" as an Attio-style pinned run: the rail of chapter
 * headings holds on the left while scroll walks the plate through the nine
 * Remotion scenes (FeatureRail). Below lg it degrades to a plain stacked
 * read. Server shell; the client island owns all scroll machinery.
 */

/** DRAFT copy — PRD §5 grammar: bold clause + period + mechanism sentence.
    Every claim traces to shipped behaviour. */
const CHAPTERS: readonly RailChapter[] = [
	{
		key: "clients",
		code: "A-101",
		label: "Clients",
		heading: "The whole book of business.",
		body: "Every client, contact, and property on one searchable list, with the history that tells you who to call back.",
	},
	{
		key: "quote-build",
		code: "A-102",
		label: "Quote builder",
		heading: "Build the quote in minutes.",
		body: "Pick the client, drop in the line items, and the total adds itself up. Send it from the same screen you built it on.",
	},
	{
		key: "portal-approve",
		code: "A-103",
		label: "Client approval",
		heading: "The client approves from their phone.",
		body: "They open your link, read the quote under your name, and sign with a finger. You see it land the moment they do.",
	},
	{
		key: "tasks",
		code: "A-104",
		label: "Scheduling",
		heading: "The day plans itself.",
		body: "Tasks and visits land on a day plan you can actually run, and the week's workload stays where you can see it.",
	},
	{
		key: "routing",
		code: "A-105",
		label: "Routing",
		heading: "The shortest way through Tuesday.",
		body: "Your stops become an optimized route with drive times, so the crew spends the day working, not navigating.",
	},
	{
		key: "invoice-paid",
		code: "A-106",
		label: "Invoice & payment",
		heading: "One click to invoice. Paid the same week.",
		body: "The approved quote becomes an invoice without retyping a line, and the card payment settles straight into your Stripe account.",
	},
	{
		key: "automations",
		code: "A-107",
		label: "Automations",
		heading: "Work that runs while you sleep.",
		body: "Friday, 7:00 AM: the overdue list gets walked one invoice at a time: recent ones get a reminder email, the late ones become a call task. You wake up to a finished run.",
	},
	{
		key: "assistant",
		code: "A-108",
		label: "Assistant",
		heading: "Ask for it in plain English.",
		body: "One sentence becomes the task, the route, or the report, and the assistant shows its work as it goes.",
	},
	{
		key: "reports",
		code: "A-109",
		label: "Reports",
		heading: "Your numbers, without the spreadsheet.",
		body: "Revenue, outstanding invoices, and top clients from live data. The chart is already made when you ask.",
	},
];

const HEADING_ID = "feature-chapters-heading";

/**
 * Keeps `id="how-it-works"` — the navbar link and the hero's quiet CTA both
 * point at it.
 */
export function FeatureChapters() {
	return (
		<section
			id="how-it-works"
			aria-labelledby={HEADING_ID}
			className="relative p-6 sm:p-10 lg:p-14"
		>
			<h2
				id={HEADING_ID}
				className="max-w-3xl text-balance text-2xl font-semibold leading-[1.1] tracking-tight text-foreground sm:text-3xl lg:text-[2.5rem]"
			>
				Watch a job run through it.{" "}
				<span className="text-muted-foreground">
					Nine scenes drawn from the real screens. The same job, quote to
					paid.
				</span>
			</h2>

			<div className="mt-10 lg:mt-6">
				<FeatureChaptersClient chapters={[...CHAPTERS]} />
			</div>
		</section>
	);
}
