/**
 * A-101 act 2 — "Get signed faster".
 *
 * The rail imports `esignMeta` for its tab label and heading, and `EsignScene`
 * for the stage. Both are server-safe; the scene mounts exactly one client
 * island (<DrawIn>) internally.
 */
export { EsignScene } from "./scene";
export { esignMeta, type SceneMeta } from "./meta";
