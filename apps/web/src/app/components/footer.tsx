"use client";

import Image from "next/image";
import { FooterWordmark } from "@/app/components/landing/footer-wordmark";

const navigation = {
	solutions: [
		{ name: "Client Management", href: "/help/clients" },
		{ name: "Project Tracking", href: "/help/projects-and-tasks" },
		{ name: "Quoting & Invoicing", href: "/help/quotes" },
		{ name: "Task Scheduling", href: "/help/projects-and-tasks" },
		{ name: "Mobile Access", href: "/help/mobile-app" },
	],
	resources: [
		{ name: "Help Center", href: "/help" },
		{ name: "Getting Started", href: "/help/getting-started" },
		{ name: "Contact Support", href: "mailto:support@onetool.biz" },
	],
	legal: [
		{ name: "Terms of Service", href: "/terms-of-service" },
		{ name: "Privacy Policy", href: "/privacy-policy" },
		{ name: "Data Security", href: "/data-security" },
	],
	social: [
		{
			name: "Facebook",
			href: "https://www.facebook.com/people/OneToolbiz/61586066428412/?mibextid=wwXIfr&rdid=Nsakx5TWeKAAhZev&share_url=https%3A%2F%2Fwww.facebook.com%2Fshare%2F1FWQx8iUPt%2F%3Fmibextid%3DwwXIfr",
			icon: (props: React.SVGProps<SVGSVGElement>) => (
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
			icon: (props: React.SVGProps<SVGSVGElement>) => (
				<svg fill="currentColor" viewBox="0 0 24 24" {...props}>
					<path
						fillRule="evenodd"
						d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.45 2.525c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z"
						clipRule="evenodd"
					/>
				</svg>
			),
		},
	],
};

const linkColumns: {
	label: string;
	items: { name: string; href: string }[];
}[] = [
	{ label: "Solutions", items: navigation.solutions },
	{ label: "Resources", items: navigation.resources },
	{ label: "Legal", items: navigation.legal },
];

const FOOTER_LINK =
	"rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/** Last sheet in the set: no border-b, the shell rail closes the drawing. */
export default function Footer() {
	function scrollToTop() {
		const prefersReducedMotion = window.matchMedia(
			"(prefers-reduced-motion: reduce)"
		).matches;
		window.scrollTo({
			top: 0,
			behavior: prefersReducedMotion ? "auto" : "smooth",
		});
	}

	return (
		// No border-t: the G-004 sheet above already draws its border-b — stacking
		// both prints a doubled seam rule.
		<footer className="p-6 sm:p-10 lg:p-14">
			<div className="grid grid-cols-1 gap-12 lg:grid-cols-[auto_1fr] lg:gap-16">
				<div className="space-y-5">
					<button onClick={scrollToTop} className={FOOTER_LINK}>
						Back to top
						<span aria-hidden="true"> &uarr;</span>
					</button>
					<p className="max-w-xs text-sm leading-6 text-muted-foreground">
						Streamlining business operations for companies that serve their
						communities. Built by entrepreneurs, for entrepreneurs.
					</p>
				</div>

				<nav
					aria-label="Footer"
					className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3 lg:gap-x-12"
				>
					{linkColumns.map((column) => (
						<div key={column.label}>
							<p className="mb-5 text-[11px] font-semibold uppercase leading-none tracking-[0.14em] text-bp-anno">
								{column.label}
							</p>
							<ul className="space-y-3">
								{column.items.map((item) => (
									<li key={item.name}>
										<a href={item.href} className={FOOTER_LINK}>
											{item.name}
										</a>
									</li>
								))}
							</ul>
						</div>
					))}
				</nav>

			</div>

			<div className="mt-16 border-t border-bp-line pt-8 lg:mt-24">
				<div className="flex flex-col-reverse items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
					<div className="flex items-center gap-4">
						<Image
							src="/OneTool.png"
							alt="OneTool"
							width={150}
							height={150}
							className="w-[130px] rounded-md dark:brightness-0 dark:invert"
						/>
						<p className="text-sm text-muted-foreground">
							&copy; {new Date().getFullYear()} OneTool. All rights reserved.
						</p>
					</div>

					<div className="flex gap-x-5">
						{navigation.social.map((item) => (
							<a
								key={item.name}
								href={item.href}
								className="rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
							>
								<span className="sr-only">{item.name}</span>
								<item.icon aria-hidden="true" className="size-5 sm:size-6" />
							</a>
						))}
					</div>
				</div>

				{/* Sheet-bottom wordmark: artwork, not text — aria-hidden, and
				    particle-settled when motion is allowed. */}
				<FooterWordmark />
			</div>
		</footer>
	);
}
