"use client";

import { useEffect, useState } from "react";
import { Phone, Send } from "lucide-react";
import { cn } from "@/lib/utils";

interface MobileActionBarProps {
	contactFormId: string;
	/** Business phone, when the org has one. Adds a tap-to-call action. */
	phone?: string;
}

/**
 * Phone-only sticky action bar. Retracts while the quote form is on screen so
 * it never covers the fields it points at. Splits into call + quote when a
 * phone number exists — for trades, a call often converts better than a form.
 */
export function MobileActionBar({ contactFormId, phone }: MobileActionBarProps) {
	const [isFormVisible, setIsFormVisible] = useState(true);

	useEffect(() => {
		const target = document.getElementById(contactFormId);
		if (!target) return;

		const observer = new IntersectionObserver(
			([entry]) => setIsFormVisible(entry.isIntersecting),
			{ threshold: 0 }
		);

		observer.observe(target);
		return () => observer.disconnect();
	}, [contactFormId]);

	return (
		<div
			className={cn(
				"fixed inset-x-0 bottom-0 z-30 lg:hidden",
				"border-t border-border bg-bg/95 supports-[backdrop-filter]:bg-bg/85 backdrop-blur",
				"px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]",
				"transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
				isFormVisible ? "translate-y-full" : "translate-y-0"
			)}
			// Hidden from AT while retracted; the form itself is on screen instead.
			aria-hidden={isFormVisible}
			inert={isFormVisible ? true : undefined}
		>
			<div className="flex items-center gap-3">
				{phone && (
					<a
						href={`tel:${phone}`}
						className="flex-1 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-bg px-4 text-sm font-medium text-fg transition-colors duration-200 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
					>
						<Phone className="size-4" aria-hidden="true" />
						Call
					</a>
				)}
				<button
					type="button"
					onClick={() =>
						document
							.getElementById(contactFormId)
							?.scrollIntoView({ behavior: "smooth", block: "start" })
					}
					className="flex-1 inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-primary px-4 text-sm font-medium text-primary-fg transition-colors duration-200 hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
				>
					<Send className="size-4" aria-hidden="true" />
					Get a free quote
				</button>
			</div>
		</div>
	);
}
