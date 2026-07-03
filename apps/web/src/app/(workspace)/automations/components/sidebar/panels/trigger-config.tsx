"use client";

import React from "react";
import { Zap, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { NextStepTree } from "../next-step-tree";
import { TRIGGER_NODE_ID } from "../../../lib/flow-adapter";
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
import { UNSUPPORTED_TRIGGER_TYPE } from "../../../lib/legacy-load";
import type { ConfigPanelProps } from "../automation-sidebar";
import { ConfigPanelHeader } from "./config-panel-header";
import {
	DeleteStepButton,
	PanelField,
	PanelSection,
} from "./panel-primitives";

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
	const isUnsupported = triggerType === UNSUPPORTED_TRIGGER_TYPE;

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
				{isUnsupported && (
					<div className="mb-2 flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 px-3 py-2.5">
						<TriangleAlert className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
						<p className="text-xs text-amber-800 dark:text-amber-300">
							This automation used an email-received trigger, which is no
							longer supported. Choose a different trigger event to keep it
							running.
						</p>
					</div>
				)}

				<PanelSection title="Inputs">
					<PanelField label="Trigger event">
						<Select
							value={isUnsupported ? "" : triggerType}
							onValueChange={handleTriggerTypeChange}
						>
							<SelectTrigger>
								<SelectValue placeholder="Choose an event" />
							</SelectTrigger>
							<SelectContent>
								{TRIGGER_TYPE_OPTIONS.map((t) => (
									<SelectItem
										key={t.value}
										value={t.value}
										disabled={t.comingSoon}
									>
										<span className="flex items-center gap-2">
											{t.label}
											{t.comingSoon && (
												<span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
													Soon
												</span>
											)}
										</span>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</PanelField>

					<PanelField label="Object type">
						<Select value={objectType} onValueChange={handleObjectTypeChange}>
							<SelectTrigger>
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
					</PanelField>

					{triggerType === "status_changed" && (
						<>
							<PanelField label="Changes from">
								<Select
									value={currentTrigger.fromStatus || "any"}
									onValueChange={(value) =>
										onTriggerChange({
											...currentTrigger,
											fromStatus: value === "any" ? undefined : value,
										})
									}
								>
									<SelectTrigger>
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
							</PanelField>

							<PanelField label="To">
								<Select
									value={currentTrigger.toStatus || ""}
									onValueChange={(value) =>
										onTriggerChange({ ...currentTrigger, toStatus: value })
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
							</PanelField>
						</>
					)}

					{triggerType === "record_updated" && (
						<PanelField
							label="Watch fields (optional)"
							helper="Leave empty to trigger on any field change."
						>
							<div className="flex flex-wrap gap-1.5">
								{filterableFields.map((field) => {
									const active = (currentTrigger.fields ?? []).includes(
										field.key
									);
									return (
										<button
											key={field.key}
											type="button"
											onClick={() => toggleField(field.key)}
											aria-pressed={active}
											className={cn(
												"px-2.5 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer",
												"focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none",
												active
													? "bg-primary/10 border-primary text-primary"
													: "bg-muted text-muted-foreground border-border hover:bg-accent hover:text-foreground"
											)}
										>
											{field.label}
										</button>
									);
								})}
							</div>
						</PanelField>
					)}
				</PanelSection>

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

			{onDeleteTrigger && (
				<DeleteStepButton label="Delete trigger" onDelete={onDeleteTrigger} />
			)}
		</div>
	);
}
