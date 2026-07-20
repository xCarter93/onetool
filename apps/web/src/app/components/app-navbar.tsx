"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SignInButton, SignUpButton, SignedIn, SignedOut } from "@clerk/nextjs";
import { ThemeSwitcher } from "@/components/layout/theme-switcher";
import { Button } from "@/components/ui/button";
import { AccentCTA } from "@/app/components/landing/accent-cta";
import { motion, AnimatePresence } from "motion/react";
import {
	Blocks,
	Briefcase,
	Calendar,
	ChartColumn,
	CheckCheck,
	CreditCard,
	FileText,
	Globe,
	Handshake,
	Mail,
	Shield,
	Smartphone,
	Users,
	Zap,
	type LucideIcon,
} from "lucide-react";

const navigationLinks = [
	{ href: "#features", label: "Features" },
	{ href: "#how-it-works", label: "How it Works" },
	{ href: "#faq", label: "FAQ" },
	{ href: "#pricing", label: "Pricing" },
];

const featureItems: {
	icon: LucideIcon;
	iconClassName: string;
	label: string;
	description: string;
	comingSoon?: boolean;
}[] = [
	{
		icon: Users,
		iconClassName: "text-blue-500",
		label: "Client management",
		description: "Contacts, history, and follow-ups",
	},
	{
		icon: Briefcase,
		iconClassName: "text-sky-500",
		label: "Project tracking",
		description: "Visual pipelines, lead to complete",
	},
	{
		icon: Calendar,
		iconClassName: "text-amber-500",
		label: "Task scheduling",
		description: "Calendars and team assignments",
	},
	{
		icon: FileText,
		iconClassName: "text-emerald-600",
		label: "Quoting & invoicing",
		description: "Estimates with e-signatures",
	},
	{
		icon: CreditCard,
		iconClassName: "text-pink-500",
		label: "Stripe payments",
		description: "Deposits, installments, payouts",
	},
	{
		icon: Mail,
		iconClassName: "text-orange-500",
		label: "Email hub",
		description: "Unified inbox for client threads",
	},
	{
		icon: Handshake,
		iconClassName: "text-rose-500",
		label: "Client portal",
		description: "Clients e-sign quotes & pay online",
	},
	{
		icon: Globe,
		iconClassName: "text-green-600",
		label: "Community pages",
		description: "Your free public business page",
	},
	{
		icon: ChartColumn,
		iconClassName: "text-indigo-500",
		label: "Custom report builder",
		description: "Build and export your own reports",
	},
	{
		icon: Shield,
		iconClassName: "text-red-500",
		label: "Role-based access",
		description: "Admin and employee views",
	},
	{
		icon: CheckCheck,
		iconClassName: "text-cyan-500",
		label: "Real-time sync",
		description: "Instant updates on every device",
	},
	{
		icon: Smartphone,
		iconClassName: "text-violet-500",
		label: "Mobile access",
		description: "iOS companion app",
	},
	{
		icon: Zap,
		iconClassName: "text-teal-500",
		label: "Workflow automations",
		description: "Trigger actions on status changes",
	},
	{
		icon: Blocks,
		iconClassName: "text-fuchsia-500",
		label: "QuickBooks sync",
		description: "Send invoices & payments to QuickBooks",
		comingSoon: true,
	},
];

function scrollToSection(href: string) {
	const element = document.querySelector(href);
	if (!element) return;

	const prefersReducedMotion = window.matchMedia(
		"(prefers-reduced-motion: reduce)"
	).matches;

	if (prefersReducedMotion) {
		element.scrollIntoView({ block: "start" });
		return;
	}

	// Dispatch a click on a temporary anchor so Lenis intercepts it
	const anchor = document.createElement("a");
	anchor.href = href;
	anchor.style.display = "none";
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
}

// Animated hamburger icon
function MenuIcon() {
	return (
		<svg
			className="pointer-events-none"
			width={16}
			height={16}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path
				d="M4 12L20 12"
				className="origin-center -translate-y-[7px] transition-all duration-300 ease-[cubic-bezier(.5,.85,.25,1.1)] group-aria-expanded:translate-x-0 group-aria-expanded:translate-y-0 group-aria-expanded:rotate-[315deg]"
			/>
			<path
				d="M4 12H20"
				className="origin-center transition-all duration-300 ease-[cubic-bezier(.5,.85,.25,1.8)] group-aria-expanded:rotate-45"
			/>
			<path
				d="M4 12H20"
				className="origin-center translate-y-[7px] transition-all duration-300 ease-[cubic-bezier(.5,.85,.25,1.1)] group-aria-expanded:translate-y-0 group-aria-expanded:rotate-[135deg]"
			/>
		</svg>
	);
}

function FeaturesFlyout({
	onNavigate,
}: {
	onNavigate: (href: string) => void;
}) {
	const [open, setOpen] = useState(false);

	return (
		<div
			className="relative"
			onMouseEnter={() => setOpen(true)}
			onMouseLeave={() => setOpen(false)}
		>
			<button
				onClick={() => {
					onNavigate("#features");
					setOpen(false);
				}}
				onFocus={() => setOpen(true)}
				aria-expanded={open}
				className="relative text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
			>
				Features
				<span
					style={{ transform: open ? "scaleX(1)" : "scaleX(0)" }}
					className="absolute -bottom-1.5 left-0 right-0 h-0.5 origin-left rounded-full bg-primary transition-transform duration-300 ease-out"
				/>
			</button>
			<AnimatePresence>
				{open && (
					<motion.div
						initial={{ opacity: 0, y: 12 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: 12 }}
						transition={{ duration: 0.25, ease: "easeOut" }}
						style={{ translateX: "-50%" }}
						className="absolute left-1/2 top-full pt-4"
					>
						<div className="relative w-120 lg:w-172 rounded-2xl border border-border bg-popover text-popover-foreground p-3 shadow-2xl/20">
							<div
								className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 rounded-[2px] border-l border-t border-border bg-popover"
								aria-hidden="true"
							/>
							<div className="grid grid-cols-2 lg:grid-cols-3 gap-1">
								{featureItems.map((f) => (
									<button
										key={f.label}
										onClick={() => {
											onNavigate("#features");
											setOpen(false);
										}}
										className="flex items-start gap-3 rounded-xl p-3 text-left transition-colors hover:bg-accent"
									>
										<f.icon
											className={`mt-0.5 h-4 w-4 shrink-0 ${f.iconClassName}`}
										/>
										<span>
											<span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
												{f.label}
												{f.comingSoon && (
													<span className="rounded-full bg-amber-400/15 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
														Soon
													</span>
												)}
											</span>
											<span className="block text-xs text-muted-foreground">
												{f.description}
											</span>
										</span>
									</button>
								))}
							</div>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

function AppNavBar() {
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const router = useRouter();

	return (
		<motion.header
			initial={{ y: -100 }}
			animate={{ y: 0 }}
			transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
			className="fixed top-0 min-[850px]:top-2.5 left-0 right-0 z-[9998] min-[850px]:left-1/2 min-[850px]:-translate-x-1/2 min-[850px]:w-full min-[850px]:max-w-5xl"
		>
			<nav className="bg-frame shadow-2xl/20 rounded-b-4xl md:overflow-visible max-md:overflow-hidden">
				<div className="flex items-center justify-between h-14 px-4 sm:px-6">
					{/* Logo */}
					<Link href="/" className="shrink-0">
						<Image
							src="/OneTool.png"
							alt="OneTool Logo"
							width={160}
							height={160}
							className="rounded-md dark:brightness-0 dark:invert w-[140px] sm:w-[170px]"
						/>
					</Link>

					{/* Desktop Navigation */}
					<div className="hidden md:flex items-center gap-8">
						{navigationLinks.map((link) =>
							link.href === "#features" ? (
								<FeaturesFlyout key={link.href} onNavigate={scrollToSection} />
							) : (
								<button
									key={link.href}
									onClick={() => scrollToSection(link.href)}
									className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
								>
									{link.label}
								</button>
							)
						)}
					</div>

					{/* Right side - Auth + Theme */}
					<div className="flex items-center gap-3">
						<ThemeSwitcher />
						<div className="hidden sm:flex items-center gap-2">
							<SignedOut>
								<SignInButton mode="modal" forceRedirectUrl="/home">
									<button className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5">
										Sign in
									</button>
								</SignInButton>
								<SignUpButton mode="modal" forceRedirectUrl="/home">
									<AccentCTA size="sm">
										Get Started
									</AccentCTA>
								</SignUpButton>
							</SignedOut>
							<SignedIn>
								<Button
									variant="default"
									size="sm"
									onClick={() => router.push("/home")}
								>
									Go To Dashboard
								</Button>
							</SignedIn>
						</div>

						{/* Mobile menu button */}
						<div className="md:hidden">
							<button
								className="group inline-flex items-center justify-center rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
								onClick={() => setIsMenuOpen(!isMenuOpen)}
								aria-expanded={isMenuOpen}
							>
								<MenuIcon />
							</button>
						</div>
					</div>
				</div>

				{/* Mobile Navigation */}
				<AnimatePresence>
					{isMenuOpen && (
						<motion.div
							initial={{ height: 0, opacity: 0 }}
							animate={{ height: "auto", opacity: 1 }}
							exit={{ height: 0, opacity: 0 }}
							transition={{ duration: 0.3 }}
							className="md:hidden overflow-hidden border-t border-border"
						>
							<div className="px-4 py-3 space-y-1">
								{navigationLinks.map((link) => (
									<button
										key={link.href}
										onClick={() => {
											scrollToSection(link.href);
											setIsMenuOpen(false);
										}}
										className="block w-full text-left px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
									>
										{link.label}
									</button>
								))}
								<div className="pt-3 mt-2 border-t border-border flex items-center justify-center gap-2">
									<SignedOut>
										<SignInButton mode="modal" forceRedirectUrl="/home">
											<Button variant="outline" size="sm">
												Sign In
											</Button>
										</SignInButton>
										<SignUpButton mode="modal" forceRedirectUrl="/home">
											<AccentCTA size="sm">
												Get Started
											</AccentCTA>
										</SignUpButton>
									</SignedOut>
									<SignedIn>
										<Button
											variant="default"
											size="sm"
											onClick={() => {
												router.push("/home");
												setIsMenuOpen(false);
											}}
										>
											Go To Dashboard
										</Button>
									</SignedIn>
								</div>
							</div>
						</motion.div>
					)}
				</AnimatePresence>
			</nav>

			{/* Corner decorations connecting navbar to frame - desktop only */}
			<svg
				className="absolute top-0 -left-[49px] rotate-180 text-frame pointer-events-none max-[850px]:hidden"
				width="50"
				height="50"
				viewBox="0 0 50 50"
				fill="none"
				aria-hidden="true"
			>
				<path
					d="M5.50871e-06 0C-0.00788227 37.3001 8.99616 50.0116 50 50H5.50871e-06V0Z"
					fill="currentColor"
				/>
			</svg>
			<svg
				className="absolute top-0 -right-[49px] rotate-90 text-frame pointer-events-none max-[850px]:hidden"
				width="50"
				height="50"
				viewBox="0 0 50 50"
				fill="none"
				aria-hidden="true"
			>
				<path
					d="M5.50871e-06 0C-0.00788227 37.3001 8.99616 50.0116 50 50H5.50871e-06V0Z"
					fill="currentColor"
				/>
			</svg>
		</motion.header>
	);
}

export default AppNavBar;
