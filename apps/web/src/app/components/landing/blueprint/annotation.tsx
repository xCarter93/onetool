import type { CSSProperties, ReactNode } from "react";
import type { Point } from "@/lib/blueprint/geometry";
import { viewBoxPercent } from "@/lib/blueprint/geometry";
import { cn } from "@/lib/utils";

const ALIGN = {
	start: { transform: "translate(0, -50%)", textAlign: "left" },
	center: { transform: "translate(-50%, -50%)", textAlign: "center" },
	end: { transform: "translate(-100%, -50%)", textAlign: "right" },
	above: { transform: "translate(-50%, -100%)", textAlign: "center" },
	below: { transform: "translate(-50%, 0)", textAlign: "center" },
} as const satisfies Record<string, CSSProperties>;

/**
 * An annotation label: REAL DOM text, absolutely positioned at a percentage
 * derived from viewBox coordinates.
 *
 * Positioning in percentages keeps the label locked to the geometry at every
 * width, as long as the canvas is `w-full h-auto` with the default uniform
 * preserveAspectRatio. Real text (rather than <svg><text>) wraps, respects
 * browser zoom and user font size, is selectable and translatable, and honours
 * Outfit's letter-spacing consistently.
 *
 * Must sit inside a <BlueprintStage> (or any `relative` box) that is exactly
 * the canvas's footprint.
 *
 * Annotation carries real information or it does not exist. No invented
 * dimensions, no decorative callouts.
 */
export function Annotation({
	at,
	viewBox,
	align = "start",
	eyebrow,
	children,
	className,
	appear = false,
	delay = 0,
	tone = "muted",
}: {
	/** Anchor point in viewBox units — usually a leader shoulder end. */
	at: Point;
	/** The canvas viewBox size, e.g. [640, 400]. */
	viewBox: readonly [number, number];
	align?: keyof typeof ALIGN;
	/** Tracked-caps technical label, <= 4 words. */
	eyebrow?: string;
	children?: ReactNode;
	className?: string;
	/** Fade in when the enclosing <DrawIn> enters the viewport. */
	appear?: boolean;
	/** Seconds. */
	delay?: number;
	tone?: "muted" | "ink" | "strong";
}) {
	const { left, top } = viewBoxPercent(at, viewBox);
	const a = ALIGN[align];

	return (
		<div
			className={cn(
				"pointer-events-none absolute max-w-[16rem]",
				appear && "bp-rise",
				className,
			)}
			style={
				{
					left,
					top,
					transform: a.transform,
					textAlign: a.textAlign,
					...(appear && delay ? { "--bp-delay": `${delay}s` } : null),
				} as CSSProperties
			}
		>
			{eyebrow ? (
				<span className="block text-[10px] font-semibold uppercase leading-none tracking-[0.14em] text-bp-anno">
					{eyebrow}
				</span>
			) : null}
			{children ? (
				<span
					className={cn(
						"mt-1 block text-xs font-normal leading-snug tabular-nums",
						tone === "ink" && "text-bp-anno",
						tone === "strong" && "font-medium text-foreground",
						tone === "muted" && "text-muted-foreground",
					)}
				>
					{children}
				</span>
			) : null}
		</div>
	);
}
