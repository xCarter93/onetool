"use client";

import {
	BaseEdge,
	EdgeLabelRenderer,
	getStraightPath,
	type EdgeProps,
} from "@xyflow/react";
import { Plus, GitBranch, Play, Search, Repeat } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function PlusButtonEdge({
	id,
	sourceX,
	sourceY,
	targetX,
	targetY,
	data,
	style,
}: EdgeProps) {
	const [edgePath, labelX, labelY] = getStraightPath({
		sourceX,
		sourceY,
		targetX,
		targetY,
	});

	const isTerminal = data?.isTerminal === true;
	const onInsertNode = data?.onInsertNode as
		| ((edgeId: string, nodeType: string) => void)
		| undefined;

	return (
		<>
			<BaseEdge path={edgePath} style={{ ...style, strokeWidth: 2 }} />
			<EdgeLabelRenderer>
				<div
					className="nodrag nopan pointer-events-auto"
					style={{
						position: "absolute",
						transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
					}}
				>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button
								className={cn(
									"w-6 h-6 rounded-full bg-background border border-border shadow-sm hover:bg-muted flex items-center justify-center transition-opacity duration-150",
									isTerminal
										? "opacity-100"
										: "opacity-0 hover:opacity-100 focus:opacity-100"
								)}
								aria-label="Insert node"
							>
								<Plus className="h-3 w-3 text-muted-foreground" />
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="center" sideOffset={8}>
							<DropdownMenuItem onClick={() => onInsertNode?.(id, "condition")}>
								<GitBranch className="h-4 w-4 mr-2" />
								Add Condition
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => onInsertNode?.(id, "action")}>
								<Play className="h-4 w-4 mr-2" />
								Add Action
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => onInsertNode?.(id, "fetch_records")}>
								<Search className="h-4 w-4 mr-2" />
								Add Fetch Records
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => onInsertNode?.(id, "loop")}>
								<Repeat className="h-4 w-4 mr-2" />
								Add Loop
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</EdgeLabelRenderer>
		</>
	);
}
