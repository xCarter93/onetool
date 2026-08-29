"use client";

import { formatCurrency } from "@/lib/money";

export interface EntityEmailPreviewProps {
	entityType: "quote" | "invoice";
	orgName: string;
	orgLogoUrl?: string;
	orgEmail?: string;
	orgPhone?: string;
	/** First name of the primary contact, or "there" when unknown. */
	greetingName: string;
	/** Quote/invoice number as the client sees it. */
	numberLabel?: string;
	/** Quote title, shown above the summary. Quotes only. */
	title?: string;
	amount: number;
	/** Formatted valid-until (quote) or due date (invoice). */
	dateLabel?: string;
	ctaLabel: string;
	/** Invoices only: the org can collect card payments in the portal. */
	takesPayment?: boolean;
}

function initials(name: string): string {
	const letters = name
		.trim()
		.split(/\s+/)
		.slice(0, 2)
		.map((word) => word.charAt(0).toUpperCase())
		.join("");
	return letters || "?";
}

function SummaryCell({ label, value }: { label: string; value: string }) {
	return (
		<div className="min-w-0">
			<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
				{label}
			</p>
			<p className="truncate text-sm font-semibold text-foreground tabular-nums">
				{value}
			</p>
		</div>
	);
}

/**
 * Static approximation of the quoteReady/invoiceReady react-email templates.
 * Close enough to set expectations before sending; the real email renders
 * server-side from the same fields.
 */
export function EntityEmailPreview({
	entityType,
	orgName,
	orgLogoUrl,
	orgEmail,
	orgPhone,
	greetingName,
	numberLabel,
	title,
	amount,
	dateLabel,
	ctaLabel,
	takesPayment = false,
}: EntityEmailPreviewProps) {
	const isQuote = entityType === "quote";
	const contactLine = [orgEmail, orgPhone].filter(Boolean).join(" · ");

	return (
		<div className="overflow-hidden rounded-lg border border-border bg-background">
			<div className="flex items-center gap-3 border-b border-border px-5 py-4">
				{orgLogoUrl ? (
					// eslint-disable-next-line @next/next/no-img-element -- org logos are arbitrary remote URLs
					<img
						src={orgLogoUrl}
						alt={orgName}
						className="max-h-8 max-w-[160px] object-contain"
					/>
				) : (
					<>
						<span
							aria-hidden="true"
							className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground"
						>
							{initials(orgName)}
						</span>
						<span className="truncate text-base font-bold text-foreground">
							{orgName}
						</span>
					</>
				)}
			</div>

			<div className="space-y-4 px-5 py-5">
				<div className="space-y-2">
					<p className="text-lg font-semibold text-foreground">
						Your {isQuote ? "quote" : "invoice"} is ready
					</p>
					<p className="text-sm text-muted-foreground">
						Hi {greetingName},
					</p>
					<p className="text-sm text-foreground">
						{isQuote
							? `${orgName} has prepared a quote for you. You can review the details and approve it from your client portal.`
							: `${orgName} has sent you an invoice. You can view the details ${takesPayment ? "and pay securely " : ""}from your client portal.`}
					</p>
				</div>

				{isQuote && title ? (
					<p className="text-sm font-semibold text-foreground">{title}</p>
				) : null}

				<div className="flex flex-wrap gap-x-8 gap-y-3 rounded-md bg-muted/60 px-4 py-3">
					{numberLabel ? (
						<SummaryCell
							label={isQuote ? "Quote" : "Invoice"}
							value={numberLabel}
						/>
					) : null}
					<SummaryCell
						label={isQuote ? "Total" : "Amount due"}
						value={formatCurrency(amount)}
					/>
					{dateLabel ? (
						<SummaryCell
							label={isQuote ? "Valid until" : "Due date"}
							value={dateLabel}
						/>
					) : null}
				</div>

				<div className="flex justify-center pt-1">
					<span
						role="presentation"
						className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground"
					>
						{ctaLabel}
					</span>
				</div>

				<p className="text-center text-xs text-muted-foreground">
					For security, they will be asked to sign in with their email
					address before viewing the {isQuote ? "quote" : "invoice"}.
				</p>
			</div>

			<div className="space-y-1 border-t border-border bg-muted/40 px-5 py-4">
				<p className="text-xs font-semibold text-foreground">{orgName}</p>
				{contactLine ? (
					<p className="text-xs text-muted-foreground">{contactLine}</p>
				) : null}
				<p className="text-xs font-semibold text-muted-foreground">
					Powered by OneTool
				</p>
			</div>
		</div>
	);
}
