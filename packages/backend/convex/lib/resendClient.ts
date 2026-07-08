import { Resend } from "resend";

/**
 * Shared raw Resend SDK client for endpoints the durable @convex-dev/resend
 * component does not expose — inbound `emails.receiving.get()` and attachment
 * fetches. One construction, one RESEND_API_KEY read (PRD §3.6).
 */
export const resendClient = new Resend(process.env.RESEND_API_KEY);
