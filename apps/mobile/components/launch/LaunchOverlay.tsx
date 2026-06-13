import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, type LayoutChangeEvent } from "react-native";
import Animated, {
	runOnJS,
	useAnimatedStyle,
	useReducedMotion,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import {
	CEILING_MS,
	computeDismiss,
	FLOOR_MS,
	shouldForceDismiss,
} from "@/lib/launch-gate";
import { GlassLogoCard } from "./GlassLogoCard";
import { KenBurnsBackground } from "./KenBurnsBackground";
import { LaunchScrim } from "./LaunchScrim";
import { LightSweep } from "./LightSweep";
import { ProgressLoader } from "./ProgressLoader";

interface LaunchOverlayProps {
	ready: boolean;
	onDismissed: () => void;
	onFirstFrameReady: () => void;
}

// Animated cold-start launch overlay. Composes the Task 1 layers, gates dismissal
// on max(readiness, FLOOR_MS) with a CEILING_MS hard-ceiling deadlock guard, and
// fades out exactly once (idempotent dismissedRef). Reduced-motion still mounts a
// static first frame and dismisses normally. onFirstFrameReady fires from the root
// onLayout so the host can re-sequence SplashScreen.hide() off the overlay's first
// painted frame (no blank-frame hand-off).
export function LaunchOverlay({
	ready,
	onDismissed,
	onFirstFrameReady,
}: LaunchOverlayProps) {
	const reduceMotion = useReducedMotion();
	const [floorElapsed, setFloorElapsed] = useState(false);

	const dismissedRef = useRef(false);
	const floorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const ceilingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const firedFirstFrame = useRef(false);

	const opacity = useSharedValue(1);

	// Idempotent dismissal — all paths (readiness/floor, hard ceiling, fade
	// completion) route here; onDismissed fires AT MOST once.
	const finishDismiss = useCallback(() => {
		onDismissed();
	}, [onDismissed]);

	const dismiss = useCallback(() => {
		if (dismissedRef.current) return;
		dismissedRef.current = true;
		if (floorTimer.current) clearTimeout(floorTimer.current);
		if (ceilingTimer.current) clearTimeout(ceilingTimer.current);
		opacity.value = withTiming(0, { duration: 250 }, (done) => {
			if (done) runOnJS(finishDismiss)();
		});
		// `opacity` is a stable Reanimated shared value and must NOT be a dep
		// (react-hooks/immutability forbids listing a mutated shared value).
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [finishDismiss]);

	// Floor + hard-ceiling timers (two distinct mechanisms). Cleared on unmount.
	useEffect(() => {
		floorTimer.current = setTimeout(() => setFloorElapsed(true), FLOOR_MS);
		// shouldForceDismiss(CEILING_MS) is true at the ceiling — force dismissal even
		// if readiness never resolves (T-27-03 deadlock guard).
		ceilingTimer.current = setTimeout(() => {
			if (shouldForceDismiss(CEILING_MS)) dismiss();
		}, CEILING_MS);
		return () => {
			if (floorTimer.current) clearTimeout(floorTimer.current);
			if (ceilingTimer.current) clearTimeout(ceilingTimer.current);
		};
	}, [dismiss]);

	// Dismiss when both readiness and the floor have elapsed.
	useEffect(() => {
		if (computeDismiss(ready, floorElapsed)) dismiss();
	}, [ready, floorElapsed, dismiss]);

	const handleLayout = useCallback(
		(_: LayoutChangeEvent) => {
			if (firedFirstFrame.current) return;
			firedFirstFrame.current = true;
			onFirstFrameReady();
		},
		[onFirstFrameReady]
	);

	const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

	return (
		<Animated.View
			style={[styles.overlay, fadeStyle]}
			onLayout={handleLayout}
			pointerEvents="auto"
		>
			<KenBurnsBackground />
			<LaunchScrim />
			{!reduceMotion && <LightSweep />}
			<Animated.View style={styles.stage} pointerEvents="none">
				<GlassLogoCard />
			</Animated.View>
			<ProgressLoader />
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	overlay: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		backgroundColor: "#031125",
		zIndex: 1000,
		elevation: 1000,
	},
	stage: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		alignItems: "center",
		justifyContent: "center",
	},
});
