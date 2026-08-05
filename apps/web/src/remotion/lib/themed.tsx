import React from "react";
import { AbsoluteFill } from "remotion";
import { fontFamily } from "./font";
import { themeFor, type ThemeName } from "./tokens";
import { ThemeProvider } from "../ui/primitives";

export interface FeatureCompositionProps {
	theme?: ThemeName;
	[key: string]: unknown;
}

/**
 * Wraps a scene in the theme provider + page background. Lives here rather than
 * in `compositions.tsx` so each scene module can export its own themed default —
 * which is what the Player's `lazyComponent` loads, one chunk per scene.
 */
export const themed = (
	Scene: React.FC,
): React.FC<FeatureCompositionProps> => {
	const Wrapped: React.FC<FeatureCompositionProps> = ({ theme = "light" }) => (
		<ThemeProvider theme={themeFor(theme)}>
			<AbsoluteFill style={{ fontFamily, backgroundColor: themeFor(theme).bg }}>
				<Scene />
			</AbsoluteFill>
		</ThemeProvider>
	);
	Wrapped.displayName = `Themed(${Scene.displayName ?? Scene.name ?? "Scene"})`;
	return Wrapped;
};
