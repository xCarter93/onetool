"use client";

import { m, AnimatePresence, useReducedMotion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { CtaButton } from "@/app/components/landing/cta-button";
import { revealProps } from "@/app/components/landing/motion-utils";

const faqs = [
	{
		question: "What is OneTool and who is it for?",
		answer:
			"OneTool is a comprehensive business management platform designed for small business owners, contractors, landscapers, HVAC technicians, electricians, and other service professionals. It streamlines client management, project tracking, quoting, invoicing, and task scheduling in one unified platform.",
	},
	{
		question: "How does OneTool help me manage my clients?",
		answer:
			"OneTool provides a centralized database for all your client information, including contact details, service history, property information, and communication logs. You can easily search, filter, and organize clients, set up automated reminders, and track every interaction to deliver exceptional service.",
	},
	{
		question: "Can I create and send professional quotes and invoices?",
		answer:
			"Yes! OneTool includes a powerful quoting and invoicing system. Create customized quotes with line items, taxes, and your company branding. Send them directly via email with e-signature capabilities for quick approvals. Convert approved quotes to invoices with one click and track payment status.",
	},
	{
		question: "Can I receive payments directly to my bank account?",
		answer:
			"Paid users of OneTool have access to our Stripe Connect integration which allows you to connect a bank account and send invoice payment links to clients.",
	},
	{
		question: "Can I email clients directly from OneTool?",
		answer:
			"Yes, we offer the ability to draft professional emails to clients from directly within OneTool. We also support email threads so you can keep track of responses and replies without having to leave OneTool.",
	},
	{
		question: "Is OneTool accessible on mobile devices?",
		answer:
			"Absolutely. OneTool is built as a responsive web application that works seamlessly on smartphones, tablets, and desktop computers. We also have a native iOS app available now on the App Store that lets you view and manage your projects, tasks, and clients for each organization you're part of - all on the go. Access your data and stay productive from anywhere with an internet connection.",
	},
	{
		question: "How does task scheduling work?",
		answer:
			"OneTool's task scheduling system lets you create tasks, assign them to team members, set due dates and priorities, and track completion status. You can view tasks in list or calendar format, set reminders, and get notifications when tasks are completed or overdue.",
	},
	{
		question: "Can multiple team members use OneTool?",
		answer:
			"Yes! OneTool supports team collaboration with organization-based access. Add team members to your organization, assign roles and permissions, and work together in real-time. Everyone stays synchronized with instant updates across all devices.",
	},
	{
		question: "What kind of support do you offer?",
		answer:
			"We provide comprehensive support including detailed documentation, video tutorials, and email support. Premium plan subscribers also get priority support with faster response times and access to one-on-one onboarding assistance.",
	},
	{
		question: "How secure is my data?",
		answer:
			"Security is our top priority. OneTool uses industry-standard encryption for data transmission and storage. Your data is hosted on secure servers with regular backups, and we comply with data protection regulations. You maintain full ownership of your data and can export it at any time.",
	},
	{
		question: "Can I import my existing client data?",
		answer:
			"Yes! OneTool supports CSV imports, making it easy to migrate your existing client data. Simply export your data from your current system, map the fields, and import it into OneTool. We also provide guidance to help you with the migration process.",
	},
	{
		question: "What happens if I need to cancel my subscription?",
		answer:
			"You can cancel your subscription at any time with no penalties. Your data remains accessible for 30 days after cancellation, giving you time to export everything you need. We also offer a full refund within the first 14 days if OneTool isn't the right fit for you.",
	},
];

/**
 * G-003 — general notes. Heading column left, the notes themselves right; one
 * note open at a time, the first open on arrival. The section prints no border
 * of its own: the sheet shell owns the seam rule and the corner marks.
 */
export default function FAQSection() {
	const [openIndex, setOpenIndex] = useState<number>(0);
	const reduced = useReducedMotion();

	const toggleFAQ = (index: number) => {
		setOpenIndex((prev) => (prev === index ? -1 : index));
	};

	return (
		<section
			id="faq"
			className="bp-section relative p-6 sm:p-10 lg:p-14 lg:grid lg:grid-cols-[minmax(0,24rem)_1fr] lg:gap-14"
		>
			{/* Heading column */}
			{/* No `sticky` here: .bp-section's content-visibility breaks it. */}
			<m.div {...revealProps(reduced)} className="lg:self-start">
				<p className="text-[11px] font-semibold uppercase leading-none tracking-[0.14em] text-bp-anno">
					FAQ
				</p>
				<h2 className="mt-5 text-balance text-2xl font-semibold leading-[1.1] tracking-tight text-foreground sm:text-3xl lg:text-[2.5rem]">
					Frequently Asked Questions
				</h2>
				<p className="mt-5 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
					Everything you need to know about OneTool
				</p>
			</m.div>

			{/* Notes */}
			<div className="mt-10 border-t border-bp-line lg:mt-0">
				<ul className="divide-y divide-bp-line">
					{faqs.map((faq, index) => (
						<FaqRow
							key={faq.question}
							faq={faq}
							index={index}
							isOpen={openIndex === index}
							reduced={reduced}
							onToggle={() => toggleFAQ(index)}
						/>
					))}
				</ul>

				{/* Bottom CTAs */}
				<m.div
					{...revealProps(reduced, { delay: 0.3 })}
					className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center"
				>
					<CtaButton href="/sign-up">Get Started</CtaButton>
					<a href="mailto:support@onetool.biz">
						<Button variant="outline">Contact Support</Button>
					</a>
				</m.div>
			</div>
		</section>
	);
}

function FaqRow({
	faq,
	index,
	isOpen,
	reduced,
	onToggle,
}: {
	faq: (typeof faqs)[number];
	index: number;
	isOpen: boolean;
	reduced: boolean | null;
	onToggle: () => void;
}) {
	const triggerId = useId();
	const panelId = useId();

	const answer = (
		<div className="max-w-3xl pb-6 pr-10 text-sm leading-relaxed text-muted-foreground sm:text-base">
			{faq.answer}
		</div>
	);

	return (
		<li>
			<button
				id={triggerId}
				type="button"
				onClick={onToggle}
				aria-expanded={isOpen}
				aria-controls={panelId}
				className="flex w-full cursor-pointer items-center justify-between gap-6 py-6 text-left"
			>
				<span className="flex min-w-0 items-baseline gap-4">
					<span className="shrink-0 text-[10px] font-semibold uppercase leading-none tracking-[0.14em] tabular-nums text-muted-foreground">
						{`Note ${String(index + 1).padStart(2, "0")}`}
					</span>
					<span className="text-base font-medium leading-snug tracking-tight text-foreground sm:text-lg">
						{faq.question}
					</span>
				</span>
				<m.span
					aria-hidden="true"
					animate={{ rotate: isOpen ? 180 : 0 }}
					transition={{ duration: reduced ? 0 : 0.3 }}
					className="inline-flex h-8 w-8 shrink-0 items-center justify-center border border-bp-line text-foreground"
				>
					<ChevronDown className="h-4 w-4" />
				</m.span>
			</button>

			{reduced ? (
				isOpen ? (
					<div id={panelId} role="region" aria-labelledby={triggerId}>
						{answer}
					</div>
				) : null
			) : (
				<AnimatePresence initial={false}>
					{isOpen && (
						<m.div
							id={panelId}
							role="region"
							aria-labelledby={triggerId}
							initial={{ height: 0, opacity: 0 }}
							animate={{ height: "auto", opacity: 1 }}
							exit={{ height: 0, opacity: 0 }}
							transition={{ duration: 0.3 }}
							className="overflow-hidden"
						>
							{answer}
						</m.div>
					)}
				</AnimatePresence>
			)}
		</li>
	);
}
