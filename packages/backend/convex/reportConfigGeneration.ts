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
import {
	DEFAULT_DETAIL_COLUMNS,
	GROUP_BY_OPTIONS,
	getReportField,
	isGenericGroupBy,
	REPORT_FIELDS,
	usesLegacyDispatch,
	type ReportEntityType,
} from "./lib/reportFields";
import type {
	ReportFilterRule,
	ReportFilters,
} from "./lib/reportFilters";
import { rateLimiter } from "./rateLimits";

const REQUEST_MAX_LENGTH = 2000;

const ENTITY_TYPES = [
	"clients",
	"projects",
	"tasks",
	"quotes",
	"invoices",
	"activities",
] as const;

const FILTER_OPERATORS = [
	"equals",
	"not_equals",
	"contains",
	"greater_than",
	"greater_than_or_equal",
	"less_than",
	"less_than_or_equal",
	"is_empty",
	"is_not_empty",
] as const;

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
			op: z.enum(["count", "sum", "avg", "min", "max"]),
			field: z
				.string()
				.nullable()
				.describe("Required for sum/avg/min/max; null for count."),
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

export const REPORT_CONFIG_SYSTEM_PROMPT = [
	"You convert a user's plain-English request into a report configuration for OneTool, a business management app for field-service businesses.",
	"",
	"Entities:",
	...ENTITY_TYPES.map(describeEntity),
	"",
	"Rules:",
	'- groupBy must be exactly one of the listed Group-by values for the chosen entity, or null. Never invent values.',
	'- A list of individual records ("show me all overdue invoices") is visualization "table" with groupBy null and 3-5 relevant columns.',
	'- Charts (bar/column/line/pie/radar/radial) render above the aggregated data table and require a groupBy. "table" means no chart — groupBy null there is fine for raw rows.',
	'- Visualization choice: "column" for time-bucketed groupBy (month/week/day); "bar" for named categories (status, client, lead source, etc.); "line" for a trend over time; "pie" for share-of-total; "table" for exact values or raw rows. Only use "radar" or "radial" when the user explicitly asks for that chart type.',
	"- measure: null (count of records) unless the user asks about amounts — then sum/avg/min/max of a number or currency field. A non-count measure only combines with the measure-compatible Group-by values listed per entity, or groupBy null.",
	"- filters: only fields listed for the entity. Timestamp fields are never filterable — use startDate/endDate for time. When a field lists allowed values, equals/not_equals values must match one exactly.",
	'- "contains" is for free-text string fields only; greater/less operators are for number and currency fields.',
	"- Money values are dollars (e.g. 500 means $500).",
	"- columns: only for table visualization; use exact field names.",
	"- Resolve relative dates (this month, last quarter) from the current date given in the request.",
	"- name: a short title like a human would write; description: one sentence or null.",
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

/** Registry/coherence errors in a generated config; empty when valid. */
export function validateGeneratedReport(gen: GeneratedReport): string[] {
	const errors: string[] = [];
	const entityType = gen.entityType;
	const registry = REPORT_FIELDS[entityType];

	if (gen.groupBy !== null) {
		const allowed = GROUP_BY_OPTIONS[entityType].map((o) => o.value);
		if (!allowed.includes(gen.groupBy)) {
			errors.push(
				`groupBy "${gen.groupBy}" is not valid for ${entityType}; use one of ${allowed.join(", ")} or null`
			);
		}
	}

	if (gen.measure && gen.measure.op !== "count") {
		if (!gen.measure.field) {
			errors.push(`measure ${gen.measure.op} requires a field`);
		} else {
			const def = getReportField(entityType, gen.measure.field);
			if (!def || (def.type !== "number" && def.type !== "currency")) {
				errors.push(
					`measure field "${gen.measure.field}" must be a number or currency field of ${entityType}`
				);
			}
		}
		if (gen.groupBy !== null && !isGenericGroupBy(entityType, gen.groupBy)) {
			errors.push(
				`a ${gen.measure.op} measure cannot combine with groupBy "${gen.groupBy}" — use a measure-compatible grouping or none`
			);
		}
	}

	const filters = sanitizeGeneratedFilters(gen.filters);
	for (const group of filters?.groups ?? []) {
		for (const rule of group.rules) {
			const def = getReportField(entityType, rule.field);
			if (!def) {
				errors.push(`filter field "${rule.field}" does not exist on ${entityType}`);
				continue;
			}
			if (def.type === "timestamp") {
				errors.push(
					`filter field "${rule.field}" is a date — use startDate/endDate instead`
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
		if (value !== null && !ISO_DATE.test(value)) {
			errors.push(`${label} must be YYYY-MM-DD`);
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

	if (!gen.name.trim()) errors.push("name must not be empty");

	return errors;
}

function dayStartMs(date: string): number {
	return Date.parse(`${date}T00:00:00.000Z`);
}

function dayEndMs(date: string): number {
	return Date.parse(`${date}T23:59:59.999Z`);
}

function toDateRange(
	gen: GeneratedReport
): { start?: number; end?: number } | undefined {
	if (!gen.startDate && !gen.endDate) return undefined;
	return {
		...(gen.startDate ? { start: dayStartMs(gen.startDate) } : {}),
		...(gen.endDate ? { end: dayEndMs(gen.endDate) } : {}),
	};
}

/**
 * Charts require a groupBy to aggregate on (Slice 3-D3: the chart renders
 * above the data table, fed by the same grouped query) — a chart with no
 * groupBy has nothing to chart above, so it's coerced to a plain table
 * instead of silently producing a chart-labeled report that only ever
 * renders a table (see toExecuteReportArgs' matching detailMode fallback).
 */
function resolveVisualization(gen: GeneratedReport): GeneratedReport["visualization"] {
	return gen.groupBy === null && gen.visualization !== "table" ? "table" : gen.visualization;
}

/** Saved shape for reports.create — matches the builder's persistence rules
 * (count measure = omitted aggregations; columns only for table viz). */
export function toSavedReport(gen: GeneratedReport): {
	name: string;
	description?: string;
	config: {
		entityType: ReportEntityType;
		groupBy?: string[];
		dateRange?: { start?: number; end?: number };
		filters?: ReportFilters;
		aggregations?: {
			field: string;
			operation: "sum" | "avg" | "min" | "max";
		}[];
		columns?: string[];
	};
	visualization: { type: "bar" | "column" | "line" | "pie" | "radar" | "radial" | "table" };
} {
	const filters = sanitizeGeneratedFilters(gen.filters);
	const measure = gen.measure;
	const visualization = resolveVisualization(gen);
	return {
		name: gen.name.trim(),
		...(gen.description ? { description: gen.description } : {}),
		config: {
			entityType: gen.entityType,
			...(gen.groupBy ? { groupBy: [gen.groupBy] } : {}),
			...(toDateRange(gen) ? { dateRange: toDateRange(gen) } : {}),
			...(filters ? { filters } : {}),
			...(measure && measure.op !== "count" && measure.field
				? {
						aggregations: [
							{ field: measure.field, operation: measure.op },
						],
					}
				: {}),
			...(visualization === "table" && gen.columns?.length
				? { columns: gen.columns }
				: {}),
		},
		visualization: { type: visualization },
	};
}

/** executeReport args for the dry run — mirrors the web's
 * resolveReportQueryArgs semantics for detail mode and "Group by: None". */
export function toExecuteReportArgs(gen: GeneratedReport): {
	entityType: ReportEntityType;
	groupBy?: string;
	dateRange?: { start?: number; end?: number };
	filters?: ReportFilters;
	aggregation?: { op: "count" | "sum" | "avg" | "min" | "max"; field?: string };
	detail?: { columns: string[] };
} {
	const groupBy = gen.groupBy ?? undefined;
	const filters = sanitizeGeneratedFilters(gen.filters) ?? undefined;
	const base = {
		entityType: gen.entityType,
		groupBy,
		dateRange: toDateRange(gen),
		filters,
	};

	// No groupBy means raw-row detail mode for every viz type, not just
	// table — a chart with nothing to group on has nothing to chart above
	// (Slice 3-D3: chart renders above the data table, fed by the same
	// grouped query). Mirrors the web's isDetailModeActive.
	const detailMode = !groupBy || (gen.visualization === "table" && (gen.columns?.length ?? 0) > 0);
	if (detailMode) {
		return {
			...base,
			detail: {
				columns: gen.columns?.length
					? gen.columns
					: DEFAULT_DETAIL_COLUMNS[gen.entityType],
			},
		};
	}

	const measure =
		gen.measure && gen.measure.op !== "count" && gen.measure.field
			? { op: gen.measure.op, field: gen.measure.field }
			: undefined;

	// detailMode already returned above whenever groupBy is unset, so
	// groupBy is guaranteed defined past this point. Non-count measures
	// always need the generic pipeline; a legacy-only groupBy must keep
	// hitting the legacy dispatch for unchanged output; any other groupBy
	// (including the newer generic-only options) needs an explicit count so
	// the generic pipeline — not the legacy fallback — runs and validates
	// the groupBy.
	let aggregation: { op: "count" | "sum" | "avg" | "min" | "max"; field?: string } | undefined;
	if (measure) {
		aggregation = measure;
	} else if (usesLegacyDispatch(gen.entityType, groupBy!)) {
		aggregation = undefined;
	} else {
		aggregation = { op: "count" as const };
	}

	return { ...base, ...(aggregation ? { aggregation } : {}) };
}

/** One short sentence the assistant can echo about what was built. */
export function summarizeGeneratedReport(gen: GeneratedReport): string {
	// Reflect what's actually saved/applied, not the model's raw guess — a
	// chart with null groupBy is coerced to table (see resolveVisualization).
	const visualization = resolveVisualization(gen);
	const parts: string[] = [gen.entityType];
	if (gen.groupBy) {
		const label = GROUP_BY_OPTIONS[gen.entityType].find(
			(o) => o.value === gen.groupBy
		)?.label;
		parts.push(`grouped by ${label ?? gen.groupBy}`);
	} else if (visualization === "table") {
		parts.push("as individual rows");
	}
	if (gen.measure && gen.measure.op !== "count" && gen.measure.field) {
		parts.push(`measuring ${gen.measure.op} of ${gen.measure.field}`);
	}
	const filters = sanitizeGeneratedFilters(gen.filters);
	const ruleCount =
		filters?.groups.reduce((n, g) => n + g.rules.length, 0) ?? 0;
	if (ruleCount > 0) parts.push(`with ${ruleCount} filter${ruleCount === 1 ? "" : "s"}`);
	if (gen.startDate || gen.endDate) {
		parts.push(
			`from ${gen.startDate ?? "the beginning"} to ${gen.endDate ?? "now"}`
		);
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

/** Resolve the calling user + org for rate limiting and usage metering.
 * Identity propagates from the assistant action into this runQuery. */
export const authContext = internalQuery({
	args: {},
	handler: async (
		ctx
	): Promise<{ userId: Id<"users">; orgId: Id<"organizations"> } | null> => {
		const user = await getCurrentUserOrThrow(ctx);
		const orgId = await getCurrentUserOrgId(ctx);
		if (!orgId) return null;
		return { userId: user._id, orgId };
	},
});

/** Cap on the current-config JSON the model relays from screen context. */
const CURRENT_CONFIG_MAX_LENGTH = 4000;

/**
 * The current-config JSON arrives via the model (copied from the
 * <current-screen> block), so treat it as untrusted prompt input: parse
 * leniently, drop it if malformed. It only steers generation — the output
 * is still fully validated.
 */
export function parseCurrentConfig(
	currentConfig: string | null | undefined
): Record<string, unknown> | null {
	if (!currentConfig || currentConfig.length > CURRENT_CONFIG_MAX_LENGTH) {
		return null;
	}
	try {
		const parsed: unknown = JSON.parse(currentConfig);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			return parsed as Record<string, unknown>;
		}
	} catch {
		// Malformed relay — generate from the request alone.
	}
	return null;
}

type GenerationOutcome =
	| { ok: true; generated: GeneratedReport; total: number; truncated: boolean }
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
			`The user currently has this report configuration open:\n${JSON.stringify(current, null, 2)}\nApply the requested change to it — keep every setting the request doesn't mention.`
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
			toExecuteReportArgs(generated)
		);
		return {
			ok: true,
			generated,
			total: result.total,
			truncated: result.metadata?.truncated === true,
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
	const { generated, total, truncated } = outcome;

	const saved = toSavedReport(generated);
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

/**
 * Normalized config the report builder applies to its live state. Shapes
 * match the builder's own state model (ms date bounds like a saved config;
 * null = absent). The panel client-executes this, like the navigate tool.
 */
export type BuilderReportConfig = {
	entityType: ReportEntityType;
	groupBy: string | null;
	filters: ReportFilters | null;
	measure: {
		op: "count" | "sum" | "avg" | "min" | "max";
		field: string | null;
	} | null;
	columns: string[] | null;
	dateRange: { start?: number; end?: number } | null;
	visualization: "bar" | "column" | "line" | "pie" | "radar" | "radial" | "table";
	name: string;
	description: string | null;
};

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
export function toBuilderConfig(gen: GeneratedReport): BuilderReportConfig {
	// Coerced the same way as toSavedReport — the builder's "Add chart"
	// affordance assumes a chart is only ever active when groupBy is set.
	const visualization = resolveVisualization(gen);
	return {
		entityType: gen.entityType,
		groupBy: gen.groupBy,
		filters: sanitizeGeneratedFilters(gen.filters),
		measure: gen.measure,
		columns: visualization === "table" ? (gen.columns ?? null) : null,
		dateRange: toDateRange(gen) ?? null,
		visualization,
		name: gen.name.trim(),
		description: gen.description,
	};
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
	const { generated, total, truncated } = outcome;

	return {
		ok: true,
		config: toBuilderConfig(generated),
		summary: summarizeGeneratedReport(generated),
		total,
		truncated,
	};
}
