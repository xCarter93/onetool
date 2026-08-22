import { RateLimiter, MINUTE, HOUR } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

/**
 * Shared automation run-start budget. Enforced twice: the `automationRunStarts`
 * component limiter below (event-driven + scheduled runs) and startManualRun's
 * direct workflowExecutions window scan. Both must draw from these constants.
 */
export const AUTOMATION_RUN_WINDOW_MS = MINUTE;
export const MAX_AUTOMATION_RUNS_PER_WINDOW = 100;

/** DEC-2 adopted default: automation emails per org per day (premium orgs only). */
export const AUTOMATION_EMAIL_DAILY_CAP = 200;

export const rateLimiter = new RateLimiter(components.rateLimiter, {
	// Limit community page interest form submissions per slug
	communityInterest: { kind: "fixed window", rate: 10, period: MINUTE },
	// Limit per-email submissions to prevent the same address flooding the task queue
	communityInterestPerEmail: { kind: "fixed window", rate: 2, period: HOUR },
	// PUB-18/PUB-19: distributed per-IP throttle so an attacker rotating emails
	// cannot exhaust a slug's shared quota and block legitimate leads.
	communityInterestPerIp: { kind: "token bucket", rate: 20, period: HOUR, capacity: 20 },
	// PUB-16: the view beacon is unauthenticated and fires on every page load.
	// A limited caller is silently ignored rather than rejected — an inflated
	// counter is a worse outcome than a dropped one, and the visitor sees
	// nothing either way.
	communityPageView: { kind: "token bucket", rate: 600, period: HOUR, capacity: 600 },
	communityPageViewPerIp: { kind: "token bucket", rate: 30, period: HOUR, capacity: 30 },

	// SEC-10: each mention sync spends one Clerk Backend API call, and Clerk's
	// limits are instance-wide, so an authenticated member must not be able to
	// drive them for everyone. Generous versus real @mention use.
	mentionUserSync: {
		kind: "token bucket",
		rate: 60,
		period: HOUR,
		capacity: 20,
	},

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

	// Routing page: each compute is 1 Mapbox Directions/Optimization request.
	routeCompute: {
		kind: "token bucket",
		rate: 60,
		period: HOUR,
		capacity: 10,
	},
	// Routing page: gas-station search-along-route lookups.
	routeGasSearch: {
		kind: "token bucket",
		rate: 120,
		period: HOUR,
		capacity: 20,
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

	// PUB-12: LLM-backed routes (analyze-csv) — bound spend per org.
	llmCsvAnalyze: {
		kind: "token bucket",
		rate: 30,
		period: HOUR,
		capacity: 10,
	},

	// WS1b: replaces the old sliding-window workflowExecutions doc scan
	// (100 run starts/min/org). Unsharded: batch reservations (count = fan-out
	// size) must fit a single shard or large fan-outs would never be admitted;
	// per-org keys at 100/min don't need shard-level contention relief.
	automationRunStarts: {
		kind: "fixed window",
		rate: MAX_AUTOMATION_RUNS_PER_WINDOW,
		period: AUTOMATION_RUN_WINDOW_MS,
	},

	// DEC-2: per-org daily cap on automation send_email deliveries. Reserved
	// per recipient; over-cap sends record the node as skipped, never failed.
	automationEmailSends: {
		kind: "fixed window",
		rate: AUTOMATION_EMAIL_DAILY_CAP,
		period: 24 * HOUR,
	},
});
