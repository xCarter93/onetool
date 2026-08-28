import type { ReactNode } from "react";

/**
 * Contract between a domain's field registry and the shared filter surfaces
 * (pills row, rule editor). Reports implements it over REPORT_FIELDS
 * (report-filter-adapter.tsx); the automations sidebar keeps its own wiring
 * until it migrates (PRD-reports-redesign §3.1 / d13).
 */
export type FilterOption = { value: string; label: string };

export type FilterRuleShape = {
	field: string;
	operator: string;
	value?: string | number | boolean;
};

export type FilterValueProps = {
	field: string;
	operator: string;
	value: string | number | boolean | undefined;
	onChange: (value: string | number | boolean | undefined) => void;
};

export interface FilterAdapter {
	fields: FilterOption[];
	fieldLabel(field: string): string;
	operatorsFor(field: string): FilterOption[];
	/** Operators that take no value (is_empty and friends). */
	needsValue(operator: string): boolean;
	defaultOperatorFor(field: string): string;
	defaultValueFor(field: string): string | number | boolean | undefined;
	/** True when a stored value encodes operator semantics (timestamp day boundaries) and must be re-picked on operator change. */
	valueDependsOnOperator(field: string): boolean;
	renderValue(props: FilterValueProps): ReactNode;
	/** Condensed phrase for a rule chip/card ("equals Sent", "is before Aug 27, 2026"). */
	summarizeRule(rule: FilterRuleShape): string;
}
