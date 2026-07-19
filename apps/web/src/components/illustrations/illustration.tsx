import { cn } from "@/lib/utils";
import { illustrations, type IllustrationName } from "./registry";
import {
	ILLUSTRATION_VIEWBOX,
	ILLUSTRATION_WIDTH,
	type IllustrationSize,
	type IllustrationVariants,
} from "./types";

export interface IllustrationProps {
	name: IllustrationName;
	/** Falls back to md when the requested variant isn't drawn. */
	size?: IllustrationSize;
	className?: string;
}

/**
 * Renders an empty-state illustration.
 *
 * Always decorative — meaning lives in the adjacent title and description, so
 * this is aria-hidden with no <title>. If an illustration is ever the only
 * thing conveying state, that's a copy bug, not an a11y one.
 */
export function Illustration({ name, size = "md", className }: IllustrationProps) {
	// `satisfies` in the registry preserves literal shapes, which can't be
	// indexed by a general size — widen to the declared variant type.
	const variants: IllustrationVariants = illustrations[name];
	// Resolve before reading the viewBox — a missing sm must not render md art
	// on an 80x48 canvas.
	const resolved: IllustrationSize = variants[size] ? size : "md";
	const Art = variants[resolved] ?? variants.md;

	return (
		<svg
			viewBox={ILLUSTRATION_VIEWBOX[resolved]}
			className={cn(
				"ot-illo",
				resolved === "sm" && "ot-illo-sm",
				ILLUSTRATION_WIDTH[resolved],
				className
			)}
			aria-hidden="true"
			focusable="false"
			role="presentation"
		>
			<Art />
		</svg>
	);
}

export type { IllustrationSize };
export type { IllustrationName };
