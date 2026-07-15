"use client";

import React from "react";
import { Database } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	DEFAULT_FETCH_LIMIT,
	MAX_FETCH_LIMIT,
	OBJECT_TYPE_OPTIONS,
	triggerScopeObjectType,
	type AutomationObjectType,
	type FetchNodeConfig,
	type WorkflowNode,
} from "../../../lib/node-types";
import type { ConfigPanelProps } from "../automation-sidebar";
import { ConfigPanelHeader } from "./config-panel-header";
import {
	DeleteStepButton,
	PanelField,
	PanelSection,
} from "./panel-primitives";
import { FilterGroupsEditor } from "./filter-groups-editor";

export function FetchConfigPanel({
	nodeId,
	trigger,
	nodes,
	formulas,
	onNodeChange,
	onDeleteNode,
}: ConfigPanelProps) {
	const node = nodeId ? nodes.find((item) => item.id === nodeId) : undefined;

	if (!nodeId || !node || node.type !== "fetch_records") {
		return (
			<div className="text-sm text-muted-foreground">
				This fetch step could not be found.
			</div>
		);
	}

	const currentConfig: FetchNodeConfig = (node.config as FetchNodeConfig | undefined) ?? {
		kind: "fetch_records",
		objectType: triggerScopeObjectType(trigger) ?? "client",
		filters: [],
	};
	const workflowNodes = nodes.filter((n): n is WorkflowNode => n.type !== "placeholder");

	const commit = (next: FetchNodeConfig) => {
		onNodeChange(nodeId, { config: next } as Partial<WorkflowNode>);
	};

	return (
		<div className="flex flex-col h-full">
			<ConfigPanelHeader
				icon={Database}
				iconBgColor="bg-blue-50 dark:bg-blue-950/40"
				iconFgColor="text-blue-600 dark:text-blue-400"
				categoryBadge="Records"
				nodeTypeName="Find Records"
			/>

			<div className="flex-1">
				<PanelSection title="Inputs">
					<PanelField label="Object type">
						<Select
							value={currentConfig.objectType}
							onValueChange={(value) =>
								commit({
									...currentConfig,
									objectType: value as AutomationObjectType,
									filters: [],
								})
							}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{OBJECT_TYPE_OPTIONS.map((entity) => (
									<SelectItem key={entity.value} value={entity.value}>
										{entity.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</PanelField>

					<PanelField
						label="Limit"
						helper={`Up to ${MAX_FETCH_LIMIT} records, newest first.`}
					>
						<Input
							type="number"
							min={1}
							max={MAX_FETCH_LIMIT}
							value={currentConfig.limit ?? DEFAULT_FETCH_LIMIT}
							onChange={(e) =>
								commit({
									...currentConfig,
									limit: e.target.value === "" ? undefined : Number(e.target.value),
								})
							}
						/>
					</PanelField>
				</PanelSection>

				<PanelSection title="Filters">
					<FilterGroupsEditor
						objectType={currentConfig.objectType}
						groups={currentConfig.filters}
						onChange={(filters) => commit({ ...currentConfig, filters })}
						helperText="All groups must match."
						nodes={workflowNodes}
						trigger={trigger}
						targetNodeId={nodeId}
						formulas={formulas}
					/>
				</PanelSection>
			</div>

			{onDeleteNode && (
				<DeleteStepButton onDelete={() => onDeleteNode(nodeId)} />
			)}
		</div>
	);
}
