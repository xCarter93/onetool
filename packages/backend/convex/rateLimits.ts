import { RateLimiter, MINUTE, HOUR } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
	// Limit community page interest form submissions per slug
	communityInterest: { kind: "fixed window", rate: 10, period: MINUTE },
	// Limit per-email submissions to prevent the same address flooding the task queue
	communityInterestPerEmail: { kind: "fixed window", rate: 2, period: HOUR },

	portalOtpSend: { kind: "token bucket", rate: 3, period: HOUR, capacity: 3 },

	portalOtpVerify: {
		kind: "token bucket",
		rate: 5,
		period: 10 * MINUTE,
		capacity: 5,
	},

	// Higher per-IP capacity allows shared NATs while limiting email-list floods.
	portalOtpSendPerIp: {
		kind: "token bucket",
		rate: 30,
		period: HOUR,
		capacity: 30,
	},

	// Phase 14: limit per-session approval/decline submits.
	portalQuoteApprove: {
		kind: "token bucket",
		rate: 5,
		period: 10 * MINUTE,
		capacity: 5,
	},
	portalQuoteDecline: {
		kind: "token bucket",
		rate: 5,
		period: 10 * MINUTE,
		capacity: 5,
	},

	// Phase 15: limit per-session PaymentIntent mints.
	portalInvoicePay: {
		kind: "token bucket",
		rate: 5,
		period: 10 * MINUTE,
		capacity: 5,
	},

	// Bound per-user assistant LLM spend — streamResponse is client-callable.
	assistantMessage: {
		kind: "token bucket",
		rate: 60,
		period: HOUR,
		capacity: 15,
	},

	// Each createReport/configureReport tool call costs an extra one-shot
	// LLM generation on top of the assistant message that triggered it, and
	// the model may retry a few times within one turn.
	reportConfigGeneration: {
		kind: "token bucket",
		rate: 30,
		period: HOUR,
		capacity: 10,
	},
});
