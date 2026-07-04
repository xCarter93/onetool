"use client";

import {
	BaseEdge,
	EdgeLabelRenderer,
	type EdgeProps,
} from "@xyflow/react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getAfterLastGeometry } from "./edge-geometry";
import { ALL_STEP_ITEMS } from "../sidebar/step-picker";

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
		| ((edgeId: string, nodeType: string, actionType?: string) => void)
		| undefined;

	const geometry = getAfterLastGeometry(sourceX, sourceY, targetX, targetY, {
		routeRightX:
			typeof data?.routeRightX === "number" ? (data.routeRightX as number) : undefined,
	});

	return (
		<>
			<BaseEdge
				path={geometry.edgePath}
				style={{ ...style, strokeWidth: 1.5, stroke: "var(--color-orange-300)", strokeDasharray: "6 3" }}
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
							{ALL_STEP_ITEMS.map((item) => {
								const Icon = item.icon;
								return (
									<DropdownMenuItem
										key={`${item.type}-${item.actionType ?? ""}-${item.label}`}
										onClick={() => onInsertNode?.(id, item.type, item.actionType)}
									>
										<Icon className="h-4 w-4 mr-2" />
										{item.label}
									</DropdownMenuItem>
								);
							})}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</EdgeLabelRenderer>
		</>
	);
}
