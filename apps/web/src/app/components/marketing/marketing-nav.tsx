"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { SignInButton, SignedIn, SignedOut } from "@clerk/nextjs";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
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
import { ThemeSwitcher } from "@/components/layout/theme-switcher";
import { cn } from "@/lib/utils";
import { openReelLightbox } from "./reel-cta";

const LINKS = [
	{ href: "#one-place", label: "Why change" },
	{ href: "#loop", label: "How it works" },
	{ href: "#work", label: "What's inside" },
	{ href: "#compare", label: "Compare" },
	{ href: "#pricing", label: "Pricing" },
];

/** Desktop drops "What's inside" — the Features trigger owns #work there. */
const DESKTOP_LINKS = LINKS.filter((link) => link.href !== "#work");

const LINK_CLASS =
	"rounded-lg px-3 py-2 text-sm font-medium text-(--ink-2) transition-colors hover:bg-(--rule) hover:text-(--ink) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink)";

type FlyoutItem = {
	icon: LucideIcon;
	label: string;
	description: string;
	href: string;
};

/* Every row lands on a section that actually exists on this page — no invented
 * anchors. Several capabilities share a section; that's honest, not a bug. */
const FEATURE_ITEMS: FlyoutItem[] = [
	{
		icon: Users,
		label: "Clients & CRM",
		description: "Every client, contact, and property in one place",
		href: "#work",
	},
	{
		icon: FileSignature,
		label: "Quotes & e-sign",
		description: "Send quotes clients sign from their phone",
		href: "#try-it",
	},
	{
		icon: Receipt,
		label: "Invoices & payments",
		description: "Flip the quote to an invoice, get paid online",
		href: "#money-time",
	},
	{
		icon: CalendarDays,
		label: "Scheduling & tasks",
		description: "A day plan your crew actually runs",
		href: "#work",
	},
	{
		icon: Map,
		label: "Route planning",
		description: "Stops become an optimized route",
		href: "#phone",
	},
	{
		icon: Zap,
		label: "Automations",
		description: "Rules that run while you sleep",
		href: "#loop",
	},
	{
		icon: Sparkles,
		label: "AI assistant",
		description: "Ask in plain English, it does the work",
		href: "#work",
	},
	{
		icon: BarChart3,
		label: "Reports",
		description: "Live numbers without the spreadsheet",
		href: "#numbers",
	},
];

const RESOURCE_ITEMS: FlyoutItem[] = [
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

const LEGAL_ITEMS = [
	{ label: "Terms of Service", href: "/terms-of-service" },
	{ label: "Privacy Policy", href: "/privacy-policy" },
	{ label: "Data Security", href: "/data-security" },
];

/** `--ease-out-quint`, the landing's canonical deceleration. */
const EASE_OUT_QUINT = [0.23, 1, 0.32, 1] as const;

/** Underline is inset to the label, not the pill padding. */
const NAV_UNDERLINE =
	"pointer-events-none absolute inset-x-3 bottom-1 h-[2px] origin-left rounded-full bg-(--accent) transition-transform duration-300 ease-out";

/** Flyouts float above the sheet, so the one elevation token belongs here. */
const PANEL_CLASS =
	"rounded-[14px] border border-(--rule-2) bg-(--sheet) shadow-(--lp-shadow)";
const EYEBROW_CLASS =
	"font-mono text-[10.5px] font-medium uppercase tracking-[0.12em] text-(--ink-3)";
const ROW_CLASS =
	"flex items-start gap-3 rounded-[9px] p-3 text-left transition-colors hover:bg-(--paper) focus-visible:bg-(--paper) focus-visible:outline-none";
const TILE_CLASS =
	"mt-px flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] border border-(--rule) bg-(--accent-wash) text-(--accent-ink)";

/** Shared open/close contract: hover, focus, Escape-to-refocus, blur-out. */
function useFlyout<T extends HTMLElement>() {
	const [open, setOpen] = useState(false);
	const triggerRef = useRef<T>(null);
	const panelId = useId();

	const boundaryProps = {
		className: "relative",
		onMouseEnter: () => setOpen(true),
		onMouseLeave: () => setOpen(false),
		onKeyDown: (e: React.KeyboardEvent) => {
			if (e.key === "Escape" && open) {
				e.stopPropagation();
				setOpen(false);
				triggerRef.current?.focus();
			}
		},
		// Moving focus outside the trigger/panel dismisses it.
		onBlur: (e: React.FocusEvent) => {
			if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
				setOpen(false);
			}
		},
	};

	return { open, setOpen, triggerRef, panelId, boundaryProps };
}

/* Side-anchored, not centered: at the 1024px `lg` breakpoint a centered 38rem
 * panel runs off the viewport and the page root's overflow-x-clip eats it. */
function FlyoutPanel({
	open,
	align,
	children,
}: {
	open: boolean;
	align: "left" | "right";
	children: React.ReactNode;
}) {
	const reduced = useReducedMotion();

	return (
		<AnimatePresence>
			{open && (
				<motion.div
					initial={reduced ? false : { opacity: 0, y: 12 }}
					animate={{ opacity: 1, y: 0 }}
					exit={reduced ? { opacity: 1 } : { opacity: 0, y: 12 }}
					transition={{ duration: reduced ? 0 : 0.25, ease: EASE_OUT_QUINT }}
					className={cn(
						"absolute top-full z-10 pt-3",
						align === "left" ? "left-0" : "right-0"
					)}
				>
					{children}
				</motion.div>
			)}
		</AnimatePresence>
	);
}

function FeaturesFlyout() {
	const { open, setOpen, triggerRef, panelId, boundaryProps } =
		useFlyout<HTMLAnchorElement>();

	return (
		<div {...boundaryProps}>
			<a
				ref={triggerRef}
				href="#work"
				onClick={() => setOpen(false)}
				onFocus={() => setOpen(true)}
				aria-expanded={open}
				aria-controls={panelId}
				className={cn(LINK_CLASS, "relative inline-flex")}
			>
				Features
				<span
					aria-hidden="true"
					style={{ transform: open ? "scaleX(1)" : "scaleX(0)" }}
					className={NAV_UNDERLINE}
				/>
			</a>
			<FlyoutPanel open={open} align="left">
				<div
					id={panelId}
					className={cn(PANEL_CLASS, "w-[min(38rem,calc(100vw-2.5rem))]")}
				>
					<p className={cn(EYEBROW_CLASS, "px-3 pb-1 pt-3")}>Everything inside</p>
					<div className="grid grid-cols-2 gap-1 px-2 pb-2">
						{FEATURE_ITEMS.map((item) => (
							<a
								key={item.label}
								href={item.href}
								onClick={() => setOpen(false)}
								className={ROW_CLASS}
							>
								<span className={TILE_CLASS}>
									<item.icon size={16} aria-hidden="true" />
								</span>
								<span className="min-w-0">
									<span className="block text-[14px] font-medium leading-5 text-(--ink)">
										{item.label}
									</span>
									<span className="mt-0.5 block text-[12.5px] leading-[1.45] text-(--ink-2)">
										{item.description}
									</span>
								</span>
							</a>
						))}
					</div>
					<button
						type="button"
						onClick={() => {
							setOpen(false);
							openReelLightbox();
						}}
						className="flex w-full items-center justify-between rounded-b-[13px] border-t border-(--rule) px-5 py-3.5 text-left text-[14px] font-medium text-(--ink-2) transition-colors hover:bg-(--paper) hover:text-(--ink) focus-visible:outline-none focus-visible:bg-(--paper)"
					>
						Watch a job run through it
						<span aria-hidden="true" className="text-(--accent-ink)">
							→
						</span>
					</button>
				</div>
			</FlyoutPanel>
		</div>
	);
}

function ResourcesFlyout() {
	const { open, setOpen, triggerRef, panelId, boundaryProps } =
		useFlyout<HTMLAnchorElement>();

	return (
		<div {...boundaryProps}>
			<Link
				ref={triggerRef}
				href="/help"
				onClick={() => setOpen(false)}
				onFocus={() => setOpen(true)}
				aria-expanded={open}
				aria-controls={panelId}
				className={cn(LINK_CLASS, "relative inline-flex")}
			>
				Resources
				<span
					aria-hidden="true"
					style={{ transform: open ? "scaleX(1)" : "scaleX(0)" }}
					className={NAV_UNDERLINE}
				/>
			</Link>
			<FlyoutPanel open={open} align="right">
				<div
					id={panelId}
					className={cn(
						PANEL_CLASS,
						"grid w-[min(28rem,calc(100vw-2.5rem))] grid-cols-[1.5fr_1fr] gap-1 p-2"
					)}
				>
					<div>
						<p className={cn(EYEBROW_CLASS, "px-3 pb-1 pt-2")}>Support</p>
						{RESOURCE_ITEMS.map((item) => {
							const inner = (
								<>
									<span className={TILE_CLASS}>
										<item.icon size={16} aria-hidden="true" />
									</span>
									<span className="min-w-0">
										<span className="block text-[14px] font-medium leading-5 text-(--ink)">
											{item.label}
										</span>
										<span className="mt-0.5 block text-[12.5px] leading-[1.45] text-(--ink-2)">
											{item.description}
										</span>
									</span>
								</>
							);
							return item.href.startsWith("/") ? (
								<Link
									key={item.label}
									href={item.href}
									onClick={() => setOpen(false)}
									className={ROW_CLASS}
								>
									{inner}
								</Link>
							) : (
								<a
									key={item.label}
									href={item.href}
									onClick={() => setOpen(false)}
									className={ROW_CLASS}
								>
									{inner}
								</a>
							);
						})}
					</div>
					<div className="border-l border-(--rule) pl-4">
						<p className={cn(EYEBROW_CLASS, "pb-1 pt-2")}>Legal</p>
						{LEGAL_ITEMS.map((item) => (
							<Link
								key={item.label}
								href={item.href}
								onClick={() => setOpen(false)}
								className="block rounded-[9px] py-2 pr-2 text-[14px] text-(--ink-2) transition-colors hover:text-(--ink) focus-visible:outline-none focus-visible:text-(--ink)"
							>
								{item.label}
							</Link>
						))}
					</div>
				</div>
			</FlyoutPanel>
		</div>
	);
}

/* Button ladder. Primary is the workspace's frosted-blue treatment (nova's
 * `.cn-button-variant-default`, and the same look production's CtaButton uses),
 * not a solid ink slab — landing and app primaries have to read as one button.
 *
 * The fill is composited OPAQUE (color-mix against --paper, not an alpha tint):
 * these buttons sit over the grid backdrop and the halftone scenes, and a
 * translucent fill lets the artwork print straight through them.
 *
 * Label is --accent-ink, not --accent: the brand sky is ~2.7:1 on its own 10%
 * tint and fails AA. --accent-ink is the darker sky in light mode and the
 * lighter one in dark, so it clears contrast on both. */
export const LP_PRIMARY =
	"inline-flex cursor-pointer items-center gap-[9px] rounded-[11px] border font-semibold tracking-[-0.01em] " +
	"border-[color-mix(in_srgb,var(--accent)_32%,transparent)] " +
	"bg-[color-mix(in_srgb,var(--accent)_10%,var(--paper))] text-(--accent-ink) shadow-sm " +
	"transition-[background-color,border-color,box-shadow] duration-200 motion-reduce:transition-none " +
	"hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] " +
	"hover:bg-[color-mix(in_srgb,var(--accent)_16%,var(--paper))] hover:shadow-md " +
	"active:bg-[color-mix(in_srgb,var(--accent)_22%,var(--paper))] " +
	"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink) focus-visible:ring-offset-2 focus-visible:ring-offset-(--paper) " +
	"disabled:pointer-events-none disabled:opacity-60";

/* Secondary: hairline plate, the workspace `outline` variant in landing ink.
 * Hover moves the border and the label to accent rather than shifting the fill —
 * these sit on --paper and on --sheet, so any fill shift reads backwards on one
 * of the two. */
export const LP_SECONDARY =
	"inline-flex cursor-pointer items-center rounded-[11px] border border-(--rule-2) bg-(--sheet) font-medium text-(--ink) " +
	"transition-[color,border-color] duration-200 motion-reduce:transition-none " +
	"hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] hover:text-(--accent-ink) " +
	"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink) focus-visible:ring-offset-2 focus-visible:ring-offset-(--paper)";

const SIZE = {
	sm: "h-[38px] rounded-[9px] px-4 text-sm",
	md: "h-[52px] px-[26px] text-[17px]",
} as const;

type ButtonProps = {
	href: string;
	size?: keyof typeof SIZE;
	className?: string;
	children: React.ReactNode;
};

/** Primary CTA. */
export function PrimaryButton({
	href,
	size = "md",
	className,
	children,
}: ButtonProps) {
	return (
		<Link href={href} className={cn(LP_PRIMARY, SIZE[size], className)}>
			{children}
		</Link>
	);
}

/** Secondary CTA. Plain <a>: several call sites are in-page hash anchors. */
export function SecondaryButton({
	href,
	size = "md",
	className,
	children,
}: ButtonProps) {
	return (
		<a
			href={href}
			className={cn(LP_SECONDARY, SIZE[size], size === "md" && "px-[22px]", className)}
		>
			{children}
		</a>
	);
}

export function MarketingNav() {
	const [menuOpen, setMenuOpen] = useState(false);

	// Body scroll locks while the mobile panel is open.
	useEffect(() => {
		if (!menuOpen) return;
		const previous = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			document.body.style.overflow = previous;
		};
	}, [menuOpen]);

	return (
		<header className="sticky top-0 z-[60] border-b border-(--rule) bg-[color-mix(in_srgb,var(--paper)_86%,transparent)] backdrop-blur-[14px] backdrop-saturate-[1.4]">
			<div className="mx-auto flex min-h-16 max-w-[1560px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-[clamp(20px,4vw,40px)] py-2">
				<Link
					href="/"
					aria-label="OneTool home"
					className="flex shrink-0 items-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink)"
				>
					<Image
						src="/OneTool.png"
						alt="OneTool"
						width={150}
						height={150}
						priority
						className="h-auto w-[124px] dark:brightness-0 dark:invert sm:w-[132px]"
					/>
				</Link>

				<nav aria-label="Primary" className="hidden items-center gap-0.5 lg:flex">
					<FeaturesFlyout />
					{DESKTOP_LINKS.map((link) => (
						<a key={link.href} href={link.href} className={LINK_CLASS}>
							{link.label}
						</a>
					))}
					<ResourcesFlyout />
				</nav>

				<div className="flex shrink-0 items-center gap-2.5">
					<ThemeSwitcher />
					<SignedOut>
						<SignInButton mode="modal" forceRedirectUrl="/home">
							<button className={cn(LINK_CLASS, "hidden sm:inline-flex")}>Sign in</button>
						</SignInButton>
						<PrimaryButton href="/sign-up" size="sm">
							Start free
						</PrimaryButton>
					</SignedOut>
					<SignedIn>
						<PrimaryButton href="/home" size="sm">
							Open OneTool
						</PrimaryButton>
					</SignedIn>

					{/* Mobile menu toggle */}
					<button
						type="button"
						onClick={() => setMenuOpen((v) => !v)}
						aria-expanded={menuOpen}
						aria-controls="marketing-nav-panel"
						aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
						className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-(--ink-2) transition-colors hover:bg-(--rule) hover:text-(--ink) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink) lg:hidden"
					>
						<svg
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							aria-hidden="true"
						>
							{menuOpen ? (
								<path d="M6 6L18 18M18 6L6 18" />
							) : (
								<path d="M4 7H20M4 12H20M4 17H20" />
							)}
						</svg>
					</button>
				</div>
			</div>

			{/* Mobile panel — grid-rows 0fr→1fr so height animates without JS
			    measurement. Collapsed to 0fr the links are invisible but still
			    focusable, so `inert` takes the closed panel out of the tab order
			    and the a11y tree. */}
			<div
				id="marketing-nav-panel"
				inert={!menuOpen}
				className={cn(
					"grid overflow-hidden border-(--rule) transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(.23,1,.32,1)] lg:hidden",
					menuOpen ? "grid-rows-[1fr] border-t opacity-100" : "grid-rows-[0fr] opacity-0"
				)}
			>
				<div className="min-h-0 max-h-[calc(100dvh-4rem)] overflow-y-auto">
					<nav aria-label="Primary mobile" className="space-y-1 px-4 py-3">
						{LINKS.map((link) => (
							<a
								key={link.href}
								href={link.href}
								onClick={() => setMenuOpen(false)}
								className="block rounded-lg px-3 py-2.5 text-sm font-medium text-(--ink-2) transition-colors hover:bg-(--rule) hover:text-(--ink)"
							>
								{link.label}
							</a>
						))}
						<div className="mt-2 border-t border-(--rule) pt-3">
							<p className={cn(EYEBROW_CLASS, "px-3 pb-1")}>Features</p>
							{FEATURE_ITEMS.map((item) => (
								<a
									key={item.label}
									href={item.href}
									onClick={() => setMenuOpen(false)}
									className="block rounded-lg px-3 py-2.5 text-sm font-medium text-(--ink-2) transition-colors hover:bg-(--rule) hover:text-(--ink)"
								>
									{item.label}
								</a>
							))}
						</div>
						<div className="mt-2 border-t border-(--rule) pt-3">
							<p className={cn(EYEBROW_CLASS, "px-3 pb-1")}>Resources</p>
							{RESOURCE_ITEMS.map((item) => (
								<a
									key={item.label}
									href={item.href}
									onClick={() => setMenuOpen(false)}
									className="block rounded-lg px-3 py-2.5 text-sm font-medium text-(--ink-2) transition-colors hover:bg-(--rule) hover:text-(--ink)"
								>
									{item.label}
								</a>
							))}
						</div>
						<div className="mt-2 flex items-center gap-2 border-t border-(--rule) pt-3 sm:hidden">
							<SignedOut>
								<SignInButton mode="modal" forceRedirectUrl="/home">
									<button className={LINK_CLASS}>Sign in</button>
								</SignInButton>
							</SignedOut>
						</div>
					</nav>
				</div>
			</div>
		</header>
	);
}
