"use client";

import React from "react";
import { Trash2, GitBranch, Plus, X } from "lucide-react";
import { NextStepTree } from "../next-step-tree";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	MAX_CONDITION_GROUPS,
	MAX_RULES_PER_GROUP,
	VALUELESS_OPERATORS,
	getFieldDefinition,
	getFilterableFields,
	operatorsForField,
	type AutomationObjectType,
	type ConditionGroup,
	type ConditionNodeConfig,
	type ConditionRule,
	type FieldDefinition,
	type ValueRef,
	type WorkflowNode,
} from "../../../lib/node-types";
import type { ConfigPanelProps } from "../automation-sidebar";
import { ConfigPanelHeader } from "./config-panel-header";

const OPERATOR_LABELS: Record<string, string> = {
	equals: "equals",
	not_equals: "does not equal",
	contains: "contains",
	not_contains: "does not contain",
	is_empty: "is empty",
	is_not_empty: "is not empty",
	greater_than: "is greater than",
	less_than: "is less than",
	gte: "is at least",
	lte: "is at most",
	is_true: "is true",
	is_false: "is false",
	before: "is before",
	after: "is after",
};

function isValueless(operator: string): boolean {
	return (VALUELESS_OPERATORS as readonly string[]).includes(operator);
}

function defaultConfig(): ConditionNodeConfig {
	return { kind: "condition", logic: "and", groups: [{ logic: "and", rules: [] }] };
}

function emptyRule(field: string): ConditionRule {
	return { field, operator: "equals", value: { kind: "static", value: "" } };
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
	const staticValue = value?.kind === "static" ? value.value : "";

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
					onChange({ kind: "static", value: e.target.value === "" ? "" : Number(e.target.value) })
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
					const ms = e.target.value ? new Date(e.target.value).getTime() : "";
					onChange({ kind: "static", value: ms === "" ? "" : ms });
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
	const fields = getFilterableFields(objectType);
	const config = (node.config as ConditionNodeConfig | undefined) ?? defaultConfig();

	const commit = (next: ConditionNodeConfig) => {
		onNodeChange(nodeId, { config: next } as Partial<WorkflowNode>);
	};

	const updateGroup = (groupIndex: number, group: ConditionGroup) => {
		const groups = config.groups.map((g, i) => (i === groupIndex ? group : g));
		commit({ ...config, groups });
	};

	const updateRule = (groupIndex: number, ruleIndex: number, rule: ConditionRule) => {
		const group = config.groups[groupIndex];
		const rules = group.rules.map((r, i) => (i === ruleIndex ? rule : r));
		updateGroup(groupIndex, { ...group, rules });
	};

	const addRule = (groupIndex: number) => {
		const group = config.groups[groupIndex];
		if (group.rules.length >= MAX_RULES_PER_GROUP) return;
		const firstField = fields[0]?.key ?? "";
		updateGroup(groupIndex, { ...group, rules: [...group.rules, emptyRule(firstField)] });
	};

	const removeRule = (groupIndex: number, ruleIndex: number) => {
		const group = config.groups[groupIndex];
		updateGroup(groupIndex, {
			...group,
			rules: group.rules.filter((_, i) => i !== ruleIndex),
		});
	};

	const addGroup = () => {
		if (config.groups.length >= MAX_CONDITION_GROUPS) return;
		commit({
			...config,
			groups: [...config.groups, { logic: "and", rules: [] }],
		});
	};

	const removeGroup = (groupIndex: number) => {
		commit({ ...config, groups: config.groups.filter((_, i) => i !== groupIndex) });
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

			<div className="flex-1 space-y-4">
				{config.groups.length > 1 && (
					<div className="flex items-center gap-2">
						<span className="text-xs text-muted-foreground">Match</span>
						<Select
							value={config.logic}
							onValueChange={(v) => commit({ ...config, logic: v as "and" | "or" })}
						>
							<SelectTrigger className="h-8 w-24">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="and">All</SelectItem>
								<SelectItem value="or">Any</SelectItem>
							</SelectContent>
						</Select>
						<span className="text-xs text-muted-foreground">groups</span>
					</div>
				)}

				{config.groups.map((group, groupIndex) => (
					<div key={groupIndex} className="rounded-md border border-border p-3 space-y-3">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								<span className="text-xs font-medium text-muted-foreground">
									{groupIndex === 0 ? "When" : "And when"}
								</span>
								{group.rules.length > 1 && (
									<Select
										value={group.logic}
										onValueChange={(v) =>
											updateGroup(groupIndex, { ...group, logic: v as "and" | "or" })
										}
									>
										<SelectTrigger className="h-7 w-20">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="and">All</SelectItem>
											<SelectItem value="or">Any</SelectItem>
										</SelectContent>
									</Select>
								)}
							</div>
							{config.groups.length > 1 && (
								<button
									type="button"
									onClick={() => removeGroup(groupIndex)}
									className="text-muted-foreground hover:text-destructive"
									aria-label="Remove group"
								>
									<X className="h-3.5 w-3.5" />
								</button>
							)}
						</div>

						{group.rules.map((rule, ruleIndex) => {
							const fieldDef = getFieldDefinition(objectType, rule.field);
							const operators = fieldDef ? operatorsForField(objectType, rule.field) : [];
							const needsValue = !isValueless(rule.operator);

							return (
								<div key={ruleIndex} className="flex items-start gap-2">
									<div className="flex-1 space-y-2">
										<Select
											value={rule.field}
											onValueChange={(field) => {
												const nextOperators = operatorsForField(objectType, field);
												updateRule(groupIndex, ruleIndex, {
													field,
													operator: nextOperators[0] ?? "equals",
													value: isValueless(nextOperators[0] ?? "equals")
														? undefined
														: { kind: "static", value: "" },
												});
											}}
										>
											<SelectTrigger>
												<SelectValue placeholder="Field" />
											</SelectTrigger>
											<SelectContent>
												{fields.map((f) => (
													<SelectItem key={f.key} value={f.key}>
														{f.label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>

										<Select
											value={rule.operator}
											onValueChange={(op) =>
												updateRule(groupIndex, ruleIndex, {
													...rule,
													operator: op as ConditionRule["operator"],
													value: isValueless(op) ? undefined : (rule.value ?? { kind: "static", value: "" }),
												})
											}
										>
											<SelectTrigger>
												<SelectValue placeholder="Operator" />
											</SelectTrigger>
											<SelectContent>
												{operators.map((op) => (
													<SelectItem key={op} value={op}>
														{OPERATOR_LABELS[op] ?? op}
													</SelectItem>
												))}
											</SelectContent>
										</Select>

										{needsValue && fieldDef && (
											<ValueInput
												field={fieldDef}
												value={rule.value}
												onChange={(value) =>
													updateRule(groupIndex, ruleIndex, { ...rule, value })
												}
											/>
										)}
									</div>
									<button
										type="button"
										onClick={() => removeRule(groupIndex, ruleIndex)}
										className="mt-2 text-muted-foreground hover:text-destructive"
										aria-label="Remove rule"
									>
										<X className="h-3.5 w-3.5" />
									</button>
								</div>
							);
						})}

						{group.rules.length < MAX_RULES_PER_GROUP && (
							<Button
								type="button"
								intent="outline"
								size="sm"
								onPress={() => addRule(groupIndex)}
								className="w-full gap-1.5"
							>
								<Plus className="h-3.5 w-3.5" /> Add rule
							</Button>
						)}
					</div>
				))}

				{config.groups.length < MAX_CONDITION_GROUPS && (
					<Button
						type="button"
						intent="outline"
						size="sm"
						onPress={addGroup}
						className="w-full gap-1.5"
					>
						<Plus className="h-3.5 w-3.5" /> Add group
					</Button>
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
