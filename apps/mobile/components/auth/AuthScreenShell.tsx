import React from "react";
import {
	Image,
	KeyboardAvoidingView,
	Platform,
	ScrollView,
	StyleSheet,
	View,
} from "react-native";
import { HalftoneBg } from "@/components/ui";
import { radii, spacing, tokens } from "@/lib/theme";
import { useDevice } from "@/lib/use-device";

interface AuthScreenShellProps {
	children: React.ReactNode;
}

// Chrome-only auth surface. AuthView renders its own logo + "Continue to OneTool"
// heading, so the shell carries NO logo/tagline/title of its own (that was a
// duplicate). iPhone: a decorative HalftoneBg banner + a flex body the host
// fills. iPad: full-bleed BG.png + navy scrim + a centered floating card.
export function AuthScreenShell({ children }: AuthScreenShellProps) {
	const { device, width, height } = useDevice();
	const isPad = device === "ipad";

	if (isPad) {
		return (
			<View style={styles.flex}>
				{/* Full-bleed illustration — sized to the live window (not absoluteFill,
				    which didn't expand the <Image> here) so cover fills any iPad aspect
				    and orientation with no gaps and no cropped band. */}
				<Image
					source={require("@/assets/BG.png")}
					style={[styles.bgImage, { width, height }]}
					resizeMode="cover"
				/>
				{/* Navy scrim so the white card + its shadow read cleanly over both
				    bright sky and dark-green hill regions of the illustration. */}
				<View
					pointerEvents="none"
					style={[styles.bgImage, { width, height }, styles.scrim]}
				/>
				{/* Transparent containers so the image + scrim behind them show
				    through — styles.flex carries the opaque gray page bg. */}
				<KeyboardAvoidingView
					style={styles.flexTransparent}
					behavior={Platform.OS === "ios" ? "padding" : undefined}
				>
					<ScrollView
						style={styles.flexTransparent}
						contentContainerStyle={styles.scrollContentPad}
						keyboardShouldPersistTaps="handled"
					>
						<View style={styles.card}>{children}</View>
					</ScrollView>
				</KeyboardAvoidingView>
			</View>
		);
	}

	// Phone: a plain flex column (no ScrollView/KeyboardAvoidingView). AuthView
	// fills its parent and manages its own scroll + keyboard avoidance natively;
	// wrapping it in a ScrollView gave its flex:1 host 0 height (blank body).
	return (
		<View style={styles.flex}>
			{/* Decorative brand banner — bounded 220 height; no logo/tagline (those
			    now live inside AuthView). */}
			<View style={styles.hero}>
				<HalftoneBg brand={0.85} imageFit="width" imageOffsetTop={-10} />
			</View>

			{/* flex:1 so the AuthView host resolves to the remaining screen height. */}
			<View style={[styles.body, styles.flex]}>{children}</View>
		</View>
	);
}

const styles = StyleSheet.create({
	flex: {
		flex: 1,
		backgroundColor: tokens.bg,
	},
	flexTransparent: {
		flex: 1,
		backgroundColor: "transparent",
	},
	// iPad: center the floating card vertically + horizontally over the
	// full-bleed illustration; outer padding keeps it off the screen edges
	// (and breathing room in a narrow Split View pane).
	scrollContentPad: {
		flexGrow: 1,
		justifyContent: "center",
		alignItems: "center",
		paddingVertical: spacing.xl,
		paddingHorizontal: spacing.lg,
	},
	// iPad: full-window background layers (illustration + scrim), pinned top-left.
	bgImage: {
		position: "absolute",
		top: 0,
		left: 0,
	},
	// iPad: ~28% navy wash so the white card reads over any region of BG.png.
	scrim: {
		backgroundColor: "rgba(13, 27, 42, 0.28)",
	},
	// iPad: the floating auth card. Bg matches the AuthView surface (#f5f5f5) so
	// the card and the embedded component read as one continuous gray panel —
	// no white frame around a gray component.
	card: {
		width: "100%",
		maxWidth: 440,
		backgroundColor: tokens.bg,
		borderRadius: radii["3xl"],
		paddingHorizontal: spacing.xl,
		paddingTop: spacing.xl,
		paddingBottom: spacing.xl,
		boxShadow: "0 18px 40px -12px rgba(13, 27, 42, 0.45)",
	},
	hero: {
		height: 220,
	},
	// Phone: the host sits directly under the banner; AuthView supplies its own
	// internal padding so this only adds a little top breathing room.
	body: {
		paddingTop: spacing.sm,
	},
});
