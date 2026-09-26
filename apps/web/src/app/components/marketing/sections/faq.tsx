"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import { LAUNCH_PROMO, useLaunchPromoActive } from "@/lib/promo";
import { Lede, Section, SectionHeading } from "../primitives";
import { AmbientLayer } from "../ambient";
import { FaqHalftoneScene } from "../section-halftone-scenes";

const FAQS: ReadonlyArray<readonly [string, string]> = [
	[
		"What is OneTool and who is it for?",
		"OneTool helps field-service businesses keep clients, jobs, quotes, invoices, and schedules together. It is built for small teams doing work at customers' homes and businesses.",
	],
	[
		"How does OneTool help me manage my clients?",
		"Keep each client's contact details, properties, work history, and messages together. Search or filter the list when you need to find someone quickly.",
	],
	[
		"Can I create and send professional quotes and invoices?",
		"Yes. Add line items and tax, then email the quote for your client to review and sign. Once approved, convert it to an invoice and track its payment.",
	],
	[
		"Can I receive payments directly to my bank account?",
		"Yes, on every plan, including Free. Connect Stripe, then let clients pay invoices by card through their portal. Stripe handles payouts to your connected bank account.",
	],
	[
		"Can I email clients directly from OneTool?",
		"Yes. Write to clients from OneTool and follow their replies in the shared inbox.",
	],
	[
		"Is OneTool accessible on mobile devices?",
		"Yes. The web app works on phones and tablets, and the native app is available on iPhone and iPad. Use it to check your schedule, look up clients, send quotes, and record work in the field. An internet connection is required.",
	],
	[
		"How does task scheduling work?",
		"Create tasks, assign them to teammates, and set due dates and priorities. The schedule shows what is coming up and what is overdue.",
	],
	[
		"Can multiple team members use OneTool?",
		"Yes. Invite teammates, set their roles and permissions, and work from the same records. Free includes 5 seats; Business includes 20.",
	],
	[
		"What kind of support do you offer?",
		"The help center covers the core workflows, and you can email our support team. Free support is best effort. Business includes a 24-hour response commitment.",
	],
	[
		"How secure is my data?",
		"OneTool uses Clerk for sign-in and scopes business records to your organization. Read our Data security page for details on how we protect and handle your information.",
	],
	[
		"Can I import my existing client data?",
		"Yes. Upload a CSV and map its columns to client fields. Free includes 2,000 imported rows in total; Business has no import row limit.",
	],
	[
		"How does the free trial work?",
		"Every new organization gets Business for 14 days without entering a card. After the trial, it moves to Free with its data intact. Upgrade from Billing whenever you need to.",
	],
	[
		"What are the free plan's limits?",
		"Clients and projects are unlimited on every plan. The free plan includes 5 team members, 20 quote and invoice sends a month (plus 10 bonus sends in any month you collect a card payment), 5 e-signature requests a month, 10 AI assistant messages a day, 5 saved reports, and 2,000 imported CSV rows in total. The Business plan lifts every one of those limits and includes 20 team members.",
	],
	[
		"What happens if I need to cancel my subscription?",
		"You can cancel your subscription at any time, and you keep paid features until the end of your current billing period. Cancelling never deletes anything: your account simply continues on the free plan with all of your data intact, for as long as you keep it. Subscription fees are generally non-refundable, but we always correct genuine billing errors, and EU customers have a 14-day withdrawal right on their initial purchase.",
	],
];

const DISCOUNT_FAQ: readonly [string, string] = [
	"Do you offer discounts?",
	`Yes. Through ${LAUNCH_PROMO.endsLabel} we are running a launch offer: ${LAUNCH_PROMO.annual.label.toLowerCase()} of Business on the annual plan, or ${LAUNCH_PROMO.monthly.label.toLowerCase()} on monthly. Your promo codes are shown when you create your organization and on the Billing tab, and you enter one at checkout under "Add promo code".`,
];

const DISCOUNT_FAQ_INDEX =
	FAQS.findIndex(([question]) => question === "How does the free trial work?") +
	1;

export function Faq() {
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
			divider
			className="overflow-hidden"
			containerClassName="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-[clamp(28px,4vw,72px)]"
		>
			<AmbientLayer fullBleed opacity={0.7}>
				<FaqHalftoneScene />
			</AmbientLayer>


			<div className="relative">
				<SectionHeading size="md" className="mt-0">
					Straight answers
				</SectionHeading>
				<Lede className="max-w-[24rem]">
					Anything else, email{" "}
					<a
						href="mailto:support@onetool.biz"
						className="font-medium text-(--accent-ink) underline-offset-2 transition-colors hover:text-(--ink) hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink)"
					>
						support@onetool.biz
					</a>{" "}
					and a person replies within a day.
				</Lede>
			</div>

			<ul className="relative">
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
								<span
									aria-hidden="true"
									className={cn(
										"h-[7px] w-[14px] flex-none rounded-[1px] border transition-[background-color,border-color] duration-300 ease-[cubic-bezier(.23,1,.32,1)]",
										open
											? "border-(--accent) bg-(--accent)"
											: "border-(--ink-3) bg-transparent"
									)}
								/>
								<span className="flex-1 text-[clamp(16px,1.5vw,19px)] font-medium leading-[1.35] tracking-[-0.015em]">
									{question}
								</span>
								<span
									aria-hidden="true"
									className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-lg border border-(--rule-2) text-[13px] text-(--ink-2) transition-[transform,border-color] duration-[250ms] ease-[cubic-bezier(.23,1,.32,1)] group-hover:scale-[1.08] group-hover:border-(--rule-3)"
								>
									{open ? "−" : "+"}
								</span>
							</button>

							<div
								id={panelId}
								role="region"
								aria-labelledby={triggerId}
								className={cn(
									"grid transition-[grid-template-rows,opacity] duration-[240ms] ease-[cubic-bezier(.23,1,.32,1)] motion-reduce:transition-none",
									open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
								)}
							>
								<div className="overflow-hidden" inert={!open}>
									<p className="max-w-[46rem] pb-6 pl-7 pr-12 text-[16px] leading-[1.65] text-(--ink-2) text-pretty">
										{answer}
									</p>
								</div>
							</div>
						</li>
					);
				})}
			</ul>
		</Section>
	);
}
