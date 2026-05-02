"use client";

/**
 * Drawn-mode signature pad. Wraps `react-signature-canvas` with:
 *
 *  - Container-driven sizing: a ResizeObserver on the wrapper div drives
 *    canvas backing-store dimensions = wrapper.clientWidth * dpr (CSS layout
 *    matches wrapper width). This keeps the canvas inside its parent on
 *    narrow viewports and aligns signature_pad's getBoundingClientRect-based
 *    pointer math with the visible CSS box, so strokes track the cursor and
 *    cannot paint outside the visible pad.
 *  - DPR-scale re-apply effect: setting canvas.width / canvas.height attrs
 *    (which React does whenever containerWidth or dpr change) wipes the 2D
 *    context transform. A second useEffect resets transform and re-applies
 *    ctx.scale(dpr,dpr) on every dimension change so strokes never paint at
 *    1× on a dpr× backing store.
 *  - Theme-aware penColor: useTheme() picks slate-50 (dark) vs slate-900
 *    (light). signature_pad assigns penColor to ctx.fillStyle/strokeStyle
 *    directly; the canvas color parser ignores CSS var() and silently
 *    retains the previous (transparent backgroundColor) value, so the color
 *    must be a literal. Falls back to --acme if the host has wired a brand
 *    custom property.
 *  - Min-stroke gate: `!isEmpty && totalPoints >= 5` defends against the
 *    documented #16 single-tap false positive.
 *  - Disabled short-circuit: when disabled === true, handleEnd / handleClear
 *    early-return without emitting; wrapper applies pointer-events: none and
 *    visually dims; clear button is disabled.
 *  - touchAction: none on the canvas to keep signature_pad's touch listeners
 *    from fighting page scroll inside its own bounds.
 *  - clearAndRescale: pad.clear() does NOT touch transform (signature_pad@2.x
 *    only fillStyle/clearRect/fillRect/_reset). The defensive setTransform +
 *    scale here are idempotent so repeated Clear-button presses cannot
 *    compound the transform (which surfaced as massively magnified strokes
 *    in the 14-06 era when scale was applied without a preceding reset).
 */

import { Trash2 } from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

// CSS height is fixed; CSS width is measured from the wrapper container so the
// canvas fills its parent without overflowing on narrow viewports (sidebars,
// mobile). The fallback covers SSR / measurement-not-yet-completed edge cases.
const CSS_HEIGHT = 160;
const CSS_WIDTH_FALLBACK = 600;

export interface SignatureCanvasPadProps {
	value: SignaturePayload;
	onChange: (next: SignaturePayload) => void;
	disabled?: boolean;
}

function getDpr(): number {
	if (typeof window === "undefined") return 1;
	return Math.max(window.devicePixelRatio ?? 1, 1);
}

// Canvas 2D's fillStyle/strokeStyle parser does NOT understand CSS var(): if
// you assign "var(--acme, #0f172a)" the spec mandates the assignment is
// silently ignored and the previous value (default "rgba(0,0,0,0)" — i.e.
// transparent) is retained. Strokes then paint in transparent and are
// invisible in BOTH light and dark mode. Resolve the brand var here at mount
// so signature_pad receives a literal color string. Per-theme defaults give
// the strokes contrast against the dark/light pad background.
const PEN_COLOR_LIGHT_FALLBACK = "#0f172a"; // slate-900 on light bg
const PEN_COLOR_DARK_FALLBACK = "#f8fafc"; // slate-50 on dark bg
function resolvePenColor(isDark: boolean): string {
	const fallback = isDark ? PEN_COLOR_DARK_FALLBACK : PEN_COLOR_LIGHT_FALLBACK;
	if (typeof window === "undefined") return fallback;
	const acme = getComputedStyle(document.documentElement)
		.getPropertyValue("--acme")
		.trim();
	return acme || fallback;
}

export function SignatureCanvasPad({
	value,
	onChange,
	disabled = false,
}: SignatureCanvasPadProps) {
	const wrapperRef = useRef<HTMLDivElement | null>(null);
	const padRef = useRef<SignatureCanvas | null>(null);
	const hasMountedRef = useRef(false);
	const { resolvedTheme } = useTheme();
	const penColor = useMemo(
		() => resolvePenColor(resolvedTheme === "dark"),
		[resolvedTheme],
	);

	// Container-driven sizing. The canvas backing buffer + CSS rect are sized
	// to the wrapper's clientWidth so the canvas never overflows its parent
	// (which previously caused strokes to paint past the visible pad on
	// narrow viewports — UAT-feedback after var() fix). Measurement runs on
	// mount and on every ResizeObserver fire; updates are gated to non-zero
	// values so jsdom's "no layout" doesn't clobber the fallback.
	const [containerWidth, setContainerWidth] = useState<number>(
		CSS_WIDTH_FALLBACK,
	);
	const [dpr, setDpr] = useState<number>(() => getDpr());

	// Shared helper used by both the WR-05 reset effect and handleClear.
	//
	// CORRECTION to 14-06's premise: inspecting signature_pad@2.3.2 source
	// (node_modules/signature_pad/dist/signature_pad.js:191-202) confirms
	// `pad.clear()` only calls fillStyle/clearRect/fillRect/_reset — it does
	// NOT touch the transform. The original 14-06 fix added an unconditional
	// `ctx.scale(dpr,dpr)` after `pad.clear()` based on the false assumption
	// that clear wipes the transform. Each invocation therefore COMPOUNDED the
	// existing scale (Clear pressed N times → transform = dpr^(N+1)), which
	// surfaced as massively magnified, misaligned strokes on real devices.
	//
	// Fix: reset transform to identity BEFORE re-applying the dpr scale, so
	// clearAndRescale is idempotent regardless of the existing transform
	// state. The rescale itself is now defensive (covers the hypothetical
	// future where signature_pad does start resetting transform on clear),
	// not load-bearing.
	const clearAndRescale = useCallback(() => {
		const pad = padRef.current;
		if (!pad) return;
		pad.clear();
		const canvas = pad.getCanvas();
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		const dpr = getDpr();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.scale(dpr, dpr);
	}, []);

	// Observe the wrapper container and update containerWidth + dpr on
	// mount AND on every resize. Container-level (not canvas-level) so the
	// "TabsContent reveals after layout settles" case (Plan 14-12 candidate
	// (c)) is handled by the same mechanism as window resizes: the wrapper
	// gains a non-zero rect → setState → rerender at the right size.
	useEffect(() => {
		const wrapper = wrapperRef.current;
		if (!wrapper) return;
		const measure = () => {
			const w = Math.floor(wrapper.clientWidth);
			const newDpr = getDpr();
			// Only update when measurement is meaningful — jsdom returns 0
			// because it does no layout; ignoring zero keeps the
			// CSS_WIDTH_FALLBACK initial state intact for tests.
			if (w > 0) {
				setContainerWidth((prev) => (prev === w ? prev : w));
			}
			setDpr((prev) => (prev === newDpr ? prev : newDpr));
		};
		measure();
		if (typeof ResizeObserver === "undefined") return;
		const ro = new ResizeObserver(measure);
		ro.observe(wrapper);
		return () => ro.disconnect();
	}, []);

	// Re-apply the dpr scale whenever the canvas backing dimensions change.
	// Setting canvas.width / canvas.height attributes (which React does on
	// every render of canvasProps with new dimensions) RESETS the canvas
	// 2D context state — including the transform. Without this effect the
	// transform stays at identity after a resize, so strokes would paint
	// at 1× on a dpr× backing store and render shrunk into the top-left.
	useEffect(() => {
		const pad = padRef.current;
		if (!pad) return;
		const canvas = pad.getCanvas();
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.scale(dpr, dpr);
	}, [containerWidth, dpr]);

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

	return (
		<div className="space-y-2">
			<div
				ref={wrapperRef}
				className={cn(
					"rounded-xl border border-border bg-background overflow-hidden",
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
					penColor={penColor}
					minWidth={1.5}
					maxWidth={2.8}
					velocityFilterWeight={0.7}
					onEnd={handleEnd}
					canvasProps={{
						width: containerWidth * dpr,
						height: CSS_HEIGHT * dpr,
						style: {
							width: `${containerWidth}px`,
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
