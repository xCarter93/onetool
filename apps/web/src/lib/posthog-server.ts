import { PostHog } from "posthog-node";
import { env } from "@/env";

let client: PostHog | null = null;

/**
 * Server-side PostHog client for API routes. Talks to PostHog directly
 * (the /ingest reverse proxy is for the browser SDK only).
 */
export function getPostHogServer(): PostHog {
	if (!client) {
		client = new PostHog(env.NEXT_PUBLIC_POSTHOG_KEY, {
			host: env.NEXT_PUBLIC_POSTHOG_HOST,
			// Serverless: no long-lived process to batch in.
			flushAt: 1,
			flushInterval: 0,
		});
	}
	return client;
}

/**
 * Evaluate a feature flag for a signed-in user from server code.
 *
 * Fails closed on every error path — an unreachable or misconfigured PostHog
 * must not open a gated route. Callers that need the feature to stay usable
 * when analytics is down should not use this.
 */
export async function isFlagEnabledForUser(
	flag: string,
	distinctId: string
): Promise<boolean> {
	try {
		// evaluateFlags, not the deprecated isFeatureEnabled: one scoped /flags
		// request per call, and it survives the next posthog-node major.
		const flags = await getPostHogServer().evaluateFlags(distinctId, {
			flagKeys: [flag],
		});
		return flags.isEnabled(flag) === true;
	} catch (error) {
		console.error(`PostHog flag evaluation failed for "${flag}":`, error);
		return false;
	}
}
