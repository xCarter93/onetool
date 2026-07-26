import type { MetadataRoute } from "next";
import { HELP_CATEGORIES } from "@/lib/help";

// robots.ts already advertises /sitemap.xml when NEXT_PUBLIC_APP_URL is set;
// this generator makes that URL real. Only public marketing, legal, and help
// pages are listed. /pay and /portal stay out (noindex, see next.config.ts).
export default function sitemap(): MetadataRoute.Sitemap {
	const base = process.env.NEXT_PUBLIC_APP_URL;
	if (!base) return [];

	const staticPages: MetadataRoute.Sitemap = [
		{ url: base, changeFrequency: "weekly", priority: 1 },
		{ url: `${base}/help`, changeFrequency: "weekly", priority: 0.8 },
		{ url: `${base}/terms-of-service`, changeFrequency: "yearly", priority: 0.3 },
		{ url: `${base}/privacy-policy`, changeFrequency: "yearly", priority: 0.3 },
		{ url: `${base}/data-security`, changeFrequency: "yearly", priority: 0.3 },
	];

	const categoryPages: MetadataRoute.Sitemap = HELP_CATEGORIES.map(
		(category) => ({
			url: `${base}/help/${category.slug}`,
			changeFrequency: "monthly",
			priority: 0.6,
		})
	);

	const articlePages: MetadataRoute.Sitemap = HELP_CATEGORIES.flatMap(
		(category) =>
			category.articles.map((article) => ({
				url: `${base}/help/${category.slug}/${article.slug}`,
				changeFrequency: "monthly",
				priority: 0.5,
			}))
	);

	return [...staticPages, ...categoryPages, ...articlePages];
}
