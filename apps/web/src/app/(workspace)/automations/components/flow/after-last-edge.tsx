"use client";

import {
	BaseEdge,
	EdgeLabelRenderer,
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

	const offsetX = 50;
	const rightX = sourceX + offsetX;
	const cr = 16;

	// Ensure the edge goes down far enough even for empty loops
	const effectiveTargetY = Math.max(targetY, sourceY + cr * 4);

	// Path: right from loop → curve down → straight down → curve left → to target
	const edgePath = [
		`M ${sourceX} ${sourceY}`,
		`L ${rightX - cr} ${sourceY}`,
		`Q ${rightX} ${sourceY} ${rightX} ${sourceY + cr}`,
		`L ${rightX} ${effectiveTargetY - cr}`,
		`Q ${rightX} ${effectiveTargetY} ${rightX - cr} ${effectiveTargetY}`,
		`L ${targetX} ${effectiveTargetY}`,
	].join(" ");

	// Label at the top-right of the descent
	const labelX = rightX;
	const labelY = sourceY + cr * 2;

	// Plus button at the end of the path (where it meets the target)
	const plusX = targetX;
	const plusY = effectiveTargetY;

	return (
		<>
			<BaseEdge
				path={edgePath}
				style={{ ...style, strokeWidth: 2, stroke: "var(--color-border)" }}
			/>
			<EdgeLabelRenderer>
				<div
					className="nodrag nopan pointer-events-none"
					style={{
						position: "absolute",
						transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
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
