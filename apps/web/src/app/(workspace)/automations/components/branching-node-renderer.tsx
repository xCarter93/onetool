"use client";

import { GitBranch, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GraphNode } from "../lib/node-tree-utils";

interface BranchingNodeRendererProps {
	node: GraphNode;
	onNodeClick: (nodeId: string, nodeType: "condition" | "action") => void;
	onNodeDelete: (nodeId: string) => void;
	onAddNode?: (parentNodeId: string, branch: "true" | "false" | "next") => void;
}

export function BranchingNodeRenderer({
	node,
	onNodeClick,
	onNodeDelete,
	onAddNode,
}: BranchingNodeRendererProps) {
	const isCondition = node.type === "condition";

	// Get display summary for the node
	const getNodeSummary = () => {
		if (isCondition && node.config) {
			const condition = node.config as {
				field: string;
				operator: "equals" | "not_equals" | "contains" | "exists";
				value: unknown;
			};
			return `If ${condition.field || "field"} ${condition.operator || "equals"} ${condition.value || "..."}`;
		}

		if (!isCondition && node.config) {
			const action = node.config as {
				targetType: "self" | "project" | "client" | "quote" | "invoice";
				actionType: "update_status";
				newStatus: string;
			};
			return `Set status → ${action.newStatus || "..."}`;
		}

		return isCondition ? "Configure condition..." : "Configure action...";
	};

	const colorClasses = isCondition
		? {
				bg: "from-purple-50 to-violet-50 dark:from-purple-950/40 dark:to-violet-950/40",
				border: "border-purple-200 dark:border-purple-800",
				shadow: "shadow-purple-100/50 dark:shadow-purple-900/20",
				hoverShadow:
					"hover:shadow-purple-200/50 dark:hover:shadow-purple-800/30",
				hoverBorder: "hover:border-purple-300 dark:hover:border-purple-700",
				iconBg: "from-purple-400 to-violet-500",
				label: "text-purple-600 dark:text-purple-400",
		  }
		: {
				bg: "from-green-50 to-emerald-50 dark:from-green-950/40 dark:to-emerald-950/40",
				border: "border-green-200 dark:border-green-800",
				shadow: "shadow-green-100/50 dark:shadow-green-900/20",
				hoverShadow: "hover:shadow-green-200/50 dark:hover:shadow-green-800/30",
				hoverBorder: "hover:border-green-300 dark:hover:border-green-700",
				iconBg: "from-green-400 to-emerald-500",
				label: "text-green-600 dark:text-green-400",
		  };

	const Icon = isCondition ? GitBranch : Play;

	// Render a condition node with two branches side by side
	if (isCondition) {
		const hasTrueBranch = !!(node.trueBranch || node.next);
		const hasFalseBranch = !!node.falseBranch;

		return (
			<div className="relative flex flex-col items-center">
				{/* Condition Node */}
				<div className="relative group z-10">
					<button
						onClick={() => onNodeClick(node.id, "condition")}
						className={cn(
							"relative flex items-center gap-3 px-5 py-4 rounded-2xl",
							`bg-linear-to-br ${colorClasses.bg}`,
							`border-2 ${colorClasses.border}`,
							`shadow-lg ${colorClasses.shadow}`,
							`${colorClasses.hoverShadow}`,
							`${colorClasses.hoverBorder}`,
							"transition-all duration-200 cursor-pointer",
							"min-w-[280px]"
						)}
					>
						{/* Icon */}
						<div
							className={cn(
								"flex items-center justify-center w-10 h-10 rounded-xl shadow-md",
								`bg-linear-to-br ${colorClasses.iconBg}`
							)}
						>
							<Icon className="h-5 w-5 text-white" />
						</div>

						{/* Content */}
						<div className="flex-1 text-left">
							<div
								className={cn(
									"text-xs font-medium uppercase tracking-wide",
									colorClasses.label
								)}
							>
								Condition
							</div>
							<div className="text-sm font-semibold text-foreground truncate max-w-[180px]">
								{getNodeSummary()}
							</div>
						</div>
					</button>

					{/* Delete button */}
					<button
						onClick={(e) => {
							e.stopPropagation();
							onNodeDelete(node.id);
						}}
						className={cn(
							"absolute -right-2 -top-2 p-1.5 rounded-full",
							"bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400",
							"opacity-0 group-hover:opacity-100 transition-opacity",
							"hover:bg-red-200 dark:hover:bg-red-800/50",
							"border border-red-200 dark:border-red-800"
						)}
					>
						<svg
							className="h-3.5 w-3.5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					</button>
				</div>

				{/* Branch section */}
				{(hasTrueBranch || hasFalseBranch) && (
					<>
						{/* Initial connector from condition */}
						<div className="w-[2.5px] h-10 bg-border" />

						{/* Both branches side by side */}
						<div className="relative flex items-start gap-24">
							{/* SVG for connecting lines from split point to each branch */}
							{hasTrueBranch && hasFalseBranch && (
								<svg
									className="absolute pointer-events-none"
									style={{
										top: "-10px", // Start from where the initial vertical line ends
										left: "50%",
										transform: "translateX(-50%)",
										width: "450px", // Wide enough to cover both branches
										height: "60px",
										overflow: "visible",
										zIndex: 1,
									}}
								>
									{/* Line from center down, then left to true branch */}
									<path
										d="M 225,0 L 225,20 L 35,20 L 35,60"
										fill="none"
										stroke="#d1d5db"
										strokeWidth="2.5"
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
									{/* Line from center split, then right to false branch */}
									<path
										d="M 225,20 L 415,20 L 415,60"
										fill="none"
										stroke="#d1d5db"
										strokeWidth="2.5"
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
								</svg>
							)}

							{/* Single branch SVG (only true branch, no false) */}
							{hasTrueBranch && !hasFalseBranch && (
								<svg
									className="absolute pointer-events-none"
									style={{
										top: "-10px",
										left: "50%",
										transform: "translateX(-50%)",
										width: "2px",
										height: "60px",
										overflow: "visible",
										zIndex: 1,
									}}
								>
									<line
										x1="1"
										y1="0"
										x2="1"
										y2="60"
										stroke="#d1d5db"
										strokeWidth="2.5"
									/>
								</svg>
							)}

							{/* True branch column */}
							{hasTrueBranch && (
								<div className="flex flex-col items-center pt-6">
									{/* Is true label */}
									<div className="px-3 py-1 bg-background border border-border rounded-full text-xs font-medium text-muted-foreground whitespace-nowrap shadow-sm z-10">
										Is true
									</div>
									{/* Connector line */}
									<div className="w-[2.5px] h-8 bg-border" />
									{/* True branch node */}
									<BranchingNodeRenderer
										node={(node.trueBranch || node.next)!}
										onNodeClick={onNodeClick}
										onNodeDelete={onNodeDelete}
										onAddNode={onAddNode}
									/>
								</div>
							)}

							{/* False branch column */}
							{hasFalseBranch && (
								<div className="flex flex-col items-center pt-6">
									{/* Is false label */}
									<div className="px-3 py-1 bg-background border border-border rounded-full text-xs font-medium text-muted-foreground whitespace-nowrap shadow-sm z-10">
										Is false
									</div>
									{/* Connector line */}
									<div className="w-[2.5px] h-8 bg-border" />
									{/* False branch node */}
									<BranchingNodeRenderer
										node={node.falseBranch!}
										onNodeClick={onNodeClick}
										onNodeDelete={onNodeDelete}
										onAddNode={onAddNode}
									/>
								</div>
							)}
						</div>
					</>
				)}
			</div>
		);
	}

	// Render an action node with sequential flow
	return (
		<div className="flex flex-col items-center">
			{/* Action Node */}
			<div className="relative group">
				<button
					onClick={() => onNodeClick(node.id, "action")}
					className={cn(
						"relative flex items-center gap-3 px-5 py-4 rounded-2xl",
						`bg-linear-to-br ${colorClasses.bg}`,
						`border-2 ${colorClasses.border}`,
						`shadow-lg ${colorClasses.shadow}`,
						`${colorClasses.hoverShadow}`,
						`${colorClasses.hoverBorder}`,
						"transition-all duration-200 cursor-pointer",
						"min-w-[280px]"
					)}
				>
					{/* Icon */}
					<div
						className={cn(
							"flex items-center justify-center w-10 h-10 rounded-xl shadow-md",
							`bg-linear-to-br ${colorClasses.iconBg}`
						)}
					>
						<Icon className="h-5 w-5 text-white" />
					</div>

					{/* Content */}
					<div className="flex-1 text-left">
						<div
							className={cn(
								"text-xs font-medium uppercase tracking-wide",
								colorClasses.label
							)}
						>
							Action
						</div>
						<div className="text-sm font-semibold text-foreground truncate max-w-[180px]">
							{getNodeSummary()}
						</div>
					</div>
				</button>

				{/* Delete button */}
				<button
					onClick={(e) => {
						e.stopPropagation();
						onNodeDelete(node.id);
					}}
					className={cn(
						"absolute -right-2 -top-2 p-1.5 rounded-full",
						"bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400",
						"opacity-0 group-hover:opacity-100 transition-opacity",
						"hover:bg-red-200 dark:hover:bg-red-800/50",
						"border border-red-200 dark:border-red-800"
					)}
				>
					<svg
						className="h-3.5 w-3.5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</button>
			</div>

			{/* Connector line and next node */}
			{node.next ? (
				<>
					<div className="w-[2.5px] h-8 bg-border" />
					<BranchingNodeRenderer
						node={node.next}
						onNodeClick={onNodeClick}
						onNodeDelete={onNodeDelete}
						onAddNode={onAddNode}
					/>
				</>
			) : null}
		</div>
	);
}
