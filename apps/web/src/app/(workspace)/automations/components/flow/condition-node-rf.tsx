"use client";

import { memo, useMemo } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import { BaseHandle } from "@/components/base-handle";
import { stepIdentity } from "../../lib/step-family";
import {
	getFilterableFields,
	type AutomationObjectType,
	type ConditionNodeConfig,
} from "../../lib/node-types";
import { conditionSentence } from "../../lib/condition-sentence";
import { FlowNodeCard } from "./flow-node-card";
import { SummarySlot } from "./summary-slot";

export const ConditionNodeRF = memo(({ id, data }: NodeProps) => {
	const config = (data as Record<string, unknown>)?.config as ConditionNodeConfig | undefined;
	const warning = (data as Record<string, unknown>)?.warning as string | undefined;
	const triggerObjectType = data?.triggerObjectType as AutomationObjectType | null;
	const identity = stepIdentity("condition");
	const sentence = config
		? conditionSentence(config.logic, config.groups, triggerObjectType ?? null)
		: "";

	const isFieldInvalid = useMemo(() => {
		const allRules = (config?.groups ?? []).flatMap((g) => g.rules);
		if (allRules.length === 0 || !triggerObjectType) return false;
		const validFields = getFilterableFields(triggerObjectType);
		if (validFields.length === 0) return false;
		return allRules.some(
			(rule) => rule.field && !validFields.some((f) => f.key === rule.field)
		);
	}, [config, triggerObjectType]);

	return (
		<FlowNodeCard
			nodeId={id}
			family={identity.family}
			icon={identity.icon}
			title="Condition"
			warning={
				warning ?? (isFieldInvalid ? "Field may not match the current trigger type" : undefined)
			}
			duplicable={false}
			ariaLabel={sentence ? `Condition: if ${sentence}` : "Condition"}
			handles={
				<>
					<BaseHandle type="target" position={Position.Top} />
					<BaseHandle type="source" position={Position.Bottom} id="yes" />
					<BaseHandle type="source" position={Position.Bottom} id="no" />
				</>
			}
		>
			If <SummarySlot value={sentence} />
		</FlowNodeCard>
	);
});
ConditionNodeRF.displayName = "ConditionNodeRF";
