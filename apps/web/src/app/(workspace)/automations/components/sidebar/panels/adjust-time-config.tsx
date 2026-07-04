"use client";

import React from "react";
import { Clock3 } from "lucide-react";
import { NextStepTree } from "../next-step-tree";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	ADJUST_TIME_UNITS,
	type AdjustTimeNodeConfig,
	type AdjustTimeUnit,
	type WorkflowNode,
} from "../../../lib/node-types";
import type { ConfigPanelProps } from "../automation-sidebar";
import { ConfigPanelHeader } from "./config-panel-header";
import {
	DeleteStepButton,
	PanelField,
	PanelSection,
} from "./panel-primitives";
import { ValueInput } from "./value-input";

const UNIT_LABELS: Record<AdjustTimeUnit, string> = {
	minutes: "Minutes",
	hours: "Hours",
	days: "Days",
	weeks: "Weeks",
};

const DIRECTION_OPTIONS: {
	value: AdjustTimeNodeConfig["direction"];
	label: string;
}[] = [
	{ value: "add", label: "Add" },
	{ value: "subtract", label: "Subtract" },
];

function defaultAdjustTimeConfig(): AdjustTimeNodeConfig {
	return {
		kind: "adjust_time",
		base: { kind: "var", path: "workflow.now" },
		amount: 1,
		unit: "days",
		direction: "add",
	};
}

export function AdjustTimeConfigPanel({
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

	if (!nodeId || !node || node.type !== "adjust_time") {
		return (
			<div className="text-sm text-muted-foreground">
				This adjust time step could not be found.
			</div>
		);
	}

	const config: AdjustTimeNodeConfig =
		(node.config as AdjustTimeNodeConfig | undefined) ?? defaultAdjustTimeConfig();
	const workflowNodes = nodes.filter((n): n is WorkflowNode => n.type !== "placeholder");

	const commit = (next: AdjustTimeNodeConfig) => {
		onNodeChange(nodeId, { config: next } as Partial<WorkflowNode>);
	};

	return (
		<div className="flex flex-col h-full">
			<ConfigPanelHeader
				icon={Clock3}
				iconBgColor="bg-cyan-50 dark:bg-cyan-950/40"
				iconFgColor="text-cyan-600 dark:text-cyan-400"
				categoryBadge="Utilities"
				nodeTypeName="Adjust time"
			/>

			<div className="flex-1">
				<PanelSection title="Inputs">
					<PanelField
						label="Base time"
						helper="Pick a date, or use a variable from a date field earlier in the workflow."
					>
						<ValueInput
							field={{ type: "date" }}
							value={config.base}
							onChange={(base) => commit({ ...config, base })}
							nodes={workflowNodes}
							trigger={trigger}
							targetNodeId={nodeId}
						/>
					</PanelField>

					<PanelField label="Adjust by">
						<div className="flex items-center gap-2">
							<Input
								type="number"
								min={0}
								className="flex-1"
								value={config.amount}
								onChange={(e) => {
									const amount =
										e.target.value === ""
											? 0
											: Math.max(0, Math.round(Number(e.target.value)) || 0);
									commit({ ...config, amount });
								}}
							/>
							<Select
								value={config.unit}
								onValueChange={(unit) =>
									commit({ ...config, unit: unit as AdjustTimeUnit })
								}
							>
								<SelectTrigger className="w-32">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{ADJUST_TIME_UNITS.map((unit) => (
										<SelectItem key={unit} value={unit}>
											{UNIT_LABELS[unit]}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</PanelField>

					<PanelField label="Direction">
						<Select
							value={config.direction}
							onValueChange={(direction) =>
								commit({
									...config,
									direction: direction as AdjustTimeNodeConfig["direction"],
								})
							}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{DIRECTION_OPTIONS.map((opt) => (
									<SelectItem key={opt.value} value={opt.value}>
										{opt.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</PanelField>
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
