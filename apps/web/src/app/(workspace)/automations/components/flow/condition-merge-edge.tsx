"use client";

import {
	BaseEdge,
	EdgeLabelRenderer,
	type EdgeProps,
} from "@xyflow/react";
import { Plus, GitBranch, Play, Search, Repeat, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Edge that curves from a condition branch endpoint inward to the centered
 * merge point below. Used in pairs (left + right) to create the visual
 * convergence of both branches.
 *
 * Only the edge with showMergePlus=true renders the "+" button at the target.
 */
export function ConditionMergeEdge({
	id,
	sourceX,
	sourceY,
	targetX,
	targetY,
	data,
	style,
}: EdgeProps) {
	const showPlus = data?.showMergePlus === true;
	const onInsertNode = data?.onInsertNode as
		| ((edgeId: string, nodeType: string) => void)
		| undefined;

	const cr = 16;

	// Path: down from source node's bottom, past the branch "+",
	// then curve inward to the centered merge point.
	// sourceX/Y comes from the bottom of the last real node in the branch
	// (or the condition's branch handle when empty).
	const edgePath = [
		`M ${sourceX} ${sourceY}`,
		`L ${sourceX} ${targetY - cr}`,
		`Q ${sourceX} ${targetY} ${sourceX < targetX ? sourceX + cr : sourceX - cr} ${targetY}`,
		`L ${targetX} ${targetY}`,
	].join(" ");

	return (
		<>
			<BaseEdge
				path={edgePath}
				style={{ ...style, strokeWidth: 2, stroke: "var(--color-border)" }}
			/>
			{showPlus && (
				<EdgeLabelRenderer>
					<div
						className="nodrag nopan pointer-events-auto"
						style={{
							position: "absolute",
							transform: `translate(-50%, -50%) translate(${targetX}px, ${targetY}px)`,
							zIndex: 10,
						}}
					>
						<DropdownMenu modal={false}>
							<DropdownMenuTrigger asChild>
								<button
									className={cn(
										"w-9 h-9 rounded-full bg-transparent flex items-center justify-center cursor-pointer",
										"touch-manipulation opacity-100"
									)}
									aria-label="Insert node after condition"
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
								<DropdownMenuItem onClick={() => onInsertNode?.(id, "end")}>
									<Square className="h-4 w-4 mr-2" />
									End Automation
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</EdgeLabelRenderer>
			)}
		</>
	);
}
