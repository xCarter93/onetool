import { RateLimiter, MINUTE, HOUR } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
	// Limit community page interest form submissions per slug
	communityInterest: { kind: "fixed window", rate: 10, period: MINUTE },
	// Limit per-email submissions to prevent the same address flooding the task queue
	communityInterestPerEmail: { kind: "fixed window", rate: 2, period: HOUR },

	// [Review fix #15] Portal OTP send: EXACT parameters for "3 sends per hour
	// per email" semantics. capacity=3 + rate=3/HOUR + period=HOUR means: bucket
	// starts full (3 tokens), each send drains 1, tokens refill at exactly
	// 3/3600s. A 4th send within 1 hour from the same email is rejected because
	// the bucket cannot refill faster than the rate. There is no burst beyond
	// capacity=3.
	portalOtpSend: { kind: "token bucket", rate: 3, period: HOUR, capacity: 3 },

	// Portal OTP verify: 5 attempts per (email + portalId) per 10 min — same
	// bucket semantics as portalOtpSend.
	portalOtpVerify: {
		kind: "token bucket",
		rate: 5,
		period: 10 * MINUTE,
		capacity: 5,
	},

	// Per-IP cap defends against email-list flooding (RESEARCH Pitfall 10).
	// Higher capacity since a shared NAT could legitimately send for many users.
	portalOtpSendPerIp: {
		kind: "token bucket",
		rate: 30,
		period: HOUR,
		capacity: 30,
	},
});
