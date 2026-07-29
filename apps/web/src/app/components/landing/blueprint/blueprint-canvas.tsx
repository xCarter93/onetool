import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The <svg> host for a drafted scene. Server component, never animates.
 *
 * Owns the viewBox, the intrinsic aspect ratio (a viewBox + w-full h-auto gets
 * one for free, so no CLS), and the accessibility posture.
 *
 * Default posture is DECORATIVE: aria-hidden, focusable="false". That is the
 * correct answer for nearly all of this artwork, because every fact a blueprint
 * scene conveys is also written in the adjacent DOM copy. Pass `title` only when
 * a scene genuinely carries something the surrounding text does not.
 *
 * preserveAspectRatio is deliberately never set — the default uniform scale is
 * what keeps HTML annotations anchored to viewBox percentages, and "none" also
 * stretches hairlines non-uniformly.
 */
export function BlueprintCanvas({
	viewBox,
	children,
	className,
	style,
	title,
	desc,
	id,
}: {
	/** e.g. "0 0 640 400". Coordinates in every child are viewBox units. */
	viewBox: string;
	children: ReactNode;
	className?: string;
	style?: CSSProperties;
	/** Informative artwork only. Omit for decorative (the default). */
	title?: string;
	/** Longer description; requires `title` and `id`. */
	desc?: string;
	/** Stable id, required to wire <title>/<desc> via aria-labelledby. */
	id?: string;
}) {
	const informative = Boolean(title);
	// With an id we can use real <title>/<desc> nodes; without one, fall back to
	// aria-label so the component is never half-labelled.
	const labelled = informative && Boolean(id);

	return (
		<svg
			viewBox={viewBox}
			className={cn("h-auto w-full overflow-visible", className)}
			style={style}
			role={informative ? "img" : undefined}
			aria-hidden={informative ? undefined : true}
			aria-label={informative && !labelled ? title : undefined}
			aria-labelledby={
				labelled
					? [`${id}-bp-title`, desc ? `${id}-bp-desc` : null]
							.filter(Boolean)
							.join(" ")
					: undefined
			}
			focusable="false"
		>
			{labelled ? <title id={`${id}-bp-title`}>{title}</title> : null}
			{labelled && desc ? <desc id={`${id}-bp-desc`}>{desc}</desc> : null}
			{children}
		</svg>
	);
}

/**
 * Convenience wrapper for a scene: a relative box that holds the canvas plus its
 * HTML annotation layer. Annotations position themselves in percentages of this
 * box, so it must be exactly the canvas's footprint.
 */
export function BlueprintStage({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return <div className={cn("relative", className)}>{children}</div>;
}
