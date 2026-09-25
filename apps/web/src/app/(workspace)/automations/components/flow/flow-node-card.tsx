"use client";

import type { ReactNode } from "react";
import { Copy, EllipsisVertical, Trash2, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { BaseNode, BaseNodeHeaderTitle } from "@/components/base-node";
import { Button } from "@/components/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STEP_FAMILY_STYLE, type StepFamily } from "../../lib/step-family";
import { useNodeActions } from "./node-actions-context";

interface FlowNodeCardProps {
	nodeId: string;
	family: StepFamily;
	icon: LucideIcon;
	title: string;
	/** Sentence summary; use SummarySlot for each configurable value. */
	children: ReactNode;
	/** First save-blocking problem for this node, from lib/validation. */
	warning?: string;
	/** Branching steps can't be cloned in place; the menu says why. */
	duplicable?: boolean;
	/** Trigger and flow markers have no step menu. */
	menu?: boolean;
	handles?: ReactNode;
	ariaLabel: string;
	className?: string;
}

const NOT_DUPLICABLE = "Branching steps can't be duplicated yet";

export function FlowNodeCard({
	nodeId,
	family,
	icon: Icon,
	title,
	children,
	warning,
	duplicable = true,
	menu = true,
	handles,
	ariaLabel,
	className,
}: FlowNodeCardProps) {
	const { band } = STEP_FAMILY_STYLE[family];
	const actions = useNodeActions();
	const showMenu = menu && (actions.onDuplicate || actions.onDelete);

	const card = (
		<BaseNode className={cn("w-[300px]", className)} aria-label={ariaLabel}>
			{handles}
			<header
				className={cn("flex h-9 items-center gap-2 rounded-t-[inherit] px-3", band)}
			>
				<Icon className="h-4 w-4 shrink-0" aria-hidden />
				<BaseNodeHeaderTitle className="truncate text-sm">{title}</BaseNodeHeaderTitle>
				{showMenu && (
					<DropdownMenu>
						<DropdownMenuTrigger
							render={
								<Button
									variant="ghost"
									size="icon-xs"
									className="nodrag nopan -mr-1.5 shrink-0 text-inherit hover:bg-primary-foreground/15 hover:text-inherit"
									aria-label={`${title} step menu`}
									onClick={(e) => e.stopPropagation()}
								/>
							}
						>
							<EllipsisVertical className="h-4 w-4" />
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-44">
							<DropdownMenuItem
								disabled={!duplicable || !actions.onDuplicate}
								onClick={() => actions.onDuplicate?.(nodeId)}
							>
								<Copy />
								{duplicable ? "Duplicate" : NOT_DUPLICABLE}
							</DropdownMenuItem>
							<DropdownMenuItem
								variant="destructive"
								disabled={!actions.onDelete}
								onClick={() => actions.onDelete?.(nodeId)}
							>
								<Trash2 />
								Delete
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				)}
			</header>
			<p className="px-3 py-2.5 text-sm leading-5 text-muted-foreground">{children}</p>
			{warning && (
				<>
					<div
						role="status"
						className="flex items-start gap-1.5 border-t border-border px-3 py-1.5 text-xs text-warning-foreground"
					>
						<TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
						<span>{warning}</span>
					</div>
					<span
						aria-hidden
						className="absolute -top-2 -right-2 flex h-4 w-4 items-center justify-center rounded-full border-2 border-warning bg-card"
					>
						<TriangleAlert className="h-2.5 w-2.5 text-warning-foreground" />
					</span>
				</>
			)}
		</BaseNode>
	);

	if (!showMenu) return card;

	return (
		<ContextMenu>
			<ContextMenuTrigger className="block">{card}</ContextMenuTrigger>
			<ContextMenuContent className="w-44">
				<ContextMenuItem
					disabled={!duplicable || !actions.onDuplicate}
					onClick={() => actions.onDuplicate?.(nodeId)}
				>
					<Copy />
					{duplicable ? "Duplicate" : NOT_DUPLICABLE}
				</ContextMenuItem>
				<ContextMenuItem
					variant="destructive"
					disabled={!actions.onDelete}
					onClick={() => actions.onDelete?.(nodeId)}
				>
					<Trash2 />
					Delete
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
