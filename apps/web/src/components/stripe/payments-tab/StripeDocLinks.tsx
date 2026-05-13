"use client";

import React from "react";
import { ExternalLink } from "lucide-react";

const LINKS: { href: string; label: string }[] = [
	{ href: "https://docs.stripe.com/connect.md", label: "Stripe Connect overview" },
	{ href: "https://docs.stripe.com/connect/charges.md", label: "How Connect charges work" },
	{
		href: "https://docs.stripe.com/connect/account-capabilities.md",
		label: "Account capabilities",
	},
	{ href: "https://stripe.com/pricing", label: "Stripe pricing (live rates)" },
	{ href: "https://docs.stripe.com/payouts.md", label: "Payouts guide" },
	{ href: "https://docs.stripe.com/disputes.md", label: "Disputes" },
];

export function StripeDocLinks() {
	return (
		<section aria-label="Stripe documentation" className="space-y-3">
			<h3 className="text-lg font-semibold text-foreground">Learn more</h3>
			<ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
				{LINKS.map((link) => (
					<li key={link.href} className="flex items-center gap-1.5">
						<ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
						<a
							href={link.href}
							target="_blank"
							rel="noopener noreferrer"
							className="text-sm text-primary hover:text-primary/80 transition-colors"
						>
							{link.label}
						</a>
					</li>
				))}
			</ul>
		</section>
	);
}
