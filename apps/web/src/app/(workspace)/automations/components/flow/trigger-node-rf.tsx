"use client";

import { memo } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { BaseNode, BaseNodeContent } from "@/components/base-node";
import { BaseHandle } from "@/components/base-handle";
import {
	OBJECT_TYPE_LABELS,
	describeSchedule,
	getStatusOptions,
	validateSchedule,
	type TriggerConfig,
} from "../../lib/node-types";
import { conditionSentence } from "../../lib/condition-sentence";

/** " · when <sentence>" suffix for triggers with entry criteria (A5-2). */
function entryCriteriaSuffix(trigger: TriggerConfig): string {
	if (!trigger.entryCriteria) return "";
	const sentence = conditionSentence(
		trigger.entryCriteria.logic,
		trigger.entryCriteria.groups,
		trigger.objectType ?? null
	);
	return sentence ? ` · when ${sentence}` : "";
}

function getSummary(trigger: TriggerConfig | undefined): {
	title: string;
	description: string;
} {
	if (!trigger) return { title: "Configure trigger", description: "Select a trigger type..." };

	const objectLabel = trigger.objectType ? OBJECT_TYPE_LABELS[trigger.objectType] : "";
	const triggerType = trigger.type || "status_changed";
	const whenSuffix = entryCriteriaSuffix(trigger);

	switch (triggerType) {
		case "status_changed": {
			const title = "Status Changed";
			const statusOptions = trigger.objectType ? getStatusOptions(trigger.objectType) : [];
			const toLabel =
				statusOptions.find((s) => s.value === trigger.toStatus)?.label || trigger.toStatus;
			if (trigger.fromStatus && toLabel) {
				const fromLabel =
					statusOptions.find((s) => s.value === trigger.fromStatus)?.label || trigger.fromStatus;
				return { title, description: `${objectLabel} ${fromLabel} → ${toLabel}${whenSuffix}` };
			}
			if (toLabel) return { title, description: `${objectLabel} → ${toLabel}${whenSuffix}` };
			return { title, description: objectLabel || "Configure trigger..." };
		}
		case "record_created":
			return { title: "Record Created", description: `${objectLabel} created${whenSuffix}` };
		case "record_updated":
			return {
				title: "Record Updated",
				description:
					(trigger.fields && trigger.fields.length > 0
						? `${objectLabel}.${trigger.fields.join(", ")} changes`
						: `${objectLabel} updated`) + whenSuffix,
			};
		case "scheduled": {
			const schedule = trigger.schedule;
			// describeSchedule throws on malformed drafts; only summarize valid ones.
			if (schedule && validateSchedule(schedule) === null) {
				return {
					title: "Scheduled",
					description: describeSchedule(schedule, Date.now()),
				};
			}
			return { title: "Scheduled", description: "Configure the schedule..." };
		}
		default:
			return { title: "Unsupported trigger", description: "Choose a different trigger" };
	}
}

export const TriggerNodeRF = memo(({ data, selected }: NodeProps) => {
	const trigger = (data as Record<string, unknown>)?.trigger as TriggerConfig | undefined;
	const { title, description } = getSummary(trigger);

	return (
		<div className="relative mt-4">
			<span className="absolute -top-2.5 left-3 bg-background px-2 text-[10px] font-semibold uppercase tracking-wider text-amber-600 z-10">
				Trigger
			</span>
			<BaseNode
				className={cn(
					"w-[280px] border-amber-200 shadow-sm",
					"hover:border-primary/30 transition-colors",
					selected && "ring-2 ring-primary/50",
				)}
				aria-label={`Trigger: ${title} - ${description}`}
			>
				<BaseNodeContent className="p-3">
					<div className="flex items-center gap-3">
						<div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
							<Zap className="h-4 w-4" />
						</div>
						<div className="min-w-0 flex-1">
							<div className="text-sm font-semibold truncate">{title}</div>
							<div className="text-xs text-muted-foreground truncate">{description}</div>
						</div>
						<span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full shrink-0">
							Triggers
						</span>
					</div>
				</BaseNodeContent>
				<BaseHandle type="source" position={Position.Bottom} />
			</BaseNode>
		</div>
	);
});
TriggerNodeRF.displayName = "TriggerNodeRF";
