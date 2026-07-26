"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { HELP_CATEGORIES } from "@/lib/help";
import type { HelpCategory } from "@/lib/help/types";
import { cn } from "@/lib/utils";

function CategoryNavItem({ category }: { category: HelpCategory }) {
	const pathname = usePathname();
	const categoryPath = `/help/${category.slug}`;
	const active =
		pathname === categoryPath || pathname.startsWith(`${categoryPath}/`);

	return (
		<li>
			<Link
				href={categoryPath}
				className={cn(
					"flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
					active
						? "bg-muted font-medium text-foreground"
						: "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
				)}
			>
				<category.icon
					className={cn(
						"size-4 shrink-0",
						active ? "text-primary" : "text-muted-foreground/80"
					)}
					aria-hidden="true"
				/>
				{category.name}
			</Link>
			{active && category.articles.length > 0 && (
				<ul className="mt-1 mb-2 ml-[1.4rem] space-y-0.5 border-l border-border pl-3">
					{category.articles.map((article) => {
						const articlePath = `${categoryPath}/${article.slug}`;
						const articleActive = pathname === articlePath;
						return (
							<li key={article.slug}>
								<Link
									href={articlePath}
									className={cn(
										"block rounded-md px-2 py-1.5 text-[13px] leading-5 transition-colors",
										articleActive
											? "font-medium text-primary"
											: "text-muted-foreground hover:text-foreground"
									)}
								>
									{article.title}
								</Link>
							</li>
						);
					})}
				</ul>
			)}
		</li>
	);
}

function NavGroup({
	label,
	categories,
}: {
	label: string;
	categories: HelpCategory[];
}) {
	return (
		<div>
			<p className="px-2.5 text-xs font-semibold tracking-wide text-muted-foreground/80 uppercase">
				{label}
			</p>
			<ul className="mt-2 space-y-0.5">
				{categories.map((category) => (
					<CategoryNavItem key={category.slug} category={category} />
				))}
			</ul>
		</div>
	);
}

export function HelpSidebarNav() {
	const start = HELP_CATEGORIES.filter((c) => c.group === "start");
	const features = HELP_CATEGORIES.filter((c) => c.group === "features");
	return (
		<nav aria-label="Help topics" className="space-y-7">
			<NavGroup label="Start here" categories={start} />
			<NavGroup label="Features" categories={features} />
		</nav>
	);
}

/** Collapsible topic browser shown under the header on small screens. */
export function HelpMobileNav() {
	const pathname = usePathname();
	return (
		<details
			key={pathname}
			className="group mt-6 rounded-xl border border-border lg:hidden"
		>
			<summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
				Browse help topics
				<ChevronDown
					className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
					aria-hidden="true"
				/>
			</summary>
			<div className="border-t border-border px-2 py-3">
				<HelpSidebarNav />
			</div>
		</details>
	);
}
