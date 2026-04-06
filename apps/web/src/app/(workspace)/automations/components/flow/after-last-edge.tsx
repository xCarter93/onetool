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
import { getAfterLastGeometry } from "./edge-geometry";

/**
 * Custom edge for the "After Last" branch of loop nodes.
 * Routes from the loop's right-side handle: right → curve down → straight
 * down alongside the loop body → curve left → to target below.
 * Mirrors LoopBackEdge's left-side routing but on the right going downward.
 */
export function AfterLastEdge({
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

	const geometry = getAfterLastGeometry(sourceX, sourceY, targetX, targetY, {
		routeRightX:
			typeof data?.routeRightX === "number" ? (data.routeRightX as number) : undefined,
	});

	return (
		<>
			<BaseEdge
				path={geometry.edgePath}
				style={{ ...style, strokeWidth: 1.5, stroke: "color-mix(in oklch, var(--muted-foreground) 40%, transparent)" }}
			/>
			<EdgeLabelRenderer>
				<div
					className="nodrag nopan pointer-events-none"
					style={{
						position: "absolute",
						transform: `translate(-50%, -50%) translate(${geometry.labelX}px, ${geometry.labelY}px)`,
					}}
				>
					<span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
						After Last
					</span>
				</div>
				<div
					className="nodrag nopan pointer-events-auto"
					style={{
						position: "absolute",
						transform: `translate(-50%, -50%) translate(${geometry.plusX}px, ${geometry.plusY}px)`,
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
							<DropdownMenuItem onClick={() => onInsertNode?.(id, "end")}>
								<Square className="h-4 w-4 mr-2" />
								End Automation
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</EdgeLabelRenderer>
		</>
	);
}
