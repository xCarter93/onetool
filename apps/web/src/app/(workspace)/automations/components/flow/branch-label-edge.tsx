"use client";

import {
	BaseEdge,
	EdgeLabelRenderer,
	getSmoothStepPath,
	Position,
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
	const variant = (data?.variant as string) || "yes";
	const label = (data?.label as string) || (variant === "yes" ? "Yes" : "No");
	const isTerminal = data?.isTerminal === true;
	const onInsertNode = data?.onInsertNode as
		| ((edgeId: string, nodeType: string) => void)
		| undefined;

	// For terminal edges, shorten the path so it ends at the "+" position
	const effectiveTargetY = isTerminal
		? sourceY + (targetY - sourceY) * 0.5
		: targetY;

	const [edgePath, labelX, labelY] = getSmoothStepPath({
		sourceX,
		sourceY,
		sourcePosition: Position.Bottom,
		targetX,
		targetY: effectiveTargetY,
		targetPosition: Position.Top,
		borderRadius: 8,
	});

	// For loop branches, the loop node footer already shows "For Each" / "After Last"
	// so we skip the edge label to avoid duplication
	const branchType = data?.branchType as string | undefined;
	const isLoopBranch = branchType === "each" || branchType === "after";
	const showLabel = !isLoopBranch;

	// Pill color classes per UI-SPEC branch label table
	const pillClasses: Record<string, string> = {
		yes: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400",
		no: "bg-rose-50 dark:bg-rose-950/40 text-rose-500 dark:text-rose-400",
	};

	// Override for loop branch labels
	let pillClass: string;
	if (label === "For Each") {
		pillClass = "bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400";
	} else if (label === "After Last") {
		pillClass = "bg-muted text-muted-foreground";
	} else {
		pillClass = pillClasses[variant] || pillClasses.yes;
	}

	// "+" at end for terminal, at midpoint for connected edges
	const plusX = isTerminal ? targetX : (sourceX + targetX) / 2;
	const plusY = isTerminal
		? effectiveTargetY
		: (sourceY + targetY) / 2;

	return (
		<>
			<BaseEdge
				path={edgePath}
				style={{ ...style, strokeWidth: 2, stroke: "var(--color-border)" }}
			/>
			<EdgeLabelRenderer>
				{/* Branch label positioned by getSmoothStepPath — hidden for loop branches */}
				{showLabel && (
					<div
						className="nodrag nopan pointer-events-none"
						style={{
							position: "absolute",
							transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
						}}
					>
						<span
							className={cn(
								"text-xs font-semibold px-2 py-0.5 rounded-full",
								pillClass
							)}
						>
							{label}
						</span>
					</div>
				)}
				{/* Plus button */}
				<div
					className="nodrag nopan pointer-events-auto"
					style={{
						position: "absolute",
						transform: `translate(-50%, -50%) translate(${plusX}px, ${plusY}px)`,
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
