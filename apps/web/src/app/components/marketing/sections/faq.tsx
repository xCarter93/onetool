"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import { AmbientLayer } from "../ambient";
import { Eyebrow, Lede, Section, SectionHeading } from "../primitives";
import { FaqHalftoneScene } from "../section-halftone-scenes";

/* FAQ — questions and answers are the live production set (kept verbatim so the
 * two pages answer the same questions the same way). The panel animates on
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
		"Paid users of OneTool have access to our Stripe Connect integration which allows you to connect a bank account and send invoice payment links to clients.",
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
		"Yes! OneTool supports team collaboration with organization-based access. Add team members to your organization, assign roles and permissions, and work together in real-time. Everyone stays synchronized with instant updates across all devices.",
	],
	[
		"What kind of support do you offer?",
		"We provide comprehensive support including detailed documentation, video tutorials, and email support. Premium plan subscribers also get priority support with faster response times and access to one-on-one onboarding assistance.",
	],
	[
		"How secure is my data?",
		"Security is our top priority. OneTool uses industry-standard encryption for data transmission and storage. Your data is hosted on secure servers with regular backups, and we comply with data protection regulations. You maintain full ownership of your data and can export it at any time.",
	],
	[
		"Can I import my existing client data?",
		"Yes! OneTool supports CSV imports, making it easy to migrate your existing client data. Simply export your data from your current system, map the fields, and import it into OneTool. We also provide guidance to help you with the migration process.",
	],
	[
		"What happens if I need to cancel my subscription?",
		"You can cancel your subscription at any time, and you keep paid features until the end of your current billing period. Cancelling never deletes anything: your account simply continues on the free plan with all of your data intact, for as long as you keep it. Subscription fees are generally non-refundable, but we always correct genuine billing errors, and EU customers have a 14-day withdrawal right on their initial purchase.",
	],
];

export function Faq() {
	const [openIndex, setOpenIndex] = useState(0);
	const baseId = useId();

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
				{FAQS.map(([question, answer], index) => {
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
