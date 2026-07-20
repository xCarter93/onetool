import type { NextConfig } from "next";
import { withPostHogConfig } from "@posthog/nextjs-config";

// Extract hostname from Convex URL for image optimization
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convexHostname = convexUrl ? new URL(convexUrl).hostname : null;

// PUB-03 (partial) / PUB-27: baseline security headers. These need no CSP soak
// and ship immediately. `Referrer-Policy` in particular limits how much of a
// URL leaks to cross-origin subresources via the Referer header. A full
// Content-Security-Policy is deferred to a Report-Only soak (see PRD Phase 3).
// PUB-03 (full CSP): shipped as Content-Security-Policy-REPORT-ONLY first so it
// never blocks — it only surfaces what each of Convex (WebSocket), Clerk,
// Stripe.js, and Mapbox actually needs. Tune from the browser violation reports,
// then (a) add a per-request nonce via proxy.ts for dynamic routes and (b)
// promote to the enforcing `Content-Security-Policy` header. Do NOT flip to
// enforce without the soak — enforcing blind will break the workspace.
const cspReportOnly = [
	"default-src 'self'",
	// 'unsafe-inline'/'unsafe-eval' stay for now: Next.js emits inline bootstrap
	// scripts. Replace with a nonce before enforcing.
	`script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com`,
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' https: data: blob:",
	"font-src 'self' data:",
	`connect-src 'self'${convexHostname ? ` https://${convexHostname} wss://${convexHostname}` : ""}${process.env.NEXT_PUBLIC_POSTHOG_HOST ? ` ${process.env.NEXT_PUBLIC_POSTHOG_HOST}` : ""}`, 
	// app.boldsign.com: embedded e-signature editor (quotes/[quoteId]/sign).
	// Convex origin: PDF previews iframe file-storage URLs (quote/invoice sidebars).
	`frame-src https://js.stripe.com https://hooks.stripe.com https://app.boldsign.com${convexHostname ? ` https://${convexHostname}` : ""}`,
	"frame-ancestors 'none'",
	"base-uri 'self'",
	"form-action 'self' https://checkout.stripe.com",
	"object-src 'none'",
].join("; ");

const securityHeaders = [
	{
		key: "Strict-Transport-Security",
		value: "max-age=63072000; includeSubDomains; preload",
	},
	{ key: "X-Content-Type-Options", value: "nosniff" },
	{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
	{ key: "X-Frame-Options", value: "DENY" },
	{
		key: "Permissions-Policy",
		value: "camera=(), microphone=(), geolocation=(), payment=(self), usb=()",
	},
	{ key: "Content-Security-Policy-Report-Only", value: cspReportOnly },
];

const nextConfig: NextConfig = {
	poweredByHeader: false,
	// Required so the PostHog reverse-proxy paths below aren't trailing-slash redirected.
	skipTrailingSlashRedirect: true,
	// Same-origin reverse proxy for posthog-js (US cloud). Ingestion + static assets
	// go through /ingest so ad blockers and a same-origin CSP don't drop events.
	// proxy.ts excludes /ingest from the Clerk matcher.
	async rewrites() {
		return [
			{
				source: "/ingest/static/:path*",
				destination: "https://us-assets.i.posthog.com/static/:path*",
			},
			{
				source: "/ingest/array/:path*",
				destination: "https://us-assets.i.posthog.com/array/:path*",
			},
			{
				source: "/ingest/:path*",
				destination: `${process.env.NEXT_PUBLIC_POSTHOG_HOST}/:path*`,
			},
		];
	},
	async headers() {
		return [
			{
				source: "/:path*",
				headers: securityHeaders,
			},
			{
				source: "/portal/:path*",
				headers: [
					{ key: "X-Robots-Tag", value: "noindex, nofollow" },
				],
			},
		];
	},
	experimental: {
		viewTransition: true,
		globalNotFound: true,
	},
	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "images.unsplash.com",
			},
			{
				protocol: "https",
				hostname: "tailwindcss.com",
			},
			{
				protocol: "https",
				hostname: "img.clerk.com",
			},
			// Convex storage for community page images
			...(convexHostname
				? [
						{
							protocol: "https" as const,
							hostname: convexHostname,
						},
					]
				: []),
		],
	},
	env: {
		NEXT_PUBLIC_MAPBOX_API_KEY: process.env.MAPBOX_API_KEY,
	},
};

export default withPostHogConfig(nextConfig, {
	personalApiKey: process.env.POSTHOG_API_KEY!,
	projectId: process.env.POSTHOG_PROJECT_ID,
	host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
	sourcemaps: {
		enabled: true,
		deleteAfterUpload: true,
	},
});
