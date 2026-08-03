/**
 * A-101 act 1 — "Automate the busywork".
 *
 * The rail imports `automationMeta` for its sheet tab and copy, and
 * `AutomationScene` for the stage. `AutomationSceneSection` is the standalone
 * wrapper used only until the rail lands. Nothing else in this folder is public.
 */

export { automationMeta, type SceneMeta } from "./meta";
export { AutomationScene, AutomationSceneSection } from "./scene";
