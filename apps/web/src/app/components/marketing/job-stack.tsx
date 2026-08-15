"use client";

import { useState } from "react";
import ScrollStack from "@/components/react-bits/scroll-stack";
import type { FeatureKey } from "@/remotion/manifest";
import { ChapterPlayer } from "./chapter-player";
import { LoopHalftoneScene } from "./loop-halftone-scene";
import { Eyebrow, Lede, SectionHeading } from "./primitives";
import { RoughMark } from "./rough-mark";

/* The loop, retold as a pinned card stack: nine chapters of one job, each card
 * playing its reel chapter live, flanked by the halftone service street
 * (loop-halftone-scene.tsx). The heading rides in the pinned stage
 * (stageHeader) so it stays in view for the whole runway.
 *
 * Only the frontmost card's Player runs (onIndexChange). Players mount in a
 * window around the lead rather than all nine at once — the stack keeps every
 * card in the DOM, and nine live Remotion Players is not a thing to ship. */

/* Built once: this component re-renders on every card flip, and a fresh element
 * would resample both halftone sources and repaint their canvases each time. */
const STAGE_SCENE = <LoopHalftoneScene />;

type Step = {
	n: string;
	title: string;
	body: string;
	detail: string;
	chapter: FeatureKey;
};

const STEPS: Step[] = [
	{
		n: "01",
		title: "The client calls",
		body: "Log them once, with their contacts and every property they own. The history is there next time they ring.",
		detail: "Clients · Properties · Contacts",
		chapter: "clients",
	},
	{
		n: "02",
		title: "You send a quote",
		body: "Line items, your tax rate, your logo. Reusable products mean you are not pricing a filter change from scratch every week.",
		detail: "PDF generated automatically",
		chapter: "quote-build",
	},
	{
		n: "03",
		title: "They sign it on their phone",
		body: "They open the link with your business name on it, read the quote and sign with a finger. It flips to approved and you see it land.",
		detail: "E-signature via BoldSign",
		chapter: "portal-approve",
	},
	{
		n: "04",
		title: "The week fills itself in",
		body: "An approved quote becomes visits and tasks on the calendar, assigned to a crew. Recurring work repeats without you booking it again.",
		detail: "One-off or recurring · assigned per crew",
		chapter: "tasks",
	},
	{
		n: "05",
		title: "The day comes back in driving order",
		body: "The morning's stops are sequenced on a real map, so nobody crosses town twice and the last job still finishes on time.",
		detail: "Optimised route · live map",
		chapter: "routing",
	},
	{
		n: "06",
		title: "The invoice goes out and gets paid",
		body: "One click off the approved quote, same totals, nothing retyped. They pay by card on the portal and it settles into your account.",
		detail: "Quote to invoice, one click · Stripe Connect",
		chapter: "invoice-paid",
	},
	{
		n: "07",
		title: "The chasing runs itself",
		body: "Overdue invoices get walked, approved quotes turn into jobs, and the client hears from you on schedule. You build the rule once.",
		detail: "Workflow automations · triggers and actions",
		chapter: "automations",
	},
	{
		n: "08",
		title: "You ask instead of hunting",
		body: "Ask for last month's unpaid work or a client's history in plain words, and get the answer out of your own data.",
		detail: "AI assistant",
		chapter: "assistant",
	},
	{
		n: "09",
		title: "You see where the money came from",
		body: "Revenue, outstanding work and the clients worth keeping, without exporting anything into a spreadsheet first.",
		detail: "Reports · dashboards",
		chapter: "reports",
	},
];

/* Covered cards visible behind the lead. The Player window matches it, so
 * nothing mounts that the stack is not already showing. */
const DEPTH = 3;

/* Hoisted for the same reason as the stage scene: the RoughMark inside it draws
 * once, and a new element on every card flip would redraw it. text-(--ink) is
 * load-bearing — the stack's own className inks everything --ink-3 for the
 * progress rail, and the heading must not inherit that. */
const STAGE_HEADER = (
	<div className="pt-[72px] pb-[clamp(18px,2.5vw,30px)] text-(--ink)">
		<Eyebrow>The new way</Eyebrow>
		<div className="grid items-end gap-x-[clamp(24px,4vw,64px)] gap-y-2 md:grid-cols-[1.2fr_1fr]">
			<SectionHeading size="sm" reveal={false}>
				One loop. From the first call to{" "}
				<RoughMark type="highlight" color="var(--accent)">
					the money landing
				</RoughMark>
				.
			</SectionHeading>
			{/* Dropped on short screens: the stage has to hold a card too. */}
			<Lede className="hidden max-w-[34rem] md:block">
				Nothing gets retyped between these steps. The quote becomes the visit
				becomes the invoice, off the same numbers.
			</Lede>
		</div>
	</div>
);

export function JobStack() {
	const [active, setActive] = useState(0);

	return (
		<ScrollStack
			background={STAGE_SCENE}
			stageHeader={STAGE_HEADER}
			variant="stack"
			depth={DEPTH}
			blur={0}
			dim={0.14}
			scrollLength={0.6}
			cardWidth={1080}
			cardHeight={0.58}
			showProgress
			showCounter
			onIndexChange={setActive}
			className="text-(--ink-3)"
		>
			{STEPS.map((step, i) => (
				<article
					key={step.n}
					className="grid h-full w-full grid-rows-[auto_1fr] overflow-hidden rounded-[16px] border border-(--rule-2) bg-(--sheet) text-(--ink)"
				>
					<header className="grid gap-[10px] border-b border-(--rule) px-[clamp(20px,3vw,32px)] py-[clamp(14px,1.8vw,20px)]">
						<div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
							<div className="flex items-baseline gap-[12px]">
								<span className="font-mono text-[11.5px] font-medium tracking-[0.12em] tabular-nums text-(--accent-ink)">
									{step.n}
								</span>
								<h3 className="text-[clamp(18px,2vw,24px)] font-semibold leading-[1.2] tracking-[-0.02em]">
									{step.title}
								</h3>
							</div>
							<p className="hidden font-mono text-[11px] uppercase tracking-[0.08em] text-(--ink-3) sm:block">
								{step.detail}
							</p>
						</div>
						<p className="max-w-[70ch] text-[14.5px] leading-[1.55] text-(--ink-2) text-pretty max-sm:line-clamp-2">
							{step.body}
						</p>
					</header>

					{/* Life-size chapter canvas: fills the row and crops rather than
					    shrinking (the 1600×1000 stage keeps product scale). */}
					<div className="relative overflow-hidden">
						<div className="absolute inset-0 flex items-center justify-center">
							{i >= active - DEPTH && i <= active + 1 ? (
								<ChapterPlayer
									featureKey={step.chapter}
									active={i === active}
									label={`${step.title} (product animation)`}
									className="w-full min-w-[860px] max-w-[1100px]"
								/>
							) : null}
						</div>
					</div>
				</article>
			))}
		</ScrollStack>
	);
}
