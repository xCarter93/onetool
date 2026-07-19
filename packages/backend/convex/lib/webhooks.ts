/**
 * Shared Webhook Utilities
 *
 * Common patterns for webhook handling across different integrations
 * (Clerk, BoldSign, Resend, Stripe).
 */

import type { WebhookEvent } from "@clerk/backend";
import { Webhook } from "svix";
import { trackServerException, type SchedulerCtx } from "./posthog";

// ============================================================================
// Types
// ============================================================================

/**
 * Result of webhook signature verification
 */
export interface WebhookVerificationResult<T = unknown> {
	valid: boolean;
	payload?: T;
	/** The raw request body, for handlers that need to re-forward the request. */
	rawBody?: string;
	error?: string;
}

/**
 * Standard webhook response helper
 */
export interface WebhookResponse {
	status: number;
	body?: string;
}

// ============================================================================
// Svix Webhook Verification (Used by Clerk and Resend)
// ============================================================================

/**
 * Verify a webhook request using Svix (used by Clerk and Resend)
 */
export async function verifySvixWebhook(
	request: Request,
	secret: string
): Promise<WebhookVerificationResult<WebhookEvent>> {
	const payloadString = await request.text();
	const svixHeaders = {
		"svix-id": request.headers.get("svix-id") ?? "",
		"svix-timestamp": request.headers.get("svix-timestamp") ?? "",
		"svix-signature": request.headers.get("svix-signature") ?? "",
	};

	if (!svixHeaders["svix-id"] || !svixHeaders["svix-timestamp"] || !svixHeaders["svix-signature"]) {
		return {
			valid: false,
			error: "Missing required Svix headers",
		};
	}

	const wh = new Webhook(secret);

	try {
		const payload = wh.verify(payloadString, svixHeaders) as unknown as WebhookEvent;
		return { valid: true, payload, rawBody: payloadString };
	} catch (error) {
		console.error("Svix webhook verification failed:", error);
		return {
			valid: false,
			error: error instanceof Error ? error.message : "Verification failed",
		};
	}
}

// ============================================================================
// HMAC Webhook Verification (Used by BoldSign)
// ============================================================================

/**
 * Verify BoldSign webhook signature using HMAC-SHA256
 *
 * BoldSign signature format: "t=timestamp, s0=signature"
 */
export async function verifyBoldSignWebhook(
	request: Request,
	secret: string
): Promise<WebhookVerificationResult<Record<string, unknown>>> {
	const payloadString = await request.text();
	const signatureHeader = request.headers.get("x-boldsign-signature");

	if (!signatureHeader) {
		return {
			valid: false,
			error: "Missing BoldSign signature header",
		};
	}

	// Parse signature header
	const sigParts: Record<string, string> = {};
	signatureHeader.split(",").forEach((part) => {
		const [key, value] = part.trim().split("=");
		sigParts[key] = value;
	});

	const timestamp = sigParts["t"];
	const signature = sigParts["s0"];

	if (!timestamp || !signature) {
		return {
			valid: false,
			error: "Invalid BoldSign signature format",
		};
	}

	// Verify HMAC signature
	const signedPayload = `${timestamp}.${payloadString}`;
	const encoder = new TextEncoder();

	try {
		const key = await crypto.subtle.importKey(
			"raw",
			encoder.encode(secret),
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["sign"]
		);

		const signatureBytes = await crypto.subtle.sign(
			"HMAC",
			key,
			encoder.encode(signedPayload)
		);

		const expectedSignature = Array.from(new Uint8Array(signatureBytes))
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");

		if (signature !== expectedSignature) {
			return {
				valid: false,
				error: "Signature mismatch",
			};
		}

		const payload = JSON.parse(payloadString);
		return { valid: true, payload };
	} catch (error) {
		console.error("BoldSign webhook verification failed:", error);
		return {
			valid: false,
			error: error instanceof Error ? error.message : "Verification failed",
		};
	}
}

// Stripe Webhook Verification

// Matches Stripe's default five-minute replay tolerance.
const STRIPE_WEBHOOK_TOLERANCE_SEC = 300;

function constantTimeEqualHex(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) {
		diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return diff === 0;
}

function bytesToHex(bytes: ArrayBuffer): string {
	return Array.from(new Uint8Array(bytes))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/**
 * Verify Stripe's timestamped v1 HMAC signature without loading the Stripe SDK.
 */
export async function verifyStripeWebhook(
	request: Request,
	secret: string,
	nowMs: number = Date.now()
): Promise<WebhookVerificationResult<Record<string, unknown>>> {
	const rawBody = await request.text();
	const sigHeader = request.headers.get("stripe-signature");

	if (!sigHeader) {
		return { valid: false, error: "Missing stripe-signature header" };
	}

	let timestamp: string | null = null;
	const signatures: string[] = [];
	for (const part of sigHeader.split(",")) {
		const [key, value] = part.trim().split("=");
		if (!key || !value) continue;
		if (key === "t") timestamp = value;
		else if (key === "v1") signatures.push(value);
	}

	if (!timestamp || signatures.length === 0) {
		return { valid: false, error: "Malformed stripe-signature header" };
	}

	const tsSeconds = Number(timestamp);
	if (!Number.isFinite(tsSeconds)) {
		return { valid: false, error: "Invalid stripe-signature timestamp" };
	}
	const ageSec = Math.abs(nowMs / 1000 - tsSeconds);
	if (ageSec > STRIPE_WEBHOOK_TOLERANCE_SEC) {
		return { valid: false, error: "Stripe webhook timestamp outside tolerance" };
	}

	const encoder = new TextEncoder();
	const signedPayload = `${timestamp}.${rawBody}`;

	try {
		const key = await crypto.subtle.importKey(
			"raw",
			encoder.encode(secret),
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["sign"]
		);
		const expectedBytes = await crypto.subtle.sign(
			"HMAC",
			key,
			encoder.encode(signedPayload)
		);
		const expectedHex = bytesToHex(expectedBytes);

		const matched = signatures.some((sig) =>
			constantTimeEqualHex(sig, expectedHex)
		);
		if (!matched) {
			return { valid: false, error: "Stripe webhook signature mismatch" };
		}

		const payload = JSON.parse(rawBody) as Record<string, unknown>;
		return { valid: true, payload };
	} catch (error) {
		return {
			valid: false,
			error: error instanceof Error ? error.message : "Verification failed",
		};
	}
}

// ============================================================================
// Response Helpers
// ============================================================================

/**
 * Create a successful webhook response
 */
export function webhookSuccess(body?: string): Response {
	return new Response(body ?? null, { status: 200 });
}

/**
 * Create an error webhook response
 */
export function webhookError(status: number, message?: string): Response {
	return new Response(message ?? "Error", { status });
}

/**
 * Create an unauthorized webhook response
 */
export function webhookUnauthorized(message?: string): Response {
	return webhookError(401, message ?? "Unauthorized");
}

/**
 * Create a bad request webhook response
 */
export function webhookBadRequest(message?: string): Response {
	return webhookError(400, message ?? "Bad Request");
}

// ============================================================================
// Logging Helpers
// ============================================================================

/**
 * Log webhook event received
 */
export function logWebhookReceived(
	service: string,
	eventType: string,
	identifier?: string
): void {
	console.log(
		`${service} webhook received: ${eventType}${identifier ? ` for ${identifier}` : ""}`
	);
}

/**
 * Log webhook processing success
 */
export function logWebhookSuccess(
	service: string,
	eventType: string,
	identifier?: string
): void {
	console.log(
		`${service} webhook processed: ${eventType}${identifier ? ` for ${identifier}` : ""}`
	);
}

/**
 * Log webhook processing error
 */
export async function logWebhookError(
	service: string,
	eventType: string,
	error: unknown,
	identifier?: string,
	// When provided, also captures to PostHog error tracking. Pass only at
	// terminal catch sites (route-level / swallowed errors) — rethrown errors
	// are captured upstream, so passing ctx on both would double-count.
	ctx?: SchedulerCtx
): Promise<void> {
	console.error(
		`${service} webhook error: ${eventType}${identifier ? ` for ${identifier}` : ""}`,
		error instanceof Error ? error.message : String(error)
	);
	if (ctx) {
		await trackServerException(ctx, {
			error,
			source: "webhook",
			properties: { service, event_type: eventType, identifier },
		});
	}
}

// ============================================================================
// Timestamp Conversion
// ============================================================================

/**
 * Convert Unix seconds to milliseconds (used by BoldSign)
 */
export function secondsToMilliseconds(seconds: number): number {
	return seconds * 1000;
}

/**
 * Convert ISO date string to milliseconds (used by Resend)
 */
export function isoToMilliseconds(isoString: string): number {
	return new Date(isoString).getTime();
}

// ============================================================================
// Event Type Helpers
// ============================================================================

/**
 * Common webhook event status types
 */
export type WebhookEventStatus =
	| "sent"
	| "delivered"
	| "opened"
	| "bounced"
	| "complained"
	| "completed"
	| "declined"
	| "expired"
	| "revoked"
	| "viewed"
	| "signed";

/**
 * Map webhook event types to internal status
 */
export function normalizeEventType(
	eventType: string
): WebhookEventStatus | null {
	const normalized = eventType.toLowerCase().replace(/[._]/g, "");

	const mapping: Record<string, WebhookEventStatus> = {
		sent: "sent",
		delivered: "delivered",
		opened: "opened",
		bounced: "bounced",
		complained: "complained",
		completed: "completed",
		declined: "declined",
		expired: "expired",
		revoked: "revoked",
		viewed: "viewed",
		signed: "signed",
		emailsent: "sent",
		emaildelivered: "delivered",
		emaildelivereddelayed: "delivered",
		emailopened: "opened",
		emailbounced: "bounced",
		emailcomplained: "complained",
	};

	return mapping[normalized] ?? null;
}
