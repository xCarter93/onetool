import React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Svg from "react-native-svg";
import { useTokens } from "@/lib/theme";
import { resolvePaint, type IlloPalette, type IlloSize } from "./paint";
import { illustrations, type IllustrationName, type IllustrationVariants } from "./registry";

export type { IllustrationName };
export type IllustrationSize = IlloSize;

// Canvas dp per tier — same 5:3 geometry as web (sm 80x48 · md 200x120 ·
// hero 320x192), rendered at natural size unless `width` overrides it.
const CANVAS: Record<IlloSize, { w: number; h: number }> = {
	sm: { w: 80, h: 48 },
	md: { w: 200, h: 120 },
	hero: { w: 320, h: 192 },
};

export interface IllustrationProps {
	name: IllustrationName;
	/** Falls back to md when the requested variant isn't drawn. */
	size?: IlloSize;
	/**
	 * REQUIRED: the color of the surface the illustration sits on (t.bg for
	 * pages, t.card for cards/sheets). Web solves this with a CSS variable
	 * override per wrapper; a hard-coded default paints white blobs on t.bg.
	 */
	knockout: string;
	/** Rendered width in dp (height follows 5:3). Defaults to the tier's canvas. */
	width?: number;
	style?: StyleProp<ViewStyle>;
}

/**
 * Empty-state illustration, ported from apps/web/src/components/illustrations.
 * Always decorative — meaning lives in the adjacent title and description, so
 * the whole element is hidden from assistive tech.
 */
export function Illustration({
	name,
	size = "md",
	knockout,
	width,
	style,
}: IllustrationProps) {
	const t = useTokens();
	const variants: IllustrationVariants = illustrations[name];
	// Resolve before reading the canvas — a missing sm must not render md art
	// on an 80x48 canvas.
	const resolved: IlloSize = variants[size] ? size : "md";
	const art = variants[resolved] ?? variants.md;

	// Token mapping (PRD §12): surface → t.secondary (t.muted === t.bg and would
	// vanish); line → t.sub; accent → the inkier primaryInk, not raw sky blue.
	const palette: IlloPalette = {
		surface: t.secondary,
		line: t.sub,
		accent: t.primaryInk,
		celebrate: t.success,
		knockout,
		destructive: t.danger,
	};

	const canvas = CANVAS[resolved];
	const w = width ?? canvas.w;
	const h = Math.round((w * canvas.h) / canvas.w);

	return (
		<View
			style={style}
			pointerEvents="none"
			accessibilityElementsHidden
			importantForAccessibility="no-hide-descendants"
		>
			<Svg
				width={w}
				height={h}
				viewBox={`0 0 ${canvas.w} ${canvas.h}`}
				fill="none"
			>
				{art({ p: (cls) => resolvePaint(cls, resolved, palette), c: palette })}
			</Svg>
		</View>
	);
}
