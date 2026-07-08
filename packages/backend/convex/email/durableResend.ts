import { components, internal } from "../_generated/api";
import { Resend } from "@convex-dev/resend";

/**
 * The single durable @convex-dev/resend component instance — the one outbound
 * queue for the whole app. Lives here (not in resend.ts) so the outbound seam
 * can import it without a cycle. resend.ts re-exports it for existing callers.
 *
 * onEmailEvent is the ONLY reliable correlation path for outbound lifecycle
 * events: sendEmail() returns the component's internal EmailId (what we store
 * in emailMessages.resendEmailId), while Resend webhooks carry the provider's
 * email_id — the component maps between the two and calls back with its id.
 * Requires http.ts to forward Resend webhooks to handleResendEventWebhook.
 */
export const resend: Resend = new Resend(components.resend, {
	testMode: false, // Allow sending to real addresses
	apiKey: process.env.RESEND_API_KEY,
	onEmailEvent: internal.resendWebhook.handleEmailEvent,
});
