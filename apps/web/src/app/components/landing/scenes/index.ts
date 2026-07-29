/**
 * A-101 — the three-act scene rail.
 *
 * The page imports <SceneRail> and nothing else from this folder: it owns the
 * sheet code, the section heading, the sticky rail on desktop and the stacked
 * order on mobile. The individual acts (./automation, ./esign, ./assistant)
 * are its parts, not page-level sections.
 */

export { SceneRail } from "./scene-rail";
export { RAIL_SCENE_VH, type RailScene } from "../blueprint/blueprint-rail";
