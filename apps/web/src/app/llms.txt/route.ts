import { HELP_CATEGORIES } from "@/lib/help";

// /llms.txt (llmstxt.org): a curated index of the public surface for LLMs and
// agentic browsers, which otherwise have to guess at it from rendered HTML.
// Generated rather than checked in for the same reason as sitemap.ts — the help
// centre is data, and a hand-written copy of 45 article links would rot on the
// first content change. Kept in step with sitemap.ts: same base URL, same set
// of public pages.
//
// The proxy matcher must keep `txt` in its static-extension exclusion or Clerk
// answers this with a 307 to sign-in (see src/proxy.ts).

export const dynamic = "force-static";

const SUMMARY =
	"Business management for HVAC, landscaping, cleaning and trades. Clients, quotes, e-signatures, scheduling, routing, invoices and card payments — the whole job in one place, run from a phone in a truck.";

const INTRO = `OneTool runs one job end to end. A client is logged once with their contacts and
properties; a quote is priced off reusable products; the client e-signs it on
their phone; approval turns the quote into scheduled visits and tasks; the day
comes back as an optimised driving route; and the invoice bills off the same
numbers and is paid by card. Nothing is retyped between steps.`;

const SCOPE = `Everything linked below is public. The rest of the application requires an
account and is not useful to fetch: workspace pages, /api (disallowed in
robots.txt), and — importantly — the client portal (/portal) and payment links
(/pay), which are per-recipient URLs carrying bearer credentials and are served
noindex. Do not fetch or follow those.`;

export function GET() {
	// Relative links when the base URL is unset, matching sitemap.ts's guard
	// without emitting an empty file.
	const base = process.env.NEXT_PUBLIC_APP_URL ?? "";

	const link = (path: string, label: string, note: string) =>
		`- [${label}](${base}${path}): ${note}`;

	const sections = [
		`# OneTool`,
		`> ${SUMMARY}`,
		INTRO,
		SCOPE,
		[
			`## Product`,
			link("/", "OneTool", "Landing page — the full product story in one page."),
			link("/#pricing", "Pricing", "Plans and what each one includes."),
			link(
				"/#compare",
				"Compare",
				"How OneTool's published rates line up against other field-service tools."
			),
			link("/#faq", "FAQ", "Common questions about switching, data, and billing."),
			link("/help", "Help centre", "Every guide, grouped by area."),
		].join("\n"),
		...HELP_CATEGORIES.map((category) =>
			[
				`## ${category.name}`,
				`${category.description}`,
				"",
				link(
					`/help/${category.slug}`,
					`${category.name} overview`,
					"Category index."
				),
				...category.articles.map((article) =>
					link(
						`/help/${category.slug}/${article.slug}`,
						article.title,
						// Same plan name the help pages and billing tab show, so an
						// assistant quoting this file names the plan the user can find.
						article.availability === "business"
							? `${article.subtitle} (Business plan)`
							: article.subtitle
					)
				),
			].join("\n")
		),
		[
			`## Legal`,
			link("/terms-of-service", "Terms of Service", "Terms governing use of OneTool."),
			link("/privacy-policy", "Privacy Policy", "What data OneTool collects and why."),
			link(
				"/data-security",
				"Data security",
				"How customer data is stored, encrypted, and accessed."
			),
		].join("\n"),
	];

	return new Response(`${sections.join("\n\n")}\n`, {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "public, max-age=0, must-revalidate",
		},
	});
}
