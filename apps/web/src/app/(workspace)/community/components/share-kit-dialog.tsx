"use client";

import * as React from "react";
import { Copy, Check, Download, Loader2 } from "lucide-react";

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const COPY_FEEDBACK_DURATION_MS = 2000;

interface ShareKitDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Absolute public URL of the community page. */
	url: string;
	slug: string;
	businessName: string;
}

/** Everything a field-service owner needs to put the page somewhere real. */
function buildBlurbs(businessName: string, url: string) {
	return [
		{
			id: "bio",
			label: "Social bio",
			text: `See our work and request a free quote: ${url}`,
		},
		{
			id: "post",
			label: "Post or text message",
			text: `${businessName} is online. Browse our services, see photos of recent jobs, and request a free quote in about a minute: ${url}`,
		},
		{
			id: "signature",
			label: "Email signature",
			text: `${businessName} · Request a quote: ${url}`,
		},
	];
}

function triggerDownload(href: string, filename: string) {
	const link = document.createElement("a");
	link.href = href;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	link.remove();
}

/**
 * Share kit: a QR code the owner can print, the link, and paste-ready copy.
 * The QR is generated in the browser — no image-generation route, and the
 * library is loaded only when this dialog opens.
 */
export function ShareKitDialog({
	open,
	onOpenChange,
	url,
	slug,
	businessName,
}: ShareKitDialogProps) {
	const toast = useToast();
	const [pngDataUrl, setPngDataUrl] = React.useState<string | null>(null);
	const [svgMarkup, setSvgMarkup] = React.useState<string | null>(null);
	const [qrFailed, setQrFailed] = React.useState(false);
	const [copiedId, setCopiedId] = React.useState<string | null>(null);

	React.useEffect(() => {
		if (!open || !url) return;
		let cancelled = false;

		void (async () => {
			try {
				const QRCode = (await import("qrcode")).default;
				const [png, svg] = await Promise.all([
					QRCode.toDataURL(url, { margin: 4, width: 1024 }),
					QRCode.toString(url, { type: "svg", margin: 4, width: 1024 }),
				]);
				if (cancelled) return;
				setPngDataUrl(png);
				setSvgMarkup(svg);
			} catch {
				if (!cancelled) setQrFailed(true);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [open, url]);

	const copy = React.useCallback(
		(id: string, text: string, description: string) => {
			void navigator.clipboard.writeText(text);
			setCopiedId(id);
			setTimeout(() => setCopiedId(null), COPY_FEEDBACK_DURATION_MS);
			toast.success("Copied", description);
		},
		[toast]
	);

	const blurbs = React.useMemo(
		() => buildBlurbs(businessName, url),
		[businessName, url]
	);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>Share your page</DialogTitle>
					<DialogDescription>
						Print the code for a truck door or a yard sign, or paste the copy
						below wherever your customers already look for you.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-6 p-4 pt-2">
					{/* QR + downloads */}
					<div className="flex items-center gap-5">
						<div className="flex size-32 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted">
							{pngDataUrl ? (
								// eslint-disable-next-line @next/next/no-img-element
								<img
									src={pngDataUrl}
									alt={`QR code linking to ${url}`}
									className="size-full"
								/>
							) : qrFailed ? (
								<span className="px-2 text-center text-xs text-muted-foreground">
									Code unavailable
								</span>
							) : (
								<Loader2
									className="size-5 animate-spin text-muted-foreground motion-reduce:animate-none"
									aria-label="Generating QR code"
								/>
							)}
						</div>
						<div className="min-w-0 space-y-2">
							<p className="text-sm font-medium text-foreground">QR code</p>
							<p className="text-xs text-muted-foreground">
								Points straight at your page. PNG for print, SVG to scale
								without going fuzzy.
							</p>
							<div className="flex flex-wrap gap-2 pt-1">
								<Button
									variant="outline"
									size="sm"
									disabled={!pngDataUrl}
									onClick={() =>
										pngDataUrl && triggerDownload(pngDataUrl, `${slug}-qr.png`)
									}
								>
									<Download className="size-4 mr-2" />
									PNG
								</Button>
								<Button
									variant="outline"
									size="sm"
									disabled={!svgMarkup}
									onClick={() => {
										if (!svgMarkup) return;
										const blob = new Blob([svgMarkup], {
											type: "image/svg+xml",
										});
										const href = URL.createObjectURL(blob);
										triggerDownload(href, `${slug}-qr.svg`);
										// Revoking in the same task aborts the download in
										// Safari and Firefox.
										setTimeout(() => URL.revokeObjectURL(href), 1000);
									}}
								>
									<Download className="size-4 mr-2" />
									SVG
								</Button>
							</div>
						</div>
					</div>

					{/* Link */}
					<div className="space-y-2">
						<p className="text-sm font-medium text-foreground">Link</p>
						<div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
							<span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
								{url}
							</span>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => copy("url", url, "Page link is on your clipboard")}
							>
								{copiedId === "url" ? (
									<Check className="size-4 text-success" />
								) : (
									<Copy className="size-4" />
								)}
								<span className="sr-only">Copy page link</span>
							</Button>
						</div>
					</div>

					{/* Paste-ready copy */}
					<div className="space-y-2">
						<p className="text-sm font-medium text-foreground">
							Paste-ready copy
						</p>
						<ul className="space-y-2">
							{blurbs.map((blurb) => (
								<li
									key={blurb.id}
									className="rounded-lg border border-border p-3"
								>
									<div className="flex items-start justify-between gap-3">
										<div className="min-w-0">
											<p className="text-xs font-medium text-muted-foreground">
												{blurb.label}
											</p>
											<p
												className={cn(
													"mt-1 text-sm text-foreground",
													"break-words"
												)}
											>
												{blurb.text}
											</p>
										</div>
										<Button
											variant="ghost"
											size="sm"
											className="shrink-0"
											onClick={() =>
												copy(blurb.id, blurb.text, `${blurb.label} copied`)
											}
										>
											{copiedId === blurb.id ? (
												<Check className="size-4 text-success" />
											) : (
												<Copy className="size-4" />
											)}
											<span className="sr-only">Copy {blurb.label}</span>
										</Button>
									</div>
								</li>
							))}
						</ul>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
