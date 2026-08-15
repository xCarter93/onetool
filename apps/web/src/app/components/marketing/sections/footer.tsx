"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { usePrefersReducedMotion } from "../use-reduced-motion";

/* FOOTER — comp lines 641–668. Not a <Section>: the final CTA above already
 * draws the closing hairline. Columns follow the comp's footerCols labels but
 * every href is a real route (help center, legal pages, App Store); nothing
 * here points at a page that doesn't exist. */

const ParticleText = dynamic(
	() => import("@/components/react-bits/particle-text"),
	{ ssr: false }
);

const APP_STORE_URL =
	"https://apps.apple.com/us/app/onetool-small-business-crm/id6757319255";

type FooterLink = { name: string; href: string; external?: boolean };

const COLUMNS: { label: string; items: FooterLink[] }[] = [
	{
		label: "Product",
		items: [
			{ name: "How it works", href: "#loop" },
			{ name: "What's inside", href: "#work" },
			{ name: "iOS app", href: APP_STORE_URL, external: true },
			{ name: "Pricing", href: "#pricing" },
		],
	},
	{
		label: "Support",
		items: [
			{ name: "Help center", href: "/help" },
			{ name: "Getting started", href: "/help/getting-started" },
			{ name: "Contact support", href: "mailto:support@onetool.biz" },
		],
	},
	{
		label: "Legal",
		items: [
			{ name: "Terms of service", href: "/terms-of-service" },
			{ name: "Privacy policy", href: "/privacy-policy" },
			{ name: "Data security", href: "/data-security" },
		],
	},
];

const FOOTER_LINK =
	"rounded-sm text-sm text-(--ink-2) transition-colors hover:text-(--ink) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink)";

/* Quiet zinc with one sky fleck — the comp's wordmarkColors, both themes. */
const LIGHT_COLORS = ["#d4d4d8", "#d4d4d8", "#a1a1aa", "#0284c7"];
const DARK_COLORS = ["#3f3f46", "#3f3f46", "#52525b", "#00a6f4"];
/** Module-level: an inline literal is an effect dep — it would re-init every particle each render. */
const MOUSE_CONTROLS = { enabled: true, radius: 130, strength: 4 };

/**
 * The sheet-bottom OneTool wordmark as settling graphite. Artwork, not text:
 * aria-hidden, and a plain static word under reduced motion or before the
 * hashed next/font family has actually loaded (the canvas would otherwise
 * rasterize the fallback face).
 */
function ParticleWordmark() {
	const { resolvedTheme } = useTheme();
	const reduced = usePrefersReducedMotion();
	const [fontFamily, setFontFamily] = useState<string | null>(null);

	useEffect(() => {
		const family = getComputedStyle(document.body).fontFamily;
		let cancelled = false;
		document.fonts.ready.then(() => {
			if (!cancelled) setFontFamily(family);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	const ready = !reduced && fontFamily !== null;

	return (
		<div aria-hidden="true" className="mt-2 h-[clamp(110px,17vw,260px)] w-full">
			{ready ? (
				<ParticleText
					text="OneTool"
					colors={resolvedTheme === "dark" ? DARK_COLORS : LIGHT_COLORS}
					fontFamily={fontFamily}
					fontWeight={600}
					fontSize={340}
					particleSize={2}
					particleGap={2}
					ease={0.06}
					friction={0.82}
					mouseControls={MOUSE_CONTROLS}
				/>
			) : (
				<p className="flex h-full select-none items-center justify-center text-[16vw] font-semibold leading-[0.78] tracking-[-0.05em] text-(--rule-2)">
					OneTool
				</p>
			)}
		</div>
	);
}

function FooterItem({ item }: { item: FooterLink }) {
	if (item.external) {
		return (
			<a
				href={item.href}
				target="_blank"
				rel="noopener noreferrer"
				className={FOOTER_LINK}
			>
				{item.name}
			</a>
		);
	}
	// Hash anchors and mailto: stay plain <a>; real routes get the router.
	if (!item.href.startsWith("/")) {
		return (
			<a href={item.href} className={FOOTER_LINK}>
				{item.name}
			</a>
		);
	}
	return (
		<Link href={item.href} className={FOOTER_LINK}>
			{item.name}
		</Link>
	);
}

export function MarketingFooter() {
	return (
		<footer className="relative px-[clamp(20px,4vw,40px)] pb-6 pt-[clamp(40px,5vw,72px)]">
			<div className="mx-auto max-w-[1280px]">
				<div
					className="grid gap-[clamp(32px,5vw,80px)]"
					style={{
						gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,260px),1fr))",
					}}
				>
					<div className="grid max-w-[22rem] content-start gap-4">
						<Link
							href="/"
							aria-label="OneTool home"
							className="justify-self-start rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink)"
						>
							<Image
								src="/OneTool.png"
								alt="OneTool"
								width={150}
								height={150}
								className="h-auto w-[124px] dark:brightness-0 dark:invert"
							/>
						</Link>
						<p className="text-[14.5px] leading-[1.65] text-(--ink-2)">
							Built for the people doing the work, who shouldn&apos;t have to
							chase anyone to get paid for it.
						</p>
						{/* landing.css owns smooth scroll (and its reduced-motion downgrade). */}
						<a href="#top" className={`${FOOTER_LINK} justify-self-start`}>
							Back to top <span aria-hidden="true">↑</span>
						</a>
					</div>

					<nav
						aria-label="Footer"
						className="grid grid-cols-3 gap-x-12 gap-y-8"
					>
						{COLUMNS.map((column) => (
							<div key={column.label}>
								<p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-(--ink-3)">
									{column.label}
								</p>
								<ul className="grid gap-[11px]">
									{column.items.map((item) => (
										<li key={item.name}>
											<FooterItem item={item} />
										</li>
									))}
								</ul>
							</div>
						))}
					</nav>
				</div>

				<div className="mt-[clamp(40px,5vw,72px)] flex flex-wrap items-center justify-between gap-[14px] border-t border-(--rule) pt-5">
					<p className="text-[13.5px] text-(--ink-3)">
						© 2026 OneTool. All rights reserved.
					</p>
					<p className="text-[13.5px] text-(--ink-3)">support@onetool.biz</p>
				</div>

				<ParticleWordmark />
			</div>
		</footer>
	);
}
