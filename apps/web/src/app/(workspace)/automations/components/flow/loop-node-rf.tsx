"use client";

import { memo } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import { BaseHandle } from "@/components/base-handle";
import { stepIdentity } from "../../lib/step-family";
import type { LoopNodeConfig } from "../../lib/node-types";
import { FlowNodeCard } from "./flow-node-card";
import { SummarySlot } from "./summary-slot";

export const LoopNodeRF = memo(({ id, data }: NodeProps) => {
	const config = (data as Record<string, unknown>)?.config as LoopNodeConfig | undefined;
	const sourceStepLabel = (data as Record<string, unknown>)?.sourceStepLabel as
		| string
		| undefined;
	const warning = (data as Record<string, unknown>)?.warning as string | undefined;
	const identity = stepIdentity("loop");
	const source = config?.sourceNodeId ? (sourceStepLabel ?? "the previous step") : null;

	return (
		<FlowNodeCard
			nodeId={id}
			family={identity.family}
			icon={identity.icon}
			title={identity.name}
			warning={warning}
			duplicable={false}
			ariaLabel={`Loop: ${identity.name}`}
			handles={
				<>
					<BaseHandle type="target" position={Position.Top} />
					<BaseHandle type="target" position={Position.Left} id="loopReturn" />
					<BaseHandle type="source" position={Position.Bottom} id="each" />
					<BaseHandle type="source" position={Position.Right} id="after" />
				</>
			}
		>
			For each record from <SummarySlot value={source} />
		</FlowNodeCard>
	);
});
LoopNodeRF.displayName = "LoopNodeRF";
