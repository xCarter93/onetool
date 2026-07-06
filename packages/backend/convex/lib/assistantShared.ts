/**
 * Assistant constants shared between the Convex backend and web client.
 * Must stay dependency-free — this module is bundled into the browser.
 */

// Cost guard: the server drops (not truncates) screen context longer than this.
export const SCREEN_CONTEXT_MAX_LENGTH = 4000;
