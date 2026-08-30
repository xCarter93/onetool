import { Workpool } from "@convex-dev/workpool";
import { components } from "./_generated/api";

// Shared pool bounding all external-I/O side effects (push today; webhook/SMS
// later) so bursts can't monopolize the deployment's scheduled-function slots.
export const externalIoPool = new Workpool(components.externalIoPool, {
	maxParallelism: 10,
});

/**
 * ~5s/10s/20s/40s for fetches nobody is watching in real time: a signed PDF
 * after a quote is countersigned, an attachment on mail that already arrived.
 * The long tail is free and outlasts a vendor rate-limit window.
 *
 * Per-enqueue by design. The pool is shared with push notifications, whose
 * sends are not idempotent, so a pool-wide default would double-notify users.
 * That also means an enqueue omitting this gets exactly one attempt.
 */
export const EXTERNAL_FETCH_RETRY = {
	maxAttempts: 5,
	initialBackoffMs: 5000,
	base: 2,
} as const;
