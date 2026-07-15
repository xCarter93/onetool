"use client";

import React from "react";
import { Sigma } from "lucide-react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	AGGREGATE_OPERATIONS,
	OBJECT_TYPE_LABELS,
	getFilterableFields,
	type AggregateNodeConfig,
	type AggregateOperation,
	type WorkflowNode,
} from "../../../lib/node-types";
import { getUpstreamFetchNodes } from "../../../lib/variables";
import type { ConfigPanelProps } from "../automation-sidebar";
import { ConfigPanelHeader } from "./config-panel-header";
import {
	DeleteStepButton,
	PanelField,
	PanelSection,
} from "./panel-primitives";

const OPERATION_LABELS: Record<AggregateOperation, string> = {
	sum: "Sum",
	avg: "Average",
	min: "Minimum",
	max: "Maximum",
};

export function AggregateConfigPanel({
	nodeId,
	nodes,
	onNodeChange,
	onDeleteNode,
}: ConfigPanelProps) {
	const node = nodeId ? nodes.find((item) => item.id === nodeId) : undefined;

	if (!nodeId || !node || node.type !== "aggregate") {
		return (
			<div className="text-sm text-muted-foreground">
				This aggregate step could not be found.
			</div>
		);
	}

	const workflowNodes = nodes.filter((n): n is WorkflowNode => n.type !== "placeholder");
	const upstreamFetchNodes = getUpstreamFetchNodes(workflowNodes, nodeId);
	const config: AggregateNodeConfig = (node.config as AggregateNodeConfig | undefined) ?? {
		kind: "aggregate",
		sourceNodeId: "",
		field: "",
		op: "sum",
	};

	// The fetched object type of the selected source drives the numeric-field list.
	const sourceObjectType = upstreamFetchNodes.find(
		(fetchNode) => fetchNode.id === config.sourceNodeId
	)?.objectType;
	const numericFields = sourceObjectType
		? getFilterableFields(sourceObjectType).filter(
				(field) => field.type === "number" || field.type === "currency"
			)
		: [];

	const commit = (next: AggregateNodeConfig) => {
		onNodeChange(nodeId, { config: next } as Partial<WorkflowNode>);
	};

	return (
		<div className="flex flex-col h-full">
			<ConfigPanelHeader
				icon={Sigma}
				iconBgColor="bg-orange-50 dark:bg-orange-950/40"
				iconFgColor="text-orange-600 dark:text-orange-400"
				categoryBadge="Utilities"
				nodeTypeName="Aggregate"
			/>

			<div className="flex-1">
				<PanelSection title="Inputs">
					{upstreamFetchNodes.length === 0 ? (
						<div className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
							Add a Find records step before this aggregate.
						</div>
					) : (
						<>
							<PanelField label="Records to aggregate">
								<Select
									value={config.sourceNodeId}
									onValueChange={(sourceNodeId) =>
										// Reset the field when the source changes so it can't
										// reference a field from the previous object type.
										sourceNodeId &&
										commit({ ...config, sourceNodeId, field: "" })
									}
								>
									<SelectTrigger>
										<SelectValue placeholder="Choose a Find records step" />
									</SelectTrigger>
									<SelectContent>
										{upstreamFetchNodes.map((fetchNode) => (
											<SelectItem key={fetchNode.id} value={fetchNode.id}>
												Find records
												{fetchNode.objectType
													? ` — ${OBJECT_TYPE_LABELS[fetchNode.objectType]}`
													: ""}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</PanelField>

							<PanelField label="Field to aggregate">
								<Select
									value={config.field}
									disabled={!sourceObjectType}
									onValueChange={(field) => field && commit({ ...config, field })}
								>
									<SelectTrigger>
										<SelectValue
											placeholder={
												sourceObjectType
													? "Choose a numeric field"
													: "Pick a source first"
											}
										/>
									</SelectTrigger>
									<SelectContent>
										{numericFields.map((field) => (
											<SelectItem key={field.key} value={field.key}>
												{field.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</PanelField>

							<PanelField label="Operation">
								<Select
									value={config.op}
									onValueChange={(op) =>
										commit({ ...config, op: op as AggregateOperation })
									}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{AGGREGATE_OPERATIONS.map((op) => (
											<SelectItem key={op} value={op}>
												{OPERATION_LABELS[op]}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</PanelField>
						</>
					)}
				</PanelSection>
			</div>

			{onDeleteNode && (
				<DeleteStepButton onDelete={() => onDeleteNode(nodeId)} />
			)}
		</div>
	);
}
