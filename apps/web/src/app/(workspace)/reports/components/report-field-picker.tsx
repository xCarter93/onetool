"use client";

import type { ReportEntityType } from "@onetool/backend/convex/lib/reportFields";
import {
	FieldCascader,
	type CascaderNode,
} from "@/components/shared/field-cascader";
import { filterFieldOptions, groupByPathOptions } from "../report-path-options";

const SEPARATOR = " › ";

/**
 * The shared drill-in field picker for filter rows and the group-by control
 * (§8 d15 F1+F5). Relation branches nest along the FK DAG, and search reaches
 * every level below the one you are standing on. The caller hosts this in a
 * popover.
 */
export function ReportFieldPicker({
	entityType,
	mode,
	value,
	onSelect,
	directOptions,
}: {
	entityType: ReportEntityType;
	mode: "filter" | "groupBy";
	value?: string;
	onSelect: (path: string) => void;
	/** Group by passes its curated direct list; filters fall back to the registry. */
	directOptions?: { value: string; label: string }[];
}) {
	const options =
		mode === "filter" ? filterFieldOptions(entityType) : groupByPathOptions(entityType);
	const selectablePaths = new Set<string>([
		...options.map((option) => option.value),
		...(directOptions?.map((option) => option.value) ?? []),
	]);

	// One node per dotted path, ancestors included: a traversed record has no
	// option of its own in filter mode, and the branch it names still has to
	// exist for its fields to hang off. `selectablePaths` is what then decides
	// whether pressing that branch commits or only drills.
	const nodes = new Map<string, CascaderNode>();
	const addPath = (path: string, crumbs: string[]) => {
		const segments = path.split(".");
		for (let depth = 0; depth < segments.length; depth++) {
			const nodeValue = segments.slice(0, depth + 1).join(".");
			if (nodes.has(nodeValue)) continue;
			nodes.set(nodeValue, { value: nodeValue, label: crumbs[depth] ?? nodeValue });
		}
	};

	for (const option of directOptions ?? []) addPath(option.value, [option.label]);
	for (const option of options) {
		if (directOptions && !option.value.includes(".")) continue;
		addPath(option.value, option.label.split(SEPARATOR));
	}

	return (
		<FieldCascader
			items={[...nodes.values()]}
			getParent={parentPath}
			selectable={(node) => selectablePaths.has(node.value)}
			value={value}
			onValueChange={onSelect}
			emptyText="No fields found."
			placeholder="Search fields..."
		/>
	);
}

function parentPath(node: CascaderNode): string | null {
	const cut = node.value.lastIndexOf(".");
	return cut < 0 ? null : node.value.slice(0, cut);
}
