import { HELP_CATEGORIES } from "./registry";
import type { HelpArticle } from "./types";

export interface HelpSearchHit {
	/** "category-slug/article-slug", the key for fetching the full article. */
	ref: string;
	/** Public help center path, e.g. "/help/clients/importing-clients". */
	url: string;
	title: string;
	subtitle: string;
	category: string;
	availability: "all" | "business";
	score: number;
}

function bodyText(article: HelpArticle): string {
	const parts: string[] = [];
	for (const section of article.sections) {
		parts.push(section.heading);
		for (const block of section.blocks) {
			if (block.type === "steps" || block.type === "list") {
				parts.push(...block.items);
			} else if (block.type !== "media") {
				parts.push(block.text);
			}
		}
	}
	for (const item of article.faq ?? []) {
		parts.push(item.question, item.answer);
	}
	return parts.join(" ").toLowerCase();
}

/**
 * Keyword search over all help articles. Token-based scoring weighted toward
 * titles and keywords; no index, the corpus is small enough to scan.
 */
export function searchHelpArticles(query: string, limit = 5): HelpSearchHit[] {
	const tokens = query
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((token) => token.length > 1);
	if (tokens.length === 0) return [];
	const phrase = query.toLowerCase().trim();

	const hits: HelpSearchHit[] = [];
	for (const category of HELP_CATEGORIES) {
		for (const article of category.articles) {
			const title = article.title.toLowerCase();
			const subtitle = article.subtitle.toLowerCase();
			const keywords = (article.keywords ?? []).join(" ").toLowerCase();
			const categoryName = category.name.toLowerCase();
			const headings = article.sections
				.map((section) => section.heading)
				.join(" ")
				.toLowerCase();
			const body = bodyText(article);

			let score = 0;
			for (const token of tokens) {
				if (title.includes(token)) score += 8;
				if (keywords.includes(token)) score += 6;
				if (subtitle.includes(token)) score += 4;
				if (categoryName.includes(token)) score += 3;
				if (headings.includes(token)) score += 2;
				if (body.includes(token)) score += 1;
			}
			if (phrase.length > 3 && title.includes(phrase)) score += 10;
			if (score === 0) continue;

			hits.push({
				ref: `${category.slug}/${article.slug}`,
				url: `/help/${category.slug}/${article.slug}`,
				title: article.title,
				subtitle: article.subtitle,
				category: category.name,
				availability: article.availability,
				score,
			});
		}
	}

	return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
