"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import {
	Building2,
	Users,
	ClipboardList,
	FileText,
	CreditCard,
} from "lucide-react";
import { AccentCTA } from "@/app/components/landing/accent-cta";
import type { ReactNode } from "react";

const steps = [
	{
		icon: Building2,
		title: "Create your Organization",
		description:
			"Sign up and set up your workspace in seconds. Invite team members, assign roles, and configure your branding.",
	},
	{
		icon: Users,
		title: "Build your Client Base",
		description:
			"Add your clients and their properties. Import existing data with CSV or add them one by one.",
	},
	{
		icon: ClipboardList,
		title: "Outline and Deliver",
		description:
			"Create projects, break them into tasks, and track progress. Schedule work and manage your team's time.",
	},
	{
		icon: FileText,
		title: "Quote and Invoice",
		description:
			"Send professional quotes for client approval with e-signatures. Convert approved quotes to invoices with one click.",
	},
	{
		icon: CreditCard,
		title: "Get Paid",
		description:
			"Accept payments through Stripe directly to your account. Split invoices into installments and track every dollar.",
	},
];

function StepItem({
	step,
	isLast,
}: {
	step: (typeof steps)[0];
	isLast: boolean;
}): ReactNode {
	const Icon = step.icon;

	return (
		<div className={`relative flex gap-5 ${isLast ? "" : "pb-48 sm:pb-64"}`}>
			<div
				className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary"
				aria-hidden="true"
			>
				<Icon className="h-5 w-5 text-primary-foreground" strokeWidth={2} />
			</div>

			<div className="pt-1">
				<h3 className="text-xl font-semibold text-foreground sm:text-2xl">
					{step.title}
				</h3>
				<p className="mt-2 max-w-sm text-base leading-relaxed text-muted-foreground">
					{step.description}
				</p>
			</div>
		</div>
	);
}

export default function HowItWorks(): ReactNode {
	const containerRef = useRef<HTMLDivElement>(null);

	const { scrollYProgress } = useScroll({
		target: containerRef,
		offset: ["start 0.3", "end 0.7"],
	});

	const lineHeight = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);

	return (
		<section id="how-it-works" ref={containerRef} className="relative w-full bg-background">
			<div className="mx-auto grid max-w-5xl gap-12 px-6 py-20 sm:py-28 lg:grid-cols-2 lg:gap-20">
				<div className="lg:sticky lg:top-48 lg:h-fit lg:self-start">
					<h2 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
						How it{" "}
						<span className="border border-dashed border-primary px-2 py-1 rounded-xl bg-primary/10 inline-block">
							works
						</span>
					</h2>
					<p className="mt-6 max-w-md text-lg leading-relaxed text-muted-foreground">
						Get up and running in minutes. OneTool is designed to
						simplify your workflow so you can focus on what matters
						— your business.
					</p>
					<div className="mt-8">
						<AccentCTA href="/sign-up">Get Started</AccentCTA>
					</div>
				</div>

				<div className="relative">
					{/* Background track */}
					<div
						className="absolute left-6 top-6 h-[calc(100%-9rem)] w-0.5 -translate-x-1/2 bg-border"
						aria-hidden="true"
					>
						{/* Scroll-driven progress fill */}
						<motion.div
							style={{ height: lineHeight, willChange: "height" }}
							className="w-full bg-primary"
						/>
					</div>

					<ol className="relative list-none p-0 m-0">
						{steps.map((step, index) => (
							<li key={step.title}>
								<StepItem
									step={step}
									isLast={index === steps.length - 1}
								/>
							</li>
						))}
					</ol>
				</div>
			</div>
		</section>
	);
}
