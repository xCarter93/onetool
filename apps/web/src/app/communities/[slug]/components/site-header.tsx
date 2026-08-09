"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface NavAnchor {
	id: string;
	label: string;
}

interface SiteHeaderProps {
	businessName: string;
	avatarUrl: string | null;
	anchors: NavAnchor[];
	contactFormId: string;
}

/**
 * Sticky page header for the public community page. Goes opaque once the hero
 * scrolls past so the business name and CTA stay legible over any content.
 * The CTA is desktop-only — on phones MobileActionBar carries it.
 */
export function SiteHeader({
	businessName,
	avatarUrl,
	anchors,
	contactFormId,
}: SiteHeaderProps) {
	const [scrolled, setScrolled] = useState(false);

	useEffect(() => {
		const onScroll = () => setScrolled(window.scrollY > 24);
		onScroll();
		window.addEventListener("scroll", onScroll, { passive: true });
		return () => window.removeEventListener("scroll", onScroll);
	}, []);

	const scrollToForm = () =>
		document
			.getElementById(contactFormId)
			?.scrollIntoView({ behavior: "smooth", block: "start" });

	return (
		<header
			className={cn(
				"sticky top-0 z-30 transition-colors duration-200",
				scrolled
					? "bg-bg/95 supports-[backdrop-filter]:bg-bg/80 backdrop-blur border-b border-border"
					: "bg-transparent border-b border-transparent"
			)}
		>
			<div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-4">
				<a
					href="#main"
					className="flex items-center gap-2.5 min-w-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
				>
					{avatarUrl && (
						<span className="relative size-8 shrink-0 rounded-lg overflow-hidden ring-1 ring-border bg-bg">
							<Image
								src={avatarUrl}
								alt=""
								fill
								className="object-cover"
								sizes="32px"
							/>
						</span>
					)}
					<span className="font-semibold text-fg truncate">
						{businessName}
					</span>
				</a>

				{anchors.length > 0 && (
					<nav
						aria-label="Sections"
						className="hidden md:flex items-center gap-6 ml-4"
					>
						{anchors.map((a) => (
							<a
								key={a.id}
								href={`#${a.id}`}
								className="text-sm text-muted-fg hover:text-fg transition-colors duration-200 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
							>
								{a.label}
							</a>
						))}
					</nav>
				)}

				<button
					type="button"
					onClick={scrollToForm}
					className="hidden lg:inline-flex ml-auto items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors duration-200 hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
				>
					Get a free quote
				</button>
			</div>
		</header>
	);
}
