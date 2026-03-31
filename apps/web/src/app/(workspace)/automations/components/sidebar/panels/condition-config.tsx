"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { FIELD_OPTIONS, type ConditionConfig } from "../../../lib/node-types";
import type { ConfigPanelProps } from "../automation-sidebar";

const OPERATOR_OPTIONS = [
	{ value: "equals", label: "equals" },
	{ value: "not_equals", label: "does not equal" },
	{ value: "contains", label: "contains" },
	{ value: "exists", label: "exists" },
	{ value: "greater_than", label: "is greater than" },
	{ value: "less_than", label: "is less than" },
	{ value: "is_true", label: "is true" },
	{ value: "is_false", label: "is false" },
	{ value: "before", label: "is before" },
	{ value: "after", label: "is after" },
] as const;

export function ConditionConfigPanel({
	nodeId,
	trigger,
	nodes,
	onNodeChange,
	onDeleteNode,
}: ConfigPanelProps) {
	const node = nodeId ? nodes.find((item) => item.id === nodeId) : undefined;

	if (!nodeId || !node || node.type !== "condition") {
		return (
			<div className="text-sm text-muted-foreground">
				This condition could not be found.
			</div>
		);
	}

	const triggerObjectType = trigger?.objectType || "quote";
	const fieldOptions = FIELD_OPTIONS[triggerObjectType] || [];
	const currentCondition =
		(node.config as ConditionConfig | undefined) ||
		node.condition || {
			field: fieldOptions[0]?.value || "status",
			operator: "equals" as const,
			value: "",
		};

	const shouldHideValue =
		currentCondition.operator === "exists" ||
		currentCondition.operator === "is_true" ||
		currentCondition.operator === "is_false";

	const updateCondition = (updates: Partial<ConditionConfig>) => {
		onNodeChange(nodeId, {
			config: {
				...currentCondition,
				...updates,
			},
		});
	};

	return (
		<div className="flex flex-col h-full">
			<div className="flex-1 space-y-6">
				<div className="space-y-2">
					<Label className="text-sm font-medium">If field</Label>
					<Select
						value={currentCondition.field}
						onValueChange={(value) => updateCondition({ field: value })}
					>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{fieldOptions.map((field) => (
								<SelectItem key={field.value} value={field.value}>
									{field.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="space-y-2">
					<Label className="text-sm font-medium">Operator</Label>
					<Select
						value={currentCondition.operator}
						onValueChange={(value) =>
							updateCondition({
								operator: value as ConditionConfig["operator"],
								value: ["exists", "is_true", "is_false"].includes(value)
									? ""
									: currentCondition.value,
							})
						}
					>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{OPERATOR_OPTIONS.map((operator) => (
								<SelectItem key={operator.value} value={operator.value}>
									{operator.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				{!shouldHideValue && (
					<div className="space-y-2">
						<Label className="text-sm font-medium">Value</Label>
						<Input
							value={String(currentCondition.value ?? "")}
							onChange={(event) =>
								updateCondition({ value: event.target.value })
							}
							placeholder="Enter value"
						/>
					</div>
				)}
			</div>

			{onDeleteNode && (
				<div className="pt-6 border-t border-border mt-6">
					<Button
						intent="destructive"
						className="w-full"
						onPress={() => onDeleteNode(nodeId)}
					>
						<Trash2 className="h-4 w-4 mr-2" />
						Delete Node
					</Button>
				</div>
			)}
		</div>
	);
}
