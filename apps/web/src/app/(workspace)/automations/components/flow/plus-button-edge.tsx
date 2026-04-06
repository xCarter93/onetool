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

const EDGE_STYLE = {
	stroke: "hsl(var(--muted-foreground) / 0.4)",
	strokeWidth: 1.5,
};

export function PlusButtonEdge(props: EdgeProps) {
	const {
		id,
		sourceX,
		sourceY,
		targetX,
		targetY,
		data,
		style,
	} = props;
	const isTerminal = data?.isTerminal === true;
	const onInsertNode = data?.onInsertNode as
		| ((edgeId: string, nodeType: string) => void)
		| undefined;

	// Terminal edges need custom geometry (shortened path), can't use ButtonEdge
	if (isTerminal) {
		const effectiveTargetY = sourceY + (targetY - sourceY) * 0.5;
		const [edgePath] = getStraightPath({
			sourceX,
			sourceY,
			targetX: sourceX,
			targetY: effectiveTargetY,
		});
		const plusX = sourceX;
		const plusY = effectiveTargetY;

		return (
			<>
				<BaseEdge path={edgePath} style={{ ...style, ...EDGE_STYLE }} />
				<EdgeLabelRenderer>
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
							className="nodrag nopan w-7 h-7 rounded-full bg-background border border-border hover:border-primary flex items-center justify-center shadow-sm transition-colors cursor-pointer"
							aria-label="Add step"
						>
							<Plus className="h-3.5 w-3.5 text-muted-foreground" />
						</button>
					</div>
				</EdgeLabelRenderer>
			</>
		);
	}

	// Non-terminal edges: use RF UI ButtonEdge (bezier path with midpoint children)
	return (
		<RFButtonEdge
			{...props}
			style={{ ...style, ...EDGE_STYLE }}
		>
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
		</RFButtonEdge>
	);
}
