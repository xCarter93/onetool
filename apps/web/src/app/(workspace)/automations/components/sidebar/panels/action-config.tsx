"use client";

import React, { useRef } from "react";
import { useQuery } from "convex/react";
import { Info, Plus, X } from "lucide-react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { ACTION_META } from "../../../lib/action-meta";
import { normalizeNodeConfig } from "../../../lib/legacy-load";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	CREATABLE_OBJECT_TYPE_OPTIONS,
	MAX_DUE_IN_DAYS,
	OBJECT_TYPE_LABELS,
	RELATION_FIELD,
	USER_REF_RECIPIENT_FIELDS,
	getCreatableFields,
	getRequiredCreateFields,
	getTargetOptions,
	getWritableFields,
	type ActionNodeConfig,
	type AutomationObjectType,
	type TriggerableObjectType,
	type AutomationTrigger,
	type CreateRecordAction,
	type CreateTaskAction,
	type FormulaResource,
	type SendNotificationAction,
	type SendTeamMessageAction,
	type TriggerConfig,
	type UpdateFieldsAction,
	type WorkflowNode,
	triggerScopeObjectType,
} from "../../../lib/node-types";
import { getScopeObjectType } from "../../../lib/variables";
import type { ConfigPanelProps } from "../automation-sidebar";
import { ConfigPanelHeader } from "./config-panel-header";
import {
	DeleteStepButton,
	PanelField,
	PanelSection,
} from "./panel-primitives";
import { ValueInput, VariableInsertButton } from "./value-input";
import { PickerChip } from "./picker-chip";

function defaultConfig(objectType: AutomationObjectType): ActionNodeConfig {
	const firstWritable = getWritableFields(objectType)[0];
	return {
		kind: "action",
		action: {
			type: "update_fields",
			target: "self",
			fields: [
				{
					field: firstWritable?.key ?? "",
					value: {
						kind: "static",
						value: firstWritable?.type === "boolean" ? false : null,
					},
				},
			],
		},
	};
}


/** Splices `{{path}}` into a message string at the textarea's cursor position. */
function useMessageInsertion(message: string, onChange: (message: string) => void) {
	const ref = useRef<HTMLTextAreaElement>(null);

	const insert = (path: string) => {
		const token = `{{${path}}}`;
		const textarea = ref.current;
		if (!textarea) {
			onChange(`${message}${token}`);
			return;
		}
		const start = textarea.selectionStart ?? message.length;
		const end = textarea.selectionEnd ?? message.length;
		onChange(`${message.slice(0, start)}${token}${message.slice(end)}`);
		requestAnimationFrame(() => {
			textarea.focus();
			const cursor = start + token.length;
			textarea.setSelectionRange(cursor, cursor);
		});
	};

	return { ref, insert };
}

interface ActionFieldsProps<TAction> {
	config: ActionNodeConfig;
	action: TAction;
	nodes: WorkflowNode[];
	trigger: TriggerConfig | AutomationTrigger | null;
	nodeId: string;
	formulas?: FormulaResource[];
	commit: (next: ActionNodeConfig) => void;
}

function UpdateFieldsFields({
	config,
	action,
	triggerObjectType,
	nodes,
	trigger,
	nodeId,
	formulas,
	commit,
}: ActionFieldsProps<UpdateFieldsAction> & {
	triggerObjectType: TriggerableObjectType | null;
}) {
	// Inside a loop body, `target: "self"` (and its related FKs) resolve against
	// the loop's fetched item, not the trigger record — mirror the engine.
	const scope = getScopeObjectType(nodes, nodeId, triggerObjectType);
	const scopeObjectType = scope.objectType;

	// Both targets — self and related — resolve off the record in scope, so with
	// no record there is nothing this action can update. The engine hard-fails on
	// it, and save-time validation rejects it.
	if (!scopeObjectType) {
		return (
			<PanelSection title="Inputs">
				<p className="text-xs text-muted-foreground">
					This automation runs on a schedule, so there is no record to update.
					Add a Find records step and move this action inside a Loop.
				</p>
			</PanelSection>
		);
	}

	const targetOptions = getTargetOptions(scopeObjectType);
	const targetValue = typeof action.target === "string" ? action.target : action.target.related;
	const targetObjectType =
		targetOptions.find((t) => t.value === targetValue)?.objectType ?? scopeObjectType;
	const writableFields = getWritableFields(targetObjectType);
	const chosenFields = new Set(action.fields.map((row) => row.field));

	const commitAction = (next: UpdateFieldsAction) => {
		commit({ ...config, action: next });
	};

	const seedRow = (objectType: AutomationObjectType) => {
		const first = getWritableFields(objectType)[0];
		return {
			field: first?.key ?? "",
			value: {
				kind: "static" as const,
				value: first?.type === "boolean" ? false : null,
			},
		};
	};

	const updateTarget = (value: string) => {
		const nextTarget = targetOptions.find((t) => t.value === value);
		if (!nextTarget) return;
		// The rows name fields on the old target's type — reseed with one row.
		commitAction({
			...action,
			target: value === "self" ? "self" : { related: nextTarget.objectType },
			fields: [seedRow(nextTarget.objectType)],
		});
	};

	const updateRowField = (index: number, field: string) => {
		const nextField = writableFields.find((f) => f.key === field);
		commitAction({
			...action,
			fields: action.fields.map((row, i) =>
				i === index
					? {
							field,
							value: {
								kind: "static",
								value: nextField?.type === "boolean" ? false : null,
							},
						}
					: row
			),
		});
	};

	const updateRowValue = (
		index: number,
		value: UpdateFieldsAction["fields"][number]["value"]
	) => {
		commitAction({
			...action,
			fields: action.fields.map((row, i) =>
				i === index ? { ...row, value } : row
			),
		});
	};

	const addRow = () => {
		const nextField = writableFields.find((f) => !chosenFields.has(f.key));
		if (!nextField) return;
		commitAction({
			...action,
			fields: [
				...action.fields,
				{
					field: nextField.key,
					value: {
						kind: "static",
						value: nextField.type === "boolean" ? false : null,
					},
				},
			],
		});
	};

	const removeRow = (index: number) => {
		commitAction({
			...action,
			fields: action.fields.filter((_, i) => i !== index),
		});
	};

	return (
		<PanelSection title="Inputs">
			<PanelField
				label="Target"
				helper={
					targetValue === "self"
						? scope.inLoop
							? "Updates the current record in the loop."
							: undefined
						: scope.inLoop
							? `Updates the ${targetObjectType} linked to the current loop item.`
							: `Updates the ${targetObjectType} linked to the triggering ${scopeObjectType}.`
				}
			>
				<Select
					value={targetValue}
					onValueChange={(value) => value && updateTarget(value)}
				>
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{targetOptions.map((target) => (
							<SelectItem key={target.value} value={target.value}>
								{target.value === "self" && scope.inLoop
									? "Current loop item"
									: target.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</PanelField>

			<PanelField label="Fields">
				<div className="space-y-2">
					{action.fields.map((row, index) => {
						const fieldDef = writableFields.find((f) => f.key === row.field);
						return (
							<div key={index} className="flex items-start gap-2">
								<div className="flex-1 space-y-2">
									<Select
										value={row.field}
										onValueChange={(value) =>
											value && updateRowField(index, value)
										}
									>
										<SelectTrigger>
											{row.field ? (
												<PickerChip label={fieldDef?.label ?? row.field} />
											) : (
												<span className="truncate text-muted-foreground">
													Select field
												</span>
											)}
										</SelectTrigger>
										<SelectContent>
											{writableFields.map((field) => (
												<SelectItem
													key={field.key}
													value={field.key}
													disabled={
														field.key !== row.field &&
														chosenFields.has(field.key)
													}
												>
													{field.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>

									{fieldDef && (
										<ValueInput
											field={fieldDef}
											value={row.value}
											onChange={(value) => updateRowValue(index, value)}
											nodes={nodes}
											trigger={trigger}
											targetNodeId={nodeId}
											formulas={formulas}
										/>
									)}
								</div>
								{action.fields.length > 1 && (
									<button
										type="button"
										onClick={() => removeRow(index)}
										className="mt-2 text-muted-foreground hover:text-destructive"
										aria-label="Remove field"
									>
										<X className="h-3.5 w-3.5" />
									</button>
								)}
							</div>
						);
					})}

					{action.fields.length < writableFields.length && (
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={addRow}
							className="w-full gap-1.5 border-dashed text-muted-foreground hover:text-foreground"
						>
							<Plus className="h-3.5 w-3.5" /> Add field
						</Button>
					)}
				</div>
			</PanelField>
		</PanelSection>
	);
}

function CreateRecordFields({
	config,
	action,
	triggerObjectType,
	nodes,
	trigger,
	nodeId,
	formulas,
	commit,
}: ActionFieldsProps<CreateRecordAction> & {
	triggerObjectType: TriggerableObjectType | null;
}) {
	const objectType = action.objectType;
	const scope = getScopeObjectType(nodes, nodeId, triggerObjectType);
	const scopeObjectType = scope.objectType;

	const creatableFields = getCreatableFields(objectType);
	const requiredKeys = new Set(
		getRequiredCreateFields(objectType).map((f) => f.key)
	);

	// linkToScope is offered only when a record is in scope AND the new record
	// has a direct FK to that type (e.g. a project → its client).
	const linkFk = scopeObjectType
		? RELATION_FIELD[objectType]?.[scopeObjectType]
		: undefined;
	// The FK a live link fills is hidden from the field rows so it can't be
	// double-set.
	const linkedFk = action.linkToScope ? linkFk : undefined;
	const availableFields = creatableFields.filter((f) => f.key !== linkedFk);
	const chosenFields = new Set(action.fields.map((row) => row.field));

	const commitAction = (next: CreateRecordAction) => {
		commit({ ...config, action: next });
	};

	const defaultValueFor = (field?: { type: string }) => ({
		kind: "static" as const,
		value: field?.type === "boolean" ? false : null,
	});

	const seedRequiredRows = (nextType: AutomationObjectType) =>
		getRequiredCreateFields(nextType).map((f) => ({
			field: f.key,
			value: defaultValueFor(f),
		}));

	const updateObjectType = (value: string) => {
		const nextType = value as AutomationObjectType;
		if (nextType === objectType) return;
		// Rows name the old type's fields (and a link may no longer apply) —
		// reseed from scratch with the new type's required rows.
		commitAction({
			type: "create_record",
			objectType: nextType,
			fields: seedRequiredRows(nextType),
		});
	};

	const toggleLink = (on: boolean) => {
		if (on) {
			// The link supplies the FK; drop any manual row for it.
			const fields = linkFk
				? action.fields.filter((r) => r.field !== linkFk)
				: action.fields;
			commitAction({ ...action, linkToScope: true, fields });
			return;
		}
		// Turning off: restore an empty row for a required FK the link had covered.
		let fields = action.fields;
		if (
			linkFk &&
			requiredKeys.has(linkFk) &&
			!fields.some((r) => r.field === linkFk)
		) {
			fields = [
				...fields,
				{
					field: linkFk,
					value: defaultValueFor(creatableFields.find((f) => f.key === linkFk)),
				},
			];
		}
		commitAction({ type: "create_record", objectType, fields });
	};

	const updateRowField = (index: number, field: string) => {
		const nextField = creatableFields.find((f) => f.key === field);
		commitAction({
			...action,
			fields: action.fields.map((row, i) =>
				i === index ? { field, value: defaultValueFor(nextField) } : row
			),
		});
	};

	const updateRowValue = (
		index: number,
		value: CreateRecordAction["fields"][number]["value"]
	) => {
		commitAction({
			...action,
			fields: action.fields.map((row, i) =>
				i === index ? { ...row, value } : row
			),
		});
	};

	const addRow = () => {
		const nextField = availableFields.find((f) => !chosenFields.has(f.key));
		if (!nextField) return;
		commitAction({
			...action,
			fields: [
				...action.fields,
				{ field: nextField.key, value: defaultValueFor(nextField) },
			],
		});
	};

	const removeRow = (index: number) => {
		commitAction({
			...action,
			fields: action.fields.filter((_, i) => i !== index),
		});
	};

	return (
		<PanelSection title="Create">
			<PanelField
				label="Record type"
				helper="A brand-new record is created each time this step runs."
			>
				<Select
					value={objectType}
					onValueChange={(value) => value && updateObjectType(value)}
				>
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{CREATABLE_OBJECT_TYPE_OPTIONS.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</PanelField>

			{linkFk && scopeObjectType && (
				<PanelField
					label={`Link to ${OBJECT_TYPE_LABELS[scopeObjectType]}`}
					helper={
						scope.inLoop
							? `Sets the new ${OBJECT_TYPE_LABELS[objectType]}'s ${OBJECT_TYPE_LABELS[scopeObjectType]} to the current loop item.`
							: `Sets the new ${OBJECT_TYPE_LABELS[objectType]}'s ${OBJECT_TYPE_LABELS[scopeObjectType]} to the triggering ${OBJECT_TYPE_LABELS[scopeObjectType]}.`
					}
				>
					<Switch
						checked={!!action.linkToScope}
						aria-label={`Link the new ${OBJECT_TYPE_LABELS[objectType]} to the ${OBJECT_TYPE_LABELS[scopeObjectType]} in scope`}
						onCheckedChange={toggleLink}
					/>
				</PanelField>
			)}

			{action.linkToScope && !(linkFk && scopeObjectType) && (
				// linkToScope is on but the current scope has no matching FK (scope
				// changed after it was set) — keep it removable so it can't get stuck.
				<PanelField
					label="Link to record in scope"
					helper={`This step no longer has a matching record in scope to link the new ${OBJECT_TYPE_LABELS[objectType]} to. Turn it off to clear the stale link.`}
				>
					<Switch
						checked
						aria-label={`Clear the stale scope link on this new ${OBJECT_TYPE_LABELS[objectType]}`}
						onCheckedChange={() => toggleLink(false)}
					/>
				</PanelField>
			)}

			<PanelField label="Fields">
				<div className="space-y-2">
					{action.fields.map((row, index) => {
						const fieldDef = creatableFields.find((f) => f.key === row.field);
						const isRequired = requiredKeys.has(row.field);
						return (
							<div key={index} className="flex items-start gap-2">
								<div className="flex-1 space-y-2">
									<Select
										value={row.field}
										disabled={isRequired}
										onValueChange={(value) =>
											value && updateRowField(index, value)
										}
									>
										<SelectTrigger>
											{row.field ? (
												<PickerChip label={fieldDef?.label ?? row.field} />
											) : (
												<span className="truncate text-muted-foreground">
													Select field
												</span>
											)}
										</SelectTrigger>
										<SelectContent>
											{availableFields.map((field) => (
												<SelectItem
													key={field.key}
													value={field.key}
													disabled={
														field.key !== row.field &&
														chosenFields.has(field.key)
													}
												>
													{field.label}
													{requiredKeys.has(field.key) ? " *" : ""}
												</SelectItem>
											))}
										</SelectContent>
									</Select>

									{fieldDef && (
										<ValueInput
											field={fieldDef}
											value={row.value}
											onChange={(value) => updateRowValue(index, value)}
											nodes={nodes}
											trigger={trigger}
											targetNodeId={nodeId}
											formulas={formulas}
										/>
									)}
								</div>
								{!isRequired && (
									<button
										type="button"
										onClick={() => removeRow(index)}
										className="mt-2 text-muted-foreground hover:text-destructive"
										aria-label="Remove field"
									>
										<X className="h-3.5 w-3.5" />
									</button>
								)}
							</div>
						);
					})}

					{action.fields.length < availableFields.length && (
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={addRow}
							className="w-full gap-1.5 border-dashed text-muted-foreground hover:text-foreground"
						>
							<Plus className="h-3.5 w-3.5" /> Add field
						</Button>
					)}
				</div>
			</PanelField>
		</PanelSection>
	);
}

function CreateTaskFields({
	config,
	action,
	nodes,
	trigger,
	nodeId,
	formulas,
	commit,
}: ActionFieldsProps<CreateTaskAction>) {
	// api.users.listByOrg — the same org-member query the task sheet's
	// assignee picker uses (apps/web/src/components/shared/task-sheet.tsx).
	const members = useQuery(api.users.listByOrg);

	const update = (patch: Partial<CreateTaskAction>) => {
		commit({ ...config, action: { ...action, ...patch } });
	};

	return (
		<PanelSection title="Inputs">
			<PanelField label="Title">
				<ValueInput
					field={{ type: "text" }}
					value={action.title}
					onChange={(title) => update({ title })}
					nodes={nodes}
					trigger={trigger}
					targetNodeId={nodeId}
					formulas={formulas}
					placeholder="Task title"
				/>
			</PanelField>

			<PanelField label="Description" helper="Optional.">
				<ValueInput
					field={{ type: "text" }}
					value={action.description}
					onChange={(description) => update({ description })}
					nodes={nodes}
					trigger={trigger}
					targetNodeId={nodeId}
					formulas={formulas}
					placeholder="Add more detail"
				/>
			</PanelField>

			<PanelField label="Due in" helper="Days from when this step runs — 0 = same day.">
				<Input
					type="number"
					min={0}
					max={MAX_DUE_IN_DAYS}
					value={action.dueInDays ?? 0}
					onChange={(e) =>
						update({
							dueInDays:
								e.target.value === ""
									? 0
									: Math.min(
											MAX_DUE_IN_DAYS,
											Math.max(0, Math.floor(Number(e.target.value)) || 0)
										),
						})
					}
				/>
			</PanelField>

			<div className="flex items-center justify-between gap-3">
				<div className="space-y-0.5">
					<Label htmlFor="create-task-link-toggle" className="text-sm font-medium">
						Link to record
					</Label>
					<p className="text-xs text-muted-foreground">
						Attach the task to the record&apos;s project/client.
					</p>
				</div>
				<Switch
					id="create-task-link-toggle"
					checked={action.linkToRecord ?? false}
					onCheckedChange={(linkToRecord) => update({ linkToRecord })}
				/>
			</div>

			<PanelField label="Assignee" helper="Optional — leave unassigned to skip.">
				<Select
					value={action.assigneeUserId ?? "__unassigned__"}
					onValueChange={(v) =>
						update({ assigneeUserId: !v || v === "__unassigned__" ? undefined : v })
					}
				>
					<SelectTrigger>
						<SelectValue placeholder="Unassigned" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="__unassigned__">Unassigned</SelectItem>
						{members?.map((member) => (
							<SelectItem key={member._id} value={member._id}>
								{member.name || member.email}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</PanelField>
		</PanelSection>
	);
}

function SendNotificationFields({
	config,
	action,
	triggerObjectType,
	nodes,
	trigger,
	nodeId,
	formulas,
	commit,
}: ActionFieldsProps<SendNotificationAction> & {
	triggerObjectType: TriggerableObjectType | null;
}) {
	const members = useQuery(api.users.listByOrg);
	const update = (patch: Partial<SendNotificationAction>) => {
		commit({ ...config, action: { ...action, ...patch } });
	};
	const { ref: messageRef, insert } = useMessageInsertion(action.message, (message) =>
		update({ message })
	);

	// "From the record" reads a person off the record in scope — with no record
	// (scheduled/record-agnostic) it can't resolve, so that one option disables
	// while the record-agnostic options stay usable.
	const scope = getScopeObjectType(nodes, nodeId, triggerObjectType);
	const scopeObjectType = scope.objectType;

	const recipient = action.recipient;
	const recordField =
		typeof recipient !== "string" && "recordField" in recipient
			? recipient.recordField
			: undefined;

	// A stored legacy "record_owner" (dropped from the union) or any unknown
	// string falls the DISPLAY back to "org_admins" so the control never renders
	// blank. Display-only: nothing is committed until the user re-picks.
	const recipientValue:
		| "all_members"
		| "org_admins"
		| "specific_member"
		| "from_record" =
		typeof recipient === "string"
			? recipient === "all_members" || recipient === "org_admins"
				? recipient
				: "org_admins"
			: "recordField" in recipient
				? "from_record"
				: "specific_member";

	// recordField Target/Field derivation (only meaningful with a record in scope).
	const targetOptions = scopeObjectType ? getTargetOptions(scopeObjectType) : [];
	const rfTarget = recordField?.target ?? "self";
	const rfTargetValue = typeof rfTarget === "string" ? rfTarget : rfTarget.related;
	const rfTargetObjectType =
		targetOptions.find((t) => t.value === rfTargetValue)?.objectType ??
		scopeObjectType ??
		undefined;
	const fieldOptions = rfTargetObjectType
		? USER_REF_RECIPIENT_FIELDS[rfTargetObjectType]
		: [];
	// Target changes can strand a field (a project field is invalid for a client
	// target). Keep the value, surface the error, let publish validation block.
	const fieldInvalid =
		!!recordField &&
		!!rfTargetObjectType &&
		!fieldOptions.some((f) => f.key === recordField.field);

	const selectFromRecord = () => {
		if (!scopeObjectType) return;
		const firstField = USER_REF_RECIPIENT_FIELDS[scopeObjectType][0]?.key ?? "";
		update({ recipient: { recordField: { target: "self", field: firstField } } });
	};

	const updateRecordFieldTarget = (value: string) => {
		const next = targetOptions.find((t) => t.value === value);
		if (!next) return;
		// Reseed the field to the new target type's first valid field.
		const firstField = USER_REF_RECIPIENT_FIELDS[next.objectType][0]?.key ?? "";
		update({
			recipient: {
				recordField: {
					target: value === "self" ? "self" : { related: next.objectType },
					field: firstField,
				},
			},
		});
	};

	const updateRecordFieldField = (field: string) => {
		update({ recipient: { recordField: { target: rfTarget, field } } });
	};

	return (
		<PanelSection title="Inputs">
			<PanelField label="Recipient">
				<Select
					value={recipientValue}
					onValueChange={(value) => {
						if (!value) return;
						if (value === "all_members" || value === "org_admins") {
							update({ recipient: value });
						} else if (value === "from_record") {
							selectFromRecord();
						} else {
							update({ recipient: { userId: members?.[0]?._id ?? "" } });
						}
					}}
				>
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all_members">All members</SelectItem>
						<SelectItem value="org_admins">Org admins</SelectItem>
						<SelectItem value="specific_member">Specific member</SelectItem>
						<SelectItem value="from_record" disabled={!scopeObjectType}>
							From the record
						</SelectItem>
					</SelectContent>
				</Select>
				{!scopeObjectType && (
					<p className="mt-1.5 text-xs text-muted-foreground">
						&quot;From the record&quot; needs a record in scope — unavailable on
						a schedule with no record.
					</p>
				)}
			</PanelField>

			{typeof recipient !== "string" && "userId" in recipient && (
				<PanelField label="Member">
					<Select
						value={recipient.userId}
						onValueChange={(userId) => userId && update({ recipient: { userId } })}
					>
						<SelectTrigger>
							<SelectValue placeholder="Choose a member" />
						</SelectTrigger>
						<SelectContent>
							{members?.map((member) => (
								<SelectItem key={member._id} value={member._id}>
									{member.name || member.email}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</PanelField>
			)}

			{recordField &&
				(scopeObjectType ? (
					<>
						<PanelField
							label="Target"
							helper={
								scope.inLoop
									? rfTargetValue === "self"
										? "Reads a person off the current loop item."
										: `Reads a person off the ${rfTargetObjectType} linked to the current loop item.`
									: rfTargetValue === "self"
										? "Which record to read the recipient from."
										: `Reads a person off the ${rfTargetObjectType} linked to the triggering ${scopeObjectType}.`
							}
						>
							<Select
								value={rfTargetValue}
								onValueChange={(value) => value && updateRecordFieldTarget(value)}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{targetOptions.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											{option.value === "self" && scope.inLoop
												? "Current loop item"
												: option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</PanelField>

						<PanelField
							label="From field"
							helper="Which person on the target record to notify."
						>
							<Select
								value={recordField.field}
								onValueChange={(field) => field && updateRecordFieldField(field)}
							>
								<SelectTrigger>
									{recordField.field ? (
										<PickerChip
											label={
												fieldOptions.find((f) => f.key === recordField.field)
													?.label ?? recordField.field
											}
										/>
									) : (
										<span className="truncate text-muted-foreground">
											Choose a field
										</span>
									)}
								</SelectTrigger>
								<SelectContent>
									{fieldOptions.map((f) => (
										<SelectItem key={f.key} value={f.key}>
											{f.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{fieldInvalid && (
								<p className="mt-1.5 text-xs text-destructive">
									This field isn&apos;t available on the selected target. Pick
									another field or change the target.
								</p>
							)}
						</PanelField>
					</>
				) : (
					<p className="text-xs text-destructive">
						This recipient reads a person off the record in scope, but this
						automation runs on a schedule with no record. Pick a different
						recipient, or move this action inside a Loop.
					</p>
				))}

			<div className="flex items-center justify-between gap-3">
				<div className="space-y-0.5">
					<Label htmlFor="send-notification-push-toggle" className="text-sm font-medium">
						Send mobile push
					</Label>
					<p className="text-xs text-muted-foreground">
						Notifications always show in the app. Turn on to also alert
						recipients by mobile push.
					</p>
				</div>
				<Switch
					id="send-notification-push-toggle"
					checked={action.channels?.includes("push") ?? false}
					onCheckedChange={(on) =>
						update({ channels: on ? ["in_app", "push"] : ["in_app"] })
					}
				/>
			</div>

			<PanelField
				label="Message"
				helper="Insert variable adds a placeholder that's filled in from the record when this runs."
			>
				<div className="space-y-1.5">
					<Textarea
						ref={messageRef}
						value={action.message}
						onChange={(e) => update({ message: e.target.value })}
						rows={4}
						placeholder="Write your notification..."
					/>
					<VariableInsertButton
						nodes={nodes}
						trigger={trigger}
						targetNodeId={nodeId}
						formulas={formulas}
						onInsert={insert}
					/>
				</div>
			</PanelField>
		</PanelSection>
	);
}

/** Which @mention kind is selected — mirrors the four teamMessageMentionValidator arms. */
type TagKind = "none" | "user" | "created_by" | "assigned_team";

/**
 * The Tag to display for a loaded config. `mention` (new model) wins. When it's
 * absent we read the legacy broadcast `recipients` for a lossless pre-select:
 * a specific-members list surfaces as Tag = Specific member (first id). This is
 * display-only — nothing is committed until the user saves.
 */
function displayTag(action: SendTeamMessageAction): { kind: TagKind; userId: string } {
	const mention = action.mention;
	if (mention) {
		return { kind: mention.kind, userId: mention.kind === "user" ? mention.userId : "" };
	}
	const recipients = action.recipients;
	if (typeof recipients !== "string" && recipients.userIds.length > 0) {
		return { kind: "user", userId: recipients.userIds[0] };
	}
	return { kind: "none", userId: "" };
}

function SendTeamMessageFields({
	config,
	action,
	triggerObjectType,
	nodes,
	trigger,
	nodeId,
	formulas,
	commit,
}: ActionFieldsProps<SendTeamMessageAction> & {
	triggerObjectType: TriggerableObjectType | null;
}) {
	const members = useQuery(api.users.listByOrg);

	// Both target arms resolve off the record in scope (trigger record, or the
	// loop item inside a loop body) — with no record there is nothing to post to.
	const scope = getScopeObjectType(nodes, nodeId, triggerObjectType);
	const scopeObjectType = scope.objectType;

	// Saving through this panel is the acknowledgment that retires the legacy
	// broadcast: every commit neutralizes `recipients` to an empty audience so
	// the new record-linked `mention` is the single source of who's notified.
	//
	// A legacy config (mention undefined) renders a tag *derived* from
	// `recipients` via displayTag. Since we blank `recipients` on commit, that
	// derived tag would be lost unless we write it into `mention` in the SAME
	// commit — otherwise editing the Message would visibly show a tagged member
	// while silently saving "tag no one". Materialize it on the first edit so
	// the committed config always matches what's displayed. Untouched legacy
	// nodes never commit, so their `recipients` back-compat stays intact.
	const update = (patch: Partial<SendTeamMessageAction>) => {
		const derived = displayTag(action);
		const materialized: Partial<SendTeamMessageAction> =
			action.mention === undefined && patch.mention === undefined
				? {
						mention:
							derived.kind === "user"
								? { kind: "user", userId: derived.userId as Id<"users"> }
								: { kind: "none" },
					}
				: {};
		commit({
			...config,
			action: {
				...action,
				...materialized,
				...patch,
				recipients: { userIds: [] },
			},
		});
	};
	const { ref: messageRef, insert } = useMessageInsertion(action.message, (message) =>
		update({ message })
	);

	if (!scopeObjectType) {
		return (
			<PanelSection title="Post to">
				<p className="text-xs text-muted-foreground">
					This automation runs on a schedule, so there is no record to post to.
					Add a Find records step and move this action inside a Loop.
				</p>
			</PanelSection>
		);
	}

	const targetOptions = getTargetOptions(scopeObjectType);
	const target = action.target ?? "self";
	const targetValue = typeof target === "string" ? target : target.related;
	const targetObjectType =
		targetOptions.find((t) => t.value === targetValue)?.objectType ?? scopeObjectType;

	// client/project/quote have a Team Communication feed; other targets fall
	// back to notify-only at run time (nothing is posted to a feed).
	const hasFeed =
		targetObjectType === "client" ||
		targetObjectType === "project" ||
		targetObjectType === "quote";
	const createdByOk = hasFeed;
	// assigned_team resolves for a project (its team) or a quote (its linked
	// project's team) — never for a client or feedless target.
	const assignedTeamOk =
		targetObjectType === "project" || targetObjectType === "quote";

	const tag = displayTag(action);

	// Legacy broadcast audiences ("all_members"/"admins") can't be mapped to a
	// tag — surface an unobtrusive notice, default the Tag to No one.
	const isLossyLegacy =
		action.mention === undefined && typeof action.recipients === "string";

	// A target change can strand a previously-valid tag (e.g. project → client
	// with Assigned team selected). Keep the value, surface the error, let
	// publish validation block.
	const assignedTeamInvalid = tag.kind === "assigned_team" && !assignedTeamOk;
	const createdByInvalid = tag.kind === "created_by" && !createdByOk;
	const userInvalid = tag.kind === "user" && !tag.userId;

	const updateTarget = (value: string) => {
		const next = targetOptions.find((t) => t.value === value);
		if (!next) return;
		update({ target: value === "self" ? "self" : { related: next.objectType } });
	};

	const updateTag = (value: string) => {
		if (value === "user") {
			const userId = tag.kind === "user" && tag.userId ? tag.userId : members?.[0]?._id ?? "";
			update({ mention: { kind: "user", userId: userId as Id<"users"> } });
		} else if (value === "none") {
			update({ mention: { kind: "none" } });
		} else if (value === "created_by") {
			update({ mention: { kind: "created_by" } });
		} else if (value === "assigned_team") {
			update({ mention: { kind: "assigned_team" } });
		}
	};

	let tagContext: string | undefined;
	if (tag.kind === "none" && hasFeed) {
		tagContext = "The message will appear on the feed. No one is notified.";
	} else if (tag.kind === "created_by") {
		tagContext = "If the creator can't be resolved, the message posts without a tag.";
	} else if (tag.kind === "assigned_team" && targetObjectType === "quote") {
		tagContext =
			"Resolves through the quote's linked project. If there's no linked project, the message posts without tags.";
	}

	return (
		<>
			<PanelSection title="Post to">
				{isLossyLegacy && (
					<div className="flex items-start gap-2 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
						<Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
						<span>
							This step used a broadcast audience. Broadcasts now live in the
							Send Notification action — choose who to tag below; saving replaces
							the old setting.
						</span>
					</div>
				)}

				<PanelField
					label="Target"
					helper={
						scope.inLoop
							? targetValue === "self"
								? "Posts to the current record in the loop's feed."
								: `Posts to the ${targetObjectType} linked to the current loop item.`
							: targetValue === "self"
								? "Which record's Team Communication feed this message posts to."
								: `Posts to the ${targetObjectType} linked to the triggering ${scopeObjectType}.`
					}
				>
					<Select
						value={targetValue}
						onValueChange={(value) => value && updateTarget(value)}
					>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{targetOptions.map((option) => (
								<SelectItem key={option.value} value={option.value}>
									{option.value === "self" && scope.inLoop
										? "Current loop item"
										: option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</PanelField>

				{!hasFeed && (
					<p className="text-xs text-muted-foreground">
						This record type has no Team Communication feed — tagged people are
						still notified, but nothing is posted to a feed.
					</p>
				)}

				<PanelField
					label="Tag"
					helper="Tagged people are @mentioned on the post and notified in-app and by push."
				>
					<Select value={tag.kind} onValueChange={(value) => value && updateTag(value)}>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="none">No one</SelectItem>
							<SelectItem value="user">Specific member</SelectItem>
							<SelectItem value="created_by" disabled={!createdByOk}>
								Record creator
							</SelectItem>
							<SelectItem value="assigned_team" disabled={!assignedTeamOk}>
								Assigned team
							</SelectItem>
						</SelectContent>
					</Select>
					{tagContext && (
						<p className="mt-1.5 text-xs text-muted-foreground">{tagContext}</p>
					)}
					{assignedTeamInvalid && (
						<p className="mt-1.5 text-xs text-destructive">
							Assigned team is available for project and quote targets. Pick
							another tag or change the target.
						</p>
					)}
					{createdByInvalid && (
						<p className="mt-1.5 text-xs text-destructive">
							Record creator isn&apos;t available for this target. Pick another
							tag or change the target.
						</p>
					)}
				</PanelField>

				{tag.kind === "user" && (
					<PanelField label="Member">
						<Select
							value={tag.userId}
							onValueChange={(userId) =>
								userId &&
								update({ mention: { kind: "user", userId: userId as Id<"users"> } })
							}
						>
							<SelectTrigger>
								<SelectValue placeholder="Choose a member" />
							</SelectTrigger>
							<SelectContent>
								{members?.map((member) => (
									<SelectItem key={member._id} value={member._id}>
										{member.name || member.email}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						{userInvalid && (
							<p className="mt-1.5 text-xs text-destructive">
								Choose a member, or set Tag to &quot;No one&quot;.
							</p>
						)}
					</PanelField>
				)}
			</PanelSection>

			<PanelSection title="Message">
				<PanelField label="Title">
					<Input
						value={action.title}
						onChange={(e) => update({ title: e.target.value })}
						placeholder="Message title"
					/>
				</PanelField>

				<PanelField
					label="Message"
					helper="Insert variable adds a placeholder that's filled in from the record when this runs."
				>
					<div className="space-y-1.5">
						<Textarea
							ref={messageRef}
							value={action.message}
							onChange={(e) => update({ message: e.target.value })}
							rows={4}
							placeholder="Write your message..."
						/>
						<VariableInsertButton
							nodes={nodes}
							trigger={trigger}
							targetNodeId={nodeId}
							formulas={formulas}
							onInsert={insert}
						/>
					</div>
				</PanelField>
			</PanelSection>
		</>
	);
}

export function ActionConfigPanel({
	nodeId,
	trigger,
	nodes,
	formulas,
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

	const triggerObjectType = triggerScopeObjectType(trigger);
	const workflowNodes = nodes.filter((n): n is WorkflowNode => n.type !== "placeholder");
	// null on a scheduled automation outside a loop. Seeding the default config
	// off an arbitrary object type would render a "This Quote" target on an
	// automation that has no quote — and no record at all.
	const seedObjectType =
		getScopeObjectType(workflowNodes, nodeId, triggerObjectType).objectType ??
		"client";
	// normalizeNodeConfig upgrades a legacy single-field update_field to a
	// one-row update_fields; load already does this, so it only bites if a
	// config reached editor state some other way.
	const config =
		(normalizeNodeConfig(node.config) as ActionNodeConfig | undefined) ??
		defaultConfig(seedObjectType);
	const meta = ACTION_META[config.action.type];

	const commit = (next: ActionNodeConfig) => {
		onNodeChange(nodeId, { config: next } as Partial<WorkflowNode>);
	};

	return (
		<div className="flex flex-col h-full">
			<ConfigPanelHeader
				icon={meta.icon}
				iconBgColor={meta.bg}
				iconFgColor={meta.fg}
				categoryBadge={meta.badge}
				nodeTypeName={meta.name}
				description={meta.description}
			/>

			<div className="flex-1">
				{config.action.type === "update_fields" && (
					<UpdateFieldsFields
						config={config}
						action={config.action}
						triggerObjectType={triggerObjectType}
						nodes={workflowNodes}
						trigger={trigger}
						nodeId={nodeId}
						formulas={formulas}
						commit={commit}
					/>
				)}
				{config.action.type === "create_record" && (
					<CreateRecordFields
						config={config}
						action={config.action}
						triggerObjectType={triggerObjectType}
						nodes={workflowNodes}
						trigger={trigger}
						nodeId={nodeId}
						formulas={formulas}
						commit={commit}
					/>
				)}
				{config.action.type === "create_task" && (
					<CreateTaskFields
						config={config}
						action={config.action}
						nodes={workflowNodes}
						trigger={trigger}
						nodeId={nodeId}
						formulas={formulas}
						commit={commit}
					/>
				)}
				{config.action.type === "send_notification" && (
					<SendNotificationFields
						config={config}
						action={config.action}
						triggerObjectType={triggerObjectType}
						nodes={workflowNodes}
						trigger={trigger}
						nodeId={nodeId}
						formulas={formulas}
						commit={commit}
					/>
				)}
				{config.action.type === "send_team_message" && (
					<SendTeamMessageFields
						config={config}
						action={config.action}
						triggerObjectType={triggerObjectType}
						nodes={workflowNodes}
						trigger={trigger}
						nodeId={nodeId}
						formulas={formulas}
						commit={commit}
					/>
				)}
			</div>

			{onDeleteNode && (
				<DeleteStepButton onDelete={() => onDeleteNode(nodeId)} />
			)}
		</div>
	);
}
