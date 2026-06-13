import React from "react";
import { StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

// Dissolves scroll content into the surrounding chrome: opaque surface at the
// header/footer edge, fading to clear over FADE_HEIGHT. Rendered by AppHeader
// (top) and the tab bar (bottom) so the effect is global without touching screens.
// Zero-alpha stop uses the surface RGB (not the `transparent` keyword) to avoid
// the grey mid-gradient darkening seen on Android.
const SURFACE = "#f5f7f9";
const CLEAR = "rgba(245,247,249,0)";
export const FADE_HEIGHT = 28;

// Top padding list/scroll screens apply so their first item clears the fade zone
// at rest — content only dissolves once scrolled up into the strip, never by
// default. Slightly larger than FADE_HEIGHT for a touch of breathing room.
export const SCROLL_TOP_INSET = 32;

export function ScrollFade({ edge }: { edge: "top" | "bottom" }) {
	const top = edge === "top";
	return (
		<LinearGradient
			pointerEvents="none"
			// top edge: opaque at the header, clearing downward into content.
			// bottom edge: clear at content, opaque toward the footer.
			colors={top ? [SURFACE, CLEAR] : [CLEAR, SURFACE]}
			style={[styles.strip, top ? styles.below : styles.above]}
		/>
	);
}

const styles = StyleSheet.create({
	strip: {
		position: "absolute",
		left: 0,
		right: 0,
		height: FADE_HEIGHT,
	},
	// Anchored to the parent's edges with a negative offset (not a percentage,
	// which mis-resolves on Fabric) so the strip sits in the gap between the
	// static chrome and the scroll content.
	// Just below the header, over the top of the scroll content.
	below: { bottom: -FADE_HEIGHT },
	// Just above the footer, over the bottom of the scroll content.
	above: { top: -FADE_HEIGHT },
});
