"use client";

import { ExternalLink } from "lucide-react";

import { cn } from "@/lib/utils";

const LINKS: { href: string; label: string }[] = [
	{ href: "https://docs.stripe.com/connect", label: "Stripe Connect overview" },
	{
		href: "https://docs.stripe.com/connect/charges",
		label: "How Connect charges work",
	},
	{
		href: "https://docs.stripe.com/connect/account-capabilities",
		label: "Account capabilities",
	},
	{ href: "https://stripe.com/pricing", label: "Stripe pricing (live rates)" },
	{ href: "https://docs.stripe.com/payouts", label: "Payouts guide" },
	{ href: "https://docs.stripe.com/disputes", label: "Disputes" },
];

export function StripeDocLinks({ columns = 1 }: { columns?: 1 | 2 }) {
	return (
		<section aria-label="Stripe documentation" className="space-y-1">
			<ul
				className={cn(
					columns === 2
						? "grid grid-cols-1 gap-x-10 sm:grid-cols-2 [&>li:last-child]:border-b-0 sm:[&>li:nth-last-child(-n+2)]:border-b-0"
						: "divide-y divide-border/60",
				)}
			>
				{LINKS.map((link) => (
					<li
						key={link.href}
						className={
							columns === 2 ? "border-b border-border/60" : undefined
						}
					>
						<a
							href={link.href}
							target="_blank"
							rel="noopener noreferrer"
							className="group flex items-center justify-between gap-2.5 py-2.5 text-[13.5px] font-medium text-foreground transition-colors hover:text-primary"
						>
							<span>{link.label}</span>
							<ExternalLink
								className="h-3.5 w-3.5 text-muted-foreground transition-colors group-hover:text-primary"
								aria-hidden="true"
							/>
						</a>
					</li>
				))}
			</ul>
		</section>
	);
}
