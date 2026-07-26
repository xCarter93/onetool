import { HELP_CATEGORY_META } from "./categories";
import type { HelpArticle, HelpCategory } from "./types";
import { gettingStartedArticles } from "./articles/getting-started";
import { clientsArticles } from "./articles/clients";
import { projectsAndTasksArticles } from "./articles/projects-and-tasks";
import { quotesArticles } from "./articles/quotes";
import { invoicesAndPaymentsArticles } from "./articles/invoices-and-payments";
import { clientPortalArticles } from "./articles/client-portal";
import { inboxArticles } from "./articles/inbox";
import { automationsArticles } from "./articles/automations";
import { aiAssistantArticles } from "./articles/ai-assistant";
import { routingArticles } from "./articles/routing";
import { reportsArticles } from "./articles/reports";
import { settingsAndTeamArticles } from "./articles/settings-and-team";
import { mobileAppArticles } from "./articles/mobile-app";

const ARTICLES_BY_CATEGORY: Record<string, HelpArticle[]> = {
	"getting-started": gettingStartedArticles,
	clients: clientsArticles,
	"projects-and-tasks": projectsAndTasksArticles,
	quotes: quotesArticles,
	"invoices-and-payments": invoicesAndPaymentsArticles,
	"client-portal": clientPortalArticles,
	inbox: inboxArticles,
	automations: automationsArticles,
	"ai-assistant": aiAssistantArticles,
	routing: routingArticles,
	reports: reportsArticles,
	"settings-and-team": settingsAndTeamArticles,
	"mobile-app": mobileAppArticles,
};

export const HELP_CATEGORIES: HelpCategory[] = HELP_CATEGORY_META.map(
	(meta) => ({
		...meta,
		articles: ARTICLES_BY_CATEGORY[meta.slug] ?? [],
	})
);

export function getHelpCategory(slug: string): HelpCategory | undefined {
	return HELP_CATEGORIES.find((category) => category.slug === slug);
}

export function getHelpArticle(
	categorySlug: string,
	articleSlug: string
): { category: HelpCategory; article: HelpArticle } | undefined {
	const category = getHelpCategory(categorySlug);
	const article = category?.articles.find((a) => a.slug === articleSlug);
	if (!category || !article) return undefined;
	return { category, article };
}

/** Resolves a "category-slug/article-slug" reference. */
export function resolveHelpRef(
	ref: string
): { category: HelpCategory; article: HelpArticle } | undefined {
	const [categorySlug, articleSlug] = ref.split("/");
	if (!categorySlug || !articleSlug) return undefined;
	return getHelpArticle(categorySlug, articleSlug);
}

export function getAdjacentArticles(
	category: HelpCategory,
	articleSlug: string
): { previous?: HelpArticle; next?: HelpArticle } {
	const index = category.articles.findIndex((a) => a.slug === articleSlug);
	if (index === -1) return {};
	return {
		previous: index > 0 ? category.articles[index - 1] : undefined,
		next:
			index < category.articles.length - 1
				? category.articles[index + 1]
				: undefined,
	};
}

export function slugifyHeading(heading: string): string {
	return heading
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, "")
		.trim()
		.replace(/\s+/g, "-");
}
