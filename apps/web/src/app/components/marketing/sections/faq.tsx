"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- plain anchors: a full load keeps the landing and app stylesheets apart and skips prefetching */

import { useId, useState, type ReactNode } from "react";
import { ArrowRight, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { LAUNCH_PROMO, useLaunchPromoActive } from "@/lib/promo";
import { Halftone } from "../halftone";
import { Lede, Section, SectionHeading } from "../primitives";

const LINK =
	"font-medium text-(--accent-ink) underline-offset-2 transition-colors hover:text-(--ink) hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink)";

const FAQS: ReadonlyArray<readonly [string, ReactNode]> = [
	[
		"How does the free trial work?",
		"Every new organization gets 14 days of Business with no card. After that it moves to Free and keeps all its data. Upgrade from Billing whenever you’re ready.",
	],
	[
		"What happens to my records if I cancel?",
		"Nothing is deleted. Cancel any time and you keep Business until the end of the billing period. Then the account moves to Free with all its data, for as long as you keep it. Fees generally aren’t refundable, but we always fix genuine billing errors. EU customers can withdraw within 14 days of their first purchase.",
	],
	[
		"What moves over from my old software?",
		"Your client list. Export it from your old tool as a CSV, or on Business pull your customers in from QuickBooks Online. Past quotes, invoices and job history don’t import.",
	],
	[
		"Can I limit what my crew sees?",
		"New members see only the projects and tasks assigned to them. You can open up more for each person one area at a time, such as clients, quotes, invoices or billing. Admins and the owner see everything.",
	],
	[
		"How do you protect my client records?",
		<>
			Sign-in runs through a dedicated login service, and each business&rsquo;s records are kept apart from every other business&rsquo;s. Only the people you invite can see yours. The{" "}
			<a href="/data-security" className={LINK}>
				Data security
			</a>{" "}
			page covers the rest.
		</>,
	],
	[
		"Who helps me if I get stuck?",
		<>
			Start with the{" "}
			<a href="/help" className={LINK}>
				help center
			</a>{" "}
			or email our support team. On Free we reply as soon as we can. On Business we reply
			within 24 hours.
		</>,
	],
];

const DISCOUNT_FAQ: readonly [string, ReactNode] = [
	"Do you offer discounts?",
	`Until ${LAUNCH_PROMO.endsLabel}, the launch offer gives you ${LAUNCH_PROMO.annual.label.toLowerCase()} of Business on the annual plan, or ${LAUNCH_PROMO.monthly.label.toLowerCase()} on monthly. Your codes show up when you create your organization and on the Billing tab. Enter one at checkout under “Add promo code”.`,
];

const DISCOUNT_FAQ_INDEX =
	FAQS.findIndex(([question]) => question === "How does the free trial work?") +
	1;

// The feature panels are server-rendered children, so their markup stays out of this client bundle.
export function Faq({ children }: { children: ReactNode }) {
	const [openIndex, setOpenIndex] = useState(0);
	const baseId = useId();
	const promoActive = useLaunchPromoActive();
	const faqs = promoActive
		? [
				...FAQS.slice(0, DISCOUNT_FAQ_INDEX),
				DISCOUNT_FAQ,
				...FAQS.slice(DISCOUNT_FAQ_INDEX),
			]
		: FAQS;

	return (
		<Section
			id="faq"
			containerClassName="grid grid-cols-1 gap-x-[clamp(28px,4vw,72px)] gap-y-[clamp(40px,5vw,64px)] lg:grid-cols-2"
		>
			<div className="lg:col-start-1 lg:row-start-1">
				<SectionHeading size="md" className="mt-0">
					What owners ask before they switch.
				</SectionHeading>
				<Lede className="max-w-[24rem]">
					Anything we missed, email{" "}
					<a href="mailto:support@onetool.biz" className={LINK}>
						support@onetool.biz
					</a>.
				</Lede>
				<div className="mt-8 max-w-[24rem] border-t border-(--rule-2) pt-5">
					<p className="text-base font-semibold text-(--ink)">
						Switching from Jobber or Housecall&nbsp;Pro?
					</p>
					<p className="mt-2 text-base leading-[1.6] text-pretty text-(--ink-2)">
						Get a walkthrough from someone on our team before you move anything over.
					</p>
					<a
						href="#book-a-demo"
						className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-sm font-semibold text-(--accent-ink) underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink)"
					>
						Book a demo
						<ArrowRight aria-hidden="true" className="size-4" />
					</a>
				</div>
				<Halftone scene="doorstep" className="lp-faq-art" />
			</div>

			<ul className="relative lg:col-start-2 lg:row-start-1">
				{faqs.map(([question, answer], index) => {
					const open = openIndex === index;
					const panelId = `${baseId}-faq-panel-${index}`;
					const triggerId = `${baseId}-faq-trigger-${index}`;

					return (
						<li key={question} className="border-t border-(--rule)">
							<button
								type="button"
								id={triggerId}
								aria-expanded={open}
								aria-controls={panelId}
								onClick={() => setOpenIndex(open ? -1 : index)}
								className="group flex w-full cursor-pointer items-center gap-3.5 py-[22px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink)"
							>
								<span className="flex-1 text-base lg:text-lg font-medium leading-[1.35] tracking-[-0.015em]">
									{question}
								</span>
								<span
									aria-hidden="true"
									className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-lg border border-(--rule-2) text-(--ink-2) transition-[transform,border-color] duration-[250ms] ease-(--ease-out-quint) group-hover:scale-[1.08] group-hover:border-(--rule-3)"
								>
									{open ? <Minus className="size-3.5" /> : <Plus className="size-3.5" />}
								</span>
							</button>

							<div
								id={panelId}
								role="region"
								aria-labelledby={triggerId}
								className={cn(
									"grid transition-[grid-template-rows,opacity] duration-[240ms] ease-(--ease-out-quint) motion-reduce:transition-none",
									open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
								)}
							>
								<div className="overflow-hidden" inert={!open}>
									<p className="max-w-[46rem] pb-6 pr-12 text-base leading-[1.65] text-(--ink-2) text-pretty">
										{answer}
									</p>
								</div>
							</div>
						</li>
					);
				})}
			</ul>
			<div className="grid gap-[clamp(24px,3vw,40px)] md:grid-cols-2 lg:col-span-2 lg:row-start-2">
				{children}
			</div>

		</Section>
	);
}
