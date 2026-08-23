"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import { isLaunchPromoActive, LAUNCH_PROMO } from "@/lib/promo";
import { AmbientLayer } from "../ambient";
import { Eyebrow, Lede, Section, SectionHeading } from "../primitives";
import { FaqHalftoneScene } from "../section-halftone-scenes";

/* FAQ — the live production question set. The panel animates on
 * grid-template-rows 0fr→1fr so nothing has to be measured; landing.css already
 * disables the transition under prefers-reduced-motion. */

const FAQS: ReadonlyArray<readonly [string, string]> = [
	[
		"What is OneTool and who is it for?",
		"OneTool is a comprehensive business management platform designed for small business owners, contractors, landscapers, HVAC technicians, electricians, and other service professionals. It streamlines client management, project tracking, quoting, invoicing, and task scheduling in one unified platform.",
	],
	[
		"How does OneTool help me manage my clients?",
		"OneTool provides a centralized database for all your client information, including contact details, service history, property information, and communication logs. You can easily search, filter, and organize clients, set up automated reminders, and track every interaction to deliver exceptional service.",
	],
	[
		"Can I create and send professional quotes and invoices?",
		"Yes! OneTool includes a powerful quoting and invoicing system. Create customized quotes with line items, taxes, and your company branding. Send them directly via email with e-signature capabilities for quick approvals. Convert approved quotes to invoices with one click and track payment status.",
	],
	[
		"Can I receive payments directly to my bank account?",
		"Yes, on every plan, including Free. Connect a bank account through our Stripe integration and clients pay their invoices by card from your client portal, with the money landing in your own Stripe account.",
	],
	[
		"Can I email clients directly from OneTool?",
		"Yes, we offer the ability to draft professional emails to clients from directly within OneTool. We also support email threads so you can keep track of responses and replies without having to leave OneTool.",
	],
	[
		"Is OneTool accessible on mobile devices?",
		"Absolutely. OneTool is built as a responsive web application that works seamlessly on smartphones, tablets, and desktop computers. We also have a native iOS app available now on the App Store that lets you view and manage your projects, tasks, and clients for each organization you're part of - all on the go. Access your data and stay productive from anywhere with an internet connection.",
	],
	[
		"How does task scheduling work?",
		"OneTool's task scheduling system lets you create tasks, assign them to team members, set due dates and priorities, and track completion status. You can view tasks in list or calendar format, set reminders, and get notifications when tasks are completed or overdue.",
	],
	[
		"Can multiple team members use OneTool?",
		"Yes! OneTool supports team collaboration with organization-based access. Add team members to your organization, assign roles and permissions, and work together in real-time. Everyone stays synchronized with instant updates across all devices. The free plan includes 5 team members and the Business plan includes 20.",
	],
	[
		"What kind of support do you offer?",
		"We provide detailed documentation, video tutorials, and email support. Free accounts get best-effort replies; Business accounts get priority support with a 24-hour response SLA.",
	],
	[
		"How secure is my data?",
		"Security is our top priority. OneTool uses industry-standard encryption for data transmission and storage. Your data is hosted on secure servers with regular backups, and we comply with data protection regulations. You maintain full ownership of your data and can export it at any time.",
	],
	[
		"Can I import my existing client data?",
		"Yes! OneTool supports CSV imports on every plan, making it easy to migrate your existing client data. Simply export your data from your current system, map the fields, and import it into OneTool. The free plan includes 2,000 imported rows in total, and the Business plan has no import limit.",
	],
	[
		"How does the free trial work?",
		"Every new organization starts with a 14-day trial of the Business plan, applied automatically when it is created. There is no credit card and nothing to cancel: when the trial ends, you simply continue on the free plan with all of your data intact. Upgrade from the Billing tab whenever it makes sense.",
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

// The discount entry rides directly after the trial question and disappears
// with the promo window.
const DISCOUNT_FAQ_INDEX =
	FAQS.findIndex(([question]) => question === "How does the free trial work?") +
	1;

export function Faq() {
	const [openIndex, setOpenIndex] = useState(0);
	const baseId = useId();
	const faqs = isLaunchPromoActive()
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
			{/* Halftone scene: the place you walk up to and ask — a polytunnel and
			    its planters on the left, the lit office with a bench and a lamp
			    post outside it on the right. */}
			<AmbientLayer opacity={0.7} fullBleed>
				<FaqHalftoneScene />
			</AmbientLayer>

			<div className="relative">
				<Eyebrow>FAQ</Eyebrow>
				<SectionHeading size="md">Straight answers</SectionHeading>
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
									"grid transition-[grid-template-rows,opacity] duration-[450ms] ease-[cubic-bezier(.23,1,.32,1)]",
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
