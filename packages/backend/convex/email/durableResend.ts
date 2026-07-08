import { components } from "../_generated/api";
import { Resend } from "@convex-dev/resend";

/**
 * The single durable @convex-dev/resend component instance — the one outbound
 * queue for the whole app. Lives here (not in resend.ts) so the outbound seam
 * can import it without a cycle. resend.ts re-exports it for existing callers.
 */
export const resend = new Resend(components.resend, {
	testMode: false, // Allow sending to real addresses
	apiKey: process.env.RESEND_API_KEY,
});
