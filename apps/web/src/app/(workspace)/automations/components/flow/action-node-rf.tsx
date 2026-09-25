"use client";

import { memo, type ReactNode } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import { BaseHandle } from "@/components/base-handle";
import { stepIdentity } from "../../lib/step-family";
import { OBJECT_TYPE_LABELS, type ActionNodeConfig, type ValueRef } from "../../lib/node-types";
import { FlowNodeCard } from "./flow-node-card";
import { SummarySlot } from "./summary-slot";

type Action = ActionNodeConfig["action"];

function valueText(value: ValueRef | undefined): string | null {
	if (!value) return null;
	if (value.kind === "var") return `{{${value.path}}}`;
	const v = value.value;
	return v === null || v === undefined || v === "" ? null : String(v);
}

function targetLabel(action: Extract<Action, { target: unknown }>): string {
	return action.target === "self"
		? "this record"
		: OBJECT_TYPE_LABELS[(action.target as { related: keyof typeof OBJECT_TYPE_LABELS }).related];
}

function sentence(action: Action): ReactNode {
	switch (action.type) {
		case "update_field":
			return (
				<>
					Set <SummarySlot value={action.field || null} /> to{" "}
					<SummarySlot value={valueText(action.value)} /> on {targetLabel(action)}
				</>
			);
		case "update_fields": {
			const rows = action.fields.filter((row) => row.field);
			if (rows.length <= 1) {
				const row = rows[0];
				return (
					<>
						Set <SummarySlot value={row?.field || null} /> to{" "}
						<SummarySlot value={row ? valueText(row.value) : null} /> on {targetLabel(action)}
					</>
				);
			}
			return (
				<>
					Set <SummarySlot value={rows.map((r) => r.field).join(", ")} /> on{" "}
					{targetLabel(action)}
				</>
			);
		}
		case "create_task":
			return (
				<>
					Create a task titled <SummarySlot value={valueText(action.title)} />
				</>
			);
		case "create_record": {
			const label = OBJECT_TYPE_LABELS[action.objectType];
			const rows = action.fields.filter((row) => row.field);
			return (
				<>
					Create a {label} with{" "}
					<SummarySlot value={rows.length ? rows.map((r) => r.field).join(", ") : null} />
					{action.linkToScope ? ", linked to the record in scope" : null}
				</>
			);
		}
		case "send_notification":
			return (
				<>
					Notify {recipientLabel(action.recipient)} with{" "}
					<SummarySlot value={action.message || null} />
				</>
			);
		case "send_team_message":
			return (
				<>
					Post <SummarySlot value={action.title || null} /> to the team feed with message{" "}
					<SummarySlot value={action.message || null} />
				</>
			);
		case "send_email":
			return (
				<>
					Send email to{" "}
					<SummarySlot
						value={
							action.recipient.kind === "primary_contact"
								? "the primary contact"
								: action.recipient.addresses.length
									? action.recipient.addresses.join(", ")
									: null
						}
					/>{" "}
					with subject <SummarySlot value={action.subject || null} />
				</>
			);
		default:
			return "Choose an action";
	}
}

function recipientLabel(recipient: Extract<Action, { type: "send_notification" }>["recipient"]): string {
	if (recipient === "all_members") return "all members";
	if (recipient === "org_admins") return "org admins";
	if ("userId" in recipient) return "a member";
	return `the ${recipient.recordField.field} on the record`;
}

export const ActionNodeRF = memo(({ id, data }: NodeProps) => {
	const config = (data as Record<string, unknown>)?.config as ActionNodeConfig | undefined;
	const warning = (data as Record<string, unknown>)?.warning as string | undefined;
	const identity = stepIdentity("action", config?.action.type);

	return (
		<FlowNodeCard
			nodeId={id}
			family={identity.family}
			icon={identity.icon}
			title={identity.name}
			warning={warning}
			ariaLabel={`Action: ${identity.name}`}
			handles={
				<>
					<BaseHandle type="target" position={Position.Top} />
					<BaseHandle type="source" position={Position.Bottom} />
				</>
			}
		>
			{config ? sentence(config.action) : "Choose an action"}
		</FlowNodeCard>
	);
});
ActionNodeRF.displayName = "ActionNodeRF";
