import type { ComponentType } from "react";
import type { FeatureCompositionProps } from "./lib/themed";
import type { FeatureKey } from "./manifest";

export type SceneLoader = () => Promise<{
	default: ComponentType<FeatureCompositionProps>;
}>;

/**
 * Dynamic-import table for `<Player lazyComponent>`. Every import lives inside
 * an arrow function, so this module is scene-free at load time and each scene
 * gets its own chunk — the landing bundle ships neither the scenes nor
 * `@remotion/player`'s render graph until something is actually on screen.
 *
 * The type-only imports above are erased, so nothing here reaches a scene
 * statically.
 */
export const SCENE_LOADERS: Record<FeatureKey, SceneLoader> = {
	clients: () => import("./scenes/clients"),
	"quote-build": () => import("./scenes/quote-build"),
	"portal-approve": () => import("./scenes/portal-approve"),
	tasks: () => import("./scenes/tasks-schedule"),
	routing: () => import("./scenes/routing"),
	"invoice-paid": () => import("./scenes/invoice-paid"),
	automations: () => import("./scenes/automations"),
	assistant: () => import("./scenes/assistant"),
	reports: () => import("./scenes/reports"),
};

/** The rail's one composition: shell + every chapter canvas in a TransitionSeries. */
export const loadStoryReel: SceneLoader = () => import("./story-reel");
