import { defineApp } from "convex/server";
import { v } from "convex/values";
import aggregate from "@convex-dev/aggregate/convex.config";
import resend from "@convex-dev/resend/convex.config";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import migrations from "@convex-dev/migrations/convex.config";
import agent from "@convex-dev/agent/convex.config";
import posthog from "@posthog/convex/convex.config.js";
import workpool from "@convex-dev/workpool/convex.config";

// PostHog credentials live in the deployment env (`npx convex env set`);
// declared here so `app.use(posthog, { env })` binds them by reference.
const app = defineApp({
	env: {
		POSTHOG_PROJECT_TOKEN: v.string(),
		POSTHOG_HOST: v.optional(v.string()),
		// Optional: enables server-side feature-flag evaluation (feature_flag:read scope).
		POSTHOG_PERSONAL_API_KEY: v.optional(v.string()),
	},
});

// Define separate aggregates for different home stats metrics
app.use(aggregate, { name: "clientCounts" });
app.use(aggregate, { name: "projectCounts" });
app.use(aggregate, { name: "quoteCounts" });
app.use(aggregate, { name: "invoiceRevenue" });
app.use(aggregate, { name: "invoiceCounts" });

// Resend email integration
app.use(resend);

// Rate limiting
app.use(rateLimiter);

// Database migrations
app.use(migrations);

// AI assistant agent (threads/messages/streaming)
app.use(agent);

// Bounds external-I/O fan-out (push notifications today) so a burst can't
// monopolize the deployment's scheduled-function slots.
app.use(workpool, { name: "externalIoPool" });

// Server-side PostHog analytics (fires business events from Convex)
app.use(posthog, {
	env: {
		POSTHOG_PROJECT_TOKEN: app.env.POSTHOG_PROJECT_TOKEN,
		POSTHOG_HOST: app.env.POSTHOG_HOST,
		POSTHOG_PERSONAL_API_KEY: app.env.POSTHOG_PERSONAL_API_KEY,
	},
});

export default app;
