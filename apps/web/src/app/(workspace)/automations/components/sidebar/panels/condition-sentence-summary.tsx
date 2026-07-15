"use client";

import React from "react";
import {
	conditionSentenceParts,
	type VarLabelMap,
} from "../../../lib/condition-sentence";
import type {
	AutomationObjectType,
	ConditionGroup,
} from "../../../lib/node-types";

/**
 * Live plain-English readback of a condition tree (A5-1): rule phrases render
 * bold, connectors muted. Renders nothing until at least one complete rule
 * exists.
 */
export function ConditionSentenceSummary({
	prefix,
	logic,
	groups,
	objectType,
	varLabels,
}: {
	prefix: string;
	logic: "and" | "or";
	groups: ConditionGroup[];
	objectType: AutomationObjectType | null;
	varLabels?: VarLabelMap;
}) {
	const parts = conditionSentenceParts(logic, groups, objectType, varLabels);
	if (parts.length === 0) return null;

	return (
		<div className="rounded-md border border-border bg-muted/40 px-2.5 py-2 text-xs text-muted-foreground leading-relaxed">
			{prefix}{" "}
			{parts.map((part, index) =>
				part.kind === "rule" ? (
					<span key={index} className="font-medium text-foreground">
						{part.text}
					</span>
				) : (
					<React.Fragment key={index}>{part.text}</React.Fragment>
				)
			)}
		</div>
	);
}
