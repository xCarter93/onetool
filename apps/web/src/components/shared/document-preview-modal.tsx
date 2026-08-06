"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { TriangleAlert } from "lucide-react";

export interface DocumentPreviewModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Dialog heading, e.g. "Quote preview". */
	title: string;
	/** Optional sub-line under the heading. */
	description?: string;
	/**
	 * Renders the document the caller wants previewed. Must resolve to a PDF
	 * blob. Called once each time the modal opens.
	 */
	renderDocument: () => Promise<Blob>;
	/** Footer primary action. Omit for a preview-only modal. */
	primaryAction?: {
		label: string;
		onAction: () => void;
		disabled?: boolean;
	};
	/** File name used by the fallback download link. */
	downloadFileName?: string;
}

/**
 * Entity-agnostic client-side document preview. The caller owns the document
 * template; this only handles render lifecycle, object-URL cleanup, and the
 * browsers that refuse to inline PDFs.
 */
export function DocumentPreviewModal({
	open,
	onOpenChange,
	title,
	description,
	renderDocument,
	primaryAction,
	downloadFileName = "document.pdf",
}: DocumentPreviewModalProps) {
	const [url, setUrl] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const urlRef = useRef<string | null>(null);
	// Keeps a late-resolving render from overwriting a newer one.
	const renderTokenRef = useRef(0);

	const releaseUrl = useCallback(() => {
		if (urlRef.current) {
			URL.revokeObjectURL(urlRef.current);
			urlRef.current = null;
		}
		setUrl(null);
	}, []);

	useEffect(() => {
		if (!open) return;

		const token = ++renderTokenRef.current;
		let cancelled = false;

		void (async () => {
			try {
				const blob = await renderDocument();
				if (cancelled || renderTokenRef.current !== token) return;
				const objectUrl = URL.createObjectURL(blob);
				urlRef.current = objectUrl;
				setUrl(objectUrl);
			} catch (err) {
				if (cancelled || renderTokenRef.current !== token) return;
				setError(
					err instanceof Error
						? err.message
						: "Something went wrong while building the preview."
				);
			}
		})();

		// Runs on close and on unmount: drops the object URL and resets state so
		// the next open starts from the loading view rather than a stale render.
		return () => {
			cancelled = true;
			renderTokenRef.current += 1;
			releaseUrl();
			setError(null);
		};
		// renderDocument is intentionally not a dependency: callers rebuild the
		// closure on every render, which would restart the render loop forever.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open, releaseUrl]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="grid h-[85vh] w-[min(90vw,900px)] grid-rows-[auto_1fr_auto] sm:max-w-none">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					{description ? (
						<DialogDescription>{description}</DialogDescription>
					) : null}
				</DialogHeader>

				<div className="min-h-0 overflow-hidden rounded-lg border border-border bg-muted/40">
					{error ? (
						<div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
							<TriangleAlert
								className="h-8 w-8 text-warning"
								aria-hidden="true"
							/>
							<p className="text-sm font-medium text-foreground">
								Preview could not be built
							</p>
							<p className="max-w-sm text-sm text-muted-foreground">
								{error}
							</p>
						</div>
					) : url ? (
						<object
							data={url}
							type="application/pdf"
							className="h-full w-full"
							aria-label={title}
						>
							<div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
								<p className="text-sm text-muted-foreground">
									This browser cannot show PDFs inline.
								</p>
								<a
									href={url}
									download={downloadFileName}
									className="rounded-md text-sm font-medium text-primary underline underline-offset-4 hover:text-primary/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
								>
									Download the preview
								</a>
							</div>
						</object>
					) : (
						<div className="flex h-full flex-col gap-4 p-6">
							<div className="flex items-center gap-2 text-sm text-muted-foreground">
								<Spinner
									className="motion-reduce:animate-none"
									aria-hidden="true"
								/>
								<span aria-live="polite">Preparing preview…</span>
							</div>
							<Skeleton className="h-8 w-1/3" />
							<Skeleton className="h-4 w-2/3" />
							<Skeleton className="flex-1 w-full" />
						</div>
					)}
				</div>

				<DialogFooter>
					<DialogClose render={<Button variant="outline" />}>
						Close
					</DialogClose>
					{primaryAction ? (
						<Button
							onClick={primaryAction.onAction}
							disabled={primaryAction.disabled}
						>
							{primaryAction.label}
						</Button>
					) : null}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
