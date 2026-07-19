"use client";

import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";

/**
 * One selectable row. `value` is the cmdk search string (include the full
 * "Group → Field" path so flat search matches across levels); `label` is what
 * renders.
 */
export type DrillItem = {
	id: string;
	value: string;
	label: React.ReactNode;
	className?: string;
	trailing?: React.ReactNode;
	onSelect: () => void;
};

/** A root-level group of rows (rendered with a heading when search is empty). */
export type DrillGroup = {
	id: string;
	heading?: string;
	items: DrillItem[];
};

/** A navigable relation page: its nav-row/back label and its own rows. */
export type DrillPage = {
	id: string;
	navLabel: string;
	items: DrillItem[];
};

/**
 * The cmdk "pages" drill-down shared by every relation-aware picker: root shows
 * `rootGroups` plus one nav row per relation `page`; selecting a nav row
 * descends. Typing flattens across all levels (cmdk filters each row by its
 * `value`), ignoring the current page. Resets to root when `open` goes false.
 */
export function VariableDrillList({
	rootGroups,
	pages,
	open,
	emptyText,
	placeholder,
}: {
	rootGroups: DrillGroup[];
	pages: DrillPage[];
	open: boolean;
	emptyText: string;
	placeholder: string;
}) {
	const [search, setSearch] = useState("");
	const [page, setPage] = useState<string | null>(null);

	// Reopen at the root: clear navigation + search when the popover closes.
	// Render-time derivation (not an effect) so no cascading-render lint error.
	const [prevOpen, setPrevOpen] = useState(open);
	if (prevOpen !== open) {
		setPrevOpen(open);
		if (!open) {
			setSearch("");
			setPage(null);
		}
	}

	const searching = search.trim().length > 0;

	const flatItems = useMemo(
		() => [
			...rootGroups.flatMap((g) => g.items),
			...pages.flatMap((p) => p.items),
		],
		[rootGroups, pages]
	);

	// A stale page id (options changed) resolves to null -> falls back to root.
	const activePage = page ? (pages.find((p) => p.id === page) ?? null) : null;

	// cmdk keys rows by `value`; append the id so rows with identical display
	// text (an own ref field "Client" vs the "Client" nav row) don't highlight
	// together on hover.
	const renderItem = (item: DrillItem) => (
		<CommandItem
			key={item.id}
			value={`${item.value} ${item.id}`}
			onSelect={item.onSelect}
			className={cn("cursor-pointer", item.className)}
		>
			<span className="flex-1 truncate">{item.label}</span>
			{item.trailing}
		</CommandItem>
	);

	return (
		<Command
			onKeyDown={(e) => {
				// Backspace on an empty search steps back out of a relation page
				// rather than dismissing the popover.
				if (e.key === "Backspace" && !search && activePage) {
					e.preventDefault();
					setPage(null);
				}
			}}
		>
			<CommandInput
				placeholder={placeholder}
				value={search}
				onValueChange={setSearch}
			/>
			<CommandList>
				<CommandEmpty>{emptyText}</CommandEmpty>
				{searching ? (
					<CommandGroup>{flatItems.map(renderItem)}</CommandGroup>
				) : activePage ? (
					<>
						<CommandGroup>
							<CommandItem
								value={`__back__ ${activePage.navLabel}`}
								onSelect={() => setPage(null)}
								className="cursor-pointer text-muted-foreground"
							>
								<ChevronLeft className="h-4 w-4 shrink-0" />
								<span className="flex-1 truncate">{activePage.navLabel}</span>
							</CommandItem>
						</CommandGroup>
						<CommandGroup>{activePage.items.map(renderItem)}</CommandGroup>
					</>
				) : (
					<>
						{rootGroups.map((g) => (
							<CommandGroup key={g.id} heading={g.heading}>
								{g.items.map(renderItem)}
							</CommandGroup>
						))}
						{pages.length > 0 && (
							<CommandGroup heading="Related records">
								{pages.map((p) => (
									<CommandItem
										key={p.id}
										value={`__nav__ ${p.navLabel} ${p.id}`}
										onSelect={() => setPage(p.id)}
										className="cursor-pointer"
									>
										<span className="flex-1 truncate">{p.navLabel}</span>
										<span className="ml-2 shrink-0 text-[10px] tabular-nums text-muted-foreground">
											{p.items.length}
										</span>
										<ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
									</CommandItem>
								))}
							</CommandGroup>
						)}
					</>
				)}
			</CommandList>
		</Command>
	);
}
