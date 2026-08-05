/**
 * Scene lengths, in frames @30fps — deliberately scene-free so page-side code
 * (and the manifest) can do timeline arithmetic without pulling any scene
 * component, and with it the whole Remotion scene graph, into the bundle.
 *
 * Each scene re-exports its own constant, so `import { CLIENTS_DURATION } from
 * "./scenes/clients"` keeps working.
 */

export const CLIENTS_DURATION = 240;
export const QUOTE_BUILD_DURATION = 200;
export const PORTAL_APPROVE_DURATION = 220;
export const INVOICE_PAID_DURATION = 230;
/** Retired from the reel in wave 4; still the Showcase reel's quote chapter. */
export const QUOTE_TO_PAID_DURATION = 300;
export const TASKS_DURATION = 240;
export const ROUTING_DURATION = 240;
export const AUTOMATIONS_DURATION = 295;
export const ASSISTANT_DURATION = 230;
export const REPORTS_DURATION = 240;
