import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { HELP_CATEGORIES, getHelpCategory } from "@/lib/help";

export function generateStaticParams() {
	return HELP_CATEGORIES.map((category) => ({ category: category.slug }));
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ category: string }>;
}): Promise<Metadata> {
	const { category: categorySlug } = await params;
	const category = getHelpCategory(categorySlug);
	if (!category) return {};
	return {
		title: category.name,
		description: category.description,
	};
}

export default async function HelpCategoryPage({
	params,
}: {
	params: Promise<{ category: string }>;
}) {
	const { category: categorySlug } = await params;
	const category = getHelpCategory(categorySlug);
	if (!category) return notFound();

	return (
		<div className="py-10">
			<Breadcrumb>
				<BreadcrumbList>
					<BreadcrumbItem>
						<BreadcrumbLink render={<Link href="/help" />}>Help</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbPage>{category.name}</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>

			<div className="mt-8 flex items-start gap-4">
				<span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/50">
					<category.icon
						className="size-5 text-foreground/70"
						aria-hidden="true"
					/>
				</span>
				<div>
					<h1 className="text-3xl font-bold tracking-tight text-foreground">
						{category.name}
					</h1>
					<p className="mt-2 leading-7 text-muted-foreground">
						{category.description}
					</p>
				</div>
			</div>

			{category.articles.length > 0 ? (
				<ol className="mt-10 space-y-1">
					{category.articles.map((article, index) => (
						<li key={article.slug}>
							<Link
								href={`/help/${category.slug}/${article.slug}`}
								className="group -mx-4 flex items-start gap-4 rounded-xl p-4 transition-colors hover:bg-muted/50"
							>
								{category.ordered ? (
									<span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-background text-xs font-semibold text-foreground">
										{index + 1}
									</span>
								) : (
									<span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50">
										<FileText
											className="size-3.5 text-muted-foreground"
											aria-hidden="true"
										/>
									</span>
								)}
								<span className="min-w-0 flex-1">
									<span className="flex flex-wrap items-center gap-2">
										<span className="font-medium text-foreground group-hover:text-primary">
											{article.title}
										</span>
										{article.availability === "business" && (
											<Badge variant="secondary" className="text-[11px]">
												Business plan
											</Badge>
										)}
									</span>
									<span className="mt-0.5 block text-sm leading-6 text-muted-foreground">
										{article.subtitle}
									</span>
								</span>
								<ChevronRight
									className="mt-1.5 size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
									aria-hidden="true"
								/>
							</Link>
						</li>
					))}
				</ol>
			) : (
				<p className="mt-10 text-muted-foreground">
					Articles for this topic are on the way.
				</p>
			)}
		</div>
	);
}
