"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SignInButton, SignUpButton, SignedIn, SignedOut } from "@clerk/nextjs";
import { ThemeSwitcher } from "@/components/layout/theme-switcher";
import { StyledButton } from "@/components/ui/styled/styled-button";
import { AccentCTA } from "@/app/components/landing/accent-cta";
import { motion, AnimatePresence } from "motion/react";

const navigationLinks = [
	{ href: "#features", label: "Features" },
	{ href: "#how-it-works", label: "How it Works" },
	{ href: "#faq", label: "FAQ" },
	{ href: "#pricing", label: "Pricing" },
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
			<nav className="bg-frame shadow-2xl/20 rounded-b-4xl min-[850px]:overflow-visible max-[850px]:overflow-hidden">
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
						{navigationLinks.map((link) => (
							<button
								key={link.href}
								onClick={() => scrollToSection(link.href)}
								className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
							>
								{link.label}
							</button>
						))}
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
								<StyledButton
									intent="primary"
									size="sm"
									onClick={() => router.push("/home")}
								>
									Go To Dashboard
								</StyledButton>
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
											<StyledButton intent="outline" size="sm">
												Sign In
											</StyledButton>
										</SignInButton>
										<SignUpButton mode="modal" forceRedirectUrl="/home">
											<AccentCTA size="sm">
												Get Started
											</AccentCTA>
										</SignUpButton>
									</SignedOut>
									<SignedIn>
										<StyledButton
											intent="primary"
											size="sm"
											onClick={() => {
												router.push("/home");
												setIsMenuOpen(false);
											}}
										>
											Go To Dashboard
										</StyledButton>
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
