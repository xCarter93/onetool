"use client";

import { useMemo, useState } from "react";

import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
	Combobox,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxInput,
	ComboboxItem,
	ComboboxList,
	ComboboxSeparator,
	ComboboxTrigger,
} from "@/components/ui/combobox";
import { cn } from "@/lib/utils";

export interface ClientOption {
	_id: Id<"clients">;
	companyName: string;
}

interface ImportClientPickerProps {
	clients: ClientOption[];
	value: Id<"clients"> | null;
	/** Shown on the trigger. Falls back to the matching client's name. */
	valueLabel?: string;
	placeholder?: string;
	disabled?: boolean;
	ariaLabel: string;
	onSelect: (clientId: Id<"clients">) => void;
}

/**
 * Searchable client picker for the import review rows. An organization can have
 * hundreds of clients, so this follows the searchable combobox pattern used for
 * the timezone field rather than a plain Select.
 */
export function ImportClientPicker({
	clients,
	value,
	valueLabel,
	placeholder = "Choose client",
	disabled,
	ariaLabel,
	onSelect,
}: ImportClientPickerProps) {
	const [search, setSearch] = useState("");

	const filtered = useMemo(() => {
		const term = search.trim().toLowerCase();
		if (!term) return clients;
		return clients.filter((client) =>
			client.companyName.toLowerCase().includes(term)
		);
	}, [clients, search]);

	const itemIds = useMemo(
		() => filtered.map((client) => client._id as string),
		[filtered]
	);

	const label =
		valueLabel ??
		(value
			? clients.find((client) => client._id === value)?.companyName
			: undefined);

	return (
		<Combobox
			items={itemIds}
			// Items are already search-filtered above; stop Base UI's own filter
			// from second-guessing the list.
			filter={null}
			value={(value as string | null) ?? ""}
			disabled={disabled}
			onOpenChange={(open) => {
				if (!open) setSearch("");
			}}
			onValueChange={(clientId: string | null) => {
				if (clientId) onSelect(clientId as Id<"clients">);
			}}
		>
			<ComboboxTrigger
				render={
					<Button
						variant="outline"
						size="sm"
						disabled={disabled}
						aria-label={ariaLabel}
						className="w-full justify-between font-normal sm:w-56"
					>
						<span className={cn("truncate", !label && "text-muted-foreground")}>
							{label ?? placeholder}
						</span>
					</Button>
				}
			/>
			<ComboboxContent className="*:data-[slot=input-group]:bg-transparent">
				<ComboboxInput
					placeholder="Search clients..."
					value={search}
					onChange={(event) => setSearch(event.target.value)}
					showTrigger={false}
					className="rounded-none border-0 px-0 py-2.5 shadow-none ring-0! outline-none! focus-visible:ring-0"
				/>
				<ComboboxSeparator />
				<ComboboxEmpty className="px-4 py-2.5 text-sm text-muted-foreground">
					No clients found.
				</ComboboxEmpty>
				<ComboboxList className="max-h-[min(var(--available-height),18rem)]">
					{filtered.map((client) => (
						<ComboboxItem key={client._id} value={client._id}>
							<span className="truncate">{client.companyName}</span>
						</ComboboxItem>
					))}
				</ComboboxList>
			</ComboboxContent>
		</Combobox>
	);
}
