import type { MetadataRoute } from "next";

// PUB-04 / PUB-25: /pay and /portal carry bearer credentials in the URL. We do
// NOT Disallow them here — a robots.txt Disallow blocks crawling, which would
// prevent crawlers from ever seeing the noindex directive, leaving URL-only
// listings possible. Instead they are served `X-Robots-Tag: noindex, nofollow`
// (see next.config.ts) so crawlers fetch, see noindex, and drop them. Only
// /api/ (no meaningful content) is disallowed outright.
export default function robots(): MetadataRoute.Robots {
	const base = process.env.NEXT_PUBLIC_APP_URL;
	return {
		rules: {
			userAgent: "*",
			disallow: ["/api/"],
		},
		...(base ? { sitemap: `${base}/sitemap.xml`, host: base } : {}),
	};
}
