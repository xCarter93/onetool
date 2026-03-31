"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	TARGET_OPTIONS,
	type ActionConfig,
} from "../../../lib/node-types";
import { STATUS_OPTIONS } from "../../trigger-node";
import type { ConfigPanelProps } from "../automation-sidebar";

export function ActionConfigPanel({
	nodeId,
	trigger,
	nodes,
	onNodeChange,
	onDeleteNode,
}: ConfigPanelProps) {
	const node = nodeId ? nodes.find((item) => item.id === nodeId) : undefined;

	if (!nodeId || !node || node.type !== "action") {
		return (
			<div className="text-sm text-muted-foreground">
				This action could not be found.
			</div>
		);
	}

	const triggerObjectType = trigger?.objectType || "quote";
	const targetOptions = TARGET_OPTIONS[triggerObjectType] || [];
	const statusOptionsFor = (targetType: string) => {
		const selectedTarget = targetOptions.find((item) => item.value === targetType);
		return STATUS_OPTIONS[selectedTarget?.type || triggerObjectType] || [];
	};

	const rawAction =
		(node.config as ActionConfig | undefined) ||
		node.action;
	const currentAction: ActionConfig = rawAction
		? {
				...rawAction,
				actionType:
					rawAction.actionType === "update_status"
						? "update_field"
						: rawAction.actionType,
			}
		: {
				targetType: "self",
				actionType: "update_field",
				newStatus: statusOptionsFor("self")[0]?.value || "",
			};

	const isStatusUpdateAction = currentAction.actionType === "update_field";

	const updateAction = (updates: Partial<ActionConfig>) => {
		const nextConfig: ActionConfig = {
			...currentAction,
			...updates,
		};
		onNodeChange(nodeId, {
			config: nextConfig,
		});
	};

	const statusOptions = statusOptionsFor(currentAction.targetType || "self");

	return (
		<div className="flex flex-col h-full">
			<div className="flex-1 space-y-6">
				<div className="space-y-2">
					<Label className="text-sm font-medium">
						{isStatusUpdateAction ? "Update record" : "Action"}
					</Label>
					<div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
						{isStatusUpdateAction
							? "Update Record"
							: currentAction.actionType === "send_notification"
								? "Send Notification"
								: "Create Record"}
					</div>
				</div>

				{isStatusUpdateAction ? (
					<>
						<div className="space-y-2">
							<Label className="text-sm font-medium">Target</Label>
							<Select
								value={currentAction.targetType}
								onValueChange={(value) => {
									const nextStatuses = statusOptionsFor(value);
									updateAction({
										targetType: value as ActionConfig["targetType"],
										actionType: "update_field",
										newStatus:
											nextStatuses.find(
												(status) => status.value === currentAction.newStatus
											)?.value || nextStatuses[0]?.value || "",
									});
								}}
							>
								<SelectTrigger>
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

						<div className="space-y-2">
							<Label className="text-sm font-medium">Set status to</Label>
							<Select
								value={currentAction.newStatus || ""}
								onValueChange={(value) =>
									updateAction({
										actionType: "update_field",
										newStatus: value,
									})
								}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select status" />
								</SelectTrigger>
								<SelectContent>
									{statusOptions.map((status) => (
										<SelectItem key={status.value} value={status.value}>
											{status.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</>
				) : (
					<div className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
						Detailed configuration for this action type is coming in a future
						update.
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
