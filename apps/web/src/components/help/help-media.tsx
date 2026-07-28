"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Expand, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
	helpImageSrcSet,
	helpImageUrl,
	helpVideoPosterUrl,
	helpVideoUrl,
} from "@/lib/help/media";
import { MediaPlaceholder } from "./media-placeholder";

/** Crisp at 2x for the ~960px tall box the lightbox renders, without a huge fetch. */
const EXPANDED_WIDTH = 1920;

const SPRING = { type: "spring" as const, stiffness: 300, damping: 30 };

/** What the trigger captures at click time so the lightbox can size itself. */
interface Expansion {
	/** Intrinsic ratio, so the expanded box is correct on the first frame. */
	aspect: number;
}

interface HelpMediaProps {
	media: "image" | "video";
	caption: string;
	/** Cloudinary public ID under `OneTool/help/`. */
	asset: string;
	className?: string;
}

/**
 * Renders a help screenshot or recording from Cloudinary, falling back to the
 * "coming soon" frame when the asset 404s. That keeps unshot slots looking
 * deliberate without anyone maintaining a list of which ones exist — each one
 * goes live the moment it lands in Cloudinary.
 *
 * Screenshots expand into a lightbox on click. Recordings do not: they already
 * carry native controls including fullscreen, and morphing a playing video is
 * visibly rough.
 */
export function HelpMedia({ media, caption, asset, className }: HelpMediaProps) {
	const [missing, setMissing] = useState(false);
	const [expansion, setExpansion] = useState<Expansion | null>(null);
	const [pending, setPending] = useState(false);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const imgRef = useRef<HTMLImageElement>(null);
	const preloadRef = useRef<HTMLImageElement | null>(null);
	const reduceMotion = useReducedMotion();

	// Warm the full-size source on intent, so the click usually opens instantly.
	// Cloudinary generates a derived asset on its first request, so this also
	// absorbs that one-time transform cost before anyone is waiting on it.
	const preload = useCallback(() => {
		if (preloadRef.current) return preloadRef.current;
		const img = new window.Image();
		img.src = helpImageUrl(asset, EXPANDED_WIDTH);
		preloadRef.current = img;
		return img;
	}, [asset]);

	// Open only once the full-size image is decodable. Expanding onto an
	// upscaled preview defeats the point — the reason to expand a screenshot is
	// to read detail that is not legible inline.
	const open = useCallback(async () => {
		const el = imgRef.current;
		const aspect =
			el && el.naturalWidth && el.naturalHeight
				? el.naturalWidth / el.naturalHeight
				: 16 / 9;

		const full = preload();
		if (full.complete && full.naturalWidth) {
			setExpansion({ aspect });
			return;
		}

		setPending(true);
		try {
			await full.decode();
		} catch {
			// A decode failure still opens: the <img> below re-requests and can
			// surface its own error state rather than leaving the click dead.
		}
		setPending(false);
		setExpansion({ aspect });
	}, [preload]);

	const close = useCallback(() => setExpansion(null), []);

	if (missing) {
		return (
			<MediaPlaceholder media={media} caption={caption} className={className} />
		);
	}

	if (media === "video") {
		return (
			<figure className={cn("my-8", className)}>
				<div className="overflow-hidden rounded-xl border border-border bg-muted/30">
					<video
						className="aspect-video w-full"
						src={helpVideoUrl(asset)}
						poster={helpVideoPosterUrl(asset)}
						controls
						muted
						playsInline
						preload="metadata"
						onError={() => setMissing(true)}
					/>
				</div>
				<figcaption className="mt-3 text-center text-sm text-muted-foreground">
					{caption}
				</figcaption>
			</figure>
		);
	}

	return (
		<figure className={cn("my-8", className)}>
			<button
				ref={triggerRef}
				type="button"
				onClick={open}
				onPointerEnter={preload}
				onFocus={preload}
				aria-label={`Expand screenshot: ${caption}`}
				className="group relative block w-full cursor-zoom-in rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
			>
				{/* The layout id lives on this wrapper rather than the image: its box is
				    CSS-determined, so motion measures the same thing on both sides even
				    while an image is still in flight. */}
				<motion.div
					layoutId={reduceMotion ? undefined : `help-media-${asset}`}
					className="overflow-hidden rounded-xl border border-border bg-muted/30"
				>
					{/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary already serves f_auto/q_auto; next/image would double-optimize. */}
					<img
						ref={imgRef}
						className="block w-full"
						src={helpImageUrl(asset, 1600)}
						srcSet={helpImageSrcSet(asset)}
						sizes="(min-width: 768px) 800px, 100vw"
						alt={caption}
						loading="lazy"
						decoding="async"
						onError={() => setMissing(true)}
					/>
				</motion.div>
				<span
					aria-hidden="true"
					className={cn(
						"pointer-events-none absolute right-3 top-3 flex size-8 items-center justify-center rounded-lg border border-border bg-background/90 shadow-xs backdrop-blur-sm transition-opacity",
						pending
							? "opacity-100"
							: "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
					)}
				>
					{pending ? (
						<Loader2 className="size-3.5 animate-spin text-muted-foreground" />
					) : (
						<Expand className="size-3.5 text-muted-foreground" />
					)}
				</span>
			</button>

			<figcaption className="mt-3 text-center text-sm text-muted-foreground">
				{caption}
			</figcaption>

			<HelpMediaLightbox
				expansion={expansion}
				onClose={close}
				asset={asset}
				caption={caption}
				returnFocusTo={triggerRef}
			/>
		</figure>
	);
}

function HelpMediaLightbox({
	expansion,
	onClose,
	asset,
	caption,
	returnFocusTo,
}: {
	expansion: Expansion | null;
	onClose: () => void;
	asset: string;
	caption: string;
	returnFocusTo: React.RefObject<HTMLButtonElement | null>;
}) {
	const closeRef = useRef<HTMLButtonElement>(null);
	const reduceMotion = useReducedMotion();
	const open = expansion !== null;

	useEffect(() => {
		if (!open) return;

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				onClose();
			} else if (event.key === "Tab") {
				// The close button is the only focusable thing in here, so holding
				// focus on it is the whole trap.
				event.preventDefault();
				closeRef.current?.focus();
			}
		};

		// Restore the previous value rather than clearing it: the in-app drawer
		// has already locked scrolling, and clearing would unlock the page
		// underneath a drawer that is still open.
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		document.addEventListener("keydown", onKeyDown);
		closeRef.current?.focus();

		return () => {
			document.body.style.overflow = previousOverflow;
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [open, onClose]);

	// No portal target during SSR. `open` starts false, so the client's first
	// render also produces nothing here and hydration stays matched.
	if (typeof document === "undefined") return null;

	return createPortal(
		<AnimatePresence onExitComplete={() => returnFocusTo.current?.focus()}>
			{expansion && (
				<div
					className="fixed inset-0 z-[10000]"
					role="dialog"
					aria-modal="true"
					aria-label={caption}
				>
					<motion.div
						className="absolute inset-0 bg-background/80 backdrop-blur-sm"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: reduceMotion ? 0 : 0.2 }}
						onClick={onClose}
					/>

					<div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 sm:p-10">
						{/* Sized from the captured aspect ratio, so the box is final on the
						    first frame and never resizes as sources arrive. */}
						<motion.div
							layoutId={reduceMotion ? undefined : `help-media-${asset}`}
							style={{ aspectRatio: expansion.aspect }}
							className="pointer-events-auto relative h-[82vh] w-auto max-w-full overflow-hidden rounded-xl border border-border bg-muted/30 shadow-2xl"
							initial={reduceMotion ? { opacity: 0 } : undefined}
							animate={reduceMotion ? { opacity: 1 } : undefined}
							exit={reduceMotion ? { opacity: 0 } : undefined}
							transition={reduceMotion ? { duration: 0 } : SPRING}
						>
							{/* Decoded before the lightbox opened, so this paints on the
							    first frame at full quality — no upscaled stand-in, no swap. */}
							{/* eslint-disable-next-line @next/next/no-img-element -- see above */}
							<img
								src={helpImageUrl(asset, EXPANDED_WIDTH)}
								alt={caption}
								className="absolute inset-0 size-full object-contain"
							/>
						</motion.div>

						<motion.figcaption
							className="pointer-events-auto max-w-2xl text-center text-sm text-muted-foreground"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{
								duration: reduceMotion ? 0 : 0.2,
								delay: reduceMotion ? 0 : 0.1,
							}}
						>
							{caption}
						</motion.figcaption>
					</div>

					<button
						ref={closeRef}
						type="button"
						onClick={onClose}
						aria-label="Close"
						className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-lg border border-border bg-background/90 shadow-xs backdrop-blur-sm transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
					>
						<X className="size-4 text-muted-foreground" />
					</button>
				</div>
			)}
		</AnimatePresence>,
		document.body
	);
}
