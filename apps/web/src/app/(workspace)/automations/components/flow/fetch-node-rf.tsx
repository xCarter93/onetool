"use client";

import { memo, type ReactNode } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import { BaseHandle } from "@/components/base-handle";
import { stepIdentity } from "../../lib/step-family";
import { OBJECT_TYPE_LABELS, type FetchNodeConfig } from "../../lib/node-types";
import { FlowNodeCard } from "./flow-node-card";
import { SummarySlot } from "./summary-slot";

function sentence(config: FetchNodeConfig | undefined): ReactNode {
	const entityLabel = config?.objectType ? OBJECT_TYPE_LABELS[config.objectType] : null;
	const filterCount = config?.filters?.reduce((sum, g) => sum + g.rules.length, 0) ?? 0;
	if (filterCount === 0) {
		return (
			<>
				Find <SummarySlot value={entityLabel} />
			</>
		);
	}
	return (
		<>
			Find <SummarySlot value={entityLabel} /> matching{" "}
			<SummarySlot value={`${filterCount} filter${filterCount > 1 ? "s" : ""}`} />
		</>
	);
}

export const FetchNodeRF = memo(({ id, data }: NodeProps) => {
	const config = (data as Record<string, unknown>)?.config as FetchNodeConfig | undefined;
	const warning = (data as Record<string, unknown>)?.warning as string | undefined;
	const identity = stepIdentity("fetch_records");

	return (
		<FlowNodeCard
			nodeId={id}
			family={identity.family}
			icon={identity.icon}
			title={identity.name}
			warning={warning}
			ariaLabel={`Fetch: ${identity.name}`}
			handles={
				<>
					<BaseHandle type="target" position={Position.Top} />
					<BaseHandle type="source" position={Position.Bottom} />
				</>
			}
		>
			{sentence(config)}
		</FlowNodeCard>
	);
});
FetchNodeRF.displayName = "FetchNodeRF";
