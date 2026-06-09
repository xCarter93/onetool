import { useEffect, useState } from "react";
import { Animated } from "react-native";

// Enter/exit transition for in-hierarchy overlays (see FieldMenu/Modal-freeze
// note). Native-driver only — never LayoutAnimation, which has its own iOS
// modal freeze. `mounted` stays true through the exit so it can animate out.
export function useOverlayTransition(visible: boolean, duration = 220) {
	const [mounted, setMounted] = useState(visible);
	const [progress] = useState(() => new Animated.Value(visible ? 1 : 0));

	// Mount synchronously on enter (render-safe); unmount after the exit anim.
	if (visible && !mounted) setMounted(true);

	useEffect(() => {
		Animated.timing(progress, {
			toValue: visible ? 1 : 0,
			duration,
			useNativeDriver: true,
		}).start(({ finished }) => {
			if (finished && !visible) setMounted(false);
		});
	}, [visible, duration, progress]);

	return { mounted, progress };
}
