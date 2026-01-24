"use client";

import React from "react";
import { Plus, GitBranch, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AddStepButtonProps {
	onAddCondition: () => void;
	onAddAction: () => void;
}

export function AddStepButton({
	onAddCondition,
	onAddAction,
}: AddStepButtonProps) {
	return (
		<div className="flex flex-col items-center">
			{/* Connector line coming from above */}
			<div className="w-[2.5px] h-8 bg-border" />

			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						className={cn(
							"flex items-center justify-center w-10 h-10 rounded-full",
							"bg-muted hover:bg-muted/80",
							"border-2 border-dashed border-muted-foreground/30 hover:border-muted-foreground/50",
							"text-muted-foreground hover:text-foreground",
							"transition-all duration-200",
							"hover:scale-110 hover:shadow-lg"
						)}
					>
						<Plus className="h-5 w-5" />
					</button>
				</DropdownMenuTrigger>

				<DropdownMenuContent align="center" className="w-48">
					<DropdownMenuItem
						onClick={onAddCondition}
						className="flex items-center gap-3 py-2.5 cursor-pointer"
					>
						<div className="flex items-center justify-center w-7 h-7 rounded-lg bg-purple-100 dark:bg-purple-900/50">
							<GitBranch className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
						</div>
						<div>
							<div className="font-medium text-sm">Condition</div>
							<div className="text-xs text-muted-foreground">
								Branch based on data
							</div>
						</div>
					</DropdownMenuItem>

					<DropdownMenuItem
						onClick={onAddAction}
						className="flex items-center gap-3 py-2.5 cursor-pointer"
					>
						<div className="flex items-center justify-center w-7 h-7 rounded-lg bg-green-100 dark:bg-green-900/50">
							<Play className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
						</div>
						<div>
							<div className="font-medium text-sm">Action</div>
							<div className="text-xs text-muted-foreground">Update status</div>
						</div>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}

