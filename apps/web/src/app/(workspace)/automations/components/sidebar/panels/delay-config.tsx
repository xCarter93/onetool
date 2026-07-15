"use client";

import React from "react";
import { Timer, CalendarClock } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	DELAY_UNIT_MS,
	MAX_DELAY_MS,
	type DelayNodeConfig,
	type DelayUntilNodeConfig,
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

const DELAY_UNIT_OPTIONS: { value: DelayNodeConfig["unit"]; label: string }[] = [
	{ value: "minutes", label: "Minutes" },
	{ value: "hours", label: "Hours" },
	{ value: "days", label: "Days" },
];

function defaultDelayConfig(): DelayNodeConfig {
	return { kind: "delay", amount: 1, unit: "days" };
}

export function DelayConfig({
	nodeId,
	nodes,
	onNodeChange,
	onDeleteNode,
}: ConfigPanelProps) {
	const node = nodeId ? nodes.find((item) => item.id === nodeId) : undefined;

	if (!nodeId || !node || node.type !== "delay") {
		return (
			<div className="text-sm text-muted-foreground">
				This delay step could not be found.
			</div>
		);
	}

	const config: DelayNodeConfig = (node.config as DelayNodeConfig | undefined) ?? defaultDelayConfig();
	const maxForUnit = Math.floor(MAX_DELAY_MS / DELAY_UNIT_MS[config.unit]);

	const commit = (next: DelayNodeConfig) => {
		onNodeChange(nodeId, { config: next } as Partial<WorkflowNode>);
	};

	return (
		<div className="flex flex-col h-full">
			<ConfigPanelHeader
				icon={Timer}
				iconBgColor="bg-cyan-50 dark:bg-cyan-950/40"
				iconFgColor="text-cyan-600 dark:text-cyan-400"
				categoryBadge="Utilities"
				nodeTypeName="Delay"
			/>

			<div className="flex-1">
				<PanelSection title="Inputs">
					<PanelField label="Wait for" helper={`Up to ${maxForUnit} ${config.unit}.`}>
						<div className="flex items-center gap-2">
							<Input
								type="number"
								min={1}
								className="flex-1"
								value={config.amount}
								onChange={(e) => {
									const amount = e.target.value === "" ? 1 : Number(e.target.value);
									commit({ ...config, amount });
								}}
							/>
							<Select
								value={config.unit}
								onValueChange={(unit) =>
									commit({ ...config, unit: unit as DelayNodeConfig["unit"] })
								}
							>
								<SelectTrigger className="w-32">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{DELAY_UNIT_OPTIONS.map((opt) => (
										<SelectItem key={opt.value} value={opt.value}>
											{opt.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</PanelField>
				</PanelSection>
			</div>

			{onDeleteNode && (
				<DeleteStepButton onDelete={() => onDeleteNode(nodeId)} />
			)}
		</div>
	);
}

function defaultDelayUntilConfig(): DelayUntilNodeConfig {
	return { kind: "delay_until", until: { kind: "static", value: null } };
}

export function DelayUntilConfig({
	nodeId,
	trigger,
	nodes,
	formulas,
	onNodeChange,
	onDeleteNode,
}: ConfigPanelProps) {
	const node = nodeId ? nodes.find((item) => item.id === nodeId) : undefined;

	if (!nodeId || !node || node.type !== "delay_until") {
		return (
			<div className="text-sm text-muted-foreground">
				This delay step could not be found.
			</div>
		);
	}

	const config: DelayUntilNodeConfig =
		(node.config as DelayUntilNodeConfig | undefined) ?? defaultDelayUntilConfig();
	const workflowNodes = nodes.filter((n): n is WorkflowNode => n.type !== "placeholder");

	const commit = (next: DelayUntilNodeConfig) => {
		onNodeChange(nodeId, { config: next } as Partial<WorkflowNode>);
	};

	return (
		<div className="flex flex-col h-full">
			<ConfigPanelHeader
				icon={CalendarClock}
				iconBgColor="bg-cyan-50 dark:bg-cyan-950/40"
				iconFgColor="text-cyan-600 dark:text-cyan-400"
				categoryBadge="Utilities"
				nodeTypeName="Delay until"
			/>

			<div className="flex-1">
				<PanelSection title="Inputs">
					<PanelField
						label="Run at"
						helper="Pick a date, or use a variable from a date field on the trigger record."
					>
						<ValueInput
							field={{ type: "date" }}
							value={config.until}
							onChange={(until) => commit({ ...config, until })}
							nodes={workflowNodes}
							trigger={trigger}
							targetNodeId={nodeId}
							formulas={formulas}
						/>
					</PanelField>
				</PanelSection>
			</div>

			{onDeleteNode && (
				<DeleteStepButton onDelete={() => onDeleteNode(nodeId)} />
			)}
		</div>
	);
}
