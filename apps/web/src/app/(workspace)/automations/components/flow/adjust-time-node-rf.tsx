"use client";

import { memo } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import { BaseHandle } from "@/components/base-handle";
import { stepIdentity } from "../../lib/step-family";
import type { AdjustTimeNodeConfig } from "../../lib/node-types";
import { FlowNodeCard } from "./flow-node-card";
import { SummarySlot } from "./summary-slot";

function singularize(unit: AdjustTimeNodeConfig["unit"], amount: number): string {
	return amount === 1 ? unit.slice(0, -1) : unit;
}

export const AdjustTimeNodeRF = memo(({ id, data }: NodeProps) => {
	const config = (data as Record<string, unknown>)?.config as AdjustTimeNodeConfig | undefined;
	const warning = (data as Record<string, unknown>)?.warning as string | undefined;
	const identity = stepIdentity("adjust_time");
	const subtract = config?.direction === "subtract";
	const adjustment = config?.amount
		? `${subtract ? "Subtract" : "Add"} ${config.amount} ${singularize(config.unit, config.amount)}`
		: null;
	const baseLabel = config ? (config.base.kind === "var" ? "a variable" : "the base time") : null;

	return (
		<FlowNodeCard
			nodeId={id}
			family={identity.family}
			icon={identity.icon}
			title={identity.name}
			warning={warning}
			ariaLabel={`Adjust time: ${identity.name}`}
			handles={
				<>
					<BaseHandle type="target" position={Position.Top} />
					<BaseHandle type="source" position={Position.Bottom} />
				</>
			}
		>
			<SummarySlot value={adjustment} /> {subtract ? "from" : "to"}{" "}
			<SummarySlot value={baseLabel} />
		</FlowNodeCard>
	);
});
AdjustTimeNodeRF.displayName = "AdjustTimeNodeRF";
