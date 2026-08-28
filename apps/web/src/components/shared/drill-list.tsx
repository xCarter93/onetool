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
	/** Shown instead of `label` while searching, where a row needs its breadcrumb. */
	searchLabel?: React.ReactNode;
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
	/** Nav-row text when nested under `parentId`; the back row keeps `navLabel`. */
	navRowLabel?: React.ReactNode;
	/** Page this one is reached from; parentless pages sit at the root. */
	parentId?: string;
	items: DrillItem[];
};

/**
 * The cmdk "pages" drill-down shared by every relation-aware picker: the root
 * shows `rootGroups` plus one nav row per parentless `page`, and each page
 * shows its own rows plus a nav row per child page; back steps up one level.
 * Typing flattens across all levels (cmdk filters each row by its `value`),
 * ignoring the current page. Resets to root when `open` goes false.
 */
export function DrillList({
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
	const [stack, setStack] = useState<string[]>([]);

	// Reopen at the root: clear navigation + search when the popover closes.
	// Render-time derivation (not an effect) so no cascading-render lint error.
	const [prevOpen, setPrevOpen] = useState(open);
	if (prevOpen !== open) {
		setPrevOpen(open);
		if (!open) {
			setSearch("");
			setStack([]);
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

	// A stale page id (options changed) resolves to null -> falls back to root,
	// whose nav rows reset the stack rather than pushing onto the stale one.
	const activeId = stack[stack.length - 1];
	const activePage = activeId
		? (pages.find((p) => p.id === activeId) ?? null)
		: null;
	const childPages = activePage
		? pages.filter((p) => p.parentId === activePage.id)
		: [];
	const rootPages = pages.filter((p) => !p.parentId);

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
			<span className="flex-1 truncate">
				{searching ? (item.searchLabel ?? item.label) : item.label}
			</span>
			{item.trailing}
		</CommandItem>
	);

	const renderNavRow = (
		page: DrillPage,
		label: React.ReactNode,
		onSelect: () => void
	) => (
		<CommandItem
			key={page.id}
			value={`__nav__ ${page.navLabel} ${page.id}`}
			onSelect={onSelect}
			className="cursor-pointer"
		>
			<span className="flex-1 truncate">{label}</span>
			<span className="ml-2 shrink-0 text-[10px] tabular-nums text-muted-foreground">
				{page.items.length}
			</span>
			<ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
		</CommandItem>
	);

	return (
		<Command
			onKeyDown={(e) => {
				// Backspace on an empty search steps back out of a relation page
				// rather than dismissing the popover.
				if (e.key === "Backspace" && !search && activePage) {
					e.preventDefault();
					setStack((s) => s.slice(0, -1));
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
								onSelect={() => setStack((s) => s.slice(0, -1))}
								className="cursor-pointer text-muted-foreground"
							>
								<ChevronLeft className="h-4 w-4 shrink-0" />
								<span className="flex-1 truncate">{activePage.navLabel}</span>
							</CommandItem>
						</CommandGroup>
						<CommandGroup>{activePage.items.map(renderItem)}</CommandGroup>
						{childPages.length > 0 && (
							<CommandGroup>
								{childPages.map((p) =>
									renderNavRow(p, p.navRowLabel ?? p.navLabel, () =>
										setStack((s) => [...s, p.id])
									)
								)}
							</CommandGroup>
						)}
					</>
				) : (
					<>
						{rootGroups.map((g) => (
							<CommandGroup key={g.id} heading={g.heading}>
								{g.items.map(renderItem)}
							</CommandGroup>
						))}
						{rootPages.length > 0 && (
							<CommandGroup heading="Related records">
								{rootPages.map((p) =>
									renderNavRow(p, p.navLabel, () => setStack([p.id]))
								)}
							</CommandGroup>
						)}
					</>
				)}
			</CommandList>
		</Command>
	);
}
