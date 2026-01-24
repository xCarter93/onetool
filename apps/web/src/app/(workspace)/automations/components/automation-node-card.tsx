"use client";

import React from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GitBranch, Play, Trash2, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

export type NodeType = "condition" | "action";

export type WorkflowNode = {
	id: string;
	type: NodeType;
	condition?: {
		field: string;
		operator: "equals" | "not_equals" | "contains" | "exists";
		value: unknown;
	};
	action?: {
		targetType: "self" | "project" | "client" | "quote" | "invoice";
		actionType: "update_status";
		newStatus: string;
	};
	nextNodeId?: string;
	elseNodeId?: string;
};

interface AutomationNodeCardProps {
	node: WorkflowNode;
	index: number;
	objectType: string;
	onUpdate: (node: WorkflowNode) => void;
	onDelete: () => void;
	children: React.ReactNode;
}

export function AutomationNodeCard({
	node,
	index,
	onDelete,
	children,
}: AutomationNodeCardProps) {
	const isCondition = node.type === "condition";
	const Icon = isCondition ? GitBranch : Play;
	const colorClasses = isCondition
		? "from-purple-500/5 via-purple-500/2 to-transparent dark:from-purple-400/5 dark:via-purple-400/2 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400"
		: "from-green-500/5 via-green-500/2 to-transparent dark:from-green-400/5 dark:via-green-400/2 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400";

	return (
		<div className="relative">
			{/* Connector line */}
			{index > 0 && (
				<div className="absolute -top-4 left-8 w-[2.5px] h-4 bg-border" />
			)}

			<Card
				className={cn(
					"group relative backdrop-blur-md overflow-hidden ring-1 ring-border/20 dark:ring-border/40",
					isCondition && "ring-purple-200/50 dark:ring-purple-800/50",
					!isCondition && "ring-green-200/50 dark:ring-green-800/50"
				)}
			>
				<div
					className={cn(
						"absolute inset-0 bg-linear-to-br rounded-2xl",
						colorClasses.split(" ")[0],
						colorClasses.split(" ")[1],
						colorClasses.split(" ")[2]
					)}
				/>
				<CardHeader className="relative z-10 pb-2 flex flex-row items-center justify-between space-y-0">
					<div className="flex items-center gap-3">
						<div className="flex items-center gap-2">
							<GripVertical className="h-4 w-4 text-muted-foreground opacity-50" />
							<div
								className={cn(
									"flex items-center justify-center w-8 h-8 rounded-full",
									colorClasses.split(" ")[3],
									colorClasses.split(" ")[4]
								)}
							>
								<Icon
									className={cn(
										"h-4 w-4",
										colorClasses.split(" ")[5],
										colorClasses.split(" ")[6]
									)}
								/>
							</div>
						</div>
						<div>
							<p className="font-medium text-sm">
								{isCondition ? "Condition" : "Action"}
							</p>
							<p className="text-xs text-muted-foreground">
								Step {index + 1}
							</p>
						</div>
					</div>
					<Button
						intent="outline"
						size="sq-sm"
						onPress={onDelete}
						className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950 opacity-0 group-hover:opacity-100 transition-opacity"
						aria-label="Delete node"
					>
						<Trash2 className="size-4" />
					</Button>
				</CardHeader>
				<CardContent className="relative z-10 pt-0">{children}</CardContent>
			</Card>
		</div>
	);
}

