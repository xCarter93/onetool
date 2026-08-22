"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
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
import { TIMEZONES } from "@/lib/timezones";

export function TimezoneCombobox({
	value,
	disabled,
	onSelect,
}: {
	value: string;
	disabled?: boolean;
	onSelect: (timezone: string) => void;
}) {
	const [search, setSearch] = useState("");

	const filtered = useMemo(() => {
		const term = search.trim().toLowerCase();
		if (!term) return TIMEZONES;
		return TIMEZONES.filter((zone) => zone.toLowerCase().includes(term));
	}, [search]);

	return (
		<Combobox
			items={filtered}
			// Items are already search-filtered above; stop Base UI's own filter
			// from second-guessing the list.
			filter={null}
			value={value}
			disabled={disabled}
			onOpenChange={(open) => {
				if (!open) setSearch("");
			}}
			// Never cleared: consumers persist the value, so an empty selection
			// would revert on reload while showing blank.
			onValueChange={(timezone: string | null) => {
				if (timezone) onSelect(timezone);
			}}
		>
			<ComboboxTrigger
				render={
					<Button
						variant="outline"
						disabled={disabled}
						aria-label="Timezone"
						className="w-full justify-between font-normal"
					>
						<span className={cn("truncate", !value && "text-muted-foreground")}>
							{value || "Select timezone"}
						</span>
					</Button>
				}
			/>
			<ComboboxContent className="*:data-[slot=input-group]:bg-transparent">
				<ComboboxInput
					placeholder="Search timezones..."
					value={search}
					onChange={(event) => setSearch(event.target.value)}
					showTrigger={false}
					className="rounded-none border-0 px-0 py-2.5 shadow-none ring-0! outline-none! focus-visible:ring-0"
				/>
				<ComboboxSeparator />
				<ComboboxEmpty className="px-4 py-2.5 text-sm text-muted-foreground">
					No timezones found.
				</ComboboxEmpty>
				<ComboboxList className="max-h-[min(var(--available-height),18rem)]">
					{filtered.map((zone) => (
						<ComboboxItem key={zone} value={zone}>
							<span className="truncate">{zone}</span>
						</ComboboxItem>
					))}
				</ComboboxList>
			</ComboboxContent>
		</Combobox>
	);
}
