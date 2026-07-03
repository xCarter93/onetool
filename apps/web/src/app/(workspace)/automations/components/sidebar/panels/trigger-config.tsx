"use client";

import React from "react";
import { Trash2, Zap } from "lucide-react";
import { NextStepTree } from "../next-step-tree";
import { TRIGGER_NODE_ID } from "../../../lib/flow-adapter";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	OBJECT_TYPE_OPTIONS,
	TRIGGER_TYPE_OPTIONS,
	getFilterableFields,
	getStatusOptions,
	type AutomationObjectType,
	type TriggerConfig,
	type TriggerType,
} from "../../../lib/node-types";
import type { ConfigPanelProps } from "../automation-sidebar";
import { ConfigPanelHeader } from "./config-panel-header";

export function TriggerConfigPanel({
	trigger,
	onTriggerChange,
	onDeleteTrigger,
	onNavigateToNode,
	rfNodes,
	rfEdges,
}: ConfigPanelProps) {
	const currentTrigger: TriggerConfig = trigger || {
		type: "status_changed",
		objectType: "quote",
		toStatus: "",
	};
	const triggerType = currentTrigger.type || "status_changed";
	const objectType = currentTrigger.objectType || "quote";
	const statusOptions = getStatusOptions(objectType);
	const filterableFields = getFilterableFields(objectType);

	const handleTriggerTypeChange = (value: string) => {
		const newType = value as TriggerType;
		if (newType === "record_created" || newType === "record_updated") {
			onTriggerChange({ type: newType, objectType });
		} else {
			const newStatusOptions = getStatusOptions(objectType);
			onTriggerChange({
				type: "status_changed",
				objectType,
				toStatus: newStatusOptions[0]?.value || "",
			});
		}
	};

	const handleObjectTypeChange = (value: string) => {
		const newObjType = value as AutomationObjectType;
		const newStatusOptions = getStatusOptions(newObjType);
		onTriggerChange({
			...currentTrigger,
			objectType: newObjType,
			fromStatus: undefined,
			toStatus:
				triggerType === "status_changed"
					? newStatusOptions[0]?.value || ""
					: undefined,
			fields: undefined,
		});
	};

	const toggleField = (field: string) => {
		const current = currentTrigger.fields ?? [];
		const next = current.includes(field)
			? current.filter((f) => f !== field)
			: [...current, field];
		onTriggerChange({ ...currentTrigger, fields: next });
	};

	return (
		<div className="flex flex-col h-full">
			<ConfigPanelHeader
				icon={Zap}
				iconBgColor="bg-amber-50 dark:bg-amber-950/40"
				iconFgColor="text-amber-600 dark:text-amber-400"
				categoryBadge="Triggers"
				nodeTypeName="Trigger"
			/>

			<div className="flex-1">
				{/* Trigger type selector */}
				<div className="border-b border-border py-4">
					<Label className="text-sm font-medium">Trigger event</Label>
					<Select value={triggerType} onValueChange={handleTriggerTypeChange}>
						<SelectTrigger className="mt-2">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{TRIGGER_TYPE_OPTIONS.map((t) => (
								<SelectItem key={t.value} value={t.value} disabled={t.comingSoon}>
									{t.label}
									{t.comingSoon ? " (Soon)" : ""}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				{/* Object type */}
				<div className="border-b border-border py-4">
					<Label className="text-sm font-medium">Object type</Label>
					<Select value={objectType} onValueChange={handleObjectTypeChange}>
						<SelectTrigger className="mt-2">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{OBJECT_TYPE_OPTIONS.map((type) => (
								<SelectItem key={type.value} value={type.value}>
									{type.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				{/* Status change-specific fields */}
				{triggerType === "status_changed" && (
					<>
						<div className="border-b border-border py-4">
							<Label className="text-sm font-medium">Changes from</Label>
							<Select
								value={currentTrigger.fromStatus || "any"}
								onValueChange={(value) =>
									onTriggerChange({
										...currentTrigger,
										fromStatus: value === "any" ? undefined : value,
									})
								}
							>
								<SelectTrigger className="mt-2">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="any">Any status</SelectItem>
									{statusOptions.map((status) => (
										<SelectItem key={status.value} value={status.value}>
											{status.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="border-b border-border py-4">
							<Label className="text-sm font-medium">To</Label>
							<Select
								value={currentTrigger.toStatus || ""}
								onValueChange={(value) =>
									onTriggerChange({ ...currentTrigger, toStatus: value })
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
				)}

				{/* Record updated -- optional field filter */}
				{triggerType === "record_updated" && (
					<div className="border-b border-border py-4">
						<Label className="text-sm font-medium">
							Fields (optional)
						</Label>
						<div className="mt-2 flex flex-wrap gap-1.5">
							{filterableFields.map((field) => {
								const active = (currentTrigger.fields ?? []).includes(field.key);
								return (
									<button
										key={field.key}
										type="button"
										onClick={() => toggleField(field.key)}
										className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
											active
												? "bg-primary/10 border-primary text-primary"
												: "bg-muted text-muted-foreground border-border hover:bg-accent"
										}`}
									>
										{field.label}
									</button>
								);
							})}
						</div>
						<p className="text-xs text-muted-foreground mt-2">
							Leave empty to trigger on any field change
						</p>
					</div>
				)}

				<div className="py-4 text-xs text-muted-foreground">
					Changes are saved automatically
				</div>
			</div>

			{/* Next steps tree */}
			{rfNodes && rfEdges && onNavigateToNode && (
				<div className="border-t border-border pt-4 mt-2">
					<NextStepTree
						currentNodeId={TRIGGER_NODE_ID}
						nodes={rfNodes}
						edges={rfEdges}
						onNavigateToNode={onNavigateToNode}
					/>
				</div>
			)}

			{/* Delete trigger */}
			{onDeleteTrigger && (
				<div className="pt-4 border-t border-border mt-2">
					<button
						type="button"
						className="text-destructive hover:bg-destructive/10 flex items-center gap-2 px-3 py-2 rounded-md transition-colors w-full"
						onClick={onDeleteTrigger}
						aria-label="Delete step"
					>
						<Trash2 className="h-4 w-4" />
						<span className="text-sm font-medium">Delete Trigger</span>
					</button>
				</div>
			)}
		</div>
	);
}
