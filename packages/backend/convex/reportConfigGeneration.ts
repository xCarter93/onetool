/**
 * NL → report-config generation engine behind the assistant's createReport
 * tool. A one-shot, thread-less `generateObject` on a dedicated lightweight
 * agent (no tools, no chat instructions) turns the user's request into a
 * config targeting the FULL executeReport surface (groupBy/None, filters,
 * measure, columns), which is validated against the field registry,
 * dry-run through executeReport, then saved via reports.create.
 *
 * Lives in its own module (not assistantTools.ts) so the agent instance
 * doesn't create an assistantTools → assistantAgent import cycle.
 */
import { openai } from "@ai-sdk/openai";
import { Agent, type ToolCtx } from "@convex-dev/agent";
import { ConvexError } from "convex/values";
import { z } from "zod";
import { api, components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalQuery } from "./_generated/server";
import { getCurrentUserOrgId, getCurrentUserOrThrow } from "./lib/auth";
import { getOrgTimezoneById } from "./lib/organization";
import { resolveDayAnchors } from "./lib/reportDates";
import {
	entitlementsFromIdentity,
	isFeatureAllowed,
	type PlanTier,
} from "./lib/entitlements";
import {
	GROUP_BY_OPTIONS,
	getReportField,
	isGenericGroupBy,
	RATIO_KEYS,
	RATIO_METRICS,
	REPORT_ENTITY_TYPES,
	REPORT_FIELDS,
	type ReportEntityType,
	type ReportFieldDef,
} from "./lib/reportFields";
import {
	DATE_RANGE_PRESETS,
	normalizeReportConfig,
	type ReportConfigV2,
	type ReportMetric,
	type ReportVisualization,
} from "./lib/reportConfig";
import {
	isRelatedPath,
	REPORT_RELATIONS,
	resolveReportPath,
} from "./lib/reportRelations";
import {
	resolveReportQueryArgs,
	type ExecuteReportArgs,
} from "./lib/reportQueryArgs";
import type {
	ReportFilterRule,
	ReportFilters,
} from "./lib/reportFilters";
import { rateLimiter } from "./rateLimits";

const REQUEST_MAX_LENGTH = 2000;

const ENTITY_TYPES = REPORT_ENTITY_TYPES;

const FILTER_OPERATORS = [
	"equals",
	"not_equals",
	"contains",
	"greater_than",
	"greater_than_or_equal",
	"less_than",
	"less_than_or_equal",
	"before",
	"after",
	"on",
	"is_empty",
	"is_not_empty",
] as const;

/** The only operators a timestamp field accepts, on either side. */
const DATE_OPERATORS = ["before", "after", "on"] as const;

type DateOperator = (typeof DATE_OPERATORS)[number];

function isDateOperator(operator: string): operator is DateOperator {
	return (DATE_OPERATORS as readonly string[]).includes(operator);
}

const AGGREGATION_OPS = ["sum", "avg", "min", "max"] as const;

type AggregationOp = (typeof AGGREGATION_OPS)[number];

function isAggregationOp(op: string): op is AggregationOp {
	return (AGGREGATION_OPS as readonly string[]).includes(op);
}

// Structured-output providers require every property; "optional" is
// expressed as nullable throughout.
export const generatedReportSchema = z.object({
	entityType: z.enum(ENTITY_TYPES),
	groupBy: z
		.string()
		.nullable()
		.describe(
			"One of the listed Group-by values for the entity, or null for no grouping (raw rows on a table, single total on a chart)."
		),
	measure: z
		.object({
			op: z.enum(["count", "sum", "avg", "min", "max", "ratio"]),
			field: z
				.string()
				.nullable()
				.describe("Required for sum/avg/min/max; null otherwise."),
			ratioKey: z
				.enum(RATIO_KEYS)
				.nullable()
				.describe('Required for op "ratio"; null otherwise.'),
		})
		.nullable()
		.describe("What each group's value is. Null means count of records."),
	filters: z
		.object({
			logic: z.enum(["and", "or"]),
			groups: z.array(
				z.object({
					logic: z.enum(["and", "or"]),
					rules: z.array(
						z.object({
							field: z.string(),
							operator: z.enum(FILTER_OPERATORS),
							value: z
								.union([z.string(), z.number(), z.boolean()])
								.nullable(),
						})
					),
				})
			),
		})
		.nullable(),
	columns: z
		.array(z.string())
		.nullable()
		.describe("Table visualization only: registry fields to show as columns."),
	startDate: z
		.string()
		.nullable()
		.describe("YYYY-MM-DD lower bound for the entity's date field, or null."),
	endDate: z.string().nullable().describe("YYYY-MM-DD upper bound, or null."),
	datePreset: z
		.enum(DATE_RANGE_PRESETS)
		.nullable()
		.describe(
			"Named period for the date range. Preferred over startDate/endDate when the request names one; never both."
		),
	visualization: z.enum(["bar", "column", "line", "pie", "radar", "radial", "table"]),
	name: z.string().describe("Short report title."),
	description: z.string().nullable().describe("One sentence, or null."),
});

export type GeneratedReport = z.infer<typeof generatedReportSchema>;

export type CreateReportResult =
	| {
			ok: true;
			reportId: Id<"reports">;
			name: string;
			path: string;
			summary: string;
			total: number;
			truncated: boolean;
	  }
	| { ok: false; error: string };

// ---------------------------------------------------------------------------
// System prompt — derived from the field registry so it can't drift.
// ---------------------------------------------------------------------------

function describeEntity(entityType: ReportEntityType): string {
	const entity = REPORT_FIELDS[entityType];
	const groupBys = GROUP_BY_OPTIONS[entityType]
		.map((o) => `"${o.value}" (${o.label})`)
		.join(", ");
	const measureSafe = GROUP_BY_OPTIONS[entityType]
		.filter((o) => isGenericGroupBy(entityType, o.value))
		.map((o) => `"${o.value}"`)
		.join(", ");
	const fields = Object.entries(entity.fields)
		.map(([name, def]) => {
			const opts = def.options ? ` ∈ [${def.options.join(", ")}]` : "";
			return `  - ${name} (${def.type}${opts})`;
		})
		.join("\n");
	return [
		`${entityType} — date range applies to ${entity.dateField}`,
		`  Group-by values: ${groupBys}, or null`,
		`  Group-by values compatible with a non-count measure: ${measureSafe || "(none)"}, or null`,
		`Fields:\n${fields}`,
	].join("\n");
}

/** Every FK edge in the registry, so the path grammar can't drift from it. */
const RELATION_EDGES = ENTITY_TYPES.flatMap((entity) =>
	Object.entries(REPORT_RELATIONS[entity]).map(
		([field, edge]) => `${entity}.${field} → ${edge.refType}`
	)
);

export const REPORT_CONFIG_SYSTEM_PROMPT = [
	"You convert a user's plain-English request into a report configuration for OneTool, a business management app for field-service businesses.",
	"",
	"Entities:",
	...ENTITY_TYPES.map(describeEntity),
	"",
	"Links between entities (child.field → parent):",
	`  ${RELATION_EDGES.join(", ")}`,
	"A groupBy or filter field may be a dotted path: link field names joined by dots, ending in a field of the entity you arrive at.",
	'  e.g. on invoices "clientId.leadSource" is the client\'s lead source; "quoteId.projectId.startDate_month" buckets by the month the quote\'s project started; on invoiceLineItems "invoiceId.quoteId.projectId.clientId" reaches the client record.',
	"A path may end on a link field itself (groups by that related record) — groupBy only; filter paths must end on a field. Never traverse through users or skus, and never invent a link.",
	"",
	"Rules:",
	'- groupBy must be exactly one of the listed Group-by values for the chosen entity, a dotted path, or null. Never invent values.',
	'- A list of individual records ("show me all overdue invoices") is visualization "table" with groupBy null and 3-5 relevant columns.',
	'- Charts (bar/column/line/pie/radar/radial) render above the aggregated data table and require a groupBy. "table" means no chart — groupBy null there is fine for raw rows.',
	'- Visualization choice: "column" for time-bucketed groupBy (month/week/day); "bar" for named categories (status, client, lead source, etc.); "line" for a trend over time; "pie" for share-of-total; "table" for exact values or raw rows. Only use "radar" or "radial" when the user explicitly asks for that chart type.',
	"- measure: null (count of records) unless the user asks about amounts — then sum/avg/min/max of a number or currency field. A non-count measure only combines with the measure-compatible Group-by values listed per entity, or groupBy null.",
	`- measure {op: "ratio", ratioKey}: a built-in percentage. Available: ${RATIO_KEYS.map(
		(key) => `"${key}" on ${RATIO_METRICS[key].entityType}`
	).join(", ")}. groupBy must be null.`,
	'- To roll a linked entity up per record, report on the child entity and group by the link: "total invoiced per client" is entityType "invoices" with measure {op: "sum", field: "total"} and groupBy "clientId"; "count of line items per quote" is entityType "quoteLineItems" with measure null and groupBy "quoteId" (a parent path like "quoteId.quoteNumber" labels the buckets by that field instead).',
	'- A ratio measure renders as one figure, so the visualization you pick is ignored — use "table".',
	"- filters: fields listed for the entity, or a dotted path ending in one. Timestamp fields filter with before/after/on and a YYYY-MM-DD value — no other operator applies to a date, and those three apply to nothing else. When a field lists allowed values, equals/not_equals values must match one exactly.",
	'- "contains" is for free-text string fields only; greater/less operators are for number and currency fields.',
	"- Money values are dollars (e.g. 500 means $500).",
	"- columns: only for table visualization; use exact field names.",
	`- Date range: prefer datePreset when the request names a period (${DATE_RANGE_PRESETS.join(", ")}) — "this month" is "this_month" — since a preset re-resolves in the org's timezone every time the report runs. Use startDate/endDate only for an explicit or unusual range, resolved from the current date given in the request. Never set both.`,
	"- name: a short title like a human would write; description: one sentence or null.",
	"",
	"When the request comes with a configuration the user already has open, it is described in saved-report terms — reproduce every part of it you were not asked to change:",
	'- "metric: count of records" is measure null; "metric: sum of total" is measure {op: "sum", field: "total"}; "metric: ratio (conversionRate)" is measure {op: "ratio", ratioKey: "conversionRate"}.',
	'- A date range named as a period ("date range: this_month") is that datePreset; explicit days are startDate/endDate.',
	'- A dotted "group by" is that exact string.',
	'- invoices summing total over paid records grouped by paidAt_month or clientId are groupBy "month" and "client".',
	'- A setting the schema has no field for (segment by, a date range scoped "on <field>") you cannot reproduce — leave it out.',
].join("\n");

// ---------------------------------------------------------------------------
// Validation + mapping (pure, exported for tests)
// ---------------------------------------------------------------------------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Drop incomplete rules and empty groups; null when nothing survives. */
export function sanitizeGeneratedFilters(
	filters: GeneratedReport["filters"]
): ReportFilters | null {
	if (!filters) return null;
	const groups = filters.groups
		.map((group) => ({
			logic: group.logic,
			rules: group.rules
				.filter(
					(rule) =>
						rule.operator === "is_empty" ||
						rule.operator === "is_not_empty" ||
						(rule.value !== null && rule.value !== "")
				)
				.map(
					(rule): ReportFilterRule => ({
						field: rule.field,
						operator: rule.operator,
						...(rule.operator === "is_empty" ||
						rule.operator === "is_not_empty"
							? {}
							: { value: rule.value as string | number | boolean }),
					})
				),
		}))
		.filter((group) => group.rules.length > 0);
	if (groups.length === 0) return null;
	return { logic: filters.logic, groups };
}

/** Rule count across groups; tolerant of untrusted (relayed) filter shapes. */
function countFilterRules(filters: ReportFilters | null | undefined): number {
	if (!filters || !Array.isArray(filters.groups)) return 0;
	return filters.groups.reduce(
		(n, group) => n + (Array.isArray(group?.rules) ? group.rules.length : 0),
		0
	);
}

/** ConvexError carries its message in `data`; plain errors in `message`. */
function pathErrorMessage(error: unknown): string {
	if (error instanceof ConvexError && typeof error.data === "string") {
		return error.data;
	}
	return error instanceof Error ? error.message : String(error);
}

/** Field def a filter rule ends on — direct or through a dotted path. */
function resolveFilterFieldDef(
	entityType: ReportEntityType,
	field: string
): { def: ReportFieldDef } | { error: string } {
	if (!isRelatedPath(field)) {
		const def = getReportField(entityType, field);
		return def
			? { def }
			: { error: `filter field "${field}" does not exist on ${entityType}` };
	}
	try {
		const { terminal } = resolveReportPath(entityType, field);
		if (terminal.kind === "fk") {
			return {
				error: `filter field "${field}" resolves to a related record, not a filterable value`,
			};
		}
		if (terminal.granularity) {
			return { error: `filter field "${field}" is a time bucket, not a filterable value` };
		}
		return { def: terminal.def };
	} catch (error) {
		return { error: pathErrorMessage(error) };
	}
}

/** Registry/coherence errors in a generated config; empty when valid. */
export function validateGeneratedReport(gen: GeneratedReport): string[] {
	const errors: string[] = [];
	const entityType = gen.entityType;

	if (gen.groupBy !== null) {
		if (isRelatedPath(gen.groupBy)) {
			try {
				resolveReportPath(entityType, gen.groupBy);
			} catch (error) {
				errors.push(pathErrorMessage(error));
			}
		} else {
			const allowed = GROUP_BY_OPTIONS[entityType].map((o) => o.value);
			if (!allowed.includes(gen.groupBy)) {
				errors.push(
					`groupBy "${gen.groupBy}" is not valid for ${entityType}; use one of ${allowed.join(", ")} or null`
				);
			}
		}
	}

	const measure = gen.measure;
	if (measure?.op === "ratio" && gen.groupBy !== null) {
		// A ratio buckets without a dimension — reportData rejects any grouping.
		errors.push("a ratio measure cannot combine with a groupBy — use groupBy null");
	}
	if (measure?.op === "ratio") {
		if (!measure.ratioKey) {
			errors.push("measure ratio requires a ratioKey");
		} else if (RATIO_METRICS[measure.ratioKey].entityType !== entityType) {
			errors.push(
				`ratio "${measure.ratioKey}" is only available for ${RATIO_METRICS[measure.ratioKey].entityType}, not ${entityType}`
			);
		}
	} else if (measure && measure.op !== "count") {
		if (!measure.field) {
			errors.push(`measure ${measure.op} requires a field`);
		} else {
			const def = getReportField(entityType, measure.field);
			if (!def || (def.type !== "number" && def.type !== "currency")) {
				errors.push(
					`measure field "${measure.field}" must be a number or currency field of ${entityType}`
				);
			}
		}
		if (gen.groupBy !== null && !isGenericGroupBy(entityType, gen.groupBy)) {
			errors.push(
				`a ${measure.op} measure cannot combine with groupBy "${gen.groupBy}" — use a measure-compatible grouping or none`
			);
		}
	}

	const filters = sanitizeGeneratedFilters(gen.filters);
	for (const group of filters?.groups ?? []) {
		for (const rule of group.rules) {
			const resolved = resolveFilterFieldDef(entityType, rule.field);
			if ("error" in resolved) {
				errors.push(resolved.error);
				continue;
			}
			const def = resolved.def;
			if (def.type === "timestamp") {
				if (!isDateOperator(rule.operator)) {
					errors.push(
						`filter field "${rule.field}" is a date — use before/after/on with a YYYY-MM-DD value`
					);
				} else if (typeof rule.value !== "string" || !ISO_DATE.test(rule.value)) {
					errors.push(`"${rule.operator}" on "${rule.field}" needs a YYYY-MM-DD value`);
				} else if (!isRealCalendarDate(rule.value)) {
					errors.push(
						`"${rule.operator}" on "${rule.field}" needs a real calendar date`
					);
				}
				continue;
			}
			if (isDateOperator(rule.operator)) {
				errors.push(
					`"${rule.operator}" only applies to date fields, not "${rule.field}"`
				);
				continue;
			}
			if (rule.operator === "contains" && def.type !== "string") {
				errors.push(`"contains" only applies to text fields, not "${rule.field}"`);
			}
			if (
				(rule.operator === "greater_than" ||
					rule.operator === "greater_than_or_equal" ||
					rule.operator === "less_than" ||
					rule.operator === "less_than_or_equal") &&
				def.type !== "number" &&
				def.type !== "currency"
			) {
				errors.push(
					`"${rule.operator}" only applies to numeric fields, not "${rule.field}"`
				);
			}
			if (
				def.options &&
				(rule.operator === "equals" || rule.operator === "not_equals") &&
				typeof rule.value === "string" &&
				!def.options.includes(rule.value)
			) {
				errors.push(
					`"${rule.value}" is not a valid ${rule.field} value; use one of ${def.options.join(", ")}`
				);
			}
		}
	}

	if (gen.visualization === "table") {
		for (const column of gen.columns ?? []) {
			if (!getReportField(entityType, column)) {
				errors.push(`column "${column}" does not exist on ${entityType}`);
			}
		}
	}

	for (const [label, value] of [
		["startDate", gen.startDate],
		["endDate", gen.endDate],
	] as const) {
		if (value === null) continue;
		if (!ISO_DATE.test(value)) {
			errors.push(`${label} must be YYYY-MM-DD`);
		} else if (!isRealCalendarDate(value)) {
			errors.push(`${label} must be a real calendar date`);
		}
	}
	if (
		gen.startDate &&
		gen.endDate &&
		ISO_DATE.test(gen.startDate) &&
		ISO_DATE.test(gen.endDate) &&
		gen.startDate > gen.endDate
	) {
		errors.push("startDate is after endDate");
	}
	if (gen.datePreset && (gen.startDate || gen.endDate)) {
		errors.push(
			"datePreset and startDate/endDate are mutually exclusive — use one or the other"
		);
	}

	if (!gen.name.trim()) errors.push("name must not be empty");

	return errors;
}

/**
 * True when a shape-valid YYYY-MM-DD names an actual calendar day —
 * Date.parse alone rolls impossible days over (2026-02-31 → Mar 3) and
 * yields NaN for impossible months, which inDateBounds treats as unbounded.
 */
function isRealCalendarDate(date: string): boolean {
	const [y, m, d] = date.split("-").map(Number);
	const dt = new Date(Date.UTC(y, m - 1, d));
	return (
		dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
	);
}

function toDateRange(
	gen: GeneratedReport,
	timezone?: string
): { start?: number; end?: number } | undefined {
	if (!gen.startDate && !gen.endDate) return undefined;
	return {
		...(gen.startDate
			? { start: resolveDayAnchors(gen.startDate, timezone).start }
			: {}),
		...(gen.endDate ? { end: resolveDayAnchors(gen.endDate, timezone).end } : {}),
	};
}

/**
 * Date-op rule values are authored as YYYY-MM-DD but evaluated as ms instants
 * on the org calendar, encoded the way the builder's date picker does it
 * (report-filter-adapter): "before" excludes the whole picked day, "after"
 * starts after it, and "on" is org-local noon so the day key survives DST.
 */
function dateOperatorInstant(
	operator: DateOperator,
	date: string,
	timezone?: string
): number {
	const anchors = resolveDayAnchors(date, timezone);
	if (operator === "before") return anchors.start;
	if (operator === "after") return anchors.end;
	return anchors.noon;
}

function toExecutableFilters(
	filters: ReportFilters | null,
	timezone?: string
): ReportFilters | null {
	if (!filters) return null;
	return {
		logic: filters.logic,
		groups: filters.groups.map((group) => ({
			logic: group.logic,
			rules: group.rules.map((rule) =>
				isDateOperator(rule.operator) && typeof rule.value === "string"
					? {
							...rule,
							value: dateOperatorInstant(rule.operator, rule.value, timezone),
						}
					: rule
			),
		})),
	};
}

/** Metrics the v1 shape cannot carry; undefined leaves the normalizer's own. */
function toNativeMetric(gen: GeneratedReport): ReportMetric | undefined {
	const measure = gen.measure;
	if (measure?.op === "ratio") {
		return measure.ratioKey
			? { op: "ratio", ratioKey: measure.ratioKey }
			: undefined;
	}
	return undefined;
}

/**
 * Charts require a groupBy to aggregate on (Slice 3-D3: the chart renders
 * above the data table, fed by the same grouped query) — a chart with no
 * groupBy has nothing to chart above, so it's coerced to a plain table
 * instead of silently producing a chart-labeled report that only ever
 * renders a table (see toExecuteReportArgs' matching detailMode fallback).
 */
function resolveVisualization(
	gen: GeneratedReport
): ReportVisualization["type"] {
	// One value, no dimension — the KPI figure is the only rendering with data.
	if (isMetricOnlyMeasure(gen.measure)) return "number";
	return gen.groupBy === null && gen.visualization !== "table" ? "table" : gen.visualization;
}

function isMetricOnlyMeasure(measure: GeneratedReport["measure"]): boolean {
	return measure?.op === "ratio";
}

/**
 * Generated config → the canonical v2 pair every downstream path uses.
 * Routed through the v1 normalizer because the generatable Group-by
 * vocabulary still includes the magic keys (month, client, conversionRate,
 * completionRate), which only become executable v2 configs by expansion; the
 * two things v1 cannot carry (ratio metrics, preset ranges) are laid over the
 * expansion, so a preset keeps the date FIELD the expansion chose.
 */
function toGeneratedConfig(
	gen: GeneratedReport,
	timezone?: string
): {
	config: ReportConfigV2;
	visualization: ReportVisualization;
} {
	const filters = toExecutableFilters(
		sanitizeGeneratedFilters(gen.filters),
		timezone
	);
	const dateRange = toDateRange(gen, timezone);
	const measure = gen.measure;
	const visualization = resolveVisualization(gen);
	const normalized = normalizeReportConfig(
		{
			entityType: gen.entityType,
			...(gen.groupBy ? { groupBy: [gen.groupBy] } : {}),
			...(dateRange ? { dateRange } : {}),
			...(filters ? { filters } : {}),
			...(measure && isAggregationOp(measure.op) && measure.field
				? { aggregations: [{ field: measure.field, operation: measure.op }] }
				: {}),
			...(visualization === "table" && gen.columns?.length
				? { columns: gen.columns }
				: {}),
		},
		{ type: visualization }
	);
	const metric = toNativeMetric(gen);
	return {
		config: {
			...normalized.config,
			...(metric ? { metric } : {}),
			...(gen.datePreset
				? {
						date: {
							...normalized.config.date,
							range: { kind: "preset" as const, preset: gen.datePreset },
						},
					}
				: {}),
		},
		visualization: normalized.visualization,
	};
}

/**
 * What a generated report becomes: the saved-report arguments AND the seed the
 * builder applies to its live state — deliberately the same shape, so applying
 * a generated config then saving it can't produce a different report.
 * An omitted description means "leave it as it is".
 */
export type BuilderReportConfig = {
	name: string;
	description?: string;
	config: ReportConfigV2;
	visualization: ReportVisualization;
};

/** Saved shape for reports.create. */
export function toSavedReport(
	gen: GeneratedReport,
	timezone?: string
): BuilderReportConfig {
	const { config, visualization } = toGeneratedConfig(gen, timezone);
	return {
		name: gen.name.trim(),
		...(gen.description ? { description: gen.description } : {}),
		config,
		visualization,
	};
}

/** executeReport args for the dry run — delegates to the shared contract
 * module (lib/reportQueryArgs.ts) so the web's resolveReportQueryArgs and
 * this path can never drift. */
export function toExecuteReportArgs(
	gen: GeneratedReport,
	timezone?: string
): ExecuteReportArgs {
	const { config, visualization } = toGeneratedConfig(gen, timezone);
	return resolveReportQueryArgs(config, visualization);
}

/** One short sentence the assistant can echo about what was built. */
export function summarizeGeneratedReport(gen: GeneratedReport): string {
	// Reflect what's actually saved/applied, not the model's raw guess — a
	// chart with null groupBy is coerced to table (see resolveVisualization).
	const visualization = resolveVisualization(gen);
	const measure = gen.measure;
	const parts: string[] = [gen.entityType];
	if (gen.groupBy) {
		const label = GROUP_BY_OPTIONS[gen.entityType].find(
			(o) => o.value === gen.groupBy
		)?.label;
		parts.push(`grouped by ${label ?? gen.groupBy}`);
	} else if (visualization === "table" && !isMetricOnlyMeasure(measure)) {
		parts.push("as individual rows");
	}
	if (measure?.op === "ratio" && measure.ratioKey) {
		parts.push(`measuring ratio (${measure.ratioKey})`);
	} else if (measure && isAggregationOp(measure.op) && measure.field) {
		parts.push(`measuring ${measure.op} of ${measure.field}`);
	}
	const ruleCount = countFilterRules(sanitizeGeneratedFilters(gen.filters));
	if (ruleCount > 0) parts.push(`with ${ruleCount} filter${ruleCount === 1 ? "" : "s"}`);
	if (gen.datePreset) {
		parts.push(`over ${gen.datePreset}`);
	} else if (gen.startDate || gen.endDate) {
		parts.push(
			`from ${gen.startDate ?? "the beginning"} to ${gen.endDate ?? "now"}`
		);
	}
	if (visualization === "number") {
		return `single metric of ${parts.join(", ")}`;
	}
	return `${visualization} of ${parts.join(", ")}`;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

// Dedicated one-shot agent: no tools, no chat instructions, no default
// usageHandler (attribution is per-call — thread-less calls can't resolve
// org from thread meta). NOTE: AI SDK v6 marks generateObject deprecated in
// favor of generateText output settings; @convex-dev/agent 0.6.x still
// wraps it directly — revisit on the next agent-component upgrade.
// gpt-5.4-mini (not nano): schema-generation misses cause whole-tool retries,
// which dominated configure-turn latency — one clean shot beats 3 cheap ones.
export const reportConfigAgent = new Agent(components.agent, {
	name: "report-config-generator",
	languageModel: openai.chat("gpt-5.4-mini"),
});

/** Resolve the calling user + org + plan for gating and rate limiting.
 * Identity propagates from the assistant action into this runQuery. */
export const authContext = internalQuery({
	args: {},
	handler: async (
		ctx
	): Promise<{
		userId: Id<"users">;
		orgId: Id<"organizations">;
		plan: PlanTier;
		timezone: string | undefined;
	} | null> => {
		const user = await getCurrentUserOrThrow(ctx);
		const orgId = await getCurrentUserOrgId(ctx);
		if (!orgId) return null;
		const { plan } = await entitlementsFromIdentity(ctx);
		const timezone = await getOrgTimezoneById(ctx, orgId);
		return { userId: user._id, orgId, plan, timezone };
	},
});

/** Cap on the current-config JSON the model relays from screen context. */
const CURRENT_CONFIG_MAX_LENGTH = 4000;

const METRIC_OPS: readonly ReportMetric["op"][] = [
	"count",
	"sum",
	"avg",
	"min",
	"max",
	"ratio",
];

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

/** The builder's live draft, as relayed from screen context. */
export type CurrentReportConfig = {
	config: ReportConfigV2;
	visualization: ReportVisualization | null;
};

/**
 * The current-config JSON arrives via the model (copied from the
 * <current-screen> block), so treat it as untrusted prompt input: it's
 * accepted only as a `{ config, visualization }` pair carrying the v2 marker,
 * a known entity and a known metric op, and everything below that is rendered
 * defensively. It only steers generation — the output is still fully
 * validated.
 */
export function parseCurrentConfig(
	currentConfig: string | null | undefined
): CurrentReportConfig | null {
	if (!currentConfig || currentConfig.length > CURRENT_CONFIG_MAX_LENGTH) {
		return null;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(currentConfig);
	} catch {
		return null;
	}
	const root = asRecord(parsed);
	const config = asRecord(root?.config);
	const metric = asRecord(config?.metric);
	if (!config || !metric || config.version !== 2) return null;
	if (!ENTITY_TYPES.includes(config.entityType as ReportEntityType)) return null;
	if (!METRIC_OPS.includes(metric.op as ReportMetric["op"])) return null;
	const visualization = asRecord(root?.visualization);
	return {
		config: config as unknown as ReportConfigV2,
		visualization:
			typeof visualization?.type === "string"
				? (visualization as unknown as ReportVisualization)
				: null,
	};
}

function isoDay(ms: number | undefined): string | undefined {
	return typeof ms === "number"
		? new Date(ms).toISOString().slice(0, 10)
		: undefined;
}

function describeMetric(metric: ReportMetric): string {
	if (metric.op === "count") return "count of records";
	if (metric.op === "ratio") return `ratio (${metric.ratioKey ?? "unknown"})`;
	return `${metric.op} of ${metric.field ?? "(no field)"}`;
}

function describeDateRange(date: ReportConfigV2["date"]): string {
	const scope = typeof date?.field === "string" ? ` on ${date.field}` : "";
	const range = date?.range;
	if (range?.kind === "preset") return `${range.preset}${scope}`;
	const start = isoDay(range?.start);
	const end = isoDay(range?.end);
	if (!start && !end) return `all time${scope}`;
	return `${start ?? "the beginning"} to ${end ?? "now"}${scope}`;
}

/** Prompt rendering of the open draft — v2 vocabulary, no raw JSON relay. */
export function describeCurrentConfig(current: CurrentReportConfig): string {
	const { config, visualization } = current;
	const rules = countFilterRules(config.filters);
	const lines = [
		`entity: ${config.entityType}`,
		`metric: ${describeMetric(config.metric)}`,
		`group by: ${typeof config.groupBy === "string" ? config.groupBy : "none"}`,
		`date range: ${describeDateRange(config.date)}`,
		`filters: ${rules} rule${rules === 1 ? "" : "s"}`,
	];
	if (typeof config.segmentBy === "string") {
		lines.push(`segment by: ${config.segmentBy}`);
	}
	if (Array.isArray(config.columns)) {
		lines.push(`columns: ${config.columns.join(", ")}`);
	}
	if (visualization) lines.push(`visualization: ${visualization.type}`);
	return lines.join("\n");
}

type GenerationOutcome =
	| {
			ok: true;
			generated: GeneratedReport;
			total: number;
			truncated: boolean;
			timezone: string | undefined;
	  }
	| { ok: false; error: string };

/**
 * Shared core: rate limit → generateObject → validate → dry-run
 * executeReport. Errors come back as { ok: false } so the assistant can
 * relay or refine rather than surface a raw tool crash.
 */
async function runReportGeneration(
	ctx: ToolCtx,
	request: string,
	currentConfig?: string | null
): Promise<GenerationOutcome> {
	if (!request.trim()) {
		return { ok: false, error: "Describe the report you want." };
	}
	if (request.length > REQUEST_MAX_LENGTH) {
		return { ok: false, error: "That request is too long — please shorten it." };
	}

	const auth = await ctx.runQuery(internal.reportConfigGeneration.authContext, {});
	if (!auth) {
		return { ok: false, error: "No organization found for this user." };
	}

	// The pipeline entry is the single NL-generation gate, so every surface
	// that ever calls it (assistant tool, future report-page buttons)
	// enforces identically. The denial is data the model relays — the chat
	// keeps working, and the blocked ask already debited its daily message.
	if (!isFeatureAllowed(auth.plan, "nlReportGeneration")) {
		return {
			ok: false,
			error:
				"Generating reports with AI is part of the Business plan. Tell the user they can build and edit this report manually in the report builder, or upgrade to generate it with AI.",
		};
	}

	const { ok: allowed, retryAfter } = await rateLimiter.limit(
		ctx,
		"reportConfigGeneration",
		{ key: auth.userId }
	);
	if (!allowed) {
		const minutes = Math.max(1, Math.ceil((retryAfter ?? 0) / 60_000));
		return {
			ok: false,
			error: `Report generation is rate limited — try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`,
		};
	}

	const current = parseCurrentConfig(currentConfig);
	const promptParts = [
		`Current date: ${new Date().toISOString().slice(0, 10)}`,
	];
	if (current) {
		promptParts.push(
			`The user currently has this report configuration open:\n${describeCurrentConfig(current)}\nApply the requested change to it — keep every setting the request doesn't mention.`
		);
	}
	promptParts.push(`Request: ${request}`);

	let generated: GeneratedReport;
	try {
		const result = await reportConfigAgent.generateObject(
			ctx,
			{ userId: auth.userId },
			{
				schema: generatedReportSchema,
				system: REPORT_CONFIG_SYSTEM_PROMPT,
				prompt: promptParts.join("\n\n"),
				// Schema-constrained one-shot needs little deliberation; default
				// effort spends most of the turn's wall-clock on reasoning tokens.
				providerOptions: { openai: { reasoningEffort: "low" } },
			},
			{
				usageHandler: async (handlerCtx, args) => {
					await handlerCtx.runMutation(internal.assistantAgent.recordUsage, {
						orgId: auth.orgId,
						userId: auth.userId,
						agentName: args.agentName,
						model: args.model,
						provider: args.provider,
						inputTokens: args.usage.inputTokens ?? 0,
						outputTokens: args.usage.outputTokens ?? 0,
						totalTokens: args.usage.totalTokens ?? 0,
					});
				},
			}
		);
		generated = result.object;
	} catch (error) {
		console.error("report config generation failed", error);
		return {
			ok: false,
			error: "Couldn't generate a report configuration for that request.",
		};
	}

	const errors = validateGeneratedReport(generated);
	if (errors.length > 0) {
		return { ok: false, error: `The generated configuration was invalid: ${errors.join("; ")}` };
	}

	// Dry run proves the config executes before anything is saved/applied.
	try {
		const result = await ctx.runQuery(
			api.reportData.executeReport,
			toExecuteReportArgs(generated, auth.timezone)
		);
		return {
			ok: true,
			generated,
			total: result.total,
			truncated: result.metadata?.truncated === true,
			timezone: auth.timezone,
		};
	} catch (error) {
		const message =
			error instanceof ConvexError && typeof error.data === "string"
				? error.data
				: "the report query failed";
		return { ok: false, error: `The generated report didn't run: ${message}` };
	}
}

/** createReport flow: shared core, then persist as a new saved report. */
export async function generateAndSaveReport(
	ctx: ToolCtx,
	request: string
): Promise<CreateReportResult> {
	const outcome = await runReportGeneration(ctx, request);
	if (!outcome.ok) return outcome;
	const { generated, total, truncated, timezone } = outcome;

	const saved = toSavedReport(generated, timezone);
	const reportId = await ctx.runMutation(api.reports.create, saved);

	return {
		ok: true,
		reportId,
		name: saved.name,
		path: `/reports/${reportId}`,
		summary: summarizeGeneratedReport(generated),
		total,
		truncated,
	};
}

export type ConfigureReportResult =
	| {
			ok: true;
			config: BuilderReportConfig;
			summary: string;
			total: number;
			truncated: boolean;
	  }
	| { ok: false; error: string };

/** Generated config → the shape the builder applies (exported for tests). */
export function toBuilderConfig(
	gen: GeneratedReport,
	timezone?: string
): BuilderReportConfig {
	return toSavedReport(gen, timezone);
}

/**
 * configureReport flow: shared core, nothing persisted — the validated,
 * dry-run config is returned for the builder screen to apply in place.
 */
export async function generateConfigForBuilder(
	ctx: ToolCtx,
	request: string,
	currentConfig?: string | null
): Promise<ConfigureReportResult> {
	const outcome = await runReportGeneration(ctx, request, currentConfig);
	if (!outcome.ok) return outcome;
	const { generated, total, truncated, timezone } = outcome;

	return {
		ok: true,
		config: toBuilderConfig(generated, timezone),
		summary: summarizeGeneratedReport(generated),
		total,
		truncated,
	};
}
