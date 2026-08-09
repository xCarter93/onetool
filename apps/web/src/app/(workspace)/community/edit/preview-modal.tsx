"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import {
	CommunityPageView,
	type CommunityPageViewData,
} from "@/app/communities/[slug]/community-page-view";

interface PreviewModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Built by `buildPreviewData`, the same mapping the docked pane renders. */
	data: CommunityPageViewData;
}

export function PreviewModal({ open, onOpenChange, data }: PreviewModalProps) {
	// Lock background scroll when open
	useEffect(() => {
		if (!open) return;
		const original = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			document.body.style.overflow = original;
		};
	}, [open]);

	// Close on Escape
	useEffect(() => {
		if (!open) return;
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape") onOpenChange(false);
		};
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, [open, onOpenChange]);

	if (!open) return null;

	return (
		<div
			className="fixed inset-0 z-50 bg-background overflow-y-auto"
			role="dialog"
			aria-modal="true"
			aria-label="Page Preview"
		>
			{/* Header bar */}
			<div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-background border-b border-border/60 shadow-sm">
				<h2 className="text-base font-semibold text-fg">Page Preview</h2>
				<button
					onClick={() => onOpenChange(false)}
					className="rounded-lg p-1.5 text-muted-fg hover:text-fg hover:bg-muted/40 transition-colors"
					aria-label="Close preview"
				>
					<X className="size-5" />
				</button>
			</div>

			<CommunityPageView data={data} preview />
		</div>
	);
}
