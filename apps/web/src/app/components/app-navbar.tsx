"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SignInButton, SignedIn, SignedOut } from "@clerk/nextjs";
import { ThemeSwitcher } from "@/components/layout/theme-switcher";
import { Button } from "@/components/ui/button";
import { CtaButton } from "@/app/components/landing/cta-button";
import Image from "next/image";
import { m, AnimatePresence, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import {
	BarChart3,
	BookOpen,
	CalendarDays,
	FileSignature,
	LifeBuoy,
	Map,
	Receipt,
	Rocket,
	Sparkles,
	Users,
	Zap,
	type LucideIcon,
} from "lucide-react";
import { chapterAnchor } from "@/app/components/landing/feature-anchors";

const navigationLinks = [
	{ href: "#features", label: "Features" },
	{ href: "/help", label: "Resources" },
	{ href: "#how-it-works", label: "How it Works" },
	{ href: "#pricing", label: "Pricing" },
	{ href: "#faq", label: "FAQ" },
];

const resourceItems: {
	icon: LucideIcon;
	label: string;
	description: string;
	href: string;
}[] = [
	{
		icon: BookOpen,
		label: "Help Center",
		description: "Guides for every part of OneTool",
		href: "/help",
	},
	{
		icon: Rocket,
		label: "Getting started",
		description: "Set up OneTool step by step",
		href: "/help/getting-started",
	},
	{
		icon: LifeBuoy,
		label: "Contact support",
		description: "Email our team for a hand",
		href: "mailto:support@onetool.biz",
	},
];

const legalItems = [
	{ label: "Terms of Service", href: "/terms-of-service" },
	{ label: "Privacy Policy", href: "/privacy-policy" },
	{ label: "Data Security", href: "/data-security" },
];

/** Full capability list. Anchors resolve to the feature chapters (A-101…A-107),
    so every row lands on the scene that demos it. Copy is agent-draft, pending
    Patrick. */
const featureItems: {
	icon: LucideIcon;
	label: string;
	description: string;
	href: string;
}[] = [
	{
		icon: Users,
		label: "Clients & CRM",
		description: "Every client, contact, and property in one place",
		href: `#${chapterAnchor("clients")}`,
	},
	{
		icon: FileSignature,
		label: "Quotes & e-sign",
		description: "Send quotes clients sign from their phone",
		href: `#${chapterAnchor("portal-approve")}`,
	},
	{
		icon: Receipt,
		label: "Invoices & payments",
		description: "Flip the quote to an invoice, get paid online",
		href: `#${chapterAnchor("invoice-paid")}`,
	},
	{
		icon: CalendarDays,
		label: "Scheduling & tasks",
		description: "A day plan your crew actually runs",
		href: `#${chapterAnchor("tasks")}`,
	},
	{
		icon: Map,
		label: "Route planning",
		description: "Stops become an optimized route",
		href: `#${chapterAnchor("routing")}`,
	},
	{
		icon: Zap,
		label: "Automations",
		description: "Rules that run while you sleep",
		href: `#${chapterAnchor("automations")}`,
	},
	{
		icon: Sparkles,
		label: "AI assistant",
		description: "Ask in plain English, it does the work",
		href: `#${chapterAnchor("assistant")}`,
	},
	{
		icon: BarChart3,
		label: "Reports",
		description: "Live numbers without the spreadsheet",
		href: `#${chapterAnchor("reports")}`,
	},
];

/** The landing surface's canonical deceleration, matching `--ease-out-quint`. */
const EASE_OUT_QUINT = [0.23, 1, 0.32, 1] as const;

/** Pill-row geometry, shared so plain links and both flyout triggers align. */
const NAV_ITEM =
	"rounded-full px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background";

/** Underline is inset to the label, not the pill padding. */
const NAV_UNDERLINE =
	"absolute inset-x-4 bottom-0.5 h-0.5 origin-left rounded-full bg-primary transition-transform duration-300 ease-out";

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
				className="origin-center transition-all duration-300 ease-[cubic-bezier(.5,.85,.25,1.1)] group-aria-expanded:rotate-45"
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
	const reduced = useReducedMotion();
	const panelId = useId();
	const triggerRef = useRef<HTMLButtonElement>(null);

	function close(refocus = false) {
		setOpen(false);
		if (refocus) triggerRef.current?.focus();
	}

	return (
		<div
			className="relative"
			onMouseEnter={() => setOpen(true)}
			onMouseLeave={() => setOpen(false)}
			onKeyDown={(e) => {
				if (e.key === "Escape" && open) {
					e.stopPropagation();
					close(true);
				}
			}}
			// Moving focus outside the trigger/panel dismisses it.
			onBlur={(e) => {
				if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
					setOpen(false);
				}
			}}
		>
			<button
				ref={triggerRef}
				onClick={() => {
					onNavigate("#features");
					setOpen(false);
				}}
				onFocus={() => setOpen(true)}
				aria-expanded={open}
				aria-controls={panelId}
				className={cn("relative", NAV_ITEM)}
			>
				Features
				<span
					style={{ transform: open ? "scaleX(1)" : "scaleX(0)" }}
					className={NAV_UNDERLINE}
				/>
			</button>
			<AnimatePresence>
				{open && (
					<m.div
						initial={reduced ? false : { opacity: 0, y: 12 }}
						animate={{ opacity: 1, y: 0 }}
						exit={reduced ? { opacity: 1 } : { opacity: 0, y: 12 }}
						transition={{ duration: reduced ? 0 : 0.25, ease: EASE_OUT_QUINT }}
						style={{ translateX: "-50%" }}
						className="absolute left-1/2 top-full pt-4"
					>
						{/* Full capability grid — each row lands on its feature chapter. */}
						<div
							id={panelId}
							className="relative w-[34rem] lg:w-[38rem] rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl/20"
						>
							<div
								className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 rounded-[2px] border-l border-t border-border bg-popover"
								aria-hidden="true"
							/>
							<div className="grid grid-cols-2 gap-1 p-3">
								{featureItems.map((item) => (
									<button
										key={item.label}
										onClick={() => {
											onNavigate(item.href);
											close();
										}}
										className="group flex items-start gap-3 rounded-xl p-3 text-left transition-colors hover:bg-accent focus-visible:bg-accent"
									>
										<span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
											<item.icon className="h-4.5 w-4.5" />
										</span>
										<span className="min-w-0">
											<span className="block text-sm font-semibold leading-5 text-foreground">
												{item.label}
											</span>
											<span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
												{item.description}
											</span>
										</span>
									</button>
								))}
							</div>
							<button
								onClick={() => {
									onNavigate("#how-it-works");
									close();
								}}
								className="flex w-full items-center justify-between rounded-b-2xl border-t border-border px-6 py-3.5 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
							>
								Watch a job run through it
								<span aria-hidden="true" className="text-primary">
									→
								</span>
							</button>
						</div>
					</m.div>
				)}
			</AnimatePresence>
		</div>
	);
}

function ResourcesFlyout() {
	const [open, setOpen] = useState(false);
	const reduced = useReducedMotion();
	const panelId = useId();
	const triggerRef = useRef<HTMLAnchorElement>(null);

	return (
		<div
			className="relative"
			onMouseEnter={() => setOpen(true)}
			onMouseLeave={() => setOpen(false)}
			// Same dismissal contract as FeaturesFlyout: Escape closes and
			// refocuses the trigger; focus leaving the boundary closes.
			onKeyDown={(e) => {
				if (e.key === "Escape" && open) {
					e.stopPropagation();
					setOpen(false);
					triggerRef.current?.focus();
				}
			}}
			onBlur={(e) => {
				if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
					setOpen(false);
				}
			}}
		>
			<Link
				href="/help"
				ref={triggerRef}
				onClick={() => setOpen(false)}
				onFocus={() => setOpen(true)}
				aria-expanded={open}
				aria-controls={panelId}
				className={cn("relative", NAV_ITEM)}
			>
				Resources
				<span
					style={{ transform: open ? "scaleX(1)" : "scaleX(0)" }}
					className={NAV_UNDERLINE}
				/>
			</Link>
			<AnimatePresence>
				{open && (
					<m.div
						initial={reduced ? false : { opacity: 0, y: 12 }}
						animate={{ opacity: 1, y: 0 }}
						exit={reduced ? { opacity: 1 } : { opacity: 0, y: 12 }}
						transition={{ duration: reduced ? 0 : 0.25, ease: EASE_OUT_QUINT }}
						style={{ translateX: "-50%" }}
						className="absolute left-1/2 top-full pt-4"
					>
						<div
							id={panelId}
							className="relative w-108 rounded-2xl border border-border bg-popover text-popover-foreground p-3 shadow-2xl/20"
						>
							<div
								className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 rounded-[2px] border-l border-t border-border bg-popover"
								aria-hidden="true"
							/>
							<div className="grid grid-cols-[1.5fr_1fr] gap-1">
								<div>
									<p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
										Support
									</p>
									{resourceItems.map((item) => {
										const inner = (
											<>
												<span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
													<item.icon className="h-4.5 w-4.5" />
												</span>
												<span>
													<span className="block text-sm font-medium text-foreground">
														{item.label}
													</span>
													<span className="block text-xs text-muted-foreground">
														{item.description}
													</span>
												</span>
											</>
										);
										const itemClassName =
											"flex items-start gap-3 rounded-xl p-3 text-left transition-colors hover:bg-accent";
										return item.href.startsWith("/") ? (
											<Link
												key={item.label}
												href={item.href}
												onClick={() => setOpen(false)}
												className={itemClassName}
											>
												{inner}
											</Link>
										) : (
											<a
												key={item.label}
												href={item.href}
												onClick={() => setOpen(false)}
												className={itemClassName}
											>
												{inner}
											</a>
										);
									})}
								</div>
								<div className="border-l border-border pl-4">
									<p className="pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
										Legal
									</p>
									{legalItems.map((item) => (
										<Link
											key={item.label}
											href={item.href}
											onClick={() => setOpen(false)}
											className="block rounded-lg py-2 pr-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
										>
											{item.label}
										</Link>
									))}
								</div>
							</div>
						</div>
					</m.div>
				)}
			</AnimatePresence>
		</div>
	);
}

function AppNavBar() {
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const [isScrolled, setIsScrolled] = useState(false);
	const router = useRouter();
	const reduced = useReducedMotion();

	useEffect(() => {
		const handleScroll = () => setIsScrolled(window.scrollY > 8);
		// rAF rather than a direct call: setState in an effect body is a lint error,
		// and a restored scroll position must still resolve on first paint.
		const raf = requestAnimationFrame(handleScroll);
		window.addEventListener("scroll", handleScroll, { passive: true });
		return () => {
			cancelAnimationFrame(raf);
			window.removeEventListener("scroll", handleScroll);
		};
	}, []);

	// `body.nav-open` lets global CSS hide the sheet corner ticks behind the panel.
	useEffect(() => {
		if (!isMenuOpen) return;

		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		document.body.classList.add("nav-open");

		return () => {
			document.body.style.overflow = previousOverflow;
			document.body.classList.remove("nav-open");
		};
	}, [isMenuOpen]);

	return (
		<header className="sticky top-0 z-50 border-b border-bp-guide-strong bg-bp-paper/95 backdrop-blur supports-backdrop-filter:bg-bp-paper/80">
			{/* 7px ticks straddling the shell rails, same as every section corner. */}
			<span
				aria-hidden="true"
				data-section-corner
				className="pointer-events-none absolute bottom-0 left-0 z-10 h-[7px] w-[7px] -translate-x-1/2 translate-y-1/2 border border-bp-guide-strong bg-bp-paper"
			/>
			<span
				aria-hidden="true"
				data-section-corner
				className="pointer-events-none absolute bottom-0 right-0 z-10 h-[7px] w-[7px] translate-x-1/2 translate-y-1/2 border border-bp-guide-strong bg-bp-paper"
			/>

			<div className="flex h-16 sm:h-20 items-center justify-between px-4 sm:px-6 lg:px-8">
				{/* Logo */}
				<Link
					href="/"
					aria-label="OneTool home"
					className="enter flex shrink-0 items-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
				>
					<Image
						src="/OneTool.png"
						alt="OneTool Logo"
						width={160}
						height={160}
						className="rounded-md dark:brightness-0 dark:invert w-[140px] sm:w-[170px]"
					/>
				</Link>

				{/* Desktop navigation — the pill loses its fill once the page moves. */}
				<nav
					aria-label="Primary navigation"
					className={cn(
						"hidden items-center gap-1 rounded-full px-2 py-1.5 transition-[background-color] duration-300 ease-out md:flex",
						isScrolled ? "bg-transparent" : "bg-muted"
					)}
				>
					{navigationLinks.map((link, i) =>
						link.href === "#features" ? (
							<FeaturesFlyout key={link.href} onNavigate={scrollToSection} />
						) : link.href === "/help" ? (
							<ResourcesFlyout key={link.href} />
						) : (
							<button
								key={link.href}
								onClick={() => scrollToSection(link.href)}
								style={{ ["--enter-delay" as string]: `${80 + i * 60}ms` }}
								className={cn("enter", NAV_ITEM)}
							>
								{link.label}
							</button>
						)
					)}
				</nav>

				{/* Right side - Auth + Theme */}
				<div className="flex items-center gap-3">
					<ThemeSwitcher />
					<div className="hidden sm:flex items-center gap-2">
						<SignedOut>
							<SignInButton mode="modal" forceRedirectUrl="/home">
								<button
									style={{ ["--enter-delay" as string]: "260ms" }}
									className={cn("enter", NAV_ITEM)}
								>
									Sign in
								</button>
							</SignInButton>
							<CtaButton size="sm" href="/sign-up" showArrow={false}>
								Get Started
							</CtaButton>
						</SignedOut>
						<SignedIn>
							<CtaButton
								size="sm"
								showArrow={false}
								onClick={() => router.push("/home")}
							>
								Go To Dashboard
							</CtaButton>
						</SignedIn>
					</div>

					{/* Mobile menu button */}
					<div className="md:hidden">
						<button
							// min-h/w-11 pads the tap target to 44px without resizing the glyph.
						className="group inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
							onClick={() => setIsMenuOpen(!isMenuOpen)}
							aria-expanded={isMenuOpen}
							aria-label={
								isMenuOpen ? "Close navigation menu" : "Open navigation menu"
							}
						>
							<MenuIcon />
						</button>
					</div>
				</div>
			</div>

			{/* Mobile Navigation */}
			<AnimatePresence>
				{isMenuOpen && (
					// grid-template-rows 0fr→1fr, never height:auto — Framer cannot
					// interpolate `auto`, so it measures every frame and thrashes layout.
					<m.div
						initial={{ gridTemplateRows: "0fr", opacity: 0 }}
						animate={{ gridTemplateRows: "1fr", opacity: 1 }}
						exit={{ gridTemplateRows: "0fr", opacity: 0 }}
						transition={{ duration: reduced ? 0 : 0.3, ease: EASE_OUT_QUINT }}
						className="grid md:hidden overflow-hidden border-t border-bp-guide-strong bg-bp-paper"
					>
						{/* Body scroll is locked while open — the panel itself must scroll
						    or short viewports (landscape phones) lose the lower links. */}
						{/* min-h-0 is load-bearing: a grid item's auto minimum would refuse
						    to shrink to the 0fr row. */}
						<div className="min-h-0 max-h-[calc(100dvh-4rem)] sm:max-h-[calc(100dvh-5rem)] overflow-y-auto px-4 py-3 space-y-1">
							{navigationLinks.map((link) =>
								link.href === "/help" ? (
									<Link
										key={link.href}
										href="/help"
										onClick={() => setIsMenuOpen(false)}
										className="block w-full text-left px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
									>
										Help Center
									</Link>
								) : (
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
								)
							)}
							<div className="pt-3 mt-2 border-t border-bp-line flex items-center justify-center gap-2">
								<SignedOut>
									<SignInButton mode="modal" forceRedirectUrl="/home">
										<Button variant="outline" size="sm">
											Sign In
										</Button>
									</SignInButton>
									<CtaButton
										size="sm"
										href="/sign-up"
										showArrow={false}
										className="w-full sm:w-auto"
									>
										Get Started
									</CtaButton>
								</SignedOut>
								<SignedIn>
									<CtaButton
										size="sm"
										showArrow={false}
										onClick={() => {
											router.push("/home");
											setIsMenuOpen(false);
										}}
									>
										Go To Dashboard
									</CtaButton>
								</SignedIn>
							</div>
						</div>
					</m.div>
				)}
			</AnimatePresence>
		</header>
	);
}

export default AppNavBar;
