"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { usePrefersReducedMotion } from "../use-reduced-motion";

/* FOOTER — comp lines 641–668. Not a <Section>: the final CTA above already
 * draws the closing hairline. Link columns, tagline and social set are held at
 * parity with the production footer (app/components/footer.tsx); only the
 * inking is the landing's own. */

const ParticleText = dynamic(
	() => import("@/components/react-bits/particle-text"),
	{ ssr: false }
);

type FooterLink = { name: string; href: string };

const COLUMNS: { label: string; items: FooterLink[] }[] = [
	{
		label: "Solutions",
		items: [
			{ name: "Client management", href: "/help/clients" },
			{ name: "Project tracking", href: "/help/projects-and-tasks" },
			{ name: "Quoting & invoicing", href: "/help/quotes" },
			{ name: "Task scheduling", href: "/help/projects-and-tasks" },
			{ name: "Mobile access", href: "/help/mobile-app" },
		],
	},
	{
		label: "Resources",
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

const SOCIAL: {
	name: string;
	href: string;
	icon: (props: React.SVGProps<SVGSVGElement>) => React.ReactElement;
}[] = [
	{
		name: "Facebook",
		href: "https://www.facebook.com/people/OneToolbiz/61586066428412/?mibextid=wwXIfr&rdid=Nsakx5TWeKAAhZev&share_url=https%3A%2F%2Fwww.facebook.com%2Fshare%2F1FWQx8iUPt%2F%3Fmibextid%3DwwXIfr",
		icon: (props) => (
			<svg fill="currentColor" viewBox="0 0 24 24" {...props}>
				<path
					fillRule="evenodd"
					d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z"
					clipRule="evenodd"
				/>
			</svg>
		),
	},
	{
		name: "Instagram",
		href: "https://www.instagram.com/onetool.biz?igsh=MWJiNzVyOTFjcTdtZw==",
		icon: (props) => (
			<svg fill="currentColor" viewBox="0 0 24 24" {...props}>
				<path
					fillRule="evenodd"
					d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.45 2.525c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z"
					clipRule="evenodd"
				/>
			</svg>
		),
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
				<p className="flex h-full select-none items-center justify-center text-[min(16vw,300px)] font-semibold leading-[0.78] tracking-[-0.05em] text-(--rule-2)">
					OneTool
				</p>
			)}
		</div>
	);
}

function FooterItem({ item }: { item: FooterLink }) {
	// mailto: stays a plain <a>; real routes get the router.
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
			<div className="mx-auto max-w-[1560px]">
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
							Streamlining business operations for companies that serve their
							communities. Built by entrepreneurs, for entrepreneurs.
						</p>
						{/* landing.css owns smooth scroll (and its reduced-motion downgrade). */}
						<a href="#top" className={`${FOOTER_LINK} justify-self-start`}>
							Back to top <span aria-hidden="true">↑</span>
						</a>
					</div>

					<nav
						aria-label="Footer"
						className="grid grid-cols-2 gap-x-12 gap-y-8 sm:grid-cols-3"
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
						© {new Date().getFullYear()} OneTool. All rights reserved.
					</p>
					{/* Negative margin cancels the padding that grows each icon to a 44px
					    target, so the glyphs keep their visual gap against the rule. */}
					<div className="-mx-2.5 flex gap-x-1">
						{SOCIAL.map((item) => (
							<a
								key={item.name}
								href={item.href}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex size-11 items-center justify-center rounded-sm text-(--ink-2) transition-colors hover:text-(--ink) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink)"
							>
								<span className="sr-only">{item.name}</span>
								<item.icon aria-hidden="true" className="size-5 sm:size-[22px]" />
							</a>
						))}
					</div>
				</div>

				<ParticleWordmark />
			</div>
		</footer>
	);
}
