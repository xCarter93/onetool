"use client";

import { memo } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import { Plus, Trash2, X } from "lucide-react";
import { BaseNode } from "@/components/base-node";
import { BaseHandle } from "@/components/base-handle";
import { Button } from "@/components/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { PlaceholderRFNode } from "../../lib/node-types";
import { useNodeActions } from "./node-actions-context";

export const PlaceholderNodeRF = memo(({ id }: NodeProps<PlaceholderRFNode>) => {
	const { onDelete } = useNodeActions();

	const card = (
		<BaseNode
			className="group/placeholder w-[300px] border-dashed border-muted-foreground/30"
			role="button"
			aria-label="Empty step — click to configure"
			onKeyDown={(e) => {
				// BaseNode is a focusable div — without this the card is reachable
				// by keyboard but not activatable. The synthetic click bubbles to
				// React Flow's node wrapper and triggers the same onNodeClick path.
				if (e.key !== "Enter" && e.key !== " ") return;
				e.preventDefault();
				e.stopPropagation();
				e.currentTarget.click();
			}}
		>
			<BaseHandle type="target" position={Position.Top} />
			<div className="flex h-11 items-center gap-2 px-3 text-sm text-muted-foreground">
				<Plus className="h-4 w-4 shrink-0" aria-hidden />
				<span className="flex-1">Choose a step</span>
				{onDelete && (
					<Button
						variant="ghost"
						size="icon-xs"
						className="nodrag nopan -mr-1.5 opacity-0 transition-opacity group-hover/placeholder:opacity-100 focus-visible:opacity-100 in-[.selected]:opacity-100"
						aria-label="Remove empty step"
						onClick={(e) => {
							e.stopPropagation();
							onDelete(id);
						}}
					>
						<X className="h-4 w-4" />
					</Button>
				)}
			</div>
			<BaseHandle type="source" position={Position.Bottom} className="opacity-0!" />
		</BaseNode>
	);

	if (!onDelete) return card;

	return (
		<ContextMenu>
			<ContextMenuTrigger className="block">{card}</ContextMenuTrigger>
			<ContextMenuContent className="w-44">
				<ContextMenuItem variant="destructive" onClick={() => onDelete(id)}>
					<Trash2 />
					Remove empty step
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
});
PlaceholderNodeRF.displayName = "PlaceholderNodeRF";
