"use client";

/**
 * Drawn-mode signature pad. Wraps `react-signature-canvas` with:
 *
 *  - Explicit high-DPI canvas sizing: backing-store = CSS_WIDTH * dpr; CSS
 *    layout = CSS_WIDTH px. (Pitfall 3.) The wrapper's internal _resizeCanvas
 *    skips ctx.scale when explicit width/height are passed via canvasProps,
 *    so we manually call ctx.scale(dpr, dpr) on mount.
 *  - Min-stroke gate: `!isEmpty && totalPoints >= 5` defends against the
 *    documented #16 single-tap false positive (Pitfall 6).
 *  - Disabled short-circuit (REVIEWS): when disabled === true, handleEnd /
 *    handleClear early-return without emitting; wrapper applies pointer
 *    events: none and visually dims; clear button is disabled.
 *  - touchAction: none on the canvas to keep signature_pad's touch listeners
 *    from fighting page scroll inside its own bounds (Pitfall 4 boundary).
 *  - WR-05 reset effect (Gap 1 fix): guarded by hasMountedRef so it does NOT
 *    fire on initial mount; calls clearAndRescale() so subsequent legitimate
 *    resets re-apply ctx.scale(dpr,dpr) instead of leaving the canvas at 1×
 *    transform. signature_pad.clear() internally calls
 *    ctx.setTransform(1,0,0,1,0,0) and would otherwise wipe the DPR scale,
 *    making strokes paint into the top-left 1/dpr region of the backing
 *    store and rendering them invisible after CSS downscale.
 *  - Plan 14-12 / Gap A re-UAT fix (candidate (c) — canvas mounts with zero
 *    CSS rect inside Radix TabsContent until layout settles): a
 *    ResizeObserver re-applies ctx.scale(dpr,dpr) on the first zero->non-zero
 *    rect transition so strokes paint inside the visible CSS region. If
 *    real-device UAT after this fix does not close UAT Gap A, candidate (e)
 *    (signature_pad pointer-coord math vs dpr-scaled backing store) is the
 *    residual hypothesis — see 14-12-PLAN.md.
 */

import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import SignatureCanvas from "react-signature-canvas";

import { cn } from "@/lib/utils";

import type { SignaturePayload, SignatureStroke } from "./signature-card";

/**
 * Runtime shape of `signature_pad@2.x.toData()`: an array of stroke groups.
 * Each group is itself either a legacy flat point array OR an object with
 * `points` + style metadata depending on signature_pad version. The wrapper's
 * shipped .d.ts is stale (typed as `Point[]`) so we coerce here.
 */
type RawPoint = {
	x: number;
	y: number;
	time: number;
	pressure?: number;
};
type RawGroup =
	| RawPoint[]
	| {
			points: RawPoint[];
			dotSize?: number;
			minWidth?: number;
			maxWidth?: number;
			penColor?: string;
	  };

const CSS_WIDTH = 600;
const CSS_HEIGHT = 160;

export interface SignatureCanvasPadProps {
	value: SignaturePayload;
	onChange: (next: SignaturePayload) => void;
	disabled?: boolean;
}

function getDpr(): number {
	if (typeof window === "undefined") return 1;
	return Math.max(window.devicePixelRatio ?? 1, 1);
}

export function SignatureCanvasPad({
	value,
	onChange,
	disabled = false,
}: SignatureCanvasPadProps) {
	const padRef = useRef<SignatureCanvas | null>(null);
	const hasMountedRef = useRef(false);

	// Shared helper used by both the WR-05 reset effect and handleClear.
	// signature_pad.clear() internally invokes ctx.setTransform(1,0,0,1,0,0),
	// wiping the DPR scale applied at mount. Every clear MUST be followed by
	// a fresh ctx.scale(dpr,dpr) or strokes paint at 1× on a dpr× backing
	// store and become invisible after CSS downscale (UAT Gap 1).
	const clearAndRescale = useCallback(() => {
		const pad = padRef.current;
		if (!pad) return;
		pad.clear();
		const canvas = pad.getCanvas();
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		const dpr = getDpr();
		ctx.scale(dpr, dpr);
	}, []);

	// Manually apply ctx.scale(dpr, dpr) once on mount because the wrapper's
	// internal _resizeCanvas only calls scale when canvasProps width/height
	// are unset — we set them to backing-store px to control the bitmap.
	//
	// Plan 14-12 / Gap A (candidate (c)): when the canvas mounts inside a
	// Radix TabsContent that was just revealed (Type->Draw click), the first
	// paint may happen before layout settles, so getBoundingClientRect()
	// returns 0x0 and signature_pad's pointer-coord math locks in a
	// zero-rect frame of reference. The mount-time ctx.scale STILL runs
	// (so existing tests that probe scale call counts still pass), but
	// strokes paint outside the visible CSS region. The ResizeObserver
	// below fires once layout produces a real rect; on the first
	// zero->non-zero transition we re-apply ctx.scale(dpr,dpr) so the
	// transform survives any pad-internal setTransform reset that may
	// have happened during the intervening ticks.
	useEffect(() => {
		const pad = padRef.current;
		if (!pad) return;
		const canvas = pad.getCanvas();
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		const dpr = getDpr();

		const applyScale = () => {
			// Reset transform first to avoid compounding scales on
			// re-application (a previous ctx.scale(dpr,dpr) plus another
			// would yield dpr^2 on the same backing store).
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.scale(dpr, dpr);
		};

		// Initial mount: apply scale immediately. If rect is non-zero, this
		// is sufficient. If rect is zero (mounted inside a freshly-revealed
		// Radix TabsContent), the ResizeObserver below will re-apply once
		// layout produces a real rect.
		applyScale();

		let lastRectIsZero =
			canvas.getBoundingClientRect().width === 0 ||
			canvas.getBoundingClientRect().height === 0;

		// Guard against environments without ResizeObserver (older jsdom,
		// SSR-evaluation hazards).
		if (typeof ResizeObserver === "undefined") {
			return;
		}
		const ro = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const w = entry.contentRect.width;
				const h = entry.contentRect.height;
				// Re-apply scale ONLY on the zero->non-zero transition.
				// Subsequent resizes do not change CSS_WIDTH/CSS_HEIGHT
				// (style is fixed) so the scale need not be re-applied
				// for them.
				if (lastRectIsZero && w > 0 && h > 0) {
					applyScale();
					lastRectIsZero = false;
				}
			}
		});
		ro.observe(canvas);
		return () => ro.disconnect();
	}, []);

	// REVIEWS-mandated (WR-05): when the parent resets value to a non-usable
	// payload (e.g., handleStaleReset on 409, or a force-remount via key),
	// also clear the underlying canvas so prior strokes do not visually
	// linger and bleed into pad.toData() on the next stroke.
	//
	// Gap 1 fix: guard against firing on the initial mount. The mount-time
	// scale effect already applied ctx.scale(dpr,dpr); calling pad.clear()
	// here would wipe it. Subsequent transitions (parent reset after a real
	// submit / stale 409 / explicit non-usable rewrite) DO need to clear and
	// rescale via the shared helper.
	useEffect(() => {
		if (!hasMountedRef.current) {
			hasMountedRef.current = true;
			return;
		}
		if (!value.isUsable && value.dataUrl === null) {
			clearAndRescale();
		}
	}, [value.isUsable, value.dataUrl, clearAndRescale]);

	const handleEnd = useCallback(() => {
		// REVIEWS-mandated: short-circuit when disabled.
		if (disabled) return;
		const pad = padRef.current;
		if (!pad) return;

		const isEmpty = pad.isEmpty();
		const rawGroups = pad.toData() as unknown as RawGroup[];
		const groups = rawGroups.map((g) =>
			Array.isArray(g) ? { points: g } : g,
		);
		const totalPoints = groups.reduce(
			(acc, group) => acc + group.points.length,
			0,
		);
		const isUsable = !isEmpty && totalPoints >= 5;

		if (!isUsable) {
			onChange({
				mode: "drawn",
				dataUrl: null,
				rawData: null,
				isUsable: false,
			});
			return;
		}

		const strokes: SignatureStroke[] = groups.map((group) => ({
			points: group.points.map((p) => ({
				x: p.x,
				y: p.y,
				time: p.time,
				pressure: p.pressure,
			})),
			dotSize: typeof group.dotSize === "number" ? group.dotSize : undefined,
			minWidth: group.minWidth,
			maxWidth: group.maxWidth,
			penColor: group.penColor,
		}));

		onChange({
			mode: "drawn",
			dataUrl: pad.toDataURL("image/png"),
			rawData: { strokes },
			isUsable: true,
		});
	}, [disabled, onChange]);

	const handleClear = useCallback(() => {
		// REVIEWS-mandated: short-circuit when disabled.
		if (disabled) return;
		clearAndRescale();
		onChange({ mode: "drawn", dataUrl: null, rawData: null, isUsable: false });
	}, [disabled, onChange, clearAndRescale]);

	const dpr = getDpr();

	return (
		<div className="space-y-2">
			<div
				className={cn(
					"rounded-xl border border-border bg-background",
					disabled && "opacity-60",
				)}
				style={
					disabled
						? { pointerEvents: "none", opacity: 0.6 }
						: undefined
				}
			>
				<SignatureCanvas
					ref={padRef}
					penColor="var(--acme, #0f172a)"
					minWidth={1.5}
					maxWidth={2.8}
					velocityFilterWeight={0.7}
					onEnd={handleEnd}
					canvasProps={{
						width: CSS_WIDTH * dpr,
						height: CSS_HEIGHT * dpr,
						style: {
							width: `${CSS_WIDTH}px`,
							height: `${CSS_HEIGHT}px`,
							touchAction: "none",
							display: "block",
							borderRadius: "0.75rem",
						},
						"aria-label": "Draw your signature",
						role: "img",
					}}
				/>
			</div>
			<div className="flex justify-end">
				<button
					type="button"
					onClick={handleClear}
					disabled={disabled}
					className={cn(
						"inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
						"disabled:pointer-events-none disabled:opacity-50",
					)}
				>
					<Trash2 className="size-3.5" />
					Clear
				</button>
			</div>
		</div>
	);
}
