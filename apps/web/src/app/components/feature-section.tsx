"use client";

import { useRef } from "react";
import { motion } from "motion/react";
import {
	Briefcase,
	Calendar,
	CheckCheck,
	CreditCard,
	FileText,
	Mail,
	Shield,
	Smartphone,
	Users,
} from "lucide-react";
import {
	ParticleCard,
	GlobalSpotlight,
	useMobileDetection,
} from "@/components/MagicBento";

const GLOW_COLOR = "0, 166, 244";

/* ─── Mini visual elements for each card ─── */

function ClientsVisual() {
	return (
		<div className="mt-6 space-y-2">
			{[
				{ name: "Sarah Johnson", role: "Property Owner" },
				{ name: "Mike Chen", role: "Business Manager" },
				{ name: "Lisa Park", role: "Site Contact" },
			].map((client) => (
				<div
					key={client.name}
					className="flex items-center gap-3 rounded-xl bg-background/50 px-3 py-2"
				>
					<div className="h-8 w-8 shrink-0 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium text-primary">
						{client.name[0]}
					</div>
					<div className="min-w-0">
						<p className="text-xs font-medium text-foreground truncate">
							{client.name}
						</p>
						<p className="text-[10px] text-muted-foreground">
							{client.role}
						</p>
					</div>
				</div>
			))}
		</div>
	);
}

function ProjectsVisual() {
	return (
		<div className="mt-4 space-y-3">
			{["Lead", "In Progress", "Complete"].map((stage, i) => (
				<div key={stage}>
					<div className="flex justify-between text-[10px] text-muted-foreground mb-1">
						<span>{stage}</span>
						<span>{[3, 5, 8][i]}</span>
					</div>
					<div className="h-1.5 rounded-full bg-background/50 overflow-hidden">
						<div
							className="h-full rounded-full bg-primary/50"
							style={{ width: `${[25, 45, 75][i]}%` }}
						/>
					</div>
				</div>
			))}
		</div>
	);
}

function QuotingVisual() {
	return (
		<div className="mt-4 rounded-xl bg-background/50 p-3 space-y-2">
			<div className="flex justify-between text-[10px]">
				<span className="text-muted-foreground">Quote #Q-000042</span>
				<span className="text-primary font-medium">Approved</span>
			</div>
			<div className="space-y-1">
				{[
					["Lawn Maintenance", "$120.00"],
					["Hedge Trimming", "$80.00"],
					["Mulch Application", "$160.00"],
				].map(([item, price]) => (
					<div
						key={item}
						className="flex justify-between text-[10px] text-muted-foreground"
					>
						<span>{item}</span>
						<span className="tabular-nums">{price}</span>
					</div>
				))}
			</div>
			<div className="border-t border-border/50 pt-1 flex justify-between text-[10px] font-medium text-foreground">
				<span>Total</span>
				<span>$360.00</span>
			</div>
		</div>
	);
}

function TasksVisual() {
	const days = Array.from({ length: 28 }, (_, i) => i + 1);
	const highlighted = [3, 7, 12, 15, 18, 22, 25];
	return (
		<div className="mt-4">
			<div className="grid grid-cols-7 gap-0.5">
				{["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
					<div
						key={`${d}-${i}`}
						className="text-[8px] text-center text-muted-foreground font-medium pb-0.5"
					>
						{d}
					</div>
				))}
				{days.map((day) => (
					<div
						key={day}
						className={`aspect-square rounded text-[8px] flex items-center justify-center ${
							highlighted.includes(day)
								? "bg-primary/20 text-primary font-medium"
								: "text-muted-foreground/50"
						}`}
					>
						{day}
					</div>
				))}
			</div>
		</div>
	);
}

function StripeVisual() {
	const bars = [65, 40, 80, 55, 90, 70];
	return (
		<div className="mt-4 flex items-end gap-1.5 h-16">
			{bars.map((height, i) => (
				<div
					key={i}
					className="flex-1 rounded-t bg-primary/25"
					style={{ height: `${height}%` }}
				/>
			))}
		</div>
	);
}

function EmailVisual() {
	return (
		<div className="mt-4 space-y-1.5">
			{[
				{ subject: "Re: Project update", unread: true },
				{ subject: "Invoice sent", unread: false },
				{ subject: "New quote request", unread: true },
			].map((email) => (
				<div
					key={email.subject}
					className="flex items-center gap-2 rounded-lg bg-background/50 px-2.5 py-1.5"
				>
					<div
						className={`h-1.5 w-1.5 shrink-0 rounded-full ${email.unread ? "bg-primary" : "bg-transparent"}`}
					/>
					<span
						className={`text-[10px] truncate ${email.unread ? "font-medium text-foreground" : "text-muted-foreground"}`}
					>
						{email.subject}
					</span>
				</div>
			))}
		</div>
	);
}

function MobileVisual() {
	return (
		<div className="mt-4 flex justify-center">
			<div className="w-20 rounded-xl border border-border/50 bg-background/50 p-1.5">
				<div className="h-1 w-6 mx-auto rounded-full bg-muted-foreground/20 mb-1.5" />
				<div className="space-y-1">
					<div className="h-2 rounded bg-primary/20" />
					<div className="h-2 w-3/4 rounded bg-muted-foreground/10" />
					<div className="h-2 w-1/2 rounded bg-muted-foreground/10" />
					<div className="h-4 rounded bg-primary/10 mt-1" />
				</div>
			</div>
		</div>
	);
}

function RolesVisual() {
	return (
		<div className="mt-4 grid grid-cols-2 gap-2">
			<div className="rounded-xl bg-background/50 p-2.5">
				<div className="flex items-center gap-2 mb-2">
					<div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center">
						<Shield className="h-2.5 w-2.5 text-primary" />
					</div>
					<span className="text-[10px] font-medium text-foreground">
						Admin
					</span>
				</div>
				<div className="space-y-0.5">
					{["Dashboard", "Settings", "Billing"].map((p) => (
						<div
							key={p}
							className="flex items-center gap-1 text-[9px] text-muted-foreground"
						>
							<CheckCheck className="h-2.5 w-2.5 text-primary/60" />
							{p}
						</div>
					))}
				</div>
			</div>
			<div className="rounded-xl bg-background/50 p-2.5">
				<div className="flex items-center gap-2 mb-2">
					<div className="h-5 w-5 rounded-full bg-muted-foreground/10 flex items-center justify-center">
						<Users className="h-2.5 w-2.5 text-muted-foreground" />
					</div>
					<span className="text-[10px] font-medium text-foreground">
						Member
					</span>
				</div>
				<div className="space-y-0.5">
					{["Projects", "Tasks", "Clients"].map((p) => (
						<div
							key={p}
							className="flex items-center gap-1 text-[9px] text-muted-foreground"
						>
							<CheckCheck className="h-2.5 w-2.5 text-primary/60" />
							{p}
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

/* ─── Feature data ─── */

const features = [
	{
		title: "Client Management",
		description:
			"Store comprehensive client data including contact info, service history, and communication logs. Never miss a follow-up.",
		icon: Users,
		gridClass: "sm:col-span-2 sm:row-span-2",
		Visual: ClientsVisual,
	},
	{
		title: "Project Tracking",
		description:
			"Visual Kanban boards and list views help you manage projects from lead to completion with real-time progress.",
		icon: Briefcase,
		gridClass: "",
		Visual: ProjectsVisual,
	},
	{
		title: "Quoting & Invoicing",
		description:
			"Generate professional estimates and invoices in seconds. E-signatures for quick approvals.",
		icon: FileText,
		gridClass: "",
		Visual: QuotingVisual,
	},
	{
		title: "Task Scheduling",
		description:
			"Calendar views, assignments, and recurring tasks to keep your team on track.",
		icon: Calendar,
		gridClass: "",
		Visual: TasksVisual,
	},
	{
		title: "Stripe Connect",
		description:
			"Integrated payments with recurring billing, deposits, and instant payouts via Stripe.",
		icon: CreditCard,
		gridClass: "",
		Visual: StripeVisual,
	},
	{
		title: "Email Hub",
		description:
			"Draft and respond to email threads directly within OneTool — no platform jumping.",
		icon: Mail,
		gridClass: "",
		Visual: EmailVisual,
	},
	{
		title: "Mobile Access",
		description:
			"Take your projects, tasks, and clients with you on the go with our upcoming iOS app.",
		icon: Smartphone,
		gridClass: "",
		Visual: MobileVisual,
	},
	{
		title: "Role-Based Access",
		description:
			"Distinct views between admins and employees ensure everyone sees only what they need.",
		icon: Shield,
		gridClass: "sm:col-span-2",
		Visual: RolesVisual,
	},
];

/* ─── Section ─── */

export default function FeatureSection() {
	const gridRef = useRef<HTMLDivElement>(null);
	const isMobile = useMobileDetection();

	return (
		<section
			id="features"
			className="pt-12 pb-24 sm:pt-16 sm:pb-32 lg:pt-20 lg:pb-40 px-4 sm:px-6 lg:px-8"
		>
			{/* Glow effect CSS */}
			<style>{`
				.feature-card-glow::after {
					content: '';
					position: absolute;
					inset: 0;
					padding: 6px;
					background: radial-gradient(var(--glow-radius, 200px) circle at var(--glow-x, 50%) var(--glow-y, 50%),
						rgba(${GLOW_COLOR}, calc(var(--glow-intensity, 0) * 0.6)) 0%,
						rgba(${GLOW_COLOR}, calc(var(--glow-intensity, 0) * 0.3)) 30%,
						transparent 60%);
					border-radius: inherit;
					mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
					mask-composite: subtract;
					-webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
					-webkit-mask-composite: xor;
					pointer-events: none;
					z-index: 1;
				}
				.feature-card-glow:hover {
					box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08), 0 0 20px rgba(${GLOW_COLOR}, 0.12);
				}
			`}</style>

			<div className="mx-auto max-w-7xl">
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
						<span className="border border-dashed border-primary px-2 py-1 rounded-xl bg-primary/10 inline-block">
							OneTool.
						</span>
					</h2>
				</motion.div>

				{/* Bento Grid */}
				<div
					ref={gridRef}
					className="bento-section relative select-none"
				>
					<GlobalSpotlight
						gridRef={gridRef}
						disableAnimations={isMobile}
						glowColor={GLOW_COLOR}
					/>

					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
						{features.map((feature, index) => (
							<motion.div
								key={feature.title}
								initial={{ opacity: 0, y: 30 }}
								whileInView={{ opacity: 1, y: 0 }}
								viewport={{ once: true, margin: "-50px" }}
								transition={{
									duration: 0.5,
									delay: index * 0.08,
								}}
								className={feature.gridClass}
							>
								<ParticleCard
									className="card feature-card-glow h-full rounded-3xl p-6 sm:p-8 border border-border/30 bg-card-secondary transition-shadow duration-300"
									disableAnimations={isMobile}
									particleCount={0}
									glowColor={GLOW_COLOR}
									enableTilt
									clickEffect={false}
									enableMagnetism={false}
								>
									<div className="relative z-10">
										<div className="mb-4 inline-flex items-center justify-center rounded-2xl bg-primary/10 p-3">
											<feature.icon className="h-6 w-6 text-primary" />
										</div>
										<h3 className="text-lg font-semibold text-foreground mb-2">
											{feature.title}
										</h3>
										<p className="text-sm text-muted-foreground leading-relaxed">
											{feature.description}
										</p>
										<feature.Visual />
									</div>
								</ParticleCard>
							</motion.div>
						))}
					</div>
				</div>
			</div>
		</section>
	);
}
