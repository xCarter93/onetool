"use client";

import { memo, type ReactNode } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import { BaseHandle } from "@/components/base-handle";
import { stepIdentity } from "../../lib/step-family";
import {
	OBJECT_TYPE_LABELS,
	describeSchedule,
	triggerScopeObjectType,
	getStatusOptions,
	validateSchedule,
	type TriggerConfig,
} from "../../lib/node-types";
import { conditionSentence } from "../../lib/condition-sentence";
import { FlowNodeCard } from "./flow-node-card";
import { SummarySlot } from "./summary-slot";

/** " · when <sentence>" suffix for triggers with entry criteria (A5-2). */
function entryCriteriaSuffix(trigger: TriggerConfig): string {
	if (!trigger.entryCriteria) return "";
	const sentence = conditionSentence(
		trigger.entryCriteria.logic,
		trigger.entryCriteria.groups,
		triggerScopeObjectType(trigger)
	);
	return sentence ? ` · when ${sentence}` : "";
}

function article(label: string | null): string {
	return label && /^[aeiou]/i.test(label) ? "an" : "a";
}

function getSummary(trigger: TriggerConfig | undefined): {
	title: string;
	sentence: ReactNode;
} {
	if (!trigger) return { title: "Trigger", sentence: "Choose a trigger type" };

	const scopeObjectType = triggerScopeObjectType(trigger);
	const objectLabel = scopeObjectType ? OBJECT_TYPE_LABELS[scopeObjectType] : null;
	const subject = (
		<>
			When {article(objectLabel)} <SummarySlot value={objectLabel} />
		</>
	);
	const triggerType = trigger.type || "status_changed";
	const whenSuffix = entryCriteriaSuffix(trigger);

	switch (triggerType) {
		case "status_changed": {
			const statusOptions = scopeObjectType ? getStatusOptions(scopeObjectType) : [];
			const labelFor = (status: string | undefined) =>
				statusOptions.find((s) => s.value === status)?.label || status || null;
			return {
				title: "Status Changed",
				sentence: (
					<>
						{subject} changes
						{trigger.fromStatus ? (
							<>
								{" "}
								from <SummarySlot value={labelFor(trigger.fromStatus)} />
							</>
						) : null}{" "}
						to <SummarySlot value={labelFor(trigger.toStatus)} />
						{whenSuffix}
					</>
				),
			};
		}
		case "record_created":
			return {
				title: "Record Created",
				sentence: (
					<>
						{subject} is created{whenSuffix}
					</>
				),
			};
		case "record_updated":
			return {
				title: "Record Updated",
				sentence:
					trigger.fields && trigger.fields.length > 0 ? (
						<>
							When <SummarySlot value={trigger.fields.join(", ")} /> changes on{" "}
							{article(objectLabel)} <SummarySlot value={objectLabel} />
							{whenSuffix}
						</>
					) : (
						<>
							{subject} is updated{whenSuffix}
						</>
					),
			};
		case "scheduled": {
			const schedule = trigger.schedule;
			// describeSchedule throws on malformed drafts; only summarize valid ones.
			const description =
				schedule && validateSchedule(schedule) === null
					? describeSchedule(schedule, Date.now())
					: null;
			return {
				title: "Scheduled",
				sentence: (
					<>
						Runs{" "}
						<SummarySlot
							value={description && description[0].toLowerCase() + description.slice(1)}
						/>
					</>
				),
			};
		}
		default:
			return { title: "Unsupported trigger", sentence: "Choose a different trigger" };
	}
}

export const TriggerNodeRF = memo(({ id, data }: NodeProps) => {
	const trigger = (data as Record<string, unknown>)?.trigger as TriggerConfig | undefined;
	const warning = (data as Record<string, unknown>)?.warning as string | undefined;
	const identity = stepIdentity("trigger");
	const { title, sentence } = getSummary(trigger);

	return (
		<FlowNodeCard
			nodeId={id}
			family={identity.family}
			icon={identity.icon}
			title={title}
			warning={warning}
			menu={false}
			ariaLabel={`Trigger: ${title}`}
			handles={<BaseHandle type="source" position={Position.Bottom} />}
		>
			{sentence}
		</FlowNodeCard>
	);
});
TriggerNodeRF.displayName = "TriggerNodeRF";
