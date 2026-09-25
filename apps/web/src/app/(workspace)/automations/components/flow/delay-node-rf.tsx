"use client";

import { memo } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import { BaseHandle } from "@/components/base-handle";
import { stepIdentity } from "../../lib/step-family";
import type { DelayNodeConfig } from "../../lib/node-types";
import { FlowNodeCard } from "./flow-node-card";
import { SummarySlot } from "./summary-slot";

function singularize(unit: DelayNodeConfig["unit"], amount: number): string {
	return amount === 1 ? unit.slice(0, -1) : unit;
}

export const DelayNodeRF = memo(({ id, data }: NodeProps) => {
	const config = (data as Record<string, unknown>)?.config as DelayNodeConfig | undefined;
	const warning = (data as Record<string, unknown>)?.warning as string | undefined;
	const identity = stepIdentity("delay");
	const duration = config?.amount
		? `${config.amount} ${singularize(config.unit, config.amount)}`
		: null;

	return (
		<FlowNodeCard
			nodeId={id}
			family={identity.family}
			icon={identity.icon}
			title={identity.name}
			warning={warning}
			ariaLabel={`Delay: ${identity.name}`}
			handles={
				<>
					<BaseHandle type="target" position={Position.Top} />
					<BaseHandle type="source" position={Position.Bottom} />
				</>
			}
		>
			Wait <SummarySlot value={duration} />
		</FlowNodeCard>
	);
});
DelayNodeRF.displayName = "DelayNodeRF";
