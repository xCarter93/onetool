/**
 * Free-plan numeric ceilings — the single source of truth for both the backend
 * enforcement (automationExecutor.ts create_record caps) and the web UI
 * (apps/web/src/lib/plan-limits.ts). The backend must own these because web
 * can't be imported by the backend; the web app reads them via @onetool/backend.
 *
 * Must stay free of ./_generated and convex/server imports so the web app can
 * import it without pulling in the backend type cycle.
 */

/** Max non-archived clients on the free plan. */
export const FREE_MAX_CLIENTS = 10;

/** Max active (planned/in-progress) projects per client on the free plan. */
export const FREE_MAX_ACTIVE_PROJECTS_PER_CLIENT = 3;
