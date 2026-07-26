import Image from "next/image";
import Link from "next/link";

const footerLinks = [
	{ label: "Help Center", href: "/help" },
	{ label: "Contact support", href: "mailto:support@onetool.biz" },
	{ label: "Terms of Service", href: "/terms-of-service" },
	{ label: "Privacy Policy", href: "/privacy-policy" },
	{ label: "Data Security", href: "/data-security" },
];

export function HelpFooter() {
	return (
		<footer className="border-t border-border/60 bg-muted/30">
			<div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6 lg:px-8">
				<div className="flex items-center gap-3">
					<Image
						src="/OneTool.png"
						alt="OneTool"
						width={110}
						height={110}
						className="rounded-md dark:brightness-0 dark:invert"
					/>
					<span className="text-sm text-muted-foreground">
						&copy; {new Date().getFullYear()} OneTool. All rights reserved.
					</span>
				</div>
				<nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm">
					{footerLinks.map((link) =>
						link.href.startsWith("/") ? (
							<Link
								key={link.label}
								href={link.href}
								className="text-muted-foreground transition-colors hover:text-foreground"
							>
								{link.label}
							</Link>
						) : (
							<a
								key={link.label}
								href={link.href}
								className="text-muted-foreground transition-colors hover:text-foreground"
							>
								{link.label}
							</a>
						)
					)}
				</nav>
			</div>
		</footer>
	);
}
