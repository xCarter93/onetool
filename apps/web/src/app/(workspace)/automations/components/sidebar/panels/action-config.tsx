"use client";

import React from "react";
import { Trash2, Play } from "lucide-react";
import { NextStepTree } from "../next-step-tree";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	getTargetOptions,
	getWritableFields,
	type ActionNodeConfig,
	type AutomationObjectType,
	type FieldDefinition,
	type ValueRef,
	type WorkflowNode,
} from "../../../lib/node-types";
import type { ConfigPanelProps } from "../automation-sidebar";
import { ConfigPanelHeader } from "./config-panel-header";

function defaultConfig(objectType: AutomationObjectType): ActionNodeConfig {
	const firstWritable = getWritableFields(objectType)[0];
	return {
		kind: "action",
		action: {
			type: "update_field",
			target: "self",
			field: firstWritable?.key ?? "",
			value: { kind: "static", value: firstWritable?.type === "boolean" ? false : null },
		},
	};
}

function ValueInput({
	field,
	value,
	onChange,
}: {
	field: FieldDefinition;
	value: ValueRef | undefined;
	onChange: (value: ValueRef) => void;
}) {
	const staticValue = value?.kind === "static" ? value.value : null;

	if (field.type === "boolean") {
		return (
			<Select
				value={staticValue === true ? "true" : "false"}
				onValueChange={(v) => onChange({ kind: "static", value: v === "true" })}
			>
				<SelectTrigger className="mt-2">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="true">True</SelectItem>
					<SelectItem value="false">False</SelectItem>
				</SelectContent>
			</Select>
		);
	}

	if (field.type === "select" && field.options) {
		return (
			<Select
				value={typeof staticValue === "string" ? staticValue : ""}
				onValueChange={(v) => onChange({ kind: "static", value: v })}
			>
				<SelectTrigger className="mt-2">
					<SelectValue placeholder="Select value" />
				</SelectTrigger>
				<SelectContent>
					{field.options.map((opt) => (
						<SelectItem key={opt.value} value={opt.value}>
							{opt.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		);
	}

	if (field.type === "number" || field.type === "currency") {
		return (
			<input
				type="number"
				className="mt-2 w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
				value={typeof staticValue === "number" ? staticValue : ""}
				onChange={(e) =>
					onChange({ kind: "static", value: e.target.value === "" ? null : Number(e.target.value) })
				}
			/>
		);
	}

	if (field.type === "date") {
		const dateValue =
			typeof staticValue === "number"
				? new Date(staticValue).toISOString().slice(0, 10)
				: "";
		return (
			<input
				type="date"
				className="mt-2 w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
				value={dateValue}
				onChange={(e) => {
					const ms = e.target.value ? new Date(e.target.value).getTime() : null;
					onChange({ kind: "static", value: ms });
				}}
			/>
		);
	}

	return (
		<input
			type="text"
			className="mt-2 w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
			value={typeof staticValue === "string" ? staticValue : String(staticValue ?? "")}
			onChange={(e) => onChange({ kind: "static", value: e.target.value })}
			placeholder="Value"
		/>
	);
}

export function ActionConfigPanel({
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

	if (!nodeId || !node || node.type !== "action") {
		return (
			<div className="text-sm text-muted-foreground">
				This action could not be found.
			</div>
		);
	}

	const triggerObjectType: AutomationObjectType = trigger?.objectType || "quote";
	const targetOptions = getTargetOptions(triggerObjectType);
	const config =
		(node.config as ActionNodeConfig | undefined) ?? defaultConfig(triggerObjectType);

	if (config.action.type !== "update_field") {
		// Only update_field is offered in the Slice 1 UI; other action kinds
		// are read-only until Slice 3 lands support for them.
		return (
			<div className="flex flex-col h-full">
				<ConfigPanelHeader
					icon={Play}
					iconBgColor="bg-green-50 dark:bg-green-950/40"
					iconFgColor="text-green-600 dark:text-green-400"
					categoryBadge="Actions"
					nodeTypeName="Action"
				/>
				<div className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
					This action type isn&apos;t editable yet. Delete and recreate this
					step to use an Update Record action.
				</div>
				{onDeleteNode && (
					<div className="pt-4 border-t border-border mt-4">
						<button
							type="button"
							className="text-destructive hover:bg-destructive/10 flex items-center gap-2 px-3 py-2 rounded-md transition-colors w-full"
							onClick={() => onDeleteNode(nodeId)}
							aria-label="Delete step"
						>
							<Trash2 className="h-4 w-4" />
							<span className="text-sm font-medium">Delete Node</span>
						</button>
					</div>
				)}
			</div>
		);
	}

	const action = config.action;
	const targetValue =
		typeof action.target === "string" ? action.target : action.target.related;
	const targetObjectType =
		targetOptions.find((t) => t.value === targetValue)?.objectType ??
		triggerObjectType;
	const writableFields = getWritableFields(targetObjectType);
	const fieldDef = writableFields.find((f) => f.key === action.field);

	const commit = (next: ActionNodeConfig) => {
		onNodeChange(nodeId, { config: next } as Partial<WorkflowNode>);
	};

	const updateTarget = (value: string) => {
		const nextTarget = targetOptions.find((t) => t.value === value);
		if (!nextTarget) return;
		const nextWritable = getWritableFields(nextTarget.objectType);
		commit({
			...config,
			action: {
				...action,
				target: value === "self" ? "self" : { related: nextTarget.objectType },
				field: nextWritable[0]?.key ?? "",
				value: { kind: "static", value: nextWritable[0]?.type === "boolean" ? false : null },
			},
		});
	};

	const updateField = (field: string) => {
		const nextField = writableFields.find((f) => f.key === field);
		commit({
			...config,
			action: {
				...action,
				field,
				value: { kind: "static", value: nextField?.type === "boolean" ? false : null },
			},
		});
	};

	const updateValue = (value: typeof action.value) => {
		commit({ ...config, action: { ...action, value } });
	};

	return (
		<div className="flex flex-col h-full">
			<ConfigPanelHeader
				icon={Play}
				iconBgColor="bg-green-50 dark:bg-green-950/40"
				iconFgColor="text-green-600 dark:text-green-400"
				categoryBadge="Actions"
				nodeTypeName="Update Record"
			/>

			<div className="flex-1">
				<div className="border-b border-border py-4">
					<Label className="text-sm font-medium">Target</Label>
					<Select value={targetValue} onValueChange={updateTarget}>
						<SelectTrigger className="mt-2">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{targetOptions.map((target) => (
								<SelectItem key={target.value} value={target.value}>
									{target.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="border-b border-border py-4">
					<Label className="text-sm font-medium">Field</Label>
					<Select value={action.field} onValueChange={updateField}>
						<SelectTrigger className="mt-2">
							<SelectValue placeholder="Select field" />
						</SelectTrigger>
						<SelectContent>
							{writableFields.map((field) => (
								<SelectItem key={field.key} value={field.key}>
									{field.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				{fieldDef && (
					<div className="border-b border-border py-4">
						<Label className="text-sm font-medium">Set value to</Label>
						<ValueInput field={fieldDef} value={action.value} onChange={updateValue} />
					</div>
				)}
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

			{/* Delete button */}
			{onDeleteNode && (
				<div className="pt-4 border-t border-border mt-2">
					<button
						type="button"
						className="text-destructive hover:bg-destructive/10 flex items-center gap-2 px-3 py-2 rounded-md transition-colors w-full"
						onClick={() => onDeleteNode(nodeId)}
						aria-label="Delete step"
					>
						<Trash2 className="h-4 w-4" />
						<span className="text-sm font-medium">Delete Node</span>
					</button>
				</div>
			)}
		</div>
	);
}
