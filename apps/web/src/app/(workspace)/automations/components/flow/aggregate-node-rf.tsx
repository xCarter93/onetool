"use client";

import { memo } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import { BaseHandle } from "@/components/base-handle";
import { stepIdentity } from "../../lib/step-family";
import type { AggregateNodeConfig, AggregateOperation } from "../../lib/node-types";
import { FlowNodeCard } from "./flow-node-card";
import { SummarySlot } from "./summary-slot";

const OP_LABELS: Record<AggregateOperation, string> = {
	sum: "Sum",
	avg: "Average",
	min: "Minimum",
	max: "Maximum",
};

export const AggregateNodeRF = memo(({ id, data }: NodeProps) => {
	const config = (data as Record<string, unknown>)?.config as AggregateNodeConfig | undefined;
	const warning = (data as Record<string, unknown>)?.warning as string | undefined;
	const identity = stepIdentity("aggregate");

	return (
		<FlowNodeCard
			nodeId={id}
			family={identity.family}
			icon={identity.icon}
			title={identity.name}
			warning={warning}
			ariaLabel={`Aggregate: ${identity.name}`}
			handles={
				<>
					<BaseHandle type="target" position={Position.Top} />
					<BaseHandle type="source" position={Position.Bottom} />
				</>
			}
		>
			<SummarySlot value={config ? OP_LABELS[config.op] : null} /> of{" "}
			<SummarySlot value={config?.field || null} /> across found records
		</FlowNodeCard>
	);
});
AggregateNodeRF.displayName = "AggregateNodeRF";
