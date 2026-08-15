"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { SignInButton, SignedIn, SignedOut } from "@clerk/nextjs";
import { ThemeSwitcher } from "@/components/layout/theme-switcher";
import { cn } from "@/lib/utils";

const LINKS = [
	{ href: "#one-place", label: "Why change" },
	{ href: "#loop", label: "How it works" },
	{ href: "#work", label: "What's inside" },
	{ href: "#compare", label: "Compare" },
	{ href: "#pricing", label: "Pricing" },
];

const LINK_CLASS =
	"rounded-lg px-3 py-2 text-sm font-medium text-(--ink-2) transition-colors hover:bg-(--rule) hover:text-(--ink) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink)";

/** Solid-ink CTA — the page's one filled button style. */
export function InkButton({
	href,
	size = "md",
	className,
	children,
}: {
	href: string;
	size?: "sm" | "md";
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<Link
			href={href}
			className={cn(
				"inline-flex items-center gap-[9px] rounded-[11px] bg-(--ink) font-semibold tracking-[-0.01em] text-(--paper) shadow-(--lp-shadow) transition-opacity hover:opacity-[0.88] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink) focus-visible:ring-offset-2 focus-visible:ring-offset-(--paper)",
				size === "sm" && "h-[38px] rounded-[9px] px-4 text-sm",
				size === "md" && "h-[52px] px-[26px] text-[17px]",
				className
			)}
		>
			{children}
		</Link>
	);
}

/** Hairline secondary CTA. */
export function SheetButton({
	href,
	size = "md",
	className,
	children,
}: {
	href: string;
	size?: "sm" | "md";
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<a
			href={href}
			className={cn(
				"inline-flex items-center rounded-[11px] border border-(--rule-2) bg-(--sheet) font-medium text-(--ink) transition-colors hover:border-(--rule-3) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink) focus-visible:ring-offset-2 focus-visible:ring-offset-(--paper)",
				size === "sm" && "h-[38px] rounded-[9px] px-4 text-sm",
				size === "md" && "h-[52px] px-[22px] text-[17px]",
				className
			)}
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
			<div className="mx-auto flex min-h-16 max-w-[1280px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-[clamp(20px,4vw,40px)] py-2">
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
					{LINKS.map((link) => (
						<a key={link.href} href={link.href} className={LINK_CLASS}>
							{link.label}
						</a>
					))}
				</nav>

				<div className="flex shrink-0 items-center gap-2.5">
					<ThemeSwitcher />
					<SignedOut>
						<SignInButton mode="modal" forceRedirectUrl="/home">
							<button className={cn(LINK_CLASS, "hidden sm:inline-flex")}>Sign in</button>
						</SignInButton>
						<InkButton href="/sign-up" size="sm">
							Start free
						</InkButton>
					</SignedOut>
					<SignedIn>
						<InkButton href="/home" size="sm">
							Open OneTool
						</InkButton>
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

			{/* Mobile panel — grid-rows 0fr→1fr so height animates without JS measurement. */}
			<div
				id="marketing-nav-panel"
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
