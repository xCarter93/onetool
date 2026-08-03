import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A rubber stamp. HTML, never SVG — SVG <text> cannot wrap, applies
 * font-feature-settings inconsistently, and is a screen-reader liability.
 *
 * The double rule (a real border plus an inset knockout ring in paper colour)
 * is what sells "stamp" without a texture image.
 *
 * A stamp APPEARS. It never slams, never bounces, never overshoots — one beat
 * of ink settling. The keyframe lives in globals.css (.bp-stamp) so the
 * reduced-motion override and the no-JS floor come with it.
 *
 * CONTRAST: stamp text is text and must clear 4.5:1. --bp-line-strong (34%/46%
 * alpha) does not, so the faint tokens are used for the BORDER only and the
 * label routes to --bp-anno or --foreground. This is the most likely a11y
 * regression in the whole blueprint system.
 *
 * `rotate` is a standalone CSS property rather than a transform so an animated
 * `scale` stays independent of it.
 */
export function Stamp({
	children,
	tone = "ink",
	rotate = -8,
	appear = false,
	delay = 0,
	weathered = false,
	className,
}: {
	children: ReactNode;
	tone?: "ink" | "line";
	/** Degrees. Real stamps land a few degrees off true, not at a jaunty angle. */
	rotate?: number;
	/**
	 * Fade in when the enclosing <DrawIn> enters the viewport. Requires a
	 * <DrawIn> ancestor — without one the stamp stays at opacity 0.
	 */
	appear?: boolean;
	/** Seconds. */
	delay?: number;
	/** Very subtle ink unevenness, the way a real stamp inks unevenly. */
	weathered?: boolean;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"inline-block select-none rounded-[2px] border-2 px-3 py-1.5",
				"text-[0.6875rem] font-semibold uppercase leading-none tracking-[0.18em]",
				// Double rule: the border, a paper-coloured gap, then a paper ring.
				"shadow-[inset_0_0_0_1px_var(--bp-paper),0_0_0_3px_var(--bp-paper)]",
				tone === "ink"
					? "border-bp-ink text-bp-anno"
					: "border-bp-line-strong text-foreground/85",
				appear && "bp-stamp",
				className,
			)}
			style={
				{
					rotate: `${rotate}deg`,
					...(appear && delay ? { "--bp-delay": `${delay}s` } : null),
					...(weathered
						? {
								maskImage:
									"radial-gradient(120% 140% at 30% 20%, #000 55%, rgba(0,0,0,0.86) 100%)",
							}
						: null),
				} as CSSProperties
			}
		>
			{children}
		</span>
	);
}
