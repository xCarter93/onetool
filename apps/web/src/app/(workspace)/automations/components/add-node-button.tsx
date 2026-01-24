"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, GitBranch, Play, ChevronDown } from "lucide-react";

interface AddNodeButtonProps {
	onAddCondition: () => void;
	onAddAction: () => void;
	disabled?: boolean;
}

export function AddNodeButton({
	onAddCondition,
	onAddAction,
	disabled,
}: AddNodeButtonProps) {
	return (
		<div className="flex flex-col items-center gap-2 py-4">
			{/* Connector line */}
			<div className="w-[2.5px] h-4 bg-border" />

			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						intent="outline"
						size="md"
						isDisabled={disabled}
						className="gap-2"
					>
						<Plus className="h-4 w-4" />
						Add Step
						<ChevronDown className="h-3 w-3 opacity-50" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="center" className="w-48">
					<DropdownMenuItem
						onSelect={onAddCondition}
						className="gap-2 cursor-pointer"
					>
						<div className="flex items-center justify-center w-6 h-6 rounded bg-purple-100 dark:bg-purple-900/30">
							<GitBranch className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
						</div>
						<div>
							<p className="font-medium">Condition</p>
							<p className="text-xs text-muted-foreground">
								Add a decision point
							</p>
						</div>
					</DropdownMenuItem>
					<DropdownMenuItem
						onSelect={onAddAction}
						className="gap-2 cursor-pointer"
					>
						<div className="flex items-center justify-center w-6 h-6 rounded bg-green-100 dark:bg-green-900/30">
							<Play className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
						</div>
						<div>
							<p className="font-medium">Action</p>
							<p className="text-xs text-muted-foreground">Update a status</p>
						</div>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}

