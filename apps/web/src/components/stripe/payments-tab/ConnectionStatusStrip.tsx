"use client";

import React from "react";
import { ShieldCheck, CircleCheck, CreditCard, ChevronDown } from "lucide-react";
import { formatRelativeTime } from "@/lib/notification-utils";

interface ConnectionStatusStripProps {
	accountId: string;
	detailsSubmitted: boolean;
	chargesEnabled: boolean;
	payoutsEnabled: boolean;
	bankName?: string;
	last4?: string;
	updatedAt?: number;
	// Opens the embedded Payouts accordion (the only place a dashboard:"none"
	// account can edit its external account) and scrolls it into view.
	onChangeBank?: () => void;
}

type Capability = { label: string; enabled: boolean };

function CapabilityItem({ label, enabled }: Capability) {
	return (
		<div className="flex flex-1 flex-col justify-center gap-1.5 px-4 py-1">
			<span className="inline-flex items-center gap-1.5">
				{enabled ? (
					<CircleCheck className="h-4 w-4 text-success" aria-hidden="true" />
				) : (
					<span
						aria-hidden="true"
						className="h-2.5 w-2.5 rounded-full bg-amber-500 dark:bg-amber-400"
					/>
				)}
				<span className="text-sm font-semibold text-foreground">
					{enabled ? "Yes" : "Pending"}
				</span>
			</span>
			<span className="text-xs leading-tight text-muted-foreground">{label}</span>
		</div>
	);
}

export function ConnectionStatusStrip({
	accountId,
	detailsSubmitted,
	chargesEnabled,
	payoutsEnabled,
	bankName,
	last4,
	updatedAt,
	onChangeBank,
}: ConnectionStatusStripProps) {
	const capabilities: Capability[] = [
		{ label: "Details submitted", enabled: detailsSubmitted },
		{ label: "Charges enabled", enabled: chargesEnabled },
		{ label: "Payouts enabled", enabled: payoutsEnabled },
	];

	return (
		<div className="flex flex-wrap items-stretch gap-y-5">
			{/* Identity */}
			<div className="flex min-w-[260px] flex-[1_1_280px] items-center gap-3 pr-5">
				<span className="grid h-11 w-11 shrink-0 place-content-center rounded-xl border border-success/25 bg-success/10 text-success">
					<ShieldCheck className="h-5 w-5" aria-hidden="true" />
				</span>
				<div className="min-w-0">
					<div className="mb-0.5 flex items-center gap-2">
						<span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
							Connected account
						</span>
						<span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
							<span
								aria-hidden="true"
								className="h-1.5 w-1.5 rounded-full bg-success"
							/>
							Active
						</span>
					</div>
					<p className="truncate font-mono text-[13px] text-foreground">
						{accountId}
					</p>
				</div>
			</div>

			{/* Capabilities */}
			<div className="flex flex-[2_1_360px] items-stretch border-border sm:border-l">
				{capabilities.map((cap, i) => (
					<React.Fragment key={cap.label}>
						{i > 0 && <span aria-hidden="true" className="w-px bg-border" />}
						<CapabilityItem label={cap.label} enabled={cap.enabled} />
					</React.Fragment>
				))}
			</div>

			{/* Bank */}
			<div className="flex flex-[1_1_250px] flex-col justify-center gap-2.5 border-border pl-0 sm:border-l sm:pl-5">
				{last4 ? (
					<>
						<div className="flex items-center gap-2.5">
							<span className="grid h-9 w-9 shrink-0 place-content-center rounded-lg border border-border bg-muted text-muted-foreground">
								<CreditCard className="h-4 w-4" aria-hidden="true" />
							</span>
							<div className="min-w-0">
								<p className="whitespace-nowrap text-[13px] font-semibold text-foreground">
									{bankName ?? "Linked bank"}{" "}
									<span className="font-mono font-medium text-muted-foreground">
										••••{last4}
									</span>
								</p>
								{typeof updatedAt === "number" && (
									<p className="whitespace-nowrap text-[11.5px] text-muted-foreground">
										Updated {formatRelativeTime(updatedAt)}
									</p>
								)}
							</div>
						</div>
						{onChangeBank && (
							<button
								type="button"
								onClick={onChangeBank}
								className="inline-flex items-center gap-1 self-start whitespace-nowrap text-xs font-semibold text-primary transition-opacity hover:opacity-80"
							>
								Change payout account
								<ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
							</button>
						)}
					</>
				) : (
					<p className="text-sm text-muted-foreground">
						No bank account linked yet — finish Stripe onboarding to enable
						payouts.
					</p>
				)}
			</div>
		</div>
	);
}
