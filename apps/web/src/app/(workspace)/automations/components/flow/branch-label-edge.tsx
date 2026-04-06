"use client";

import {
	BaseEdge,
	EdgeLabelRenderer,
	getStraightPath,
	type EdgeProps,
} from "@xyflow/react";
import { ButtonEdge as RFButtonEdge } from "@/components/button-edge";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { getNoBranchGeometry } from "./edge-geometry";

const EDGE_STYLE = {
	stroke: "color-mix(in oklch, var(--muted-foreground) 40%, transparent)",
	strokeWidth: 1.5,
};

/** Map raw branch labels to user-friendly text */
function displayLabel(label: string | undefined, branchType: string): string {
	if (label === "Yes" || (!label && branchType === "yes")) return "Is true";
	if (label === "No" || (!label && branchType === "no")) return "Is false";
	if (label === "For Each" || (!label && branchType === "each")) return "For Each";
	if (label === "After Last" || (!label && branchType === "after")) return "After Last";
	return label || "";
}

export function BranchLabelEdge(props: EdgeProps) {
	const {
		id,
		sourceX,
		sourceY,
		targetX,
		targetY,
		data,
		style,
	} = props;
	const branchType =
		(data?.branchType as string) || (data?.variant as string) || "yes";
	const rawLabel = data?.label as string | undefined;
	const label = displayLabel(rawLabel, branchType);
	const isTerminal = data?.isTerminal === true;
	const onInsertNode = data?.onInsertNode as
		| ((edgeId: string, nodeType: string) => void)
		| undefined;

	// Complex geometry branches need custom rendering
	const needsCustomGeometry = branchType === "no" || branchType === "after" || isTerminal;

	if (needsCustomGeometry) {
		let edgePath = "";
		let labelX = 0;
		let labelY = 0;
		let plusX = 0;
		let plusY = 0;

		if (branchType === "yes" || branchType === "each") {
			[edgePath, labelX, labelY] = getStraightPath({
				sourceX,
				sourceY,
				targetX,
				targetY,
			});
			plusX = isTerminal ? targetX : labelX;
			plusY = isTerminal ? targetY : labelY;
		} else if (branchType === "no") {
			const geometry = getNoBranchGeometry(
				sourceX,
				sourceY,
				targetX,
				targetY,
			);
			edgePath = geometry.edgePath;
			labelX = geometry.labelX;
			labelY = geometry.labelY;
			plusX = targetX;
			plusY = geometry.effectiveTargetY;
		} else if (branchType === "after") {
			[edgePath, labelX, labelY] = getStraightPath({
				sourceX,
				sourceY,
				targetX: sourceX,
				targetY: isTerminal
					? sourceY + (targetY - sourceY) * 0.5
					: targetY,
			});
			plusX = isTerminal ? sourceX : labelX;
			plusY = isTerminal
				? sourceY + (targetY - sourceY) * 0.5
				: labelY;
		} else {
			[edgePath, labelX, labelY] = getStraightPath({
				sourceX,
				sourceY,
				targetX,
				targetY,
			});
			plusX = labelX;
			plusY = labelY;
		}

		return (
			<>
				<BaseEdge
					path={edgePath}
					style={{ ...style, ...EDGE_STYLE }}
				/>
				<EdgeLabelRenderer>
					{label && (
						<div
							className="nodrag nopan pointer-events-none absolute"
							style={{
								transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
							}}
						>
							<span className="text-xs text-muted-foreground bg-background px-1.5 py-0.5 rounded select-none">
								{label}
							</span>
						</div>
					)}
					<div
						className="nodrag nopan pointer-events-auto absolute"
						style={{
							transform: `translate(-50%, -50%) translate(${plusX}px, ${plusY}px)`,
							zIndex: 10,
						}}
					>
						<button
							onClick={(e) => {
								e.stopPropagation();
								onInsertNode?.(id, "placeholder");
							}}
							className={cn(
								"nodrag nopan w-7 h-7 rounded-full bg-background border border-border hover:border-primary flex items-center justify-center shadow-sm transition-colors cursor-pointer",
								isTerminal
									? "opacity-100"
									: "opacity-0 hover:opacity-100 focus:opacity-100",
							)}
							aria-label="Add step"
						>
							<Plus className="h-3.5 w-3.5 text-muted-foreground" />
						</button>
					</div>
				</EdgeLabelRenderer>
			</>
		);
	}

	// Simple yes/each branches: use RF UI ButtonEdge
	return (
		<RFButtonEdge
			{...props}
			style={{ ...style, ...EDGE_STYLE }}
		>
			<div className="flex flex-col items-center gap-1">
				{label && (
					<span className="text-xs text-muted-foreground bg-background px-1.5 py-0.5 rounded select-none pointer-events-none">
						{label}
					</span>
				)}
				<button
					onClick={(e) => {
						e.stopPropagation();
						onInsertNode?.(id, "placeholder");
					}}
					className={cn(
						"nodrag nopan w-7 h-7 rounded-full bg-background border border-border hover:border-primary flex items-center justify-center shadow-sm transition-colors cursor-pointer",
						"opacity-0 hover:opacity-100 focus:opacity-100",
					)}
					aria-label="Add step"
				>
					<Plus className="h-3.5 w-3.5 text-muted-foreground" />
				</button>
			</div>
		</RFButtonEdge>
	);
}
