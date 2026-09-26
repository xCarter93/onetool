"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { SignInButton, Show } from "@clerk/nextjs";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BookOpen, CircleHelp, LifeBuoy, Rocket } from "lucide-react";
import { ThemeSwitcher } from "@/components/layout/theme-switcher";
import { cn } from "@/lib/utils";
import { FEATURES } from "./features";
import { openReelLightbox } from "./reel-cta";

const LINKS = [
	{ href: "#day", label: "The day" },
	{ href: "#phone", label: "Mobile" },
	{ href: "#try", label: "Try it" },
	{ href: "#compare", label: "Compare" },
	{ href: "#pricing", label: "Pricing" },
];

const LINK_CLASS =
	"rounded-lg px-3 py-2 text-sm font-medium text-(--ink-2) transition-colors hover:bg-(--rule) hover:text-(--ink) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink)";

const FEATURE_COLUMNS = [FEATURES.slice(0, 5), FEATURES.slice(5, 9), FEATURES.slice(9)];

const RESOURCE_ITEMS = [
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
		icon: CircleHelp,
		label: "FAQ",
		description: "Quick answers before you sign up",
		href: "#faq",
	},
	{
		icon: LifeBuoy,
		label: "Contact support",
		description: "Email our team for a hand",
		href: "mailto:support@onetool.biz",
	},
] as const;

const LEGAL_ITEMS = [
	{ label: "Terms of Service", href: "/terms-of-service" },
	{ label: "Privacy Policy", href: "/privacy-policy" },
	{ label: "Data Security", href: "/data-security" },
] as const;

const EASE_OUT_QUINT = [0.23, 1, 0.32, 1] as const;

const NAV_UNDERLINE =
	"pointer-events-none absolute inset-x-3 bottom-1 h-[2px] origin-left rounded-full bg-(--accent) transition-transform duration-300 ease-out";

const PANEL_CLASS =
	"rounded-lg border border-(--rule-2) bg-(--sheet) shadow-(--lp-shadow)";
const EYEBROW_CLASS =
	"font-mono text-[10.5px] font-medium uppercase tracking-[0.12em] text-(--ink-3)";
const ROW_CLASS =
	"flex items-start gap-3 rounded-md p-3 text-left transition-colors hover:bg-(--paper) focus-visible:bg-(--paper) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink)";
const FEATURE_ROW_CLASS =
	"block rounded-md px-3 py-2.5 transition-colors hover:bg-(--paper) focus-visible:bg-(--paper) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink)";
const TILE_CLASS =
	"mt-px flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-(--rule) bg-(--accent-wash) text-(--accent-ink)";

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
				href="#inside"
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
					className={cn(PANEL_CLASS, "w-[min(47.5rem,calc(100vw-2.5rem))]")}
				>
					<p className={cn(EYEBROW_CLASS, "px-3 pb-1 pt-3")}>Everything inside</p>
					<div className="grid grid-cols-3 gap-1 px-2 pb-2">
						{FEATURE_COLUMNS.map((column, i) => (
							<div key={i}>
								{column.map((item) => (
									<Link
										key={item.key}
										href={item.href as Route}
										onClick={() => setOpen(false)}
										className={FEATURE_ROW_CLASS}
									>
										<span className="block text-[14px] font-medium leading-5 text-(--ink)">
											{item.label}
										</span>
										<span className="mt-0.5 block text-[12.5px] leading-[1.45] text-(--ink-2)">
											{item.description}
										</span>
									</Link>
								))}
							</div>
						))}
					</div>
					<button
						type="button"
						onClick={() => {
							setOpen(false);
							openReelLightbox();
						}}
						className="flex w-full items-center justify-between rounded-b-lg border-t border-(--rule) px-5 py-3.5 text-left text-[14px] font-medium text-(--ink-2) transition-colors hover:bg-(--paper) hover:text-(--ink) focus-visible:outline-none focus-visible:bg-(--paper)"
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
								className="block rounded-md py-2 pr-2 text-[14px] text-(--ink-2) transition-colors hover:text-(--ink) focus-visible:outline-none focus-visible:text-(--ink)"
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

export const LP_PRIMARY =
	"inline-flex cursor-pointer items-center justify-center gap-[9px] rounded-md border font-semibold tracking-[-0.01em] " +
	"border-[color-mix(in_srgb,var(--accent)_32%,transparent)] " +
	"bg-[color-mix(in_srgb,var(--accent)_10%,var(--paper))] text-(--accent-ink) " +
	"transition-[background-color,border-color,box-shadow] duration-200 motion-reduce:transition-none " +
	"hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] " +
	"hover:bg-[color-mix(in_srgb,var(--accent)_16%,var(--paper))] " +
	"active:bg-[color-mix(in_srgb,var(--accent)_22%,var(--paper))] " +
	"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink) focus-visible:ring-offset-2 focus-visible:ring-offset-(--paper) " +
	"disabled:pointer-events-none disabled:opacity-60";

export const LP_SECONDARY =
	"inline-flex cursor-pointer items-center justify-center gap-[9px] rounded-md border border-(--rule-2) bg-(--sheet) font-semibold text-(--ink) " +
	"transition-[color,border-color] duration-200 motion-reduce:transition-none " +
	"hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] hover:text-(--accent-ink) " +
	"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink) focus-visible:ring-offset-2 focus-visible:ring-offset-(--paper)";

export const LP_BUTTON_SIZE = {
	sm: "h-[38px] rounded-md px-4 text-sm",
	md: "h-[52px] px-[26px] text-[17px]",
} as const;

type ButtonProps = {
	href: string;
	size?: keyof typeof LP_BUTTON_SIZE;
	className?: string;
	children: React.ReactNode;
};

export function PrimaryButton({
	href,
	size = "md",
	className,
	children,
}: ButtonProps) {
	return (
		// optional catch-all route; bare path isn't in the typed union
		<Link href={href as Route} className={cn(LP_PRIMARY, LP_BUTTON_SIZE[size], className)}>
			{children}
		</Link>
	);
}

export function SecondaryButton({
	href,
	size = "md",
	className,
	children,
}: ButtonProps) {
	return (
		<a
			href={href}
			className={cn(LP_SECONDARY, LP_BUTTON_SIZE[size], className)}
		>
			{children}
		</a>
	);
}

export function MarketingNav() {
	const [menuOpen, setMenuOpen] = useState(false);
	const menuTriggerRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		if (!menuOpen) return;
		const previous = document.body.style.overflow;
		const desktop = window.matchMedia("(min-width: 1280px)");
		const closeOnDesktop = () => { if (desktop.matches) setMenuOpen(false); };
		document.body.style.overflow = "hidden";
		desktop.addEventListener("change", closeOnDesktop);
		return () => {
			document.body.style.overflow = previous;
			desktop.removeEventListener("change", closeOnDesktop);
		};
	}, [menuOpen]);

	return (
		<header onKeyDown={(event) => {
			if (event.key === "Escape" && menuOpen) {
				setMenuOpen(false);
				menuTriggerRef.current?.focus();
			}
		}} className="sticky top-0 z-[60] border-b border-(--rule) bg-[color-mix(in_srgb,var(--paper)_86%,transparent)] backdrop-blur-[14px] backdrop-saturate-[1.4]">
			<div className="mx-auto flex h-16 max-w-[1560px] items-center justify-between gap-x-6 gap-y-2 px-[clamp(20px,4vw,40px)] py-2">
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

				<nav aria-label="Primary" className="hidden items-center gap-0.5 xl:flex">
					<FeaturesFlyout />
					{LINKS.map((link) => (
						<a key={link.href} href={link.href} className={LINK_CLASS}>
							{link.label}
						</a>
					))}
					<ResourcesFlyout />
				</nav>

				<div className="flex shrink-0 items-center gap-2.5">
					<ThemeSwitcher />
					<Show when="signed-out">
						<SignInButton mode="modal" forceRedirectUrl="/home">
							<button className={cn(LINK_CLASS, "hidden sm:inline-flex")}>Sign in</button>
						</SignInButton>
						<PrimaryButton href="/sign-up" size="sm">
							Start free
						</PrimaryButton>
					</Show>
					<Show when="signed-in">
						<PrimaryButton href="/home" size="sm">
							Open OneTool
						</PrimaryButton>
					</Show>


					<button
						ref={menuTriggerRef}
						type="button"
						onClick={() => setMenuOpen((v) => !v)}
						aria-expanded={menuOpen}
						aria-controls="marketing-nav-panel"
						aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
						className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-(--ink-2) transition-colors hover:bg-(--rule) hover:text-(--ink) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink) xl:hidden"
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


			<div
				id="marketing-nav-panel"
				inert={!menuOpen}
				className={cn(
					"grid overflow-hidden border-(--rule) transition-[grid-template-rows,opacity] duration-300 ease-(--lp-ease) xl:hidden",
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
							{FEATURES.map((item) => (
								<Link
									key={item.key}
									href={item.href as Route}
									onClick={() => setMenuOpen(false)}
									className="block rounded-lg px-3 py-2.5 text-sm font-medium text-(--ink-2) transition-colors hover:bg-(--rule) hover:text-(--ink)"
								>
									{item.label}
								</Link>
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
							<Show when="signed-out">
								<SignInButton mode="modal" forceRedirectUrl="/home">
									<button className={LINK_CLASS}>Sign in</button>
								</SignInButton>
							</Show>
						</div>
					</nav>
				</div>
			</div>
		</header>
	);
}
