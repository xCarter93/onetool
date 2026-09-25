"use client";

import { memo } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import { BaseHandle } from "@/components/base-handle";
import { stepIdentity } from "../../lib/step-family";
import { FlowNodeCard } from "./flow-node-card";

export const EndNodeRF = memo(({ id, data }: NodeProps) => {
	const warning = (data as Record<string, unknown>)?.warning as string | undefined;
	const identity = stepIdentity("end");

	return (
		<FlowNodeCard
			nodeId={id}
			family={identity.family}
			icon={identity.icon}
			title={identity.name}
			warning={warning}
			duplicable={false}
			ariaLabel="End: Workflow stops here"
			handles={<BaseHandle type="target" position={Position.Top} />}
		>
			Workflow stops here
		</FlowNodeCard>
	);
});
EndNodeRF.displayName = "EndNodeRF";
