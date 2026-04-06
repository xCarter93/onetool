"use client";

import React from "react";
import { Trash2, Play } from "lucide-react";
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
import { ConfigPanelHeader } from "./config-panel-header";

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
			<ConfigPanelHeader
				icon={Play}
				iconBgColor="bg-green-50 dark:bg-green-950/40"
				iconFgColor="text-green-600 dark:text-green-400"
				categoryBadge="Actions"
				nodeTypeName="Update Record"
			/>

			<div className="flex-1">
				<div className="border-b border-border py-4">
					<Label className="text-sm font-medium">
						{isStatusUpdateAction ? "Update record" : "Action"}
					</Label>
					<div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm mt-2">
						{isStatusUpdateAction
							? "Update Record"
							: currentAction.actionType === "send_notification"
								? "Send Notification"
								: "Create Record"}
					</div>
				</div>

				{isStatusUpdateAction ? (
					<>
						<div className="border-b border-border py-4">
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
								<SelectTrigger className="mt-2">
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
					<div className="border-b border-border py-4">
						<div className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
							Detailed configuration for this action type is coming in a future
							update.
						</div>
					</div>
				)}
			</div>

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
