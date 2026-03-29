"use client";

import {
	BaseEdge,
	EdgeLabelRenderer,
	getStraightPath,
	type EdgeProps,
} from "@xyflow/react";
import { Plus, GitBranch, Play, Search, Repeat } from "lucide-react";
import { cn } from "@/lib/utils";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function BranchLabelEdge({
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

	const isYes = data?.variant === "yes";
	const label = (data?.label as string) || (isYes ? "Yes" : "No");

	// Stroke color based on variant
	const strokeColor = isYes
		? "var(--color-emerald-500, #10b981)"
		: "var(--color-rose-400, #fb7185)";

	// Position label at 25% path length (near source)
	const labelPosX = sourceX + (targetX - sourceX) * 0.25;
	const labelPosY = sourceY + (targetY - sourceY) * 0.25;

	const isTerminal = data?.isTerminal === true;
	const onInsertNode = data?.onInsertNode as
		| ((edgeId: string, nodeType: string) => void)
		| undefined;

	return (
		<>
			<BaseEdge
				path={edgePath}
				style={{ ...style, strokeWidth: 2, stroke: strokeColor }}
			/>
			<EdgeLabelRenderer>
				{/* Branch label at 25% path */}
				<div
					className="nodrag nopan pointer-events-none"
					style={{
						position: "absolute",
						transform: `translate(-50%, -50%) translate(${labelPosX}px, ${labelPosY}px)`,
					}}
				>
					<span
						className={cn(
							"text-xs font-semibold px-2 py-0.5 rounded-full",
							isYes
								? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400"
								: "bg-rose-50 dark:bg-rose-950/40 text-rose-500 dark:text-rose-400"
						)}
					>
						{label}
					</span>
				</div>
				{/* Plus button at midpoint */}
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
