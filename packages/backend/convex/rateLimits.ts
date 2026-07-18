import { RateLimiter, MINUTE, HOUR } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
	// Limit community page interest form submissions per slug
	communityInterest: { kind: "fixed window", rate: 10, period: MINUTE },
	// Limit per-email submissions to prevent the same address flooding the task queue
	communityInterestPerEmail: { kind: "fixed window", rate: 2, period: HOUR },
	// PUB-18/PUB-19: distributed per-IP throttle so an attacker rotating emails
	// cannot exhaust a slug's shared quota and block legitimate leads.
	communityInterestPerIp: { kind: "token bucket", rate: 20, period: HOUR, capacity: 20 },

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

	// PUB-28: bound touchSession write amplification per session row.
	portalSessionTouch: {
		kind: "token bucket",
		rate: 10,
		period: HOUR,
		capacity: 10,
	},

	// PUB-16: bound bulk scraping of public community pages per IP.
	communityGetBySlugPerIp: {
		kind: "token bucket",
		rate: 120,
		period: HOUR,
		capacity: 60,
	},

	// PUB-12: schedule-demo sends real email via Resend; cap per IP.
	scheduleDemoPerIp: {
		kind: "token bucket",
		rate: 5,
		period: HOUR,
		capacity: 5,
	},

	// PUB-12: LLM-backed routes (analyze-csv, mastra/report) — bound spend per org.
	llmCsvAnalyze: {
		kind: "token bucket",
		rate: 30,
		period: HOUR,
		capacity: 10,
	},
	llmMastraReport: {
		kind: "token bucket",
		rate: 30,
		period: HOUR,
		capacity: 10,
	},
});
