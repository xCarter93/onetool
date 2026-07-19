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
			host: "https://us.i.posthog.com",
			// Serverless: no long-lived process to batch in.
			flushAt: 1,
			flushInterval: 0,
		});
	}
	return client;
}
