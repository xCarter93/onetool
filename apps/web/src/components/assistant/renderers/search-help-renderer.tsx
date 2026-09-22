"use client";

import { useState } from "react";
import { BookOpen, ChevronDown } from "lucide-react";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { HelpArticleDrawer } from "@/components/help/learn-more";
import { resolveHelpRef } from "@/lib/help";
import { cn } from "@/lib/utils";
import type { ToolRendererProps } from "./index";

interface HelpHit {
	ref: string;
	title: string;
}

// Mirrors searchHelp's output in convex/assistantTools.ts. The category listing
// and no-match `note` are model guidance, so they render nothing.
interface SearchHelpOutput {
	results?: { ref: string; title: string }[];
	ref?: string;
	title?: string;
	error?: string;
}

function ArticleRow({ hit }: { hit: HelpHit }) {
	const [open, setOpen] = useState(false);
	if (!resolveHelpRef(hit.ref)) {
		return <p className="truncate text-xs text-muted-foreground">{hit.title}</p>;
	}
	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="block w-full truncate text-left text-xs text-primary hover:underline"
			>
				{hit.title}
			</button>
			<HelpArticleDrawer article={hit.ref} open={open} onOpenChange={setOpen} />
		</>
	);
}

export function SearchHelpRenderer({ output }: ToolRendererProps) {
	const [open, setOpen] = useState(false);
	const result = output as SearchHelpOutput | undefined;
	const hits: HelpHit[] = Array.isArray(result?.results)
		? result.results.map((r) => ({ ref: r.ref, title: r.title }))
		: result?.ref && result?.title
			? [{ ref: result.ref, title: result.title }]
			: [];

	if (hits.length === 0) {
		if (result?.error) {
			return <p className="text-xs text-muted-foreground">{result.error}</p>;
		}
		return null;
	}

	return (
		<Collapsible open={open} onOpenChange={setOpen} className="rounded-xl border border-border bg-card px-3.5 py-2">
			<CollapsibleTrigger className="flex w-full items-center gap-1.5 text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground">
				<BookOpen className="size-3 shrink-0" />
				<span>
					Read {hits.length} help {hits.length === 1 ? "article" : "articles"}
				</span>
				<ChevronDown
					className={cn(
						"size-3 shrink-0 opacity-60 transition-transform duration-200 motion-reduce:transition-none",
						open && "rotate-180"
					)}
				/>
			</CollapsibleTrigger>
			<CollapsibleContent>
				<div className="mt-1.5 flex flex-col gap-1 border-t border-border/60 pt-1.5">
					{hits.map((hit) => (
						<ArticleRow key={hit.ref} hit={hit} />
					))}
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}
