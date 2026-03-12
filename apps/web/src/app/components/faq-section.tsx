"use client";

import { motion, AnimatePresence } from "motion/react";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { StyledButton } from "@/components/ui/styled/styled-button";
import { AccentCTA } from "@/app/components/landing/accent-cta";

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
			"Absolutely. OneTool is built as a responsive web application that works seamlessly on smartphones, tablets, and desktop computers. We also have a native iOS app coming soon that will allow you to view and manage your projects, tasks, and clients for each organization you're part of - all on the go. Access your data and stay productive from anywhere with an internet connection.",
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

export default function FAQSection() {
	const [openIndex, setOpenIndex] = useState<number | null>(null);

	const toggleFAQ = (index: number) => {
		setOpenIndex(openIndex === index ? null : index);
	};

	return (
		<section id="faq" className="py-24 sm:py-32 lg:py-40 px-4 sm:px-6 lg:px-8">
			<div className="mx-auto max-w-3xl">
				{/* Header */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true }}
					transition={{ duration: 0.5 }}
					className="text-center mb-12"
				>
					<p className="text-sm font-semibold text-primary mb-4">FAQ</p>
					<h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground mb-4">
						Frequently Asked Questions
					</h2>
					<p className="text-base sm:text-lg text-muted-foreground">
						Everything you need to know about OneTool
					</p>
				</motion.div>

				{/* FAQ Items */}
				<div className="space-y-3">
					{faqs.map((faq, index) => (
						<motion.div
							key={index}
							initial={{ opacity: 0, y: 20 }}
							whileInView={{ opacity: 1, y: 0 }}
							viewport={{ once: true }}
							transition={{ duration: 0.3, delay: index * 0.03 }}
							className="rounded-2xl bg-white dark:bg-black border border-border shadow-sm overflow-hidden"
						>
							<button
								onClick={() => toggleFAQ(index)}
								className="flex w-full items-center justify-between p-5 text-left transition-colors hover:bg-accent/50"
							>
								<span className="text-sm sm:text-base font-semibold text-foreground pr-4">
									{faq.question}
								</span>
								<motion.div
									animate={{ rotate: openIndex === index ? 180 : 0 }}
									transition={{ duration: 0.3 }}
									className="shrink-0"
								>
									<ChevronDown className="h-4 w-4 text-primary" />
								</motion.div>
							</button>

							<AnimatePresence>
								{openIndex === index && (
									<motion.div
										initial={{ height: 0, opacity: 0 }}
										animate={{ height: "auto", opacity: 1 }}
										exit={{ height: 0, opacity: 0 }}
										transition={{ duration: 0.3 }}
										className="overflow-hidden"
									>
										<div className="border-t border-border px-5 py-4">
											<p className="text-sm leading-relaxed text-muted-foreground">
												{faq.answer}
											</p>
										</div>
									</motion.div>
								)}
							</AnimatePresence>
						</motion.div>
					))}
				</div>

				{/* Bottom CTAs */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true }}
					transition={{ duration: 0.5, delay: 0.3 }}
					className="mt-12 text-center flex flex-col sm:flex-row items-center justify-center gap-3"
				>
					<AccentCTA href="/sign-up">Get Started</AccentCTA>
					<a href="mailto:support@onetool.biz">
						<StyledButton intent="outline">Contact Support</StyledButton>
					</a>
				</motion.div>
			</div>
		</section>
	);
}
