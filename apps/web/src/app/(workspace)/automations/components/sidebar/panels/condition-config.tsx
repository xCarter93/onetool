"use client";

import React from "react";
import { GitBranch } from "lucide-react";
import { NextStepTree } from "../next-step-tree";
import type {
	ConditionNodeConfig,
	WorkflowNode,
} from "../../../lib/node-types";
import { triggerScopeObjectType } from "../../../lib/node-types";
import { getAvailableVariables, getScopeObjectType } from "../../../lib/variables";
import type { ConfigPanelProps } from "../automation-sidebar";
import { ConfigPanelHeader } from "./config-panel-header";
import { DeleteStepButton, PanelSection } from "./panel-primitives";
import { FilterGroupsEditor } from "./filter-groups-editor";
import { ConditionSentenceSummary } from "./condition-sentence-summary";

function defaultConfig(): ConditionNodeConfig {
	return { kind: "condition", logic: "and", groups: [{ logic: "and", rules: [] }] };
}

export function ConditionConfigPanel({
	nodeId,
	trigger,
	nodes,
	formulas,
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

	const triggerObjectType = triggerScopeObjectType(trigger);
	const config = (node.config as ConditionNodeConfig | undefined) ?? defaultConfig();
	const workflowNodes = nodes.filter((n): n is WorkflowNode => n.type !== "placeholder");

	// Inside a loop body, conditions read the loop's fetched item, not the
	// trigger record — mirror the engine (automationExecutor.ts executeNodeV2).
	// null on a scheduled automation outside a loop: nothing puts a record in
	// scope, so the only thing left to test is a step result.
	const scope = getScopeObjectType(workflowNodes, nodeId, triggerObjectType);
	const objectType = scope.objectType;

	// Step results and formulas can be tested without a record at all.
	const variableLeftOptions = (
		trigger ? getAvailableVariables(workflowNodes, trigger, nodeId, formulas) : []
	).filter((o) => o.path.startsWith("node.") || o.path.startsWith("formula."));
	const hasNothingToTest = !objectType && variableLeftOptions.length === 0;

	const commit = (next: ConditionNodeConfig) => {
		const source: ConditionNodeConfig["source"] =
			scope.inLoop && scope.loopNodeId ? { loopNodeId: scope.loopNodeId } : "trigger";
		onNodeChange(nodeId, { config: { ...next, source } } as Partial<WorkflowNode>);
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
					{!objectType && (
						<p className="text-xs text-muted-foreground">
							{hasNothingToTest
								? "This automation runs on a schedule, so there is no record to test. Add a Find records step, then test its result here — or move this condition inside a Loop to test each record."
								: "This automation runs on a schedule, so there is no record to test. Compare a step result instead, or move this condition inside a Loop to test each record."}
						</p>
					)}
					<FilterGroupsEditor
						objectType={objectType}
						variableLeftOptions={variableLeftOptions}
						groups={config.groups}
						onChange={(groups) => commit({ ...config, groups })}
						topLevelLogic={{
							value: config.logic,
							onChange: (logic) => commit({ ...config, logic }),
						}}
						nodes={workflowNodes}
						trigger={trigger}
						targetNodeId={nodeId}
						formulas={formulas}
					/>
					<ConditionSentenceSummary
						prefix="Runs when"
						logic={config.logic}
						groups={config.groups}
						objectType={objectType}
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
