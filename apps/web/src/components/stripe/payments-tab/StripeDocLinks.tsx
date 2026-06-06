"use client";

import React from "react";
import { ExternalLink } from "lucide-react";

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

export function StripeDocLinks() {
	return (
		<section aria-label="Stripe documentation" className="space-y-1">
			<div className="pb-1">
				<h3 className="text-lg font-semibold text-foreground">Learn more</h3>
				<p className="text-[12.5px] text-muted-foreground">
					Stripe documentation, opens in a new tab.
				</p>
			</div>
			<ul>
				{LINKS.map((link) => (
					<li key={link.href}>
						<a
							href={link.href}
							target="_blank"
							rel="noopener noreferrer"
							className="group flex items-center justify-between gap-2.5 border-t border-border/60 py-2.5 text-[13.5px] font-medium text-foreground transition-colors hover:text-primary"
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
