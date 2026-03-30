"use client";

import {
	BaseEdge,
	EdgeLabelRenderer,
	getStraightPath,
	getSmoothStepPath,
	Position,
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
	const isTerminal = data?.isTerminal === true;
	const onInsertNode = data?.onInsertNode as
		| ((edgeId: string, nodeType: string) => void)
		| undefined;

	// For terminal edges, shorten the path so it ends at the "+" button position
	// instead of continuing past it to the invisible terminal node
	const effectiveTargetY = isTerminal
		? sourceY + (targetY - sourceY) * 0.5
		: targetY;

	// Terminal edges: straight vertical line. Connected edges: smoothstep so
	// non-aligned nodes get clean right-angle routing instead of diagonal lines.
	let edgePath: string;
	let plusX: number;
	let plusY: number;

	if (isTerminal) {
		[edgePath] = getStraightPath({
			sourceX,
			sourceY,
			targetX: sourceX, // Keep terminal edges perfectly vertical
			targetY: effectiveTargetY,
		});
		plusX = sourceX;
		plusY = effectiveTargetY;
	} else {
		let labelX: number, labelY: number;
		[edgePath, labelX, labelY] = getSmoothStepPath({
			sourceX,
			sourceY,
			sourcePosition: Position.Bottom,
			targetX,
			targetY,
			targetPosition: Position.Top,
			borderRadius: 8,
		});
		plusX = labelX;
		plusY = labelY;
	}

	return (
		<>
			<BaseEdge path={edgePath} style={{ ...style, strokeWidth: 2, stroke: "var(--color-border)" }} />
			<EdgeLabelRenderer>
				<div
					className="nodrag nopan pointer-events-auto"
					style={{
						position: "absolute",
						transform: `translate(-50%, -50%) translate(${plusX}px, ${plusY}px)`,
						zIndex: 10,
					}}
				>
					<DropdownMenu modal={false}>
						<DropdownMenuTrigger asChild>
							<button
								className={cn(
									"w-9 h-9 rounded-full bg-transparent flex items-center justify-center cursor-pointer",
									"touch-manipulation",
									isTerminal
										? "opacity-100"
										: "opacity-0 hover:opacity-100 focus:opacity-100"
								)}
								aria-label="Insert node"
							>
								<span className="w-6 h-6 rounded-full bg-background border border-border shadow-sm hover:bg-muted flex items-center justify-center transition-colors">
									<Plus className="h-3 w-3 text-muted-foreground" />
								</span>
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
