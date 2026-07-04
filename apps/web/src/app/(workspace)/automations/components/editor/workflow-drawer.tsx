"use client";

import { useMemo, useState } from "react";
import { PanelLeft, PanelLeftClose, Zap, Copy, Check } from "lucide-react";
import type { Node, Edge } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { NextStepTree } from "../sidebar/next-step-tree";
import { TRIGGER_NODE_ID, type EditorNode } from "../../lib/flow-adapter";
import { getAvailableVariables, type VariableOption } from "../../lib/variables";
import type { WorkflowNode, TriggerConfig } from "../../lib/node-types";

interface WorkflowDrawerProps {
	trigger: TriggerConfig | null | undefined;
	nodes: EditorNode[];
	rfNodes: Node[];
	rfEdges: Edge[];
	onNavigateToNode: (nodeId: string) => void;
	/** The node whose scope drives the variable reference; base catalog when absent. */
	selectedNodeId?: string;
	open: boolean;
	onToggle: () => void;
}

/** Order-preserving group of variable options by their `group` label. */
function groupVariables(vars: VariableOption[]): [string, VariableOption[]][] {
	const groups: [string, VariableOption[]][] = [];
	for (const v of vars) {
		const existing = groups.find(([g]) => g === v.group);
		if (existing) existing[1].push(v);
		else groups.push([v.group, [v]]);
	}
	return groups;
}

export function WorkflowDrawer({
	trigger,
	nodes,
	rfNodes,
	rfEdges,
	onNavigateToNode,
	selectedNodeId,
	open,
	onToggle,
}: WorkflowDrawerProps) {
	const [copiedPath, setCopiedPath] = useState<string | null>(null);

	const variableGroups = useMemo(() => {
		if (!trigger) return [];
		const workflowNodes = nodes.filter(
			(n): n is WorkflowNode => n.type !== "placeholder"
		);
		return groupVariables(
			getAvailableVariables(workflowNodes, trigger, selectedNodeId ?? "")
		);
	}, [trigger, nodes, selectedNodeId]);

	if (!open) {
		return (
			<div className="flex w-9 shrink-0 flex-col items-center border-r border-border bg-sidebar pt-3">
				<button
					type="button"
					onClick={onToggle}
					aria-label="Open workflow panel"
					title="Open workflow panel"
					className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<PanelLeft className="h-4 w-4" />
				</button>
			</div>
		);
	}

	const copyPath = (path: string) => {
		const token = `{{${path}}}`;
		void navigator.clipboard?.writeText(token);
		setCopiedPath(path);
		window.setTimeout(() => setCopiedPath((p) => (p === path ? null : p)), 1200);
	};

	return (
		<div className="flex w-[280px] shrink-0 flex-col overflow-y-auto border-r border-border bg-sidebar">
			<div className="flex items-center justify-between border-b border-border px-3 py-2.5">
				<span className="text-sm font-semibold">Workflow</span>
				<button
					type="button"
					onClick={onToggle}
					aria-label="Collapse workflow panel"
					title="Collapse workflow panel"
					className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<PanelLeftClose className="h-4 w-4" />
				</button>
			</div>

			{/* Outline */}
			<div className="border-b border-border p-3">
				<div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					Outline
				</div>
				<div className="space-y-0.5">
					<button
						type="button"
						onClick={() => onNavigateToNode(TRIGGER_NODE_ID)}
						className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
							<Zap className="h-3 w-3" />
						</div>
						<span className="truncate text-sm">Trigger</span>
					</button>
					<NextStepTree
						currentNodeId={TRIGGER_NODE_ID}
						nodes={rfNodes}
						edges={rfEdges}
						onNavigateToNode={onNavigateToNode}
						hideHeader
					/>
				</div>
			</div>

			{/* Variable reference */}
			<div className="p-3">
				<div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					Variables
				</div>
				{!trigger ? (
					<p className="text-sm text-muted-foreground">
						Choose a trigger to see available variables.
					</p>
				) : variableGroups.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						No variables available yet.
					</p>
				) : (
					<div className="space-y-3">
						{variableGroups.map(([group, vars]) => (
							<div key={group}>
								<div className="mb-1 text-[11px] font-medium text-muted-foreground">
									{group}
								</div>
								<div className="space-y-0.5">
									{vars.map((v) => (
										<button
											key={v.path}
											type="button"
											onClick={() => copyPath(v.path)}
											title={`Copy {{${v.path}}}`}
											className="group flex w-full items-center gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										>
											<span className="flex-1 truncate text-sm">{v.label}</span>
											{v.fieldType && (
												<span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
													{v.fieldType}
												</span>
											)}
											{copiedPath === v.path ? (
												<Check className="h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-400" />
											) : (
												<Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
											)}
										</button>
									))}
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
