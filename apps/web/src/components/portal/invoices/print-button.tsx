"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
	return (
		<button
			type="button"
			onClick={() => window.print()}
			className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-[13px] font-medium hover:bg-accent"
		>
			<Printer className="h-3.5 w-3.5" aria-hidden="true" />
			Print Invoice
		</button>
	);
}
