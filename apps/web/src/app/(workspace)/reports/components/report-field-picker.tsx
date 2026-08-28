"use client";

import type { ReactNode } from "react";
import { Check } from "lucide-react";
import type { ReportEntityType } from "@onetool/backend/convex/lib/reportFields";
import {
	DrillList,
	type DrillGroup,
	type DrillItem,
	type DrillPage,
} from "@/components/shared/drill-list";
import {
	filterFieldOptions,
	groupByPathOptions,
	type PathOption,
} from "../report-path-options";

const SEPARATOR = " › ";

/**
 * The shared drill-in field picker for filter rows and the group-by control
 * (§8 d15 F1+F5). Relation pages are flat — each carries the full breadcrumb —
 * so a deep path is one hop from the root and search reaches all of them.
 * The caller hosts this in a popover.
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

	const toItem = (item: {
		value: string;
		label: ReactNode;
		searchText: string;
	}): DrillItem => ({
		id: item.value,
		value: item.searchText,
		label: item.label,
		onSelect: () => onSelect(item.value),
		trailing:
			item.value === value ? (
				<Check className="h-4 w-4 shrink-0 text-muted-foreground" />
			) : undefined,
	});

	const direct: DrillItem[] = directOptions
		? directOptions.map((option) =>
				toItem({ ...option, searchText: option.label.toLowerCase() })
			)
		: options
				.filter((option) => option.group === "Fields")
				.map((option) => toItem({ ...option, label: option.label }));

	const rootGroups: DrillGroup[] = direct.length
		? [{ id: "fields", heading: "Fields", items: direct }]
		: [];

	const pages = new Map<string, DrillPage>();
	for (const option of options) {
		if (option.group === "Fields") continue;
		const id = option.value.split(".").slice(0, -1).join(".");
		const page = pages.get(id) ?? { id, navLabel: option.group, items: [] };
		page.items.push(toItem({ ...option, label: breadcrumbLabel(option) }));
		pages.set(id, page);
	}

	return (
		<DrillList
			rootGroups={rootGroups}
			pages={[...pages.values()]}
			// Always open: the host popover unmounts this, which is the reset.
			open
			emptyText="No fields found."
			placeholder="Search fields..."
		/>
	);
}

/** Muted trail + the field itself, so flat search results stay unambiguous. */
function breadcrumbLabel(option: PathOption) {
	return (
		<>
			<span className="text-muted-foreground">
				{option.group}
				{SEPARATOR}
			</span>
			{option.label.slice(option.group.length + SEPARATOR.length)}
		</>
	);
}
