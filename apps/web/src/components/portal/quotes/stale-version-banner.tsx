"use client";

/**
 * StaleVersionBanner — replaces the Approve CTA when document version drift
 * is detected (mid-session republish OR server 409 stale response).
 */

import { RefreshCw } from "lucide-react";

export interface StaleVersionBannerProps {
	onReload: () => void;
}

export function StaleVersionBanner({ onReload }: StaleVersionBannerProps) {
	return (
		<div
			role="status"
			aria-live="polite"
			className="rounded-xl border border-amber-300 bg-amber-50 p-4"
		>
			<div className="flex items-start gap-3">
				<RefreshCw
					className="h-4 w-4 mt-0.5 text-amber-700 shrink-0"
					aria-hidden="true"
				/>
				<div className="flex-1">
					<p className="text-[14px] font-semibold text-foreground">
						This quote was updated.
					</p>
					<p className="mt-1 text-[13px] text-muted-foreground">
						Showing the latest version now. Please re-review and sign again.
					</p>
				</div>
			</div>
			<button
				type="button"
				onClick={onReload}
				className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-[13px] font-medium text-foreground hover:bg-muted transition-colors"
			>
				Reload latest version
			</button>
		</div>
	);
}
