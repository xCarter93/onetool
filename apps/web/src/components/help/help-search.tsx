"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { SearchIcon } from "lucide-react";
import {
	Command,
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { HELP_CATEGORIES } from "@/lib/help";
import { cn } from "@/lib/utils";

interface HelpSearchContextValue {
	openSearch: () => void;
}

const HelpSearchContext = React.createContext<HelpSearchContextValue | null>(
	null
);

function useHelpSearch() {
	const context = React.useContext(HelpSearchContext);
	if (!context) {
		throw new Error("useHelpSearch must be used within HelpSearchProvider");
	}
	return context;
}

export function HelpSearchProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [open, setOpen] = React.useState(false);
	const router = useRouter();

	React.useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
				event.preventDefault();
				setOpen((current) => !current);
			}
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, []);

	const contextValue = React.useMemo(
		() => ({ openSearch: () => setOpen(true) }),
		[]
	);

	return (
		<HelpSearchContext.Provider value={contextValue}>
			{children}
			<CommandDialog
				open={open}
				onOpenChange={setOpen}
				title="Search help"
				description="Search help articles"
			>
				<Command>
					<CommandInput placeholder="Search help articles..." />
					<CommandList>
						<CommandEmpty>No matching articles.</CommandEmpty>
						{HELP_CATEGORIES.filter(
							(category) => category.articles.length > 0
						).map((category) => (
							<CommandGroup key={category.slug} heading={category.name}>
								{category.articles.map((article) => (
									<CommandItem
										key={article.slug}
										value={`${category.slug}/${article.slug}`}
										keywords={[
											article.title,
											category.name,
											article.subtitle,
											...(article.keywords ?? []),
										]}
										onSelect={() => {
											setOpen(false);
											router.push(`/help/${category.slug}/${article.slug}`);
										}}
									>
										<div className="flex min-w-0 flex-col">
											<span className="truncate font-medium">
												{article.title}
											</span>
											<span className="truncate text-xs text-muted-foreground">
												{article.subtitle}
											</span>
										</div>
									</CommandItem>
								))}
							</CommandGroup>
						))}
					</CommandList>
				</Command>
			</CommandDialog>
		</HelpSearchContext.Provider>
	);
}

/** Compact search trigger for the help header. */
export function HelpSearchButton() {
	const { openSearch } = useHelpSearch();
	return (
		<button
			type="button"
			onClick={openSearch}
			className="flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:w-52 sm:justify-between"
		>
			<span className="flex items-center gap-2">
				<SearchIcon className="size-4" aria-hidden="true" />
				<span className="hidden sm:inline">Search help...</span>
				<span className="sr-only sm:hidden">Search help</span>
			</span>
			<Kbd className="hidden sm:inline-flex">&#8984;K</Kbd>
		</button>
	);
}

/** Large search trigger for the help home hero. */
export function HelpSearchHero({ className }: { className?: string }) {
	const { openSearch } = useHelpSearch();
	return (
		<button
			type="button"
			onClick={openSearch}
			className={cn(
				"flex h-12 w-full max-w-xl cursor-pointer items-center justify-between rounded-xl border border-border bg-background px-4 text-muted-foreground shadow-xs transition-colors hover:border-foreground/25 hover:text-foreground",
				className
			)}
		>
			<span className="flex items-center gap-2.5 text-[15px]">
				<SearchIcon className="size-4" aria-hidden="true" />
				Search help...
			</span>
			<Kbd>&#8984;K</Kbd>
		</button>
	);
}
