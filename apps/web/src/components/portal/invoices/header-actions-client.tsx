"use client";

import { Download, Printer } from "lucide-react";

export function HeaderActionsClient({ hasPdf }: { hasPdf: boolean }) {
	return (
		<div className="flex items-center gap-2">
			{hasPdf ? (
				<button
					type="button"
					// Plan 05 wires the real click (signed URL fetch + window.open).
					// Wave 1 ships visual gating only.
					className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-[13px] font-medium hover:bg-accent"
				>
					<Download className="h-3.5 w-3.5" aria-hidden="true" />
					Download PDF
				</button>
			) : null}
			<button
				type="button"
				onClick={() => window.print()}
				className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-[13px] font-medium hover:bg-accent"
			>
				<Printer className="h-3.5 w-3.5" aria-hidden="true" />
				Print Invoice
			</button>
		</div>
	);
}
