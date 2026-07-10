"use client";

import React, { useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { ACTION_META } from "../../../lib/action-meta";
import { NextStepTree } from "../next-step-tree";
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
import { StyledMultiSelector } from "@/components/ui/styled/styled-multi-selector";
import {
	MAX_DUE_IN_DAYS,
	getTargetOptions,
	getWritableFields,
	type ActionNodeConfig,
	type AutomationObjectType,
	type AutomationTrigger,
	type CreateTaskAction,
	type FormulaResource,
	type SendNotificationAction,
	type SendTeamMessageAction,
	type TriggerConfig,
	type UpdateFieldAction,
	type WorkflowNode,
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

function UpdateFieldFields({
	config,
	action,
	triggerObjectType,
	nodes,
	trigger,
	nodeId,
	formulas,
	commit,
}: ActionFieldsProps<UpdateFieldAction> & { triggerObjectType: AutomationObjectType }) {
	// Inside a loop body, `target: "self"` (and its related FKs) resolve against
	// the loop's fetched item, not the trigger record — mirror the engine.
	const scope = getScopeObjectType(nodes, nodeId, triggerObjectType);
	const scopeObjectType = scope.objectType ?? triggerObjectType;
	const targetOptions = getTargetOptions(scopeObjectType);
	const targetValue = typeof action.target === "string" ? action.target : action.target.related;
	const targetObjectType =
		targetOptions.find((t) => t.value === targetValue)?.objectType ?? scopeObjectType;
	const writableFields = getWritableFields(targetObjectType);
	const fieldDef = writableFields.find((f) => f.key === action.field);

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

	const updateValue = (value: UpdateFieldAction["value"]) => {
		commit({ ...config, action: { ...action, value } });
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
							: `Updates the ${targetObjectType} linked to the triggering ${triggerObjectType}.`
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

			<PanelField label="Field">
				<Select
					value={action.field}
					onValueChange={(value) => value && updateField(value)}
				>
					<SelectTrigger>
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
			</PanelField>

			{fieldDef && (
				<PanelField label="Set value to">
					<ValueInput
						field={fieldDef}
						value={action.value}
						onChange={updateValue}
						nodes={nodes}
						trigger={trigger}
						targetNodeId={nodeId}
						formulas={formulas}
					/>
				</PanelField>
			)}
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
	nodes,
	trigger,
	nodeId,
	formulas,
	commit,
}: ActionFieldsProps<SendNotificationAction>) {
	const members = useQuery(api.users.listByOrg);
	const update = (patch: Partial<SendNotificationAction>) => {
		commit({ ...config, action: { ...action, ...patch } });
	};
	const { ref: messageRef, insert } = useMessageInsertion(action.message, (message) =>
		update({ message })
	);

	const recipientValue = typeof action.recipient === "string" ? action.recipient : "specific_member";

	return (
		<PanelSection title="Inputs">
			<PanelField label="Recipient">
				<Select
					value={recipientValue}
					onValueChange={(value) => {
						if (value === "org_admins" || value === "record_owner") {
							update({ recipient: value });
						} else {
							update({ recipient: { userId: members?.[0]?._id ?? "" } });
						}
					}}
				>
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="org_admins">Org admins</SelectItem>
						<SelectItem value="record_owner">Record owner</SelectItem>
						<SelectItem value="specific_member">Specific member</SelectItem>
					</SelectContent>
				</Select>
			</PanelField>

			{typeof action.recipient !== "string" && (
				<PanelField label="Member">
					<Select
						value={action.recipient.userId}
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

function SendTeamMessageFields({
	config,
	action,
	nodes,
	trigger,
	nodeId,
	formulas,
	commit,
}: ActionFieldsProps<SendTeamMessageAction>) {
	const members = useQuery(api.users.listByOrg);
	const update = (patch: Partial<SendTeamMessageAction>) => {
		commit({ ...config, action: { ...action, ...patch } });
	};
	const { ref: messageRef, insert } = useMessageInsertion(action.message, (message) =>
		update({ message })
	);

	const recipientsValue = typeof action.recipients === "string" ? action.recipients : "specific_members";
	const memberOptions = (members ?? []).map((member) => ({
		value: member._id as string,
		label: member.name || member.email,
	}));

	return (
		<PanelSection title="Inputs">
			<PanelField label="Recipients">
				<Select
					value={recipientsValue}
					onValueChange={(value) => {
						if (value === "all_members" || value === "admins") {
							update({ recipients: value });
						} else {
							update({ recipients: { userIds: [] } });
						}
					}}
				>
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all_members">All members</SelectItem>
						<SelectItem value="admins">Admins</SelectItem>
						<SelectItem value="specific_members">Specific members</SelectItem>
					</SelectContent>
				</Select>
			</PanelField>

			{typeof action.recipients !== "string" && (
				<PanelField label="Members">
					<StyledMultiSelector
						options={memberOptions}
						value={action.recipients.userIds}
						onValueChange={(userIds) => update({ recipients: { userIds } })}
						placeholder="Choose members"
					/>
				</PanelField>
			)}

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
	);
}

export function ActionConfigPanel({
	nodeId,
	trigger,
	nodes,
	formulas,
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
	const config =
		(node.config as ActionNodeConfig | undefined) ?? defaultConfig(triggerObjectType);
	const workflowNodes = nodes.filter((n): n is WorkflowNode => n.type !== "placeholder");
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
				{config.action.type === "update_field" && (
					<UpdateFieldFields
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
						nodes={workflowNodes}
						trigger={trigger}
						nodeId={nodeId}
						formulas={formulas}
						commit={commit}
					/>
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

			{onDeleteNode && (
				<DeleteStepButton onDelete={() => onDeleteNode(nodeId)} />
			)}
		</div>
	);
}
