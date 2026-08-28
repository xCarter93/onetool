"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/domain/empty-state";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";

export type RecordPickerOption = { id: string; label: string };

/**
 * Presentational searchable record picker for an id field, replacing a
 * raw-Convex-id text box. The caller owns the queries and passes resolved
 * `{id, label}` options; the picker stores the selected id and resolves the
 * display name for whatever id is already stored.
 */
export function RecordPicker({
	options,
	loading,
	value,
	onChange,
	placeholder,
	searchPlaceholder,
	invalid,
}: {
	options: RecordPickerOption[];
	loading: boolean;
	value: string | null;
	onChange: (id: string | null) => void;
	placeholder: string;
	searchPlaceholder: string;
	invalid?: boolean;
}) {
	const [open, setOpen] = useState(false);

	const selected = value ? options.find((o) => o.id === value) : undefined;
	const triggerLabel = selected
		? selected.label
		: value
			? loading
				? "Loading…"
				: "Unknown record"
			: placeholder;

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				render={
					<Button
						variant="outline"
						aria-invalid={invalid || undefined}
						className={cn(
							"w-full justify-between font-normal",
							!selected && "text-muted-foreground",
							invalid && "border-destructive"
						)}
					/>
				}
			>
				<span className="truncate">{triggerLabel}</span>
				<ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
			</PopoverTrigger>
			<PopoverContent align="start" className="w-(--anchor-width) min-w-56 p-0">
				<Command>
					<CommandInput placeholder={searchPlaceholder} />
					<CommandList>
						<CommandEmpty>
							{loading ? (
								"Loading…"
							) : (
								<EmptyState
									size="sm"
									illustration="no-filter-match"
									title="No records found"
								/>
							)}
						</CommandEmpty>
						<CommandGroup>
							{value && (
								<CommandItem
									value="__clear__"
									onSelect={() => {
										onChange(null);
										setOpen(false);
									}}
									className="cursor-pointer text-muted-foreground"
								>
									Clear selection
								</CommandItem>
							)}
							{options.map((opt) => (
								<CommandItem
									key={opt.id}
									value={`${opt.label} ${opt.id}`}
									onSelect={() => {
										onChange(opt.id);
										setOpen(false);
									}}
									className="cursor-pointer"
								>
									<Check
										className={cn(
											"h-4 w-4",
											opt.id === value ? "opacity-100" : "opacity-0"
										)}
									/>
									<span className="truncate">{opt.label}</span>
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
