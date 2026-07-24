"use client";

import { useMemo, useState } from "react";
import { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import {
	Popover,
	PopoverTrigger,
	PopoverContent,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, ChevronDown, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

type ClientProperty = Doc<"clientProperties">;

function displayAddress(p: ClientProperty): string {
	return (
		p.formattedAddress ?? `${p.streetAddress}, ${p.city}, ${p.state} ${p.zipCode}`
	);
}

/**
 * Client-property dropdown matching the routing page's picker: popover with
 * search + two-line rows (name, muted full address). Search hides for short
 * lists.
 */
export function PropertyPicker({
	properties,
	value,
	onChange,
	placeholder = "Select a property",
	disabled,
	className,
}: {
	properties: ClientProperty[];
	value?: Id<"clientProperties"> | "";
	onChange: (id: Id<"clientProperties">) => void;
	placeholder?: string;
	disabled?: boolean;
	className?: string;
}) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");

	const selected = properties.find((p) => p._id === value);
	const showSearch = properties.length > 5;

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return properties;
		return properties.filter((p) =>
			[p.propertyName, displayAddress(p)]
				.filter(Boolean)
				.some((s) => s!.toLowerCase().includes(q))
		);
	}, [properties, search]);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				render={
					<Button
						type="button"
						variant="outline"
						disabled={disabled}
						className={cn(
							"w-full justify-between gap-2 font-normal",
							!selected && "text-muted-foreground",
							className
						)}
					>
						<span className="flex min-w-0 items-center gap-2">
							<MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden />
							<span className="truncate">
								{selected
									? (selected.propertyName ?? displayAddress(selected))
									: placeholder}
							</span>
						</span>
						<ChevronDown className="size-4 shrink-0 opacity-50" aria-hidden />
					</Button>
				}
			/>
			<PopoverContent align="start" className="w-80 p-2">
				{showSearch && (
					<Input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search properties…"
						className="mb-2 h-8"
						autoFocus
					/>
				)}
				<div className="max-h-64 space-y-0.5 overflow-y-auto">
					{filtered.length === 0 ? (
						<p className="px-2 py-4 text-center text-xs text-muted-foreground">
							No matching properties.
						</p>
					) : (
						filtered.map((p) => (
							<button
								key={p._id}
								type="button"
								className={cn(
									"flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted",
									p._id === value && "bg-muted/60"
								)}
								onClick={() => {
									onChange(p._id);
									setOpen(false);
									setSearch("");
								}}
							>
								<span className="min-w-0 flex-1">
									<span className="block truncate text-sm font-medium">
										{p.propertyName ?? displayAddress(p)}
										{p.isPrimary && (
											<span className="ml-1.5 text-xs font-normal text-muted-foreground">
												Primary
											</span>
										)}
									</span>
									{p.propertyName && (
										<span className="block truncate text-xs text-muted-foreground">
											{displayAddress(p)}
										</span>
									)}
								</span>
								{p._id === value && (
									<Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
								)}
							</button>
						))
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}
