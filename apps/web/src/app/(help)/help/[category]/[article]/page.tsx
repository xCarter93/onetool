import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
	ArrowLeft,
	ArrowRight,
	ArrowUpRight,
	CircleCheck,
	Sparkles,
	UserRound,
} from "lucide-react";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ArticleFeedback } from "@/components/help/article-feedback";
import { ArticleSections } from "@/components/help/article-blocks";
import { renderInlineText } from "@/components/help/inline-text";
import { HelpMedia } from "@/components/help/help-media";
import {
	HELP_CATEGORIES,
	getAdjacentArticles,
	getHelpArticle,
	resolveHelpRef,
	slugifyHeading,
} from "@/lib/help";

export function generateStaticParams() {
	return HELP_CATEGORIES.flatMap((category) =>
		category.articles.map((article) => ({
			category: category.slug,
			article: article.slug,
		}))
	);
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ category: string; article: string }>;
}): Promise<Metadata> {
	const { category: categorySlug, article: articleSlug } = await params;
	const data = getHelpArticle(categorySlug, articleSlug);
	if (!data) return {};
	return {
		title: data.article.title,
		description: data.article.subtitle,
		openGraph: {
			title: `${data.article.title} | OneTool Help`,
			description: data.article.subtitle,
			type: "article",
		},
	};
}

export default async function HelpArticlePage({
	params,
}: {
	params: Promise<{ category: string; article: string }>;
}) {
	const { category: categorySlug, article: articleSlug } = await params;
	const data = getHelpArticle(categorySlug, articleSlug);
	if (!data) return notFound();

	const { category, article } = data;
	const { previous, next } = getAdjacentArticles(category, article.slug);
	const related = (article.related ?? [])
		.map((ref) => resolveHelpRef(ref))
		.filter((entry) => entry !== undefined);
	const showToc = article.sections.length >= 3;

	return (
		<div className="py-10">
			<Breadcrumb>
				<BreadcrumbList>
					<BreadcrumbItem>
						<BreadcrumbLink render={<Link href="/help" />}>Help</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbLink render={<Link href={`/help/${category.slug}`} />}>
							{category.name}
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbPage>{article.title}</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>

			<div
				className={
					showToc
						? "mt-8 grid gap-12 xl:grid-cols-[minmax(0,1fr)_200px]"
						: "mt-8"
				}
			>
				<article className="max-w-3xl min-w-0">
					<h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
						{article.title}
					</h1>
					<p className="mt-3 text-lg leading-7 text-muted-foreground">
						{article.subtitle}
					</p>

					<div className="mt-5 space-y-1.5 text-sm text-muted-foreground">
						{article.availability === "business" ? (
							<p className="flex items-center gap-2">
								<Sparkles
									className="size-3.5 text-primary"
									aria-hidden="true"
								/>
								Available on the Business plan.
							</p>
						) : (
							<p className="flex items-center gap-2">
								<CircleCheck className="size-3.5" aria-hidden="true" />
								Available on all plans.
							</p>
						)}
						{article.permission && (
							<p className="flex items-center gap-2">
								<UserRound className="size-3.5" aria-hidden="true" />
								{article.permission}
							</p>
						)}
					</div>

					{article.heroMedia && (
						<HelpMedia
							media={article.heroMedia.media}
							caption={article.heroMedia.caption}
							asset={article.heroMedia.asset}
						/>
					)}

					<ArticleSections sections={article.sections} />

					{article.faq && article.faq.length > 0 && (
						<section className="mt-12">
							<h2 className="text-xl font-semibold tracking-tight text-foreground">
								Frequently asked questions
							</h2>
							<Accordion className="mt-2">
								{article.faq.map((item, index) => (
									<AccordionItem key={index} value={index}>
										<AccordionTrigger className="py-4 text-left text-[15px] font-medium">
											{item.question}
										</AccordionTrigger>
										<AccordionContent>
											<p className="pb-4 text-sm leading-6 text-muted-foreground">
												{renderInlineText(item.answer)}
											</p>
										</AccordionContent>
									</AccordionItem>
								))}
							</Accordion>
						</section>
					)}

					{related.length > 0 && (
						<section className="mt-12">
							<h2 className="text-xl font-semibold tracking-tight text-foreground">
								Related resources
							</h2>
							<ul className="mt-4 space-y-2.5">
								{related.map((entry) => (
									<li key={`${entry.category.slug}/${entry.article.slug}`}>
										<Link
											href={`/help/${entry.category.slug}/${entry.article.slug}`}
											className="group inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
										>
											{entry.article.title}
											<ArrowUpRight
												className="size-3.5 transition-transform group-hover:-translate-y-px group-hover:translate-x-px"
												aria-hidden="true"
											/>
										</Link>
									</li>
								))}
							</ul>
						</section>
					)}

					<ArticleFeedback article={`${category.slug}/${article.slug}`} />

					{(previous || next) && (
						<nav
							aria-label="Article pagination"
							className="mt-10 grid gap-4 border-t border-border pt-8 sm:grid-cols-2"
						>
							{previous ? (
								<Link
									href={`/help/${category.slug}/${previous.slug}`}
									className="group rounded-xl border border-border p-4 transition-colors hover:bg-muted/50"
								>
									<span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
										<ArrowLeft className="size-3.5" aria-hidden="true" />
										Previous
									</span>
									<span className="mt-1 block font-medium text-foreground group-hover:text-primary">
										{previous.title}
									</span>
								</Link>
							) : (
								<span aria-hidden="true" />
							)}
							{next && (
								<Link
									href={`/help/${category.slug}/${next.slug}`}
									className="group rounded-xl border border-border p-4 text-right transition-colors hover:bg-muted/50 sm:col-start-2"
								>
									<span className="flex items-center justify-end gap-1.5 text-xs font-medium text-muted-foreground">
										Up next
										<ArrowRight className="size-3.5" aria-hidden="true" />
									</span>
									<span className="mt-1 block font-medium text-foreground group-hover:text-primary">
										{next.title}
									</span>
								</Link>
							)}
						</nav>
					)}
				</article>

				{showToc && (
					<nav
						aria-label="On this page"
						className="sticky top-24 hidden max-h-[calc(100vh-8rem)] self-start overflow-y-auto xl:block"
					>
						<p className="text-xs font-semibold tracking-wide text-muted-foreground/80 uppercase">
							On this page
						</p>
						<ul className="mt-3 space-y-2 border-l border-border pl-4 text-sm">
							{article.sections.map((section) => (
								<li key={section.heading}>
									<a
										href={`#${slugifyHeading(section.heading)}`}
										className="block leading-5 text-muted-foreground transition-colors hover:text-foreground"
									>
										{section.heading}
									</a>
								</li>
							))}
						</ul>
					</nav>
				)}
			</div>
		</div>
	);
}
