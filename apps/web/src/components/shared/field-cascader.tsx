"use client";

import type { ReactNode } from "react";
import {
	Cascader,
	CascaderEmpty,
	CascaderList,
	CascaderPanel,
	CascaderStatus,
	type CascaderItemState,
} from "@/components/reui/cascader/cascader";
import {
	CascaderInput,
	CascaderNav,
} from "@/components/reui/cascader/cascader-nav";
import { CascaderItems } from "@/components/reui/cascader/cascader-item";
import type {
	CascaderNode,
	CascaderSelectable,
} from "@/components/reui/cascader/cascader-types";

export type { CascaderNode };

/** Breadcrumb separator, shared with `reports/report-path-options`. */
const SEPARATOR = "›";

/** Keep in step with the `min-h-*` on the list below. */
const LIST_HEIGHT = "14rem";

/**
 * The relation-aware field picker every workspace picker drills with: own fields
 * and relation branches in one run, search across the current level and below.
 * Panel only, with no popup of its own — the caller supplies the popover.
 */
export function FieldCascader<T = unknown>({
	items,
	getParent,
	selectable,
	value,
	onValueChange,
	placeholder,
	emptyText,
	rootLabel,
	renderLabel,
}: {
	items: CascaderNode<T>[];
	/** Flat input: return each node's parent value instead of nesting `children`. */
	getParent?: (node: CascaderNode<T>) => string | null | undefined;
	selectable?: CascaderSelectable<T>;
	value?: string;
	onValueChange: (value: string) => void;
	placeholder: string;
	emptyText: string;
	/** Names the root level for the live region, which no heading does any more. */
	rootLabel?: string;
	renderLabel?: (node: CascaderNode<T>, state: CascaderItemState<T>) => ReactNode;
}) {
	return (
		<Cascader
			inline
			items={items}
			getParent={getParent}
			selectable={selectable}
			value={value}
			// Wrapped, not passed through: Base UI hands the callback a details
			// object no caller here wants leaking into its handler's arity.
			onValueChange={(next) => onValueChange(next)}
			searchScope="deep"
			labels={{
				empty: emptyText,
				// Naming the level here rather than in a breadcrumb keeps the panel
				// one height, and puts the name where the cursor already is.
				search: (parent) => (parent ? `Search ${parent}...` : placeholder),
				// The breadcrumb character the rest of the reports UI already uses.
				pathSeparator: SEPARATOR,
				...(rootLabel ? { rootLevel: rootLabel } : {}),
			}}
			renderLabel={renderLabel}
		>
			<CascaderPanel>
				<CascaderNav>
					{/* The input draws its own back control; adding one duplicates it.
					    No placeholder prop: `labels.search` names the level instead. */}
					<CascaderInput />
				</CascaderNav>
				{/* Floor and cap are the same number on purpose: a level's row count
				    then never changes the panel's height, so the popover cannot flip
				    sides part-way through a drill-down. */}
				<CascaderList maxHeight={LIST_HEIGHT} className="min-h-56">
					<CascaderItems />
					<CascaderEmpty />
				</CascaderList>
				<CascaderStatus />
			</CascaderPanel>
		</Cascader>
	);
}
