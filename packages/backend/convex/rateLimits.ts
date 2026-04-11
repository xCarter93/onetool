import { RateLimiter, MINUTE, HOUR } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
	// Limit community page interest form submissions per slug
	communityInterest: { kind: "fixed window", rate: 10, period: MINUTE },
	// Limit per-email submissions to prevent the same address flooding the task queue
	communityInterestPerEmail: { kind: "fixed window", rate: 2, period: HOUR },
});
