"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { BookOpen, ChevronDown, CircleHelp, Compass, LifeBuoy, Menu, X } from "lucide-react";
import { SecondaryButton } from "./buttons";
import { ThemeSwitcher } from "@/components/layout/theme-switcher";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { FEATURES } from "./features";
import { usePrefersReducedMotion } from "./use-reduced-motion";

// App routes use plain <a>, not Link: landing <-> app must be a full page load (separate Tailwind sheets).
const LINKS = [
	{ href: "#how", label: "How it works" },
	{ href: "#pricing", label: "Pricing" },
	{ href: "#compare", label: "Compare" },
];

const LINK_CLASS =
	"inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium text-(--ink-2) transition-colors hover:bg-(--rule) hover:text-(--ink) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink) pointer-coarse:min-h-11";

const FEATURE_COLUMNS = [FEATURES.slice(0, 5), FEATURES.slice(5, 9), FEATURES.slice(9)];

const RESOURCE_ITEMS = [
	{
		icon: BookOpen,
		label: "Help center",
		description: "Guides for every part of OneTool",
		href: "/help",
	},
	{
		icon: Compass,
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
		description: "support@onetool.biz",
		href: "mailto:support@onetool.biz",
	},
] as const;

const LEGAL_ITEMS = [
	{ label: "Terms of service", href: "/terms-of-service" },
	{ label: "Privacy policy", href: "/privacy-policy" },
	{ label: "Data security", href: "/data-security" },
] as const;

const PANEL_CLASS =
	"rounded-lg bg-(--sheet) shadow-[0_0_0_1px_var(--rule-2),var(--lp-shadow)]";
const EYEBROW_CLASS =
	"text-2xs font-semibold uppercase tracking-[0.08em] text-(--ink-3)";
const ROW_CLASS =
	"flex items-start gap-3 rounded-md p-3 text-left transition-colors hover:bg-(--paper) focus-visible:bg-(--paper) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink)";
const FEATURE_ROW_CLASS =
	"block rounded-md px-3 py-2.5 transition-colors hover:bg-(--paper) focus-visible:bg-(--paper) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink) pointer-coarse:min-h-11";
const MENU_ROW_CLASS =
	"flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-(--ink-2) transition-colors hover:bg-(--rule) hover:text-(--ink) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink)";
const TILE_CLASS =
	"mt-px flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-(--rule) bg-(--accent-wash) text-(--accent-ink)";

const focusFirstLink = (panelId: string) =>
	document.getElementById(panelId)?.querySelector<HTMLElement>("a[href]")?.focus();

function useFlyout() {
	const [open, setOpen] = useState(false);
	const [instant, setInstant] = useState(false);
	const boundaryRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const focusFirstOnOpen = useRef(false);
	const panelId = useId();

	const close = () => setOpen(false);

	useEffect(() => {
		if (!open) return;
		if (focusFirstOnOpen.current) {
			focusFirstOnOpen.current = false;
			focusFirstLink(panelId);
		}
		const closeOnOutsidePointer = (e: PointerEvent) => {
			if (!boundaryRef.current?.contains(e.target as Node)) setOpen(false);
		};
		document.addEventListener("pointerdown", closeOnOutsidePointer);
		return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
	}, [open, panelId]);

	const boundaryProps = {
		ref: boundaryRef,
		className: "relative",
		onKeyDown: (e: React.KeyboardEvent) => {
			if (e.key === "Escape" && open) {
				e.stopPropagation();
				setOpen(false);
				triggerRef.current?.focus();
			}
		},
		onBlur: (e: React.FocusEvent) => {
			if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
				setOpen(false);
			}
		},
	};

	const triggerProps = {
		ref: triggerRef,
		type: "button" as const,
		"aria-expanded": open,
		"aria-controls": panelId,
		onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
			// The open gesture also decides the exit: keyboard-opened panels close instantly.
			if (!open) setInstant(event.detail === 0);
			setOpen((v) => !v);
		},
		onKeyDown: (e: React.KeyboardEvent) => {
			if (e.key !== "ArrowDown") return;
			e.preventDefault();
			if (open) {
				focusFirstLink(panelId);
			} else {
				setInstant(true);
				focusFirstOnOpen.current = true;
				setOpen(true);
			}
		},
	};

	return { open, instant, close, panelId, boundaryProps, triggerProps };
}

function FlyoutTrigger({ children, ...props }: React.ComponentProps<"button">) {
	return (
		<button
			{...props}
			className={cn(
				LINK_CLASS,
				"group inline-flex cursor-pointer items-center gap-1 aria-expanded:bg-(--rule) aria-expanded:text-(--ink)"
			)}
		>
			{children}
			<ChevronDown
				aria-hidden="true"
				size={14}
				className="transition-transform duration-200 group-aria-expanded:rotate-180 motion-reduce:transition-none"
			/>
		</button>
	);
}

function FlyoutPanel({
	open,
	instant,
	align,
	children,
}: {
	open: boolean;
	instant: boolean;
	align: "left" | "right";
	children: React.ReactNode;
}) {
	const reduced = usePrefersReducedMotion();
	const still = instant || reduced;
	const [present, setPresent] = useState(open);
	// Stays mounted through the exit fade; transitionend unmounts it.
	if (open !== present && (open || still)) setPresent(open);
	if (!present) return null;

	return (
		<div
			onTransitionEnd={(e) => {
				if (!open && e.target === e.currentTarget && e.propertyName === "opacity") setPresent(false);
			}}
			className={cn(
				"absolute top-full z-10 pt-3",
				align === "left" ? "left-0" : "right-0",
				// No transition classes at all when still: landing.css forces transition-property under reduced motion.
				!still && "transition-[opacity,translate] ease-(--ease-out-quint)",
				!still && (open ? "duration-200 starting:translate-y-3 starting:opacity-0" : "translate-y-3 opacity-0 duration-150")
			)}
		>
			{children}
		</div>
	);
}

function FeaturesFlyout() {
	const { open, instant, close, panelId, boundaryProps, triggerProps } = useFlyout();

	return (
		<div {...boundaryProps}>
			<FlyoutTrigger {...triggerProps}>
				Features
			</FlyoutTrigger>
			<FlyoutPanel open={open} instant={instant} align="left">
				<div
					id={panelId}
					className={cn(PANEL_CLASS, "w-[min(47.5rem,calc(100vw-2.5rem))]")}
				>
					<p className={cn(EYEBROW_CLASS, "px-3 pb-1 pt-3")}>Everything inside</p>
					<div className="grid grid-cols-3 gap-1 px-2 pb-2">
						{FEATURE_COLUMNS.map((column, i) => (
							<div key={i}>
								{column.map((item) => (
									<a
										key={item.key}
										href={item.href}
										onClick={close}
										className={FEATURE_ROW_CLASS}
									>
										<span className="block text-sm font-medium leading-5 text-(--ink)">
											{item.label}
										</span>
										<span className="mt-0.5 block text-xs leading-[1.45] text-pretty text-(--ink-2)">
											{item.description}
										</span>
									</a>
								))}
							</div>
						))}
					</div>
				</div>
			</FlyoutPanel>
		</div>
	);
}

function ResourcesFlyout() {
	const { open, instant, close, panelId, boundaryProps, triggerProps } = useFlyout();

	return (
		<div {...boundaryProps}>
			<FlyoutTrigger {...triggerProps}>
				Resources
			</FlyoutTrigger>
			<FlyoutPanel open={open} instant={instant} align="right">
				<div
					id={panelId}
					className={cn(
						PANEL_CLASS,
						"grid w-[min(28rem,calc(100vw-2.5rem))] grid-cols-[1.5fr_1fr] gap-1 p-2"
					)}
				>
					<div>
						<p className={cn(EYEBROW_CLASS, "px-3 pb-1 pt-2")}>Support</p>
						{RESOURCE_ITEMS.map((item) => (
							<a
								key={item.label}
								href={item.href}
								onClick={close}
								className={ROW_CLASS}
							>
								<span className={TILE_CLASS}>
									<item.icon size={16} aria-hidden="true" />
								</span>
								<span className="min-w-0">
									<span className="block text-sm font-medium leading-5 text-(--ink)">
										{item.label}
									</span>
									<span className="mt-0.5 block text-xs leading-[1.45] text-pretty text-(--ink-2)">
										{item.description}
									</span>
								</span>
							</a>
						))}
					</div>
					<div className="border-l border-(--rule) pl-4">
						<p className={cn(EYEBROW_CLASS, "pb-1 pt-2")}>Legal</p>
						{LEGAL_ITEMS.map((item) => (
							<a
								key={item.label}
								href={item.href}
								onClick={close}
								className="flex items-center rounded-md py-2 pr-2 text-sm text-(--ink-2) transition-colors hover:text-(--ink) focus-visible:outline-none focus-visible:text-(--ink) focus-visible:ring-2 focus-visible:ring-(--accent-ink) pointer-coarse:min-h-11"
							>
								{item.label}
							</a>
						))}
					</div>
				</div>
			</FlyoutPanel>
		</div>
	);
}


export function MarketingNav() {
	const [menuOpen, setMenuOpen] = useState(false);
	const menuTriggerRef = useRef<HTMLButtonElement>(null);
	const headerRef = useRef<HTMLElement>(null);
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
		// The observer corrects this server-rendered hero state after hydration.
		<header ref={headerRef} data-menu-open={menuOpen ? "" : undefined} onKeyDown={(event) => {
			if (event.key === "Escape" && menuOpen) {
				setMenuOpen(false);
				menuTriggerRef.current?.focus();
			}
		}} style={{ transition: "none" }} className="sticky top-0 z-40 border-b border-(--rule) bg-[color-mix(in_srgb,var(--paper)_94%,transparent)] backdrop-blur-[14px] backdrop-saturate-[1.4]">
			<div className="mx-auto flex h-16 max-w-[1560px] items-center justify-between gap-x-6 gap-y-2 px-(--lp-gutter) py-2">
				{/* eslint-disable-next-line @next/next/no-html-link-for-pages -- plain anchor: no prefetch of the page we are already on */}
				<a
					href="/"
					aria-label="OneTool home"
					className="flex shrink-0 items-center rounded-sm pointer-coarse:min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink)"
				>
					<Image
						src="/OneTool-wordmark-sm.webp"
						alt="OneTool"
						width={512}
						height={134}
						sizes="126px"
						priority
						className="lp-nav-logo h-auto w-[118px] dark:brightness-0 dark:invert sm:w-[126px]"
					/>
				</a>

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
					<ThemeSwitcher className="pointer-coarse:size-11" />
					{/* eslint-disable-next-line @next/next/no-html-link-for-pages -- full page load, see note above LINKS */}
					<a href="/sign-in" className={cn(LINK_CLASS, "hidden items-center pointer-coarse:min-h-11 sm:inline-flex")}>
						Sign in
					</a>
					<SecondaryButton href="/sign-up" size="sm" className="pointer-coarse:min-h-11">
						Start free
					</SecondaryButton>


					<button
						ref={menuTriggerRef}
						type="button"
						onClick={() => setMenuOpen((v) => !v)}
						aria-expanded={menuOpen}
						aria-controls="marketing-nav-panel"
						aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
						className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-(--ink-2) transition-colors hover:bg-(--rule) hover:text-(--ink) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink) xl:hidden"
					>
						{menuOpen ? (
							<X aria-hidden="true" size={20} />
						) : (
							<Menu aria-hidden="true" size={20} />
						)}
					</button>
				</div>
			</div>


			<div
				id="marketing-nav-panel"
				inert={!menuOpen}
				className={cn(
					"absolute inset-x-0 top-full grid overflow-hidden border-(--rule) bg-(--paper) transition-[grid-template-rows,opacity] duration-300 ease-(--lp-ease) xl:hidden",
					menuOpen ? "grid-rows-[1fr] border-t opacity-100" : "grid-rows-[0fr] opacity-0"
				)}
			>
				<div className="min-h-0 max-h-[calc(100dvh-4rem)] overflow-y-auto">
					<nav aria-label="Primary mobile" className="space-y-1 px-[calc(var(--lp-gutter)-0.75rem)] py-3">
						<div className="mb-2 border-b border-(--rule) pb-3 sm:hidden">
							{/* eslint-disable-next-line @next/next/no-html-link-for-pages -- full page load, see note above LINKS */}
							<a href="/sign-in" onClick={() => setMenuOpen(false)} className={MENU_ROW_CLASS}>
								Sign in
							</a>
						</div>
						{LINKS.map((link) => (
							<a
								key={link.href}
								href={link.href}
								onClick={() => setMenuOpen(false)}
								className={MENU_ROW_CLASS}
							>
								{link.label}
							</a>
						))}
						<Collapsible className="mt-2 border-t border-(--rule) pt-3">
							<CollapsibleTrigger className={cn(MENU_ROW_CLASS, "group w-full cursor-pointer justify-between")}>
								Features
								<ChevronDown
									aria-hidden="true"
									className="size-4 text-(--ink-3) transition-transform duration-200 group-data-[panel-open]:rotate-180"
								/>
							</CollapsibleTrigger>
							<CollapsibleContent>
								{FEATURES.map((item) => (
									<a
										key={item.key}
										href={item.href}
										onClick={() => setMenuOpen(false)}
										className={cn(MENU_ROW_CLASS, "pl-6")}
									>
										{item.label}
									</a>
								))}
							</CollapsibleContent>
						</Collapsible>
						<div className="mt-2 border-t border-(--rule) pt-3">
							<p className={cn(EYEBROW_CLASS, "px-3 pb-1")}>Resources</p>
							{RESOURCE_ITEMS.map((item) => (
								<a
									key={item.label}
									href={item.href}
									onClick={() => setMenuOpen(false)}
									className={MENU_ROW_CLASS}
								>
									{item.label}
								</a>
							))}
						</div>
					</nav>
				</div>
			</div>
		</header>
	);
}
