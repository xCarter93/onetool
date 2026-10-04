import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Renders fixed-size artwork scaled to the box width, in CSS alone so it paints scaled before hydration.
 * The design size is `--w`/`--h`: from `width`/`height`, or from an ancestor's CSS so breakpoints can re-crop it.
 */
export function Scaled({
	width,
	height,
	className,
	children,
}: {
	width?: number;
	height?: number;
	className?: string;
	children: ReactNode;
}) {
	return (
		<div
			className={cn("lp-scaled", className)}
			style={width && height ? ({ "--w": width, "--h": height } as CSSProperties) : undefined}
		>
			<div>{children}</div>
		</div>
	);
}
