"use client";

import { useState } from "react";
import { Download } from "lucide-react";

import { useToast } from "@/hooks/use-toast";

export interface DownloadPdfButtonProps {
	invoiceId: string;
	hasPdf: boolean;
	variant?: "header" | "panel";
}

export function DownloadPdfButton({
	invoiceId,
	hasPdf,
	variant = "header",
}: DownloadPdfButtonProps) {
	const { error: showError } = useToast();
	const [busy, setBusy] = useState(false);

	// Decision B: hide entirely when the workspace hasn't generated a PDF yet.
	if (!hasPdf) return null;

	async function handleClick() {
		setBusy(true);
		try {
			const res = await fetch(`/api/portal/invoices/${invoiceId}/pdf`, {
				credentials: "same-origin",
			});
			if (!res.ok) {
				showError(
					"Couldn't download PDF",
					"Please try again in a moment.",
				);
				return;
			}
			const body = (await res.json()) as unknown;
			if (
				!body ||
				typeof body !== "object" ||
				typeof (body as { url?: unknown }).url !== "string" ||
				(body as { url: string }).url.length === 0
			) {
				showError(
					"Couldn't download PDF",
					"The download link was missing. Please try again.",
				);
				return;
			}
			// noopener,noreferrer prevents the new tab from accessing window.opener
			// and strips Referer to the short-lived Convex storage URL.
			window.open(
				(body as { url: string }).url,
				"_blank",
				"noopener,noreferrer",
			);
		} catch {
			showError(
				"Couldn't download PDF",
				"Please try again in a moment.",
			);
		} finally {
			setBusy(false);
		}
	}

	const className =
		variant === "panel"
			? "inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-[13px] font-medium text-emerald-800 hover:bg-emerald-50 disabled:opacity-60 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-900/40"
			: "inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-[13px] font-medium hover:bg-accent disabled:opacity-60";

	return (
		<button
			type="button"
			onClick={handleClick}
			disabled={busy}
			className={className}
		>
			<Download className="h-3.5 w-3.5" aria-hidden="true" />
			{busy ? "Preparing…" : "Download PDF"}
		</button>
	);
}
