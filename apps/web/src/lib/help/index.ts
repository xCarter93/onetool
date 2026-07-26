import {
	BookOpen,
	Briefcase,
	ChartColumn,
	FileText,
	Handshake,
	Mail,
	Receipt,
	Rocket,
	Route,
	Settings,
	Smartphone,
	Sparkles,
	Users,
	Zap,
	type LucideIcon,
} from "lucide-react";
import {
	HELP_CATEGORIES as HELP_CATEGORY_DATA,
	getAdjacentArticles,
	slugifyHeading,
} from "@onetool/help-content";
import type {
	HelpArticle,
	HelpCategory as HelpCategoryData,
} from "@onetool/help-content";

// Content lives in @onetool/help-content (shared with the backend for the
// assistant's searchHelp tool); this layer attaches the web-only icons.
export type {
	HelpArticle,
	HelpBlock,
	HelpFaqItem,
	HelpSection,
} from "@onetool/help-content";
export { getAdjacentArticles, slugifyHeading };

export interface HelpCategory extends HelpCategoryData {
	icon: LucideIcon;
}

const CATEGORY_ICONS: Record<string, LucideIcon> = {
	"getting-started": Rocket,
	clients: Users,
	"projects-and-tasks": Briefcase,
	quotes: FileText,
	"invoices-and-payments": Receipt,
	"client-portal": Handshake,
	inbox: Mail,
	automations: Zap,
	"ai-assistant": Sparkles,
	routing: Route,
	reports: ChartColumn,
	"settings-and-team": Settings,
	"mobile-app": Smartphone,
};

export const HELP_CATEGORIES: HelpCategory[] = HELP_CATEGORY_DATA.map(
	(category) => ({
		...category,
		icon: CATEGORY_ICONS[category.slug] ?? BookOpen,
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
