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
	onChange,
	disabled = false,
}: SignatureCanvasPadProps) {
	const padRef = useRef<SignatureCanvas | null>(null);

	// Manually apply ctx.scale(dpr, dpr) once on mount because the wrapper's
	// internal _resizeCanvas only calls scale when canvasProps width/height
	// are unset — we set them to backing-store px to control the bitmap.
	useEffect(() => {
		const pad = padRef.current;
		if (!pad) return;
		const canvas = pad.getCanvas();
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		const dpr = getDpr();
		ctx.scale(dpr, dpr);
	}, []);

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
		padRef.current?.clear();
		onChange({ mode: "drawn", dataUrl: null, rawData: null, isUsable: false });
	}, [disabled, onChange]);

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
