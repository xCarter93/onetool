import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
	server: {
		CLERK_SECRET_KEY: z.string().min(1),
		CLERK_USER_WEBHOOK_SECRET: z.string().min(1),
		CLERK_BILLING_WEBHOOK_SECRET: z.string().min(1),
		BOLDSIGN_API_KEY: z.string().min(1),
		BOLDSIGN_WEBHOOK_SECRET: z.string().optional(),
		OPENAI_API_KEY: z.string().min(1),
		UNSPLASH_ACCESS_KEY: z.string().min(1),
		UNSPLASH_SECRET_KEY: z.string().min(1),
		UNSPLASH_APP_ID: z.string().min(1),
		CLERK_ISSUER_DOMAIN: z.string().min(1),
		RESEND_API_KEY: z.string().min(1),
		RESEND_WEBHOOK_SECRET: z.string().min(1),
		STRIPE_APPLICATION_FEE_CENTS: z.string().optional().default("100"),
		MAPBOX_API_KEY: z.string().min(1),
		// Portal session JWT (PORTAL-03, PORTAL-05). Server-only — never exposed
		// to the client bundle. Generate via `pnpm tsx scripts/generate-portal-jwt-keys.ts`.
		PORTAL_JWT_PRIVATE_KEY: z.string().min(1),
		PORTAL_JWT_JWKS: z.string().min(1),
		PORTAL_JWT_ISSUER: z.string().url(),
		// [Review fix Greptile-P1] Shared secret guarding Convex httpActions
		// that this Next.js server proxies to. The Next route derives the
		// trusted client IP from CDN headers, hashes it, and forwards both
		// the hash and this secret. Without it, the Convex httpAction would
		// be directly callable from the public internet with rotated/spoofed
		// forwarding headers, defeating per-IP rate limits.
		PORTAL_OTP_REQUEST_SECRET: z.string().min(16),
	},
	client: {
		NEXT_PUBLIC_CONVEX_URL: z.string().min(1),
		NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
		NEXT_PUBLIC_CLERK_FRONTEND_API_URL: z.string().min(1),
		NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1),
		NEXT_PUBLIC_POSTHOG_KEY: z.string().min(1),
		NEXT_PUBLIC_POSTHOG_HOST: z.string().url(),
		NEXT_PUBLIC_MAPBOX_API_KEY: z.string().min(1),
	},
	experimental__runtimeEnv: {
		NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
			process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
		NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL,
		NEXT_PUBLIC_CLERK_FRONTEND_API_URL:
			process.env.NEXT_PUBLIC_CLERK_FRONTEND_API_URL,
		NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
			process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
		NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
		NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
		NEXT_PUBLIC_MAPBOX_API_KEY: process.env.NEXT_PUBLIC_MAPBOX_API_KEY,
	},
});
