"use client";

import React from "react";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { TIMEZONES, browserTimezone } from "@/lib/timezones";
import { TRIGGER_NODE_ID } from "../../../lib/flow-adapter";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import ComboBox from "@/components/ui/combo-box";
import {
	DEFAULT_SCHEDULE_TIME,
	TRIGGERABLE_OBJECT_TYPE_OPTIONS,
	TRIGGER_TYPE_OPTIONS,
	describeSchedule,
	getFilterableFields,
	getStatusOptions,
	triggerScopeObjectType,
	validateSchedule,
	type TriggerableObjectType,
	type AutomationSchedule,
	type TriggerConfig,
	type TriggerType,
} from "../../../lib/node-types";
import type { ConfigPanelProps } from "../automation-sidebar";
import type { WorkflowNode } from "../../../lib/node-types";
import { ConfigPanelHeader } from "./config-panel-header";
import {
	DeleteStepButton,
	PanelField,
	PanelSection,
} from "./panel-primitives";
import { FilterGroupsEditor } from "./filter-groups-editor";
import { ConditionSentenceSummary } from "./condition-sentence-summary";

const WEEKDAY_OPTIONS = [
	{ value: "0", label: "Sunday" },
	{ value: "1", label: "Monday" },
	{ value: "2", label: "Tuesday" },
	{ value: "3", label: "Wednesday" },
	{ value: "4", label: "Thursday" },
	{ value: "5", label: "Friday" },
	{ value: "6", label: "Saturday" },
];

function ordinal(n: number): string {
	const rem100 = n % 100;
	if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
	const suffix = { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";
	return `${n}${suffix}`;
}

const DAY_OF_MONTH_OPTIONS = Array.from({ length: 31 }, (_, i) => ({
	value: String(i + 1),
	label: `The ${ordinal(i + 1)}`,
}));

function defaultSchedule(): AutomationSchedule {
	return {
		frequency: "daily",
		timezone: browserTimezone(),
		time: DEFAULT_SCHEDULE_TIME,
	};
}

export function TriggerConfigPanel({
	trigger,
	nodes,
	formulas,
	onTriggerChange,
	onDeleteTrigger,
}: ConfigPanelProps) {
	// Captured once per mount: describeSchedule only needs a reference instant
	// for the timezone label, and render-time Date.now() violates purity rules.
	const [nowMs] = React.useState(() => Date.now());
	const currentTrigger: TriggerConfig = trigger || {
		type: "status_changed",
		objectType: "quote",
		toStatus: "",
	};
	const triggerType = currentTrigger.type || "status_changed";
	// A scheduled trigger has no record, so it has no object type. The fallback
	// only seeds the pickers for the record trigger types below.
	const objectType = triggerScopeObjectType(currentTrigger) ?? "quote";
	const statusOptions = getStatusOptions(objectType);
	const filterableFields = getFilterableFields(objectType);

	const handleTriggerTypeChange = (value: string) => {
		const newType = value as TriggerType;
		if (newType === "record_created" || newType === "record_updated") {
			onTriggerChange({ type: newType, objectType });
		} else if (newType === "scheduled") {
			onTriggerChange({
				type: "scheduled",
				schedule: currentTrigger.schedule ?? defaultSchedule(),
			});
		} else {
			const newStatusOptions = getStatusOptions(objectType);
			onTriggerChange({
				type: "status_changed",
				objectType,
				toStatus: newStatusOptions[0]?.value || "",
			});
		}
	};

	const schedule = currentTrigger.schedule;

	const updateSchedule = (patch: Partial<AutomationSchedule>) => {
		const base = schedule ?? defaultSchedule();
		onTriggerChange({
			...currentTrigger,
			schedule: { ...base, ...patch },
		});
	};

	const handleFrequencyChange = (value: string) => {
		const frequency = value as AutomationSchedule["frequency"];
		const base = schedule ?? defaultSchedule();
		onTriggerChange({
			...currentTrigger,
			schedule: {
				...base,
				frequency,
				dayOfWeek: frequency === "weekly" ? (base.dayOfWeek ?? 1) : undefined,
				dayOfMonth:
					frequency === "monthly" ? (base.dayOfMonth ?? 1) : undefined,
			},
		});
	};

	const handleObjectTypeChange = (value: string) => {
		const newObjType = value as TriggerableObjectType;
		const newStatusOptions = getStatusOptions(newObjType);
		if (currentTrigger.type === "scheduled") return;
		onTriggerChange({
			...currentTrigger,
			objectType: newObjType,
			fromStatus: undefined,
			toStatus:
				triggerType === "status_changed"
					? newStatusOptions[0]?.value || ""
					: undefined,
			fields: undefined,
			// Criteria reference the old object's fields — stale ones would
			// hard-block save with an unknown-field error.
			entryCriteria: undefined,
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
				<PanelSection title="Inputs">
					<PanelField label="Trigger event">
						<Select
							value={triggerType}
							onValueChange={(value) => value && handleTriggerTypeChange(value)}
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

					{triggerType !== "scheduled" && (
						<PanelField label="Object type">
							<Select
								value={objectType}
								onValueChange={(value) => value && handleObjectTypeChange(value)}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{TRIGGERABLE_OBJECT_TYPE_OPTIONS.map((type) => (
										<SelectItem key={type.value} value={type.value}>
											{type.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</PanelField>
					)}

					{triggerType === "status_changed" && (
						<>
							<PanelField label="Changes from">
								<Select
									value={currentTrigger.fromStatus || "any"}
									onValueChange={(value) =>
										onTriggerChange({
											...currentTrigger,
											fromStatus:
												!value || value === "any" ? undefined : value,
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
										value &&
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

					{triggerType === "scheduled" && (
						<>
							<PanelField label="Repeats">
								<Select
									value={schedule?.frequency ?? "daily"}
									onValueChange={(value) => value && handleFrequencyChange(value)}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="daily">Daily</SelectItem>
										<SelectItem value="weekly">Weekly</SelectItem>
										<SelectItem value="monthly">Monthly</SelectItem>
									</SelectContent>
								</Select>
							</PanelField>

							{schedule?.frequency === "weekly" && (
								<PanelField label="Day of week">
									<Select
										value={String(schedule.dayOfWeek ?? 1)}
										onValueChange={(value) =>
											updateSchedule({ dayOfWeek: Number(value) })
										}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{WEEKDAY_OPTIONS.map((day) => (
												<SelectItem key={day.value} value={day.value}>
													{day.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</PanelField>
							)}

							{schedule?.frequency === "monthly" && (
								<PanelField
									label="Day of month"
									helper={
										(schedule.dayOfMonth ?? 1) > 28
											? "Months without this day run on their last day."
											: undefined
									}
								>
									<Select
										value={String(schedule.dayOfMonth ?? 1)}
										onValueChange={(value) =>
											updateSchedule({ dayOfMonth: Number(value) })
										}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{DAY_OF_MONTH_OPTIONS.map((day) => (
												<SelectItem key={day.value} value={day.value}>
													{day.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</PanelField>
							)}

							<PanelField label="Time">
								<Input
									type="time"
									value={schedule?.time ?? DEFAULT_SCHEDULE_TIME}
									onChange={(e) => {
										// Clearing a native time input yields "" — keep the default
										// instead of saving an invalid empty time.
										updateSchedule({
											time: e.target.value || DEFAULT_SCHEDULE_TIME,
										});
									}}
								/>
							</PanelField>

							<PanelField label="Timezone">
								<ComboBox
									options={TIMEZONES}
									value={schedule?.timezone ?? ""}
									placeholder="Search timezones..."
									onSelect={(tz) => {
										if (tz) updateSchedule({ timezone: tz });
									}}
								/>
							</PanelField>

							{schedule && validateSchedule(schedule) === null && (
								<p className="text-xs text-muted-foreground">
									{describeSchedule(schedule, nowMs)}
								</p>
							)}
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

				{(triggerType === "status_changed" ||
					triggerType === "record_created" ||
					triggerType === "record_updated") && (
					<PanelSection title="Entry criteria">
						<p className="text-xs text-muted-foreground">
							Optional — only run when the record matches these conditions.
						</p>
						<FilterGroupsEditor
							objectType={objectType}
							groups={currentTrigger.entryCriteria?.groups ?? []}
							onChange={(groups) =>
								onTriggerChange({
									...currentTrigger,
									entryCriteria:
										groups.length > 0
											? {
													logic:
														currentTrigger.entryCriteria?.logic ?? "and",
													groups,
												}
											: undefined,
								})
							}
							topLevelLogic={{
								value: currentTrigger.entryCriteria?.logic ?? "and",
								onChange: (logic) =>
									onTriggerChange({
										...currentTrigger,
										entryCriteria: {
											logic,
											groups: currentTrigger.entryCriteria?.groups ?? [],
										},
									}),
							}}
							nodes={nodes.filter(
								(n): n is WorkflowNode => n.type !== "placeholder"
							)}
							trigger={currentTrigger}
							targetNodeId={TRIGGER_NODE_ID}
							formulas={formulas}
						/>
						{currentTrigger.entryCriteria && (
							<ConditionSentenceSummary
								prefix="Only runs when"
								logic={currentTrigger.entryCriteria.logic}
								groups={currentTrigger.entryCriteria.groups}
								objectType={objectType}
							/>
						)}
					</PanelSection>
				)}

				<div className="py-4 text-xs text-muted-foreground">
					Changes are saved automatically
				</div>
			</div>

			{onDeleteTrigger && (
				<DeleteStepButton label="Delete trigger" onDelete={onDeleteTrigger} />
			)}
		</div>
	);
}
