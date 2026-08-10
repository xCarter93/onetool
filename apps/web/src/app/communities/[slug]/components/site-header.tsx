"use client";

import { useRef } from "react";
import Image from "next/image";

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
 * Sticky page header for the public community page. The bar is always drawn —
 * it sits in flow rather than over a hero, so a transparent resting state just
 * reads as a logo floating in a gap. Content passes under the frosted fill on
 * scroll. Opacity stays high enough to hold AA over a bright banner photo.
 * The CTA is desktop-only — on phones MobileActionBar carries it.
 */
export function SiteHeader({
	businessName,
	avatarUrl,
	anchors,
	contactFormId,
}: SiteHeaderProps) {
	const headerRef = useRef<HTMLElement>(null);

	// The editor previews this page inside an iframe, so the component runs in the
	// host realm while its DOM lives in another document — a bare `document` would
	// search the editor page instead of the previewed one.
	const scrollToForm = () =>
		headerRef.current?.ownerDocument
			.getElementById(contactFormId)
			?.scrollIntoView({ behavior: "smooth", block: "start" });

	return (
		<header
			ref={headerRef}
			className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90"
		>
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-4">
				<a
					href="#main"
					className="flex items-center gap-2.5 min-w-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
				>
					{avatarUrl && (
						<span className="relative size-8 shrink-0 rounded-lg overflow-hidden ring-1 ring-border bg-background">
							<Image
								src={avatarUrl}
								alt=""
								fill
								className="object-cover"
								sizes="32px"
							/>
						</span>
					)}
					<span className="font-semibold text-foreground truncate">
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
								className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
							>
								{a.label}
							</a>
						))}
					</nav>
				)}

				<button
					type="button"
					onClick={scrollToForm}
					className="hidden lg:inline-flex ml-auto items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors duration-200 hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
				>
					Get a free quote
				</button>
			</div>
		</header>
	);
}
