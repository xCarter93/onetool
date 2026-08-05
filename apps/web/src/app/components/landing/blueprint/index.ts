/**
 * Blueprint drafting kit — marketing surface only.
 *
 * This barrel exports the SERVER components only, so importing a shape never
 * drags an animation island into a scene that does not need one. The client
 * islands are imported directly and deliberately:
 *
 *   import { DrawIn } from ".../blueprint/draw-in";
 *   import { useBpId } from ".../blueprint/use-bp-id";
 *
 * <BlueprintDefs/> and <BlueprintMotionProvider> are mounted once in
 * app/(marketing)/layout.tsx and must not be rendered again anywhere else —
 * a second <BlueprintDefs/> reintroduces the duplicate-fragment-id bug.
 *
 * Geometry (path builders, lattices, revisionCloud, seeded jitter) lives in
 * @/lib/blueprint/geometry and is plain server-safe data.
 *
 * TWO STANDING RULES for anyone consuming this kit:
 *
 *  1. A decorative hairline is NOT a control boundary. --bp-* tokens are
 *     exempt from the 3:1 non-text requirement because they are artwork; the
 *     moment one becomes the visible edge of a button, input, tab or card that
 *     a user acts on, it fails. Controls use --border / --primary. This repo
 *     has already burned this three times with the frosted tokens.
 *
 *  2. Annotation carries real information or it does not exist. No invented
 *     dimensions, no decorative diameter callouts, no sheet codes or revision
 *     letters that describe nothing. Every figure passed into these components
 *     is a real value from the product.
 */

export {
	BP_FILL,
	BP_MARKER_ARROW,
	BP_MARKER_ARROW_INK,
	BlueprintDefs,
} from "./blueprint-defs";
export { BlueprintCanvas, BlueprintStage } from "./blueprint-canvas";
export { GuideLines } from "./guide-lines";
export { BP_WEIGHT, DraftedShape } from "./drafted-shape";
export { DimensionLine } from "./dimension-line";
export { KeywordMark } from "./keyword-mark";
export { LeaderLine, leaderAnchor } from "./leader-line";
export { SheetCode, SheetFrame } from "./sheet-frame";
export { Stamp } from "./stamp";
export { Annotation } from "./annotation";
export * from "./blueprint-motion";
