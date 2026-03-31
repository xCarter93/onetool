"use client";

import React from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	STATUS_OPTIONS,
	OBJECT_TYPES,
	TRIGGER_TYPE_OPTIONS,
	type TriggerConfig,
	type TriggerType,
} from "../../trigger-node";
import type { ConfigPanelProps } from "../automation-sidebar";

export function TriggerConfigPanel({
	trigger,
	onTriggerChange,
	onDeleteTrigger,
}: ConfigPanelProps) {
	const currentTrigger = trigger || {
		type: "status_changed" as TriggerType,
		objectType: "quote" as const,
		toStatus: "approved",
	};
	const triggerType = currentTrigger.type || "status_changed";
	const statusOptions = STATUS_OPTIONS[currentTrigger.objectType] || [];

	const handleTriggerTypeChange = (value: string) => {
		const newType = value as TriggerType;
		if (newType === "email_received") {
			onTriggerChange({ type: newType, objectType: "client" });
		} else if (newType === "scheduled") {
			onTriggerChange({
				type: newType,
				objectType: currentTrigger.objectType,
				schedule: {
					frequency: "daily",
					timezone:
						Intl.DateTimeFormat().resolvedOptions().timeZone,
				},
			});
		} else if (
			newType === "record_created" ||
			newType === "record_updated"
		) {
			onTriggerChange({
				type: newType,
				objectType: currentTrigger.objectType,
			});
		} else {
			const newStatusOptions =
				STATUS_OPTIONS[currentTrigger.objectType] || [];
			onTriggerChange({
				type: newType,
				objectType: currentTrigger.objectType,
				toStatus: newStatusOptions[0]?.value || "",
			});
		}
	};

	const handleObjectTypeChange = (value: string) => {
		const newObjType = value as TriggerConfig["objectType"];
		const newStatusOptions = STATUS_OPTIONS[newObjType] || [];
		onTriggerChange({
			...currentTrigger,
			objectType: newObjType,
			fromStatus: undefined,
			toStatus:
				triggerType === "status_changed"
					? newStatusOptions[0]?.value || ""
					: undefined,
		});
	};

	return (
		<div className="flex flex-col h-full">
			<div className="flex-1 space-y-6">
				{/* Trigger type selector */}
				<div className="space-y-2">
					<Label className="text-sm font-medium">Trigger event</Label>
					<Select
						value={triggerType}
						onValueChange={handleTriggerTypeChange}
					>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{TRIGGER_TYPE_OPTIONS.map((t) => (
								<SelectItem key={t.value} value={t.value}>
									{t.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				{/* Object type -- shown for all except scheduled */}
				{triggerType !== "scheduled" && (
					<div className="space-y-2">
						<Label className="text-sm font-medium">
							{triggerType === "email_received"
								? "From"
								: "Object type"}
						</Label>
						<Select
							value={currentTrigger.objectType}
							onValueChange={handleObjectTypeChange}
							disabled={triggerType === "email_received"}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{triggerType === "email_received" ? (
									<SelectItem value="client">
										Client
									</SelectItem>
								) : (
									OBJECT_TYPES.map((type) => (
										<SelectItem
											key={type.value}
											value={type.value}
										>
											{type.label}
										</SelectItem>
									))
								)}
							</SelectContent>
						</Select>
					</div>
				)}

				{/* Status change-specific fields */}
				{triggerType === "status_changed" && (
					<>
						<div className="space-y-2">
							<Label className="text-sm font-medium">
								Changes from
							</Label>
							<Select
								value={currentTrigger.fromStatus || "any"}
								onValueChange={(value) =>
									onTriggerChange({
										...currentTrigger,
										fromStatus:
											value === "any"
												? undefined
												: value,
									})
								}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="any">
										Any status
									</SelectItem>
									{statusOptions.map((status) => (
										<SelectItem
											key={status.value}
											value={status.value}
										>
											{status.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-2">
							<Label className="text-sm font-medium">To</Label>
							<Select
								value={currentTrigger.toStatus || ""}
								onValueChange={(value) =>
									onTriggerChange({
										...currentTrigger,
										toStatus: value,
									})
								}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select status" />
								</SelectTrigger>
								<SelectContent>
									{statusOptions.map((status) => (
										<SelectItem
											key={status.value}
											value={status.value}
										>
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
					<div className="space-y-2">
						<Label className="text-sm font-medium">
							Field (optional)
						</Label>
						<Input
							value={currentTrigger.field || ""}
							onChange={(e) =>
								onTriggerChange({
									...currentTrigger,
									field: e.target.value || undefined,
								})
							}
							placeholder="Any field"
						/>
						<p className="text-xs text-muted-foreground">
							Leave blank to trigger on any field change
						</p>
					</div>
				)}

				{/* Scheduled -- frequency picker */}
				{triggerType === "scheduled" && (
					<>
						<div className="space-y-2">
							<Label className="text-sm font-medium">
								Frequency
							</Label>
							<Select
								value={
									currentTrigger.schedule?.frequency ||
									"daily"
								}
								onValueChange={(value) =>
									onTriggerChange({
										...currentTrigger,
										schedule: {
											...currentTrigger.schedule!,
											frequency: value as
												| "daily"
												| "weekly"
												| "monthly",
										},
									})
								}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="daily">Daily</SelectItem>
									<SelectItem value="weekly">
										Weekly
									</SelectItem>
									<SelectItem value="monthly">
										Monthly
									</SelectItem>
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-2">
							<Label className="text-sm font-medium">Time</Label>
							<Input
								type="time"
								value={
									currentTrigger.schedule?.time || "09:00"
								}
								onChange={(e) =>
									onTriggerChange({
										...currentTrigger,
										schedule: {
											...currentTrigger.schedule!,
											time: e.target.value,
										},
									})
								}
							/>
						</div>

						<div className="space-y-2">
							<Label className="text-sm font-medium">Timezone</Label>
							<Input
								value={
									currentTrigger.schedule?.timezone ||
									Intl.DateTimeFormat().resolvedOptions().timeZone
								}
								onChange={(e) =>
									onTriggerChange({
										...currentTrigger,
										schedule: {
											...currentTrigger.schedule!,
											timezone: e.target.value,
										},
									})
								}
								placeholder="America/New_York"
							/>
						</div>
					</>
				)}

				<div className="pt-4 text-xs text-muted-foreground">
					Changes are saved automatically
				</div>
			</div>

			{/* Delete trigger */}
			{onDeleteTrigger && (
				<div className="pt-6 border-t border-border mt-6">
					<Button
						intent="destructive"
						className="w-full"
						onPress={onDeleteTrigger}
					>
						<Trash2 className="h-4 w-4 mr-2" />
						Delete Trigger
					</Button>
				</div>
			)}
		</div>
	);
}
