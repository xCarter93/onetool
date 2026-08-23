"use client";

import * as React from "react";
import { Check, Copy, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { LAUNCH_PROMO, useLaunchPromoActive } from "@/lib/promo";

/**
 * Copyable promo-code chip. One click copies the code; feedback is the quiet
 * inline icon swap rather than a toast.
 */
export function PromoCodeChip({
	code,
	className,
}: {
	code: string;
	className?: string;
}) {
	const [copied, setCopied] = React.useState(false);
	const timerRef = React.useRef<number | undefined>(undefined);

	React.useEffect(() => () => window.clearTimeout(timerRef.current), []);

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(code);
		} catch {
			return;
		}
		setCopied(true);
		window.clearTimeout(timerRef.current);
		timerRef.current = window.setTimeout(() => setCopied(false), 2000);
	};

	return (
		<button
			type="button"
			onClick={copy}
			aria-label={`Copy promo code ${code}`}
			className={cn(
				"inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-primary/45 bg-primary/5 py-1.5 pl-3 pr-2.5 font-mono text-sm font-semibold tracking-wide text-foreground transition-colors hover:border-primary/70 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
				className,
			)}
		>
			{code}
			<span aria-live="polite">
				{copied ? (
					<Check className="size-3.5 text-success" aria-label="Copied" />
				) : (
					<Copy
						className="size-3.5 text-muted-foreground"
						aria-hidden="true"
					/>
				)}
			</span>
		</button>
	);
}

/**
 * Launch-offer banner for the onboarding plan step: both codes with their
 * terms, shown only while the promo window is open.
 */
export function LaunchPromoBanner({ className }: { className?: string }) {
	const promoActive = useLaunchPromoActive();
	if (!promoActive) {
		return null;
	}

	return (
		<div
			className={cn(
				"rounded-xl border border-primary/20 bg-primary/5 p-4 sm:p-5",
				className,
			)}
		>
			<div className="flex items-center gap-2">
				<Tag className="size-4 text-primary" aria-hidden="true" />
				<p className="text-sm font-semibold">
					Launch offer, ends {LAUNCH_PROMO.endsLabel}
				</p>
			</div>
			<div className="mt-3 flex flex-col gap-2.5 sm:flex-row sm:gap-6">
				{([LAUNCH_PROMO.annual, LAUNCH_PROMO.monthly] as const).map(
					(offer) => (
						<div key={offer.code} className="flex items-center gap-2.5">
							<PromoCodeChip code={offer.code} />
							<span className="text-sm text-muted-foreground">
								{offer.label}
							</span>
						</div>
					),
				)}
			</div>
			<p className="mt-3 text-xs text-muted-foreground">
				Copy your code, then enter it at checkout under “Add promo code”.
			</p>
		</div>
	);
}
