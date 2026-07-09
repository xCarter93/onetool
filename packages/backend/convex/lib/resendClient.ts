import { Resend } from "resend";

/**
 * Shared raw Resend SDK client for endpoints the durable @convex-dev/resend
 * component does not expose — inbound `emails.receiving.get()` and attachment
 * fetches. One construction, one RESEND_API_KEY read (PRD §3.6).
 *
 * Lazy: the SDK constructor throws when the key is missing, and a module-scope
 * construction would fail every function that imports this module before any
 * runtime guard can run.
 */
let client: Resend | null = null;

export function getResendClient(): Resend {
	if (!client) {
		client = new Resend(process.env.RESEND_API_KEY);
	}
	return client;
}
