"use client";

import { useEffect, useRef } from "react";
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

const FOCUSABLE_SELECTOR =
	'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function PreviewModal({ open, onOpenChange, data }: PreviewModalProps) {
	const overlayRef = useRef<HTMLDivElement>(null);
	const closeRef = useRef<HTMLButtonElement>(null);

	// Lock background scroll when open
	useEffect(() => {
		if (!open) return;
		const original = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			document.body.style.overflow = original;
		};
	}, [open]);

	// The overlay covers the editor but is a sibling of it, so focus has to be
	// moved in, kept in, and handed back — otherwise Tab walks the editor behind.
	useEffect(() => {
		if (!open) return;
		const opener = document.activeElement as HTMLElement | null;
		closeRef.current?.focus();
		return () => opener?.focus();
	}, [open]);

	// Close on Escape
	useEffect(() => {
		if (!open) return;
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onOpenChange(false);
				return;
			}
			if (e.key !== "Tab") return;
			const overlay = overlayRef.current;
			if (!overlay) return;
			const focusable = Array.from(
				overlay.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
			).filter((el) => el.offsetWidth > 0 || el.offsetHeight > 0);
			if (focusable.length === 0) return;
			const first = focusable[0];
			const last = focusable[focusable.length - 1];
			const active = document.activeElement;
			const outside = !overlay.contains(active);
			if (e.shiftKey && (outside || active === first)) {
				e.preventDefault();
				last.focus();
			} else if (!e.shiftKey && (outside || active === last)) {
				e.preventDefault();
				first.focus();
			}
		};
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, [open, onOpenChange]);

	if (!open) return null;

	return (
		<div
			ref={overlayRef}
			className="fixed inset-0 z-50 bg-background overflow-y-auto"
			role="dialog"
			aria-modal="true"
			aria-label="Page Preview"
		>
			{/* Header bar */}
			<div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-background border-b border-border/60 shadow-sm">
				<h2 className="text-base font-semibold text-foreground">Page Preview</h2>
				<button
					ref={closeRef}
					onClick={() => onOpenChange(false)}
					className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
					aria-label="Close preview"
				>
					<X className="size-5" />
				</button>
			</div>

			<CommunityPageView data={data} preview />
		</div>
	);
}
