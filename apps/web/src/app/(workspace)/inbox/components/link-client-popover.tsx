"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { Link2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/domain/empty-state";
import { cn } from "@/lib/utils";

interface LinkClientPopoverProps {
	onSelect: (clientId: Id<"clients">) => void;
	/** Show a compact icon-only trigger instead of a full button. */
	compact?: boolean;
	disabled?: boolean;
}

export function LinkClientPopover({
	onSelect,
	compact = false,
	disabled = false,
}: LinkClientPopoverProps) {
	const [open, setOpen] = useState(false);
	// Skip while closed: several instances render per thread view and none
	// should subscribe to the client list until actually opened.
	const clients = useQuery(api.clients.list, open ? {} : "skip");

	const handleSelect = (clientId: Id<"clients">) => {
		onSelect(clientId);
		setOpen(false);
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				render={
					compact ? (
						<button
							type="button"
							disabled={disabled}
							aria-label="Link to client"
							className={cn(
								"inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors duration-150",
								"hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
								disabled && "cursor-not-allowed opacity-50"
							)}
						/>
					) : (
						<Button variant="outline" size="sm" disabled={disabled}>
							<Link2 className="h-4 w-4" aria-hidden="true" />
							Link to client
						</Button>
					)
				}
			>
				{compact && (
					<>
						<Link2 className="h-3.5 w-3.5" aria-hidden="true" />
						Link to client
					</>
				)}
			</PopoverTrigger>
			<PopoverContent align="end" className="w-72 p-0">
				<Command>
					<CommandInput placeholder="Search clients…" />
					<CommandList>
						<CommandEmpty>
							{clients === undefined ? (
								"Loading clients…"
							) : (
								<EmptyState
									size="sm"
									illustration="no-filter-match"
									title="No clients found"
								/>
							)}
						</CommandEmpty>
						{clients && clients.length > 0 && (
							<CommandGroup heading="Clients">
								{clients.map((client) => (
									<CommandItem
										key={client._id}
										value={client.companyName}
										onSelect={() => handleSelect(client._id)}
										className="cursor-pointer"
									>
										<span className="truncate">{client.companyName}</span>
									</CommandItem>
								))}
							</CommandGroup>
						)}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
