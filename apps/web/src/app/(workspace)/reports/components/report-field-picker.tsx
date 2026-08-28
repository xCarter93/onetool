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
 * (§8 d15 F1+F5). Relation pages nest along the FK DAG: each page shows its own
 * fields plus a nav row per direct edge, and search still flattens every level
 * with full breadcrumbs. The caller hosts this in a popover.
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

	const dotted = options.filter((option) => option.group !== "Fields");
	// A page is an FK prefix; an option whose whole value is a prefix is that
	// record's own terminal (group by mode only) and leads its page.
	const pageIds = new Set(dotted.map(parentPath));

	const pages = new Map<string, DrillPage>();
	const pageFor = (id: string, navLabel: string) => {
		const existing = pages.get(id);
		if (existing) return existing;
		const parentId = id.split(".").slice(0, -1).join(".");
		const page: DrillPage = {
			id,
			navLabel,
			navRowLabel: lastCrumb(navLabel),
			items: [],
		};
		if (parentId) page.parentId = parentId;
		pages.set(id, page);
		return page;
	};

	// Breadth-first option order puts each record terminal before that page's
	// own fields, so the record row lands first without an explicit sort.
	for (const option of dotted) {
		if (pageIds.has(option.value)) {
			pageFor(option.value, option.label).items.push({
				...toItem({ ...option, label: `${lastCrumb(option.label)} record` }),
				searchLabel: breadcrumbLabel(option),
			});
			continue;
		}
		pageFor(parentPath(option), option.group).items.push(
			toItem({ ...option, label: breadcrumbLabel(option) })
		);
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

function parentPath(option: PathOption) {
	return option.value.split(".").slice(0, -1).join(".");
}

function lastCrumb(breadcrumb: string) {
	return breadcrumb.split(SEPARATOR).at(-1);
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
