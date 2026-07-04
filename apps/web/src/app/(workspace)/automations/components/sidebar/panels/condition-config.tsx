"use client";

import React from "react";
import { GitBranch } from "lucide-react";
import { NextStepTree } from "../next-step-tree";
import type {
	AutomationObjectType,
	ConditionNodeConfig,
	WorkflowNode,
} from "../../../lib/node-types";
import type { ConfigPanelProps } from "../automation-sidebar";
import { ConfigPanelHeader } from "./config-panel-header";
import { DeleteStepButton, PanelSection } from "./panel-primitives";
import { FilterGroupsEditor } from "./filter-groups-editor";

function defaultConfig(): ConditionNodeConfig {
	return { kind: "condition", logic: "and", groups: [{ logic: "and", rules: [] }] };
}

export function ConditionConfigPanel({
	nodeId,
	trigger,
	nodes,
	onNodeChange,
	onDeleteNode,
	onNavigateToNode,
	rfNodes,
	rfEdges,
}: ConfigPanelProps) {
	const node = nodeId ? nodes.find((item) => item.id === nodeId) : undefined;

	if (!nodeId || !node || node.type !== "condition") {
		return (
			<div className="text-sm text-muted-foreground">
				This condition could not be found.
			</div>
		);
	}

	const objectType: AutomationObjectType = trigger?.objectType || "quote";
	const config = (node.config as ConditionNodeConfig | undefined) ?? defaultConfig();
	const workflowNodes = nodes.filter((n): n is WorkflowNode => n.type !== "placeholder");

	const commit = (next: ConditionNodeConfig) => {
		onNodeChange(nodeId, { config: next } as Partial<WorkflowNode>);
	};

	return (
		<div className="flex flex-col h-full">
			<ConfigPanelHeader
				icon={GitBranch}
				iconBgColor="bg-purple-50 dark:bg-purple-950/40"
				iconFgColor="text-purple-600 dark:text-purple-400"
				categoryBadge="Conditions"
				nodeTypeName="Condition"
			/>

			<div className="flex-1">
				<PanelSection title="Conditions">
					<FilterGroupsEditor
						objectType={objectType}
						groups={config.groups}
						onChange={(groups) => commit({ ...config, groups })}
						topLevelLogic={{
							value: config.logic,
							onChange: (logic) => commit({ ...config, logic }),
						}}
						nodes={workflowNodes}
						trigger={trigger}
						targetNodeId={nodeId}
					/>
				</PanelSection>
			</div>

			{/* Next steps tree */}
			{nodeId && rfNodes && rfEdges && onNavigateToNode && (
				<div className="border-t border-border pt-4 mt-2">
					<NextStepTree
						currentNodeId={nodeId}
						nodes={rfNodes}
						edges={rfEdges}
						onNavigateToNode={onNavigateToNode}
					/>
				</div>
			)}

			{onDeleteNode && (
				<DeleteStepButton onDelete={() => onDeleteNode(nodeId)} />
			)}
		</div>
	);
}
