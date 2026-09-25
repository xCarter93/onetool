"use client";

import { memo } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import { BaseHandle } from "@/components/base-handle";
import { stepIdentity } from "../../lib/step-family";
import { FlowNodeCard } from "./flow-node-card";

export const NextItemNodeRF = memo(({ id, data }: NodeProps) => {
	const warning = (data as Record<string, unknown>)?.warning as string | undefined;
	const identity = stepIdentity("next_item");

	return (
		<FlowNodeCard
			nodeId={id}
			family={identity.family}
			icon={identity.icon}
			title={identity.name}
			warning={warning}
			duplicable={false}
			ariaLabel="Next item: skips to the next record in the loop"
			handles={<BaseHandle type="target" position={Position.Top} />}
		>
			Skips to the next record in the loop
		</FlowNodeCard>
	);
});
NextItemNodeRF.displayName = "NextItemNodeRF";
