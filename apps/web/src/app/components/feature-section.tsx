"use client";

import { ReactNode } from "react";
import { motion, MotionProps } from "motion/react";
import {
	Briefcase,
	Calendar,
	CreditCard,
	FileText,
	Mail,
	Shield,
	Smartphone,
	Users,
	CheckCheck,
	type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Neobrutalism Block primitive ─── */

function Block({
	className,
	children,
	...rest
}: { className?: string; children: ReactNode } & MotionProps) {
	return (
		<motion.div
			variants={{
				initial: {
					y: 6,
					opacity: 0,
					boxShadow: "0px 0px 0px var(--neo-shadow-color, rgb(24, 24, 27))",
				},
				whileInView: {
					y: 0,
					opacity: 1,
					boxShadow:
						"4px 4px 0px var(--neo-shadow-color, rgb(24, 24, 27))",
				},
			}}
			transition={{ duration: 0.35, ease: "easeOut" }}
			className={cn(
				"col-span-1 rounded-lg border-2 border-zinc-900 bg-white p-6 dark:border-zinc-300 dark:bg-zinc-900",
				"[--neo-shadow-color:rgb(24,24,27)] dark:[--neo-shadow-color:rgb(161,161,170)]",
				className
			)}
			{...rest}
		>
			{children}
		</motion.div>
	);
}

/* ─── Typography ─── */

function CardTitle({ children }: { children: string }) {
	return (
		<p className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
			{children}
		</p>
	);
}

function CardSubtitle({ children }: { children: string }) {
	return (
		<p className="mt-1.5 text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-400">
			{children}
		</p>
	);
}

/* ─── Hero Card: All-in-One Platform (wide, 2-col) ─── */

const toolBlocks: { icon: LucideIcon; bg: string; label: string }[] = [
	{ icon: Users, bg: "bg-zinc-900 dark:bg-zinc-100", label: "Clients" },
	{ icon: Briefcase, bg: "bg-emerald-500", label: "Projects" },
	{ icon: FileText, bg: "bg-sky-500", label: "Quotes" },
	{ icon: CreditCard, bg: "bg-pink-500", label: "Payments" },
	{ icon: Calendar, bg: "bg-blue-600", label: "Tasks" },
	{ icon: Mail, bg: "bg-orange-500", label: "Email" },
];

function PlatformBlock() {
	return (
		<Block className="col-span-3 overflow-hidden md:col-span-2">
			<CardTitle>Everything in one place</CardTitle>
			<CardSubtitle>
				Clients, projects, quotes, invoices, tasks, and email — all
				connected in a single platform built for field-service businesses.
			</CardSubtitle>

			<div className="relative -mx-6 -mb-6 mt-6 grid grid-cols-3 border-t-2 border-zinc-900 dark:border-zinc-300">
				{toolBlocks.map((tool, i) => (
					<div
						key={tool.label}
						className={cn(
							"grid w-full place-content-center py-8 text-white",
							tool.bg,
							i < 3 && "border-b-2 border-zinc-900 dark:border-zinc-300",
							i % 3 !== 2 &&
								"border-r-2 border-zinc-900 dark:border-zinc-300"
						)}
					>
						<tool.icon
							className={cn(
								"h-8 w-8",
								tool.bg === "bg-zinc-900 dark:bg-zinc-100"
									? "text-white dark:text-zinc-900"
									: "text-white"
							)}
						/>
					</div>
				))}
			</div>
		</Block>
	);
}

/* ─── Hero Card: Project Tracking (tall, 1-col) ─── */

const stages = [
	{ label: "Lead", count: 3, color: "bg-amber-400" },
	{ label: "In Progress", count: 5, color: "bg-sky-500" },
	{ label: "Complete", count: 12, color: "bg-emerald-500" },
];

function ProjectsBlock() {
	return (
		<Block className="col-span-3 overflow-hidden md:col-span-1">
			<div className="flex h-full flex-col justify-between gap-6">
				<div className="relative -mx-6 -mt-6 border-b-2 border-zinc-900 bg-zinc-100 p-6 dark:border-zinc-300 dark:bg-zinc-800">
					{stages.map((stage) => (
						<div key={stage.label} className="mb-3 last:mb-0">
							<div className="mb-1 flex justify-between text-xs font-medium text-zinc-600 dark:text-zinc-400">
								<span>{stage.label}</span>
								<span className="tabular-nums">{stage.count}</span>
							</div>
							<div className="h-2.5 overflow-hidden rounded-full border border-zinc-300 bg-white dark:border-zinc-600 dark:bg-zinc-700">
								<div
									className={cn("h-full rounded-full", stage.color)}
									style={{
										width: `${(stage.count / 12) * 100}%`,
									}}
								/>
							</div>
						</div>
					))}
				</div>
				<div>
					<CardTitle>Project tracking</CardTitle>
					<CardSubtitle>
						Visual pipelines from lead to completion with real-time progress across your entire team.
					</CardSubtitle>
				</div>
			</div>
		</Block>
	);
}

/* ─── Highlight cards ─── */

type HighlightProps = {
	Icon: LucideIcon;
	iconClassName: string;
	title: string;
	subtitle: string;
	comingSoon?: boolean;
};

function HighlightBlock({ Icon, iconClassName, title, subtitle, comingSoon }: HighlightProps) {
	return (
		<Block className="col-span-3 space-y-1.5 md:col-span-1">
			<div className="flex items-center gap-2">
				<Icon className={cn("h-7 w-7", iconClassName)} />
				{comingSoon && (
					<span className="rounded border-2 border-zinc-900 bg-amber-300 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-900 dark:border-zinc-300">
						Coming Soon
					</span>
				)}
			</div>
			<CardTitle>{title}</CardTitle>
			<CardSubtitle>{subtitle}</CardSubtitle>
		</Block>
	);
}

const highlights: HighlightProps[] = [
	{
		Icon: Users,
		iconClassName: "text-blue-500",
		title: "Client management",
		subtitle:
			"Store contacts, service history, and communication logs. Never miss a follow-up again.",
	},
	{
		Icon: Calendar,
		iconClassName: "text-amber-500",
		title: "Task scheduling",
		subtitle:
			"Calendar views, team assignments, and recurring tasks to keep your crew on track.",
	},
	{
		Icon: FileText,
		iconClassName: "text-emerald-600",
		title: "Quoting & invoicing",
		subtitle:
			"Generate professional estimates and invoices in seconds with built-in e-signatures.",
	},
	{
		Icon: CreditCard,
		iconClassName: "text-pink-500",
		title: "Stripe payments",
		subtitle:
			"Integrated payments with deposits, installments, and instant payouts via Stripe Connect.",
	},
	{
		Icon: Mail,
		iconClassName: "text-orange-500",
		title: "Email hub",
		subtitle:
			"Draft and respond to email threads directly within OneTool — no platform jumping.",
	},
	{
		Icon: Smartphone,
		iconClassName: "text-violet-500",
		title: "Mobile access",
		subtitle:
			"Take your projects, tasks, and clients with you on the go with the iOS companion app.",
		comingSoon: true,
	},
	{
		Icon: Shield,
		iconClassName: "text-red-500",
		title: "Role-based access",
		subtitle:
			"Distinct views for admins and employees ensure everyone sees only what they need.",
	},
	{
		Icon: Briefcase,
		iconClassName: "text-teal-500",
		title: "Workflow automation",
		subtitle:
			"Trigger actions when statuses change — send emails, update projects, and more automatically.",
		comingSoon: true,
	},
	{
		Icon: CheckCheck,
		iconClassName: "text-cyan-500",
		title: "Real-time sync",
		subtitle:
			"Every change syncs instantly across all devices. No refresh needed, ever.",
	},
];

/* ─── Section ─── */

export default function FeatureSection() {
	return (
		<section
			id="features"
			className="pt-12 pb-24 sm:pt-16 sm:pb-32 lg:pt-20 lg:pb-40 px-4 sm:px-6 lg:px-8"
		>
			<div className="mx-auto max-w-6xl">
				{/* Header */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true }}
					transition={{ duration: 0.5 }}
					className="text-center mb-12 sm:mb-16"
				>
					<p className="text-sm font-semibold text-primary mb-4">
						Streamline operations
					</p>
					<h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-foreground mb-4">
						Every Business, Every Stage,{" "}
						<span className="border-2 border-dashed border-zinc-900 dark:border-zinc-300 px-2 py-1 rounded-xl bg-primary/10 inline-block">
							OneTool.
						</span>
					</h2>
				</motion.div>

				{/* Bento Grid */}
				<motion.div
					transition={{ staggerChildren: 0.07 }}
					initial="initial"
					whileInView="whileInView"
					viewport={{ once: true, margin: "-80px" }}
					className="grid grid-cols-3 gap-4"
				>
					<PlatformBlock />
					<ProjectsBlock />
					{highlights.map((h) => (
						<HighlightBlock key={h.title} {...h} />
					))}
				</motion.div>
			</div>
		</section>
	);
}
