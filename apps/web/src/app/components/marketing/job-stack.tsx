"use client";

import { useState } from "react";
import ScrollStack from "@/components/react-bits/scroll-stack";
import type { FeatureKey } from "@/remotion/manifest";
import { ChapterPlayer } from "./chapter-player";

/* The loop, retold as a pinned card stack: the five steps of one job, each
 * card playing its reel chapter live. Copy carried over from the mosaic
 * version of sections/loop.tsx. Only the frontmost card's Player runs
 * (onIndexChange); depth === count keeps covered Players mounted (the stack
 * hides them with visibility, so playback state survives). */

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
		body: "Log them once — company, contacts, every property they own. The history is there next time they ring.",
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
		title: "They sign it, the calendar fills",
		body: "A link, their phone, a finger — the quote flips to approved and it becomes visits and tasks on the calendar, assigned to a crew.",
		detail: "E-signature via BoldSign · one-off or recurring",
		chapter: "portal-approve",
	},
	{
		n: "04",
		title: "The work gets done and invoiced",
		body: "The day's stops come back in driving order on a real map. The invoice is one click off the approved quote — same totals, nothing retyped.",
		detail: "Optimised route · quote → invoice, one click",
		chapter: "routing",
	},
	{
		n: "05",
		title: "You get paid",
		body: "They pay by card on the portal, it settles into your account, and the job closes itself out. Overdue invoices get walked automatically.",
		detail: "Stripe Connect · automated follow-up",
		chapter: "invoice-paid",
	},
];

export function JobStack() {
	const [active, setActive] = useState(0);

	return (
		<ScrollStack
			variant="stack"
			depth={STEPS.length}
			blur={0}
			dim={0.14}
			scrollLength={0.85}
			cardWidth={1080}
			cardHeight={0.72}
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
					<header className="grid gap-[10px] border-b border-(--rule) px-[clamp(20px,3vw,32px)] py-[clamp(16px,2vw,22px)]">
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
							<ChapterPlayer
								featureKey={step.chapter}
								active={i === active}
								label={`${step.title} — product animation`}
								className="w-full min-w-[860px] max-w-[1100px]"
							/>
						</div>
					</div>
				</article>
			))}
		</ScrollStack>
	);
}
