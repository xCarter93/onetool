import { createTool } from "@convex-dev/agent";
import {
	HELP_CATEGORIES,
	helpArticleMarkdown,
	resolveHelpRef,
	searchHelpArticles,
	type HelpSearchHit,
} from "@onetool/help-content";
import {
	triggerRecordObjectType,
	type AutomationTrigger,
} from "./lib/workflowTypes";
import { ConvexError } from "convex/values";
import { z } from "zod";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { HomeStats } from "./homeStats";
import {
	DESCRIBABLE_TABLES,
	describeTable,
	listDescribableTables,
	type TableSchema,
	type TableSummary,
} from "./lib/schemaIntrospection";
import type { ReportDataResult } from "./reportData";
import {
	normalizeReportConfig,
	type DateRangePreset,
	type ReportMetric,
} from "./lib/reportConfig";
import type { ReportFilters } from "./lib/reportFilters";
import {
	REPORT_ENTITY_TYPES,
	GROUP_BY_OPTIONS,
	DEFAULT_GROUP_BY,
} from "./lib/reportFields";
import {
	generateAndSaveReport,
	generateConfigForBuilder,
	type ConfigureReportResult,
	type CreateReportResult,
} from "./reportConfigGeneration";

/**
 * Tools for the AI assistant. Every tool wraps an existing public org-scoped
 * query/mutation via ctx.runQuery/ctx.runMutation — the caller's identity
 * propagates, so org isolation (and member-role actor scoping) is inherited,
 * never rebuilt.
 *
 * Output discipline: lists are capped, long text truncated, dates converted
 * to ISO strings (LLMs can't do epoch-ms arithmetic), and fields that are
 * sensitive or useless to an LLM (publicToken, Stripe session internals,
 * signature audit PII, storage URLs) are stripped.
 *
 * Every execute has an explicit return type: this module is part of the
 * generated `api` type graph, so inferring returns through ctx.runQuery(api…)
 * would create a type cycle that degrades api types across the app.
 */

const LIST_CAP = 50;
const EMAIL_CAP = 25;
const ACTIVITY_CAP = 20;
const TEXT_CAP = 300;
const BODY_CAP = 1500;

type Capped<T> = { items: T[]; totalCount: number; truncated: boolean };

function truncate(text: string | undefined | null, max: number) {
	if (!text) return undefined;
	return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * Fence text that an outsider wrote.
 *
 * Inbound email bodies, subjects and sender names arrive from anyone who can
 * send mail; public community-form submissions land in task titles and
 * descriptions. All of it flows into the model context alongside eight write
 * tools, so it has to be visibly data rather than instruction. The agent
 * INSTRUCTIONS block carries the matching rule: nothing inside this envelope
 * can request a tool call.
 *
 * Inner occurrences of the delimiter are defanged so third-party text cannot
 * close its own envelope and continue as trusted prose.
 */
const UNTRUSTED_OPEN = "<<<UNTRUSTED_DATA";
const UNTRUSTED_CLOSE = "UNTRUSTED_DATA>>>";

/** Fence a field only when its row came from the public community form. */
export function untrustedIfPublic(
	text: string | undefined | null,
	source: string | undefined
): string | undefined {
	return source === "public_form" ? untrusted(text) : (text ?? undefined);
}

export function untrusted(
	text: string | undefined | null
): string | undefined {
	if (!text) return undefined;
	// Defang the shared token in ANY case, not the two full markers. A near-twin
	// such as `UNTRUSTED_DATA >>>` (extra space) or lowercase `untrusted_data>>>`
	// slips an exact-match full-marker replace yet still reads as a closing fence
	// to a model doing fuzzy rather than exact matching. Both fences are built
	// around UNTRUSTED_DATA, so neutralising the token neutralises every variant.
	// `[marker removed]` shares no substring with either fence, so the replacement
	// itself can never splice a new one.
	const defanged = text.replace(/UNTRUSTED_DATA/gi, "[marker removed]");
	return `${UNTRUSTED_OPEN}\n${defanged}\n${UNTRUSTED_CLOSE}`;
}

function capped<T>(items: T[], cap: number): Capped<T> {
	return {
		items: items.slice(0, cap),
		totalCount: items.length,
		truncated: items.length > cap,
	};
}

const isoDate = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format");

function dayStartMs(date: string) {
	return Date.parse(`${date}T00:00:00.000Z`);
}

function dayEndMs(date: string) {
	return Date.parse(`${date}T23:59:59.999Z`);
}

// Routing tools default to "today" in UTC — the org's date field is stored
// UTC-midnight, same as tasks/projects.
export function resolveDateMs(date?: string): number {
	return dayStartMs(date ?? new Date().toISOString().slice(0, 10));
}

// Dates go to the model as ISO strings, never epoch ms — the LLM cannot do
// reliable arithmetic on 13-digit timestamps. Day-precision fields (stored
// UTC-midnight) become YYYY-MM-DD; event instants keep the full timestamp.
function isoDay(ms: number | undefined | null): string | undefined {
	return typeof ms === "number" ? new Date(ms).toISOString().slice(0, 10) : undefined;
}

function isoInstant(ms: number | undefined | null): string | undefined {
	return typeof ms === "number" ? new Date(ms).toISOString() : undefined;
}

// ---------------------------------------------------------------------------
// Compact output shapes (what the LLM sees)
// ---------------------------------------------------------------------------

interface ScheduleProjectItem {
	id: string;
	title: string;
	description?: string;
	startDate?: string;
	endDate?: string;
	status: string;
	clientId?: string;
	clientName: string;
	projectNumber?: string;
}

interface ScheduleTaskItem {
	id: string;
	title: string;
	description?: string;
	date?: string;
	startTime?: string;
	endTime?: string;
	status: string;
	clientId?: string;
	clientName: string;
	projectId?: string;
}

interface TaskItem {
	id: string;
	title: string;
	description?: string;
	date?: string;
	startTime?: string;
	endTime?: string;
	status: string;
	clientId?: string;
	projectId?: string;
	assigneeUserId?: string;
}

interface ClientListItem {
	id: string;
	companyName: string;
	status: string;
	leadSource?: string;
	tags?: string[];
}

interface ClientDetail {
	found: true;
	client: {
		id: string;
		companyName: string;
		companyDescription?: string;
		status: string;
		leadSource?: string;
		communicationPreference?: string;
		tags?: string[];
		notes?: string;
	};
	contacts: {
		id: string;
		name: string;
		email?: string;
		phone?: string;
		jobTitle?: string;
		isPrimary?: boolean;
	}[];
	properties: {
		id: string;
		propertyName?: string;
		propertyType?: string;
		address: string;
		isPrimary?: boolean;
	}[];
}

interface ProjectItem {
	id: string;
	title: string;
	projectNumber?: string;
	status: string;
	projectType: string;
	clientId: string;
	startDate?: string;
	endDate?: string;
	completedAt?: string;
}

interface ProjectDetail {
	found: true;
	project: ProjectItem & {
		description?: string;
		assignedUserIds?: string[];
	};
}

interface QuoteItem {
	id: string;
	quoteNumber?: string;
	title?: string;
	status: string;
	subtotal: number;
	taxAmount?: number;
	total: number;
	clientId: string;
	projectId?: string;
	validUntil?: string;
	sentAt?: string;
	approvedAt?: string;
}

interface QuoteDetail {
	found: true;
	quote: QuoteItem & {
		discountAmount?: number;
		discountType?: string;
		taxRate?: number;
		clientMessage?: string;
		terms?: string;
		declinedAt?: string;
	};
	lineItems: {
		description: string;
		quantity: number;
		unit: string;
		rate: number;
		amount: number;
	}[];
}

interface InvoiceItem {
	id: string;
	invoiceNumber: string;
	status: string;
	subtotal: number;
	total: number;
	clientId: string;
	projectId?: string;
	issuedDate?: string;
	dueDate?: string;
	paidAt?: string;
}

interface InvoiceDetail {
	found: true;
	invoice: InvoiceItem & {
		discountAmount?: number;
		taxAmount?: number;
		quoteId?: string;
	};
	lineItems: {
		description: string;
		quantity: number;
		unitPrice: number;
		total: number;
	}[];
	payments: {
		paymentAmount: number;
		dueDate?: string;
		description?: string;
		status: string;
		paidAt?: string;
	}[];
	paymentSummary: {
		totalPayments: number;
		paidCount: number;
		pendingCount: number;
		paidAmount: number;
		remainingAmount: number;
		percentPaid: number;
		allPaymentsPaid: boolean;
	};
}

interface EmailItem {
	direction: string;
	subject: string;
	preview?: string;
	from: string;
	to: string;
	status: string;
	sentAt?: string;
	clientId: string | null; // null for unknown-sender inbound (no linked client)
	threadDocId?: string;
}

interface EmailThreadResult {
	found: true;
	messages: {
		direction: string;
		subject: string;
		body?: string;
		from: string;
		to: string;
		status: string;
		sentAt?: string;
	}[];
}

interface GeneratedPdfItem {
	id: string;
	documentType: string;
	documentId: string;
	version: number;
	generatedAt?: string;
	signatureStatus?: string;
	signers?: string[];
}

interface FileItem {
	name: string;
	fileName: string;
	fileSize: number;
	uploadedAt?: string;
}

interface ActivityItem {
	type: string;
	description?: string;
	timestamp?: string;
	user?: string;
}

type NotFound = { found: false };

type ReportVisualization = "bar" | "column" | "line" | "pie" | "radar" | "radial" | "table";

interface TeamMemberItem {
	id: string;
	name: string;
	email: string;
}

interface AutomationItem {
	id: string;
	name: string;
	description?: string;
	isActive: boolean;
	trigger: string;
	lastTriggeredAt?: string;
	triggerCount?: number;
}

interface AutomationRunItem {
	status: string;
	triggeredBy: string;
	triggeredAt?: string;
	completedAt?: string;
	error?: string;
	nodesExecuted: number;
}

interface SavedReportItem {
	id: string;
	name: string;
	description?: string;
	entityType: string;
	visualization: string;
	updatedAt?: string;
}

interface SavedReportDetail {
	found: true;
	report: SavedReportItem & {
		metric: ReportMetric;
		groupBy?: string;
		segmentBy?: string;
		dateField?: string;
		dateRange?: { preset?: DateRangePreset; start?: string; end?: string };
		filters?: ReportFilters;
		columns?: string[];
	};
}

interface SkuItem {
	id: string;
	name: string;
	unit: string;
	rate: number;
	cost?: number;
	isActive: boolean;
}

// Write tools report validation failures as data instead of throwing, so the
// model can read the reason and correct its call.
type WriteResult<T> = ({ ok: true } & T) | { ok: false; error: string };

// ConvexError.data can arrive (double-)JSON-stringified across function-call
// boundaries; unwrap until it's an object.
function convexErrorData(e: unknown): Record<string, unknown> | null {
	if (!(e instanceof ConvexError)) return null;
	let data: unknown = e.data;
	try {
		while (typeof data === "string") data = JSON.parse(data);
	} catch {
		return null;
	}
	return typeof data === "object" && data !== null
		? (data as Record<string, unknown>)
		: null;
}

function forbiddenErrorData(e: unknown): Record<string, unknown> | null {
	const data = convexErrorData(e);
	return data && data.code === "FORBIDDEN" ? data : null;
}

function noPermissionResult(data: Record<string, unknown>): {
	error: "no_permission";
	object: string | null;
	message: string;
} {
	const object = typeof data.object === "string" ? data.object : null;
	return {
		error: "no_permission",
		object,
		message: `The user does not have permission to access ${object ?? "this area"}. Tell them an admin can grant access from the organization settings.`,
	};
}

function writeError(e: unknown): { ok: false; error: string } {
	const forbidden = forbiddenErrorData(e);
	if (forbidden) return { ok: false, error: noPermissionResult(forbidden).message };
	return { ok: false, error: e instanceof Error ? e.message : String(e) };
}

// ---------------------------------------------------------------------------
// Navigation (client-executed — the web app intercepts the result and routes)
// ---------------------------------------------------------------------------

// Clients/projects/quotes are created in a dialog, not at a /new route — the id
// patterns must not match the retired "new" segment or the assistant will happily
// navigate the user to a 404.
const NAVIGATE_ALLOWED_PATHS: RegExp[] = [
	/^\/home$/,
	/^\/clients$/,
	/^\/clients\/import$/,
	/^\/clients\/(?!new$)[A-Za-z0-9_-]+$/,
	/^\/projects$/,
	/^\/projects\/(?!new$)[A-Za-z0-9_-]+$/,
	/^\/quotes$/,
	/^\/quotes\/(?!new$)[A-Za-z0-9_-]+$/,
	/^\/invoices$/,
	/^\/invoices\/[A-Za-z0-9_-]+$/,
	/^\/tasks$/,
	/^\/reports$/,
	/^\/reports\/new$/,
	/^\/reports\/[A-Za-z0-9_-]+$/,
	/^\/automations$/,
	/^\/subscription$/,
	/^\/organization\/profile$/,
	/^\/routing$/,
];

export function isAllowedWorkspacePath(path: string): boolean {
	return NAVIGATE_ALLOWED_PATHS.some((pattern) => pattern.test(path));
}

// ---------------------------------------------------------------------------
// Routing helpers (exported for unit tests, pure — no ctx)
// ---------------------------------------------------------------------------

type RouteDoc = Doc<"routes">;
type RouteStopDoc = RouteDoc["stops"][number];

interface ShapedRouteStop {
	number: number;
	label: string;
	status?: "pending" | "visited" | "skipped";
	visited?: boolean;
	taskId?: string;
	projectId?: string;
}

interface ShapedRoute {
	id: string;
	name: string;
	kind: "daily" | "saved";
	date?: string;
	assigneeUserId?: string;
	roundTrip: boolean;
	startLabel: string;
	optimized?: boolean;
	approximate?: boolean;
	totalDistanceMeters?: number;
	totalDurationSeconds?: number;
	stops: ShapedRouteStop[];
}

// No lat/lng, no geometry in the model-facing shape — token bloat, and the
// model never needs raw coordinates.
export function shapeRoute(route: RouteDoc): ShapedRoute {
	const kind = route.kind ?? "saved";
	const isDaily = kind === "daily";
	return {
		id: route._id,
		name: route.name,
		kind,
		date: isoDay(route.date),
		assigneeUserId: route.assigneeUserId,
		roundTrip: route.roundTrip,
		startLabel: route.start.label,
		optimized: route.optimized,
		approximate: route.approximate,
		totalDistanceMeters: route.totalDistanceMeters,
		totalDurationSeconds: route.totalDurationSeconds,
		stops: [...route.stops]
			.sort((a, b) => a.order - b.order)
			.map((s) => ({
				number: s.order + 1,
				label: s.label,
				...(isDaily
					? { status: s.status ?? "pending", visited: s.status === "visited" }
					: {}),
				taskId: s.taskId,
				projectId: s.projectId,
			})),
	};
}

type RouteResolution =
	| { found: true; route: RouteDoc }
	| { found: false; reason: "ambiguous"; candidates: string[] }
	| { found: false; reason: "not_found" };

/**
 * Resolve a route from the org's route list: by saved-route name
 * (exact-then-substring, case-insensitive; ambiguous substring matches are
 * surfaced instead of guessed), or by the (date, assigneeUserId) daily
 * singleton — undefined assigneeUserId means the whole-team/org-wide route.
 */
export function resolveRouteFromList(
	routes: RouteDoc[],
	criteria: {
		date?: number;
		assigneeUserId?: Id<"users">;
		savedRouteName?: string;
	}
): RouteResolution {
	if (criteria.savedRouteName) {
		const savedRoutes = routes.filter((r) => (r.kind ?? "saved") !== "daily");
		const term = criteria.savedRouteName.trim().toLowerCase();
		const exact = savedRoutes.find((r) => r.name.toLowerCase() === term);
		if (exact) return { found: true, route: exact };
		const matches = savedRoutes.filter((r) => r.name.toLowerCase().includes(term));
		if (matches.length === 1) return { found: true, route: matches[0] };
		if (matches.length > 1) {
			return { found: false, reason: "ambiguous", candidates: matches.map((r) => r.name) };
		}
		return { found: false, reason: "not_found" };
	}
	const route = routes.find(
		(r) =>
			(r.kind ?? "saved") === "daily" &&
			r.date === criteria.date &&
			r.assigneeUserId === criteria.assigneeUserId
	);
	return route ? { found: true, route } : { found: false, reason: "not_found" };
}

interface StopAdditionCandidate {
	propertyId: Id<"clientProperties">;
	label: string;
	latitude: number;
	longitude: number;
}

interface StopEditResult {
	stops: RouteStopDoc[];
	removed: string[];
	added: string[];
	unmatched: string[];
	error?: string;
}

/**
 * Apply remove → reorder → add edits to a route's stop list, in that order.
 * Returns sequential order values (0..n-1) and preserves each surviving
 * stop's propertyId/taskId/projectId/status/visitedAt untouched.
 */
export function applyStopEdits(
	currentStops: RouteStopDoc[],
	edits: {
		removeStops?: string[];
		reorder?: number[];
		additions?: StopAdditionCandidate[];
	}
): StopEditResult {
	const numbered = [...currentStops]
		.sort((a, b) => a.order - b.order)
		.map((stop, i) => ({ stop, number: i + 1 }));

	const unmatched: string[] = [];
	const removed: string[] = [];
	let remaining = numbered;

	if (edits.removeStops?.length) {
		const toRemove = new Set<number>();
		for (const entry of edits.removeStops) {
			const trimmed = entry.trim();
			if (/^\d+$/.test(trimmed)) {
				const match = numbered.find((n) => n.number === Number(trimmed));
				if (match) toRemove.add(match.number);
				else unmatched.push(entry);
				continue;
			}
			const term = trimmed.toLowerCase();
			const matches = numbered.filter((n) => n.stop.label.toLowerCase().includes(term));
			if (matches.length === 0) {
				unmatched.push(entry);
				continue;
			}
			for (const m of matches) toRemove.add(m.number);
		}
		for (const n of numbered) if (toRemove.has(n.number)) removed.push(n.stop.label);
		remaining = numbered.filter((n) => !toRemove.has(n.number));
	}

	let orderedStops = remaining.map((n) => n.stop);
	let error: string | undefined;

	if (edits.reorder?.length) {
		const remainingNumbers = remaining.map((n) => n.number).sort((a, b) => a - b);
		const sortedReorder = [...edits.reorder].sort((a, b) => a - b);
		const isPermutation =
			edits.reorder.length === remainingNumbers.length &&
			sortedReorder.every((v, i) => v === remainingNumbers[i]);
		if (!isPermutation) {
			error = `reorder must include every remaining stop number exactly once (${remainingNumbers.join(", ")})`;
		} else {
			const byNumber = new Map(remaining.map((n) => [n.number, n.stop]));
			orderedStops = edits.reorder.map((num) => byNumber.get(num)!);
		}
	}

	const added: string[] = [];
	if (!error && edits.additions?.length) {
		const existingPropertyIds = new Set(
			orderedStops.flatMap((s) => (s.propertyId ? [s.propertyId] : []))
		);
		for (const candidate of edits.additions) {
			if (existingPropertyIds.has(candidate.propertyId)) continue;
			existingPropertyIds.add(candidate.propertyId);
			orderedStops = [
				...orderedStops,
				{
					propertyId: candidate.propertyId,
					label: candidate.label,
					latitude: candidate.latitude,
					longitude: candidate.longitude,
					order: 0, // reassigned below
				},
			];
			added.push(candidate.label);
		}
	}

	return {
		stops: orderedStops.map((s, i) => ({ ...s, order: i })),
		removed,
		added,
		unmatched,
		error,
	};
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export const getSchedule = createTool({
	description:
		"Get the calendar for a date range: projects (with start/end dates) and tasks (single-day, optional start/end times). Use for questions about the schedule, what's coming up, or what happened on specific days.",
	inputSchema: z.object({
		startDate: isoDate.describe("Range start, inclusive (YYYY-MM-DD)"),
		endDate: isoDate.describe("Range end, inclusive (YYYY-MM-DD)"),
	}),
	execute: async (
		ctx,
		input
	): Promise<{
		projects: ScheduleProjectItem[];
		tasks: ScheduleTaskItem[];
	}> => {
		const events = await ctx.runQuery(api.calendar.getCalendarEvents, {
			startDate: dayStartMs(input.startDate),
			endDate: dayEndMs(input.endDate),
		});
		return {
			projects: events.projects.map((p) => ({
				id: p.id,
				title: p.title,
				description: truncate(p.description, TEXT_CAP),
				startDate: isoDay(p.startDate),
				endDate: isoDay(p.endDate),
				status: p.status,
				clientId: p.clientId,
				clientName: p.clientName,
				projectNumber: p.projectNumber,
			})),
			tasks: events.tasks.map((t) => ({
				id: t.id,
				title: untrustedIfPublic(t.title, t.source) ?? t.title,
				description: untrustedIfPublic(
					truncate(t.description, TEXT_CAP),
					t.source
				),
				date: isoDay(t.startDate),
				startTime: t.startTime,
				endTime: t.endTime,
				status: t.status,
				clientId: t.clientId,
				clientName: t.clientName,
				projectId: t.projectId,
			})),
		};
	},
});

export const getTasks = createTool({
	description:
		"List the organization's tasks. Scopes: 'today', 'overdue', 'upcoming' (next N days), or 'filtered' — combine any of status, client, project, assignee, and a date range.",
	inputSchema: z.object({
		scope: z.enum(["today", "overdue", "upcoming", "filtered"]),
		daysAhead: z
			.number()
			.int()
			.min(1)
			.max(90)
			.optional()
			.describe("Only for scope=upcoming; defaults to 7"),
		status: z
			.enum(["pending", "in-progress", "completed", "cancelled"])
			.optional()
			.describe("Only for scope=filtered"),
		clientId: z.string().optional().describe("Only for scope=filtered"),
		projectId: z.string().optional().describe("Only for scope=filtered"),
		assigneeUserId: z.string().optional().describe("Only for scope=filtered"),
		startDate: isoDate.optional().describe("Only for scope=filtered"),
		endDate: isoDate.optional().describe("Only for scope=filtered"),
	}),
	execute: async (ctx, input): Promise<Capped<TaskItem>> => {
		const tasks =
			input.scope === "today"
				? await ctx.runQuery(api.tasks.getToday, {})
				: input.scope === "overdue"
					? await ctx.runQuery(api.tasks.getOverdue, {})
					: input.scope === "upcoming"
						? await ctx.runQuery(api.tasks.getUpcoming, {
								daysAhead: input.daysAhead,
							})
						: await ctx.runQuery(api.tasks.list, {
								status: input.status,
								clientId: input.clientId as Id<"clients"> | undefined,
								projectId: input.projectId as Id<"projects"> | undefined,
								assigneeUserId: input.assigneeUserId as Id<"users"> | undefined,
								dateFrom: input.startDate
									? dayStartMs(input.startDate)
									: undefined,
								dateTo: input.endDate ? dayEndMs(input.endDate) : undefined,
							});
		return capped(
			tasks.map((t) => ({
				id: t._id,
				title: untrustedIfPublic(t.title, t.source) ?? t.title,
				description: untrustedIfPublic(
					truncate(t.description, TEXT_CAP),
					t.source
				),
				date: isoDay(t.date),
				startTime: t.startTime,
				endTime: t.endTime,
				status: t.status,
				clientId: t.clientId,
				projectId: t.projectId,
				assigneeUserId: t.assigneeUserId,
			})),
			LIST_CAP
		);
	},
});

export const getBusinessStats = createTool({
	description:
		"Get the dashboard overview for the organization: client counts, completed project value, approved quote value, invoices sent/outstanding, revenue-goal progress, and pending task counts (current period vs previous).",
	inputSchema: z.object({}),
	execute: async (ctx): Promise<HomeStats> => {
		return await ctx.runQuery(api.homeStats.getHomeStats, {});
	},
});

export const runReport = createTool({
	description: [
		"Run an aggregation report and get labeled data points (good for counts, totals, and trends).",
		"Valid groupBy values per entityType (omit groupBy for the default):",
		...REPORT_ENTITY_TYPES.map(
			(entity) =>
				`- ${entity}: ${GROUP_BY_OPTIONS[entity]
					.map((o) => `'${o.value}' (${o.label})`)
					.join(", ")}; default = '${DEFAULT_GROUP_BY[entity]}'`
		),
		"Do not invent other groupBy values.",
	].join("\n"),
	inputSchema: z.object({
		entityType: z.enum([
			"clients",
			"projects",
			"tasks",
			"quotes",
			"invoices",
			"activities",
		]),
		groupBy: z.string().optional(),
		startDate: isoDate.optional(),
		endDate: isoDate.optional(),
		visualization: z
			.enum(["bar", "column", "line", "pie", "radar", "radial", "table"])
			.optional()
			.describe(
				"How the result is shown to the user in chat. Pick 'column' for time-bucketed groups, 'line' for time series, 'pie' for share-of-total, 'table' for exact values. Only pick 'radar'/'radial' if the user explicitly asks for that chart type. Defaults to bar."
			),
	}),
	execute: async (
		ctx,
		input
	): Promise<ReportDataResult & { visualization: ReportVisualization }> => {
		// Bare calls keep their historical entity-default grouping (§8 d11);
		// the expander turns magic keys (month, conversionRate, …) into v2.
		const groupBy = input.groupBy ?? DEFAULT_GROUP_BY[input.entityType];
		const dateRange =
			input.startDate || input.endDate
				? {
						start: input.startDate ? dayStartMs(input.startDate) : undefined,
						end: input.endDate ? dayEndMs(input.endDate) : undefined,
					}
				: undefined;
		const { config, visualization } = normalizeReportConfig(
			{
				entityType: input.entityType,
				groupBy: [groupBy],
				...(dateRange ? { dateRange } : {}),
			},
			{ type: input.visualization ?? "bar" }
		);
		const result = await ctx.runQuery(api.reportData.executeReport, {
			entityType: input.entityType,
			config,
			...(visualization.options?.seriesLimit !== undefined
				? { seriesLimit: visualization.options.seriesLimit }
				: {}),
		});
		return { ...result, visualization: input.visualization ?? "bar" };
	},
});

export const createReport = createTool({
	description: [
		"Build and SAVE a report from the user's plain-English description. Supports the full builder surface: grouping (including related-record paths, or raw-row tables with columns), sum/avg/min/max/ratio/related measures, field and date filters, named or explicit date ranges, and chart type.",
		"Pass the user's request verbatim, including names, amounts, and time phrases.",
		"On success it returns the saved report's path — offer to open it with navigate.",
		"Use this when the user wants a report they can keep, edit, or share; use runReport for a quick one-off answer in chat.",
	].join("\n"),
	inputSchema: z.object({
		request: z
			.string()
			.describe("The report the user wants, in their own words"),
	}),
	execute: async (ctx, input): Promise<CreateReportResult> => {
		return await generateAndSaveReport(ctx, input.request);
	},
});

export const configureReport = createTool({
	description: [
		"Update the report the user currently has OPEN in the report builder. Builds a validated configuration from their request and applies it to their screen automatically — nothing is saved; the user reviews and saves it themselves.",
		"Only use when the <current-screen> block shows the report builder (a reportBuilderConfig entry). Pass that block's reportBuilderConfig JSON as currentConfig VERBATIM so settings the request doesn't mention are preserved.",
		"Use createReport instead when the user is not in the builder, or explicitly wants a separate new report.",
		"On an ok:false result the request isn't supported as asked: relay the error's reason and valid options to the user and stop — do not retry with different settings or create a report instead.",
	].join("\n"),
	inputSchema: z.object({
		request: z
			.string()
			.describe("The change or report the user wants, in their own words"),
		currentConfig: z
			.string()
			.nullable()
			.optional()
			.describe(
				"The reportBuilderConfig JSON from <current-screen>, copied verbatim; omit if not present"
			),
	}),
	execute: async (ctx, input): Promise<ConfigureReportResult> => {
		return await generateConfigForBuilder(
			ctx,
			input.request,
			input.currentConfig ?? null
		);
	},
});

export const listClients = createTool({
	description:
		"List or search the organization's clients. Use this first to resolve a client name to its ID before fetching details, emails, projects, quotes, or invoices for that client.",
	inputSchema: z.object({
		searchTerm: z
			.string()
			.optional()
			.describe("Case-insensitive substring match on company name"),
		status: z.enum(["lead", "active", "inactive", "archived"]).optional(),
	}),
	execute: async (ctx, input): Promise<Capped<ClientListItem>> => {
		const clients = await ctx.runQuery(api.clients.list, {
			status: input.status,
			includeArchived: input.status === "archived",
		});
		const term = input.searchTerm?.toLowerCase();
		const matched = term
			? clients.filter((c) => c.companyName.toLowerCase().includes(term))
			: clients;
		return capped(
			matched.map((c) => ({
				id: c._id,
				companyName: c.companyName,
				status: c.status,
				leadSource: c.leadSource,
				tags: c.tags,
			})),
			LIST_CAP
		);
	},
});

export const getClient = createTool({
	description:
		"Get full details for one client: profile, contacts, and properties/addresses.",
	inputSchema: z.object({ clientId: z.string() }),
	execute: async (ctx, input): Promise<ClientDetail | NotFound> => {
		const clientId = input.clientId as Id<"clients">;
		const [client, contacts, properties] = await Promise.all([
			ctx.runQuery(api.clients.get, { id: clientId }),
			ctx.runQuery(api.clientContacts.listByClient, { clientId }),
			ctx.runQuery(api.clientProperties.listByClient, { clientId }),
		]);
		if (!client) return { found: false };
		return {
			found: true,
			client: {
				id: client._id,
				companyName: client.companyName,
				companyDescription: truncate(client.companyDescription, TEXT_CAP),
				status: client.status,
				leadSource: client.leadSource,
				communicationPreference: client.communicationPreference,
				tags: client.tags,
				notes: untrusted(truncate(client.notes, BODY_CAP)),
			},
			contacts: contacts.map((c) => ({
				id: c._id,
				name: `${c.firstName} ${c.lastName}`.trim(),
				email: c.email,
				phone: c.phone,
				jobTitle: c.jobTitle,
				isPrimary: c.isPrimary,
			})),
			properties: properties.map((p) => ({
				id: p._id,
				propertyName: p.propertyName,
				propertyType: p.propertyType,
				address: [p.streetAddress, p.city, p.state, p.zipCode]
					.filter(Boolean)
					.join(", "),
				isPrimary: p.isPrimary,
			})),
		};
	},
});

export const listProjects = createTool({
	description:
		"List the organization's projects, optionally filtered by status and/or client.",
	inputSchema: z.object({
		status: z
			.enum(["planned", "in-progress", "completed", "cancelled"])
			.optional(),
		clientId: z.string().optional(),
	}),
	execute: async (ctx, input): Promise<Capped<ProjectItem>> => {
		const projects = await ctx.runQuery(api.projects.list, {
			status: input.status,
			clientId: input.clientId as Id<"clients"> | undefined,
		});
		return capped(
			projects.map((p) => ({
				id: p._id,
				title: p.title,
				projectNumber: p.projectNumber,
				status: p.status,
				projectType: p.projectType,
				clientId: p.clientId,
				startDate: isoDay(p.startDate),
				endDate: isoDay(p.endDate),
				completedAt: isoInstant(p.completedAt),
			})),
			LIST_CAP
		);
	},
});

export const getProject = createTool({
	description: "Get full details for one project.",
	inputSchema: z.object({ projectId: z.string() }),
	execute: async (ctx, input): Promise<ProjectDetail | NotFound> => {
		const project = await ctx.runQuery(api.projects.get, {
			id: input.projectId as Id<"projects">,
		});
		if (!project) return { found: false };
		return {
			found: true,
			project: {
				id: project._id,
				title: project.title,
				description: truncate(project.description, BODY_CAP),
				projectNumber: project.projectNumber,
				status: project.status,
				projectType: project.projectType,
				clientId: project.clientId,
				startDate: isoDay(project.startDate),
				endDate: isoDay(project.endDate),
				completedAt: isoInstant(project.completedAt),
				assignedUserIds: project.assignedUserIds,
			},
		};
	},
});

export const listQuotes = createTool({
	description:
		"List the organization's quotes with computed totals, optionally filtered by status, client, or project. Amounts are dollars.",
	inputSchema: z.object({
		status: z
			.enum(["draft", "sent", "approved", "declined", "expired"])
			.optional(),
		clientId: z.string().optional(),
		projectId: z.string().optional(),
	}),
	execute: async (ctx, input): Promise<Capped<QuoteItem>> => {
		const quotes = await ctx.runQuery(api.quotes.list, {
			status: input.status,
			clientId: input.clientId as Id<"clients"> | undefined,
			projectId: input.projectId as Id<"projects"> | undefined,
		});
		return capped(
			quotes.map((q) => ({
				id: q._id,
				quoteNumber: q.quoteNumber,
				title: q.title,
				status: q.status,
				subtotal: q.subtotal,
				taxAmount: q.taxAmount,
				total: q.total,
				clientId: q.clientId,
				projectId: q.projectId,
				validUntil: isoDay(q.validUntil),
				sentAt: isoInstant(q.sentAt),
				approvedAt: isoInstant(q.approvedAt),
			})),
			LIST_CAP
		);
	},
});

export const getQuote = createTool({
	description:
		"Get one quote with its line items and computed totals. Amounts are dollars.",
	inputSchema: z.object({ quoteId: z.string() }),
	execute: async (ctx, input): Promise<QuoteDetail | NotFound> => {
		const quoteId = input.quoteId as Id<"quotes">;
		const [quote, lineItems] = await Promise.all([
			ctx.runQuery(api.quotes.get, { id: quoteId }),
			ctx.runQuery(api.quoteLineItems.listByQuote, { quoteId }),
		]);
		if (!quote) return { found: false };
		return {
			found: true,
			quote: {
				id: quote._id,
				quoteNumber: quote.quoteNumber,
				title: quote.title,
				status: quote.status,
				subtotal: quote.subtotal,
				discountAmount: quote.discountAmount,
				discountType: quote.discountType,
				taxRate: quote.taxRate,
				taxAmount: quote.taxAmount,
				total: quote.total,
				clientId: quote.clientId,
				projectId: quote.projectId,
				validUntil: isoDay(quote.validUntil),
				clientMessage: truncate(quote.clientMessage, BODY_CAP),
				terms: truncate(quote.terms, BODY_CAP),
				sentAt: isoInstant(quote.sentAt),
				approvedAt: isoInstant(quote.approvedAt),
				declinedAt: isoInstant(quote.declinedAt),
			},
			lineItems: lineItems.map((li) => ({
				description: li.description,
				quantity: li.quantity,
				unit: li.unit,
				rate: li.rate,
				amount: li.amount,
			})),
		};
	},
});

export const listInvoices = createTool({
	description:
		"List the organization's invoices with computed totals, optionally filtered by status, client, or project. Amounts are dollars.",
	inputSchema: z.object({
		status: z.enum(["draft", "sent", "paid", "overdue", "cancelled"]).optional(),
		clientId: z.string().optional(),
		projectId: z.string().optional(),
	}),
	execute: async (ctx, input): Promise<Capped<InvoiceItem>> => {
		const invoices = await ctx.runQuery(api.invoices.list, {
			status: input.status,
			clientId: input.clientId as Id<"clients"> | undefined,
			projectId: input.projectId as Id<"projects"> | undefined,
		});
		return capped(
			invoices.map((i) => ({
				id: i._id,
				invoiceNumber: i.invoiceNumber,
				status: i.status,
				subtotal: i.subtotal,
				total: i.total,
				clientId: i.clientId,
				projectId: i.projectId,
				issuedDate: isoDay(i.issuedDate),
				dueDate: isoDay(i.dueDate),
				paidAt: isoInstant(i.paidAt),
			})),
			LIST_CAP
		);
	},
});

export const getInvoice = createTool({
	description:
		"Get one invoice with its line items, payment schedule, and payment summary. Amounts are dollars.",
	inputSchema: z.object({ invoiceId: z.string() }),
	execute: async (ctx, input): Promise<InvoiceDetail | NotFound> => {
		const invoiceId = input.invoiceId as Id<"invoices">;
		const [invoice, lineItems] = await Promise.all([
			ctx.runQuery(api.invoices.getWithPayments, { id: invoiceId }),
			ctx.runQuery(api.invoiceLineItems.listByInvoice, { invoiceId }),
		]);
		if (!invoice) return { found: false };
		return {
			found: true,
			invoice: {
				id: invoice._id,
				invoiceNumber: invoice.invoiceNumber,
				status: invoice.status,
				subtotal: invoice.subtotal,
				discountAmount: invoice.discountAmount,
				taxAmount: invoice.taxAmount,
				total: invoice.total,
				clientId: invoice.clientId,
				projectId: invoice.projectId,
				quoteId: invoice.quoteId,
				issuedDate: isoDay(invoice.issuedDate),
				dueDate: isoDay(invoice.dueDate),
				paidAt: isoInstant(invoice.paidAt),
			},
			lineItems: lineItems.map((li) => ({
				description: li.description,
				quantity: li.quantity,
				unitPrice: li.unitPrice,
				total: li.total,
			})),
			// Stripe session internals intentionally omitted.
			payments: invoice.payments.map((p) => ({
				paymentAmount: p.paymentAmount,
				dueDate: isoDay(p.dueDate),
				description: p.description,
				status: p.status,
				paidAt: isoInstant(p.paidAt),
			})),
			paymentSummary: invoice.paymentSummary,
		};
	},
});

export const searchClientEmails = createTool({
	description:
		"List email correspondence: recent emails across the organization, or all emails with one client (pass clientId). Returns previews — use getEmailThread for full messages.",
	inputSchema: z.object({
		clientId: z.string().optional(),
		limit: z.number().int().min(1).max(EMAIL_CAP).optional(),
	}),
	execute: async (ctx, input): Promise<Capped<EmailItem>> => {
		const emails: Doc<"emailMessages">[] = input.clientId
			? await ctx.runQuery(api.emailMessages.listByClient, {
					clientId: input.clientId as Id<"clients">,
				})
			: await ctx.runQuery(api.emailMessages.getRecentEmails, {
					limit: input.limit ?? EMAIL_CAP,
				});
		return capped(
			emails.map((e) => ({
				direction: e.direction,
				subject: untrusted(e.subject) ?? e.subject,
				preview: untrusted(
					e.messagePreview ?? truncate(e.messageBody, TEXT_CAP)
				),
				from: untrusted(`${e.fromName ?? ""} <${e.fromEmail}>`) ?? "",
				to: `${e.toName} <${e.toEmail}>`,
				status: e.status,
				sentAt: isoInstant(e.sentAt),
				clientId: e.clientId,
				threadDocId: e.threadDocId ? String(e.threadDocId) : undefined,
			})),
			input.limit ?? EMAIL_CAP
		);
	},
});

export const getEmailThread = createTool({
	description:
		"Get the full messages of one email thread, oldest first. Use the threadDocId from searchClientEmails.",
	inputSchema: z.object({ threadDocId: z.string() }),
	execute: async (ctx, input): Promise<EmailThreadResult | NotFound> => {
		const thread = await ctx.runQuery(api.emailMessages.getEmailThread, {
			threadDocId: input.threadDocId as Id<"emailThreads">,
		});
		if (!thread) return { found: false };
		return {
			found: true,
			messages: thread.map((m) => ({
				direction: m.direction,
				subject: untrusted(m.subject) ?? m.subject,
				body: untrusted(
					truncate(
						(m.visibleText?.trim() ? m.visibleText : undefined) ??
							m.textBody ??
							m.messageBody,
						BODY_CAP
					)
				),
				from: untrusted(`${m.fromName ?? ""} <${m.fromEmail}>`) ?? "",
				to: `${m.toName} <${m.toEmail}>`,
				status: m.status,
				sentAt: isoInstant(m.sentAt),
			})),
		};
	},
});

export const getDocuments = createTool({
	description:
		"List generated PDF documents (quotes/invoices) with their e-signature status, or files uploaded to a client or project.",
	inputSchema: z.object({
		kind: z.enum(["generated-pdfs", "client-files", "project-files"]),
		entityId: z
			.string()
			.optional()
			.describe(
				"Required for client-files (a clientId) and project-files (a projectId)"
			),
	}),
	execute: async (
		ctx,
		input
	): Promise<Capped<FileItem> | Capped<GeneratedPdfItem> | { error: string }> => {
		if (input.kind === "client-files") {
			if (!input.entityId) return { error: "entityId (clientId) is required" };
			const docs = await ctx.runQuery(api.clientDocuments.listByClient, {
				clientId: input.entityId as Id<"clients">,
			});
			return capped(
				docs.map((d) => ({
					name: d.name,
					fileName: d.fileName,
					fileSize: d.fileSize,
					uploadedAt: isoInstant(d.uploadedAt),
				})),
				LIST_CAP
			);
		}
		if (input.kind === "project-files") {
			if (!input.entityId) return { error: "entityId (projectId) is required" };
			const docs = await ctx.runQuery(api.projectDocuments.listByProject, {
				projectId: input.entityId as Id<"projects">,
			});
			return capped(
				docs.map((d) => ({
					name: d.name,
					fileName: d.fileName,
					fileSize: d.fileSize,
					uploadedAt: isoInstant(d.uploadedAt),
				})),
				LIST_CAP
			);
		}
		const docs = await ctx.runQuery(api.documents.list, {});
		return capped(
			docs.map((d) => ({
				id: d._id,
				documentType: d.documentType,
				documentId: d.documentId,
				version: d.version,
				generatedAt: isoInstant(d.generatedAt),
				signatureStatus: d.boldsign?.status,
				signers: d.boldsign?.sentTo.map((s) => s.name),
			})),
			LIST_CAP
		);
	},
});

export const getActivity = createTool({
	description:
		"Get the recent activity feed for the organization, or the activity timeline of one record (client/project/quote/invoice/task).",
	inputSchema: z.object({
		entityType: z
			.enum(["client", "project", "quote", "invoice", "task"])
			.optional(),
		entityId: z.string().optional().describe("Required when entityType is set"),
		limit: z.number().int().min(1).max(ACTIVITY_CAP).optional(),
	}),
	execute: async (ctx, input): Promise<Capped<ActivityItem>> => {
		const limit = input.limit ?? ACTIVITY_CAP;
		const activities =
			input.entityType && input.entityId
				? await ctx.runQuery(api.activities.getByEntity, {
						entityType: input.entityType,
						entityId: input.entityId,
						limit,
					})
				: await ctx.runQuery(api.activities.getRecent, { limit });
		return capped(
			activities.map((a) => ({
				type: a.activityType,
				// resendReceiving writes `Received email: ${subject}` into these
				// rows, so an inbound-mail activity carries external text.
				description: untrusted(truncate(a.description, TEXT_CAP)),
				timestamp: isoInstant(a._creationTime),
				user: a.user?.name,
			})),
			limit
		);
	},
});

export const getTeamMembers = createTool({
	description:
		"List the organization's team members (id, name, email). Use to resolve a person's name to their user ID before assigning or filtering tasks by assignee.",
	inputSchema: z.object({}),
	execute: async (ctx): Promise<Capped<TeamMemberItem>> => {
		const members = await ctx.runQuery(api.organizations.getMembers, {});
		return capped(
			members.map((m) => ({
				id: m._id,
				name: m.name,
				email: m.email,
			})),
			LIST_CAP
		);
	},
});

export const getAutomations = createTool({
	description:
		"List the organization's workflow automations: what triggers them, whether they're active, and how often they've run.",
	inputSchema: z.object({}),
	execute: async (ctx): Promise<Capped<AutomationItem>> => {
		const automations = await ctx.runQuery(api.automations.list, {});
		return capped(
			automations.map((a) => ({
				id: a._id,
				name: a.name,
				description: truncate(a.description, TEXT_CAP),
				isActive: a.status === "active",
				trigger: `${a.trigger.type}${triggerRecordObjectType(a.trigger as AutomationTrigger) ? ` (${triggerRecordObjectType(a.trigger as AutomationTrigger)})` : ""}`,
				lastTriggeredAt: isoInstant(a.lastTriggeredAt),
				triggerCount: a.triggerCount,
			})),
			LIST_CAP
		);
	},
});

export const getAutomationRuns = createTool({
	description:
		"Get the recent execution history of one workflow automation: when it ran, whether it succeeded, and any error. Use the id from getAutomations.",
	inputSchema: z.object({
		automationId: z.string(),
		limit: z.number().int().min(1).max(ACTIVITY_CAP).optional(),
	}),
	execute: async (ctx, input): Promise<Capped<AutomationRunItem>> => {
		const limit = input.limit ?? ACTIVITY_CAP;
		const result = await ctx.runQuery(api.automations.getExecutions, {
			automationId: input.automationId as Id<"workflowAutomations">,
			limit,
		});
		// getExecutions returns an array with no paginationOpts (this call), a
		// PaginationResult otherwise — narrow for the array-only mapping below.
		const runs = Array.isArray(result) ? result : result.page;
		return capped(
			runs.map((r) => ({
				status: r.status,
				triggeredBy: r.triggeredBy,
				triggeredAt: isoInstant(r.triggeredAt),
				completedAt: isoInstant(r.completedAt),
				error: truncate(r.error, TEXT_CAP),
				nodesExecuted: r.nodesExecuted.length,
			})),
			limit
		);
	},
});

export const listSavedReports = createTool({
	description:
		"List the organization's saved reports (name, entity type, visualization). To show one to the user, get its settings with getSavedReport, then execute it with runReport.",
	inputSchema: z.object({}),
	execute: async (ctx): Promise<Capped<SavedReportItem>> => {
		const reports = await ctx.runQuery(api.reports.list, {});
		return capped(
			reports.map((r) => ({
				id: r._id,
				name: r.name,
				description: truncate(r.description, TEXT_CAP),
				entityType: r.config.entityType,
				visualization: r.visualization.type,
				updatedAt: isoInstant(r.updatedAt),
			})),
			LIST_CAP
		);
	},
});

export const getSavedReport = createTool({
	description:
		"Get one saved report's settings (entity type, metric, grouping, date range, filters, visualization). Re-run it by passing those settings to runReport.",
	inputSchema: z.object({ reportId: z.string() }),
	execute: async (ctx, input): Promise<SavedReportDetail | NotFound> => {
		const report = await ctx.runQuery(api.reports.get, {
			id: input.reportId as Id<"reports">,
		});
		if (!report) return { found: false };
		const { config, visualization } = normalizeReportConfig(
			report.config,
			report.visualization
		);
		const range = config.date?.range;
		return {
			found: true,
			report: {
				id: report._id,
				name: report.name,
				description: truncate(report.description, TEXT_CAP),
				entityType: config.entityType,
				visualization: visualization.type,
				updatedAt: isoInstant(report.updatedAt),
				metric: config.metric,
				groupBy: config.groupBy,
				segmentBy: config.segmentBy,
				dateField: config.date?.field,
				dateRange:
					range === undefined
						? undefined
						: range.kind === "preset"
							? { preset: range.preset }
							: { start: isoDay(range.start), end: isoDay(range.end) },
				filters: config.filters,
				columns: config.columns,
			},
		};
	},
});

export const listSkus = createTool({
	description:
		"List the organization's service catalog (SKUs): what they charge per unit for each service or product. Rates are dollars.",
	inputSchema: z.object({
		includeInactive: z.boolean().optional().describe("Defaults to false"),
	}),
	execute: async (ctx, input): Promise<Capped<SkuItem>> => {
		const skus = input.includeInactive
			? await ctx.runQuery(api.skus.listAll, {})
			: await ctx.runQuery(api.skus.list, {});
		return capped(
			skus.map((s) => ({
				id: s._id,
				name: s.name,
				unit: s.unit,
				rate: s.rate,
				cost: s.cost,
				isActive: s.isActive,
			})),
			LIST_CAP
		);
	},
});

// ---------------------------------------------------------------------------
// Write tools
//
// Convention for adding writes:
// - Wrap an existing org-scoped userMutation via ctx.runMutation — the
//   caller's identity propagates, so org isolation and role checks are
//   inherited, exactly like the read tools.
// - Whitelist editable fields in inputSchema; never pass input through.
// - Dates come in as YYYY-MM-DD and are stored UTC-midnight (dayStartMs).
// - Return WriteResult, catching mutation validation errors as data.
// - No write requires human-in-the-loop approval. If the user asks for a record
//   to be created or updated, the agent just does it. Decided 2026-07-03 and
//   reaffirmed 2026-07-31 against the SEC-8 indirect-injection review, which
//   proposed gating the three writes whose status changes fire
//   emitStatusChangeEvent into the automation engine. Revisit only if that
//   fan-out proves to be a real problem; the bound in the meantime is that
//   every write wraps a userMutation, so org isolation and RBAC still apply
//   and an injected chain can only do what the acting user already could.
// ---------------------------------------------------------------------------

const taskStatus = z.enum(["pending", "in-progress", "completed", "cancelled"]);
const timeHHMM = z
	.string()
	.regex(/^\d{2}:\d{2}$/, "Use HH:MM (24-hour)")
	.describe("24-hour HH:MM");

export const createTask = createTool({
	description:
		"Create a task on the schedule. Resolve clientId/projectId/assigneeUserId with lookup tools first — never guess IDs. Tasks linked to a client are client-facing; tasks without a client are internal.",
	inputSchema: z.object({
		title: z.string().min(1),
		date: isoDate.describe("Day the task is scheduled for (YYYY-MM-DD)"),
		description: z.string().optional(),
		startTime: timeHHMM.optional(),
		endTime: timeHHMM.optional(),
		clientId: z.string().optional(),
		projectId: z.string().optional(),
		assigneeUserId: z.string().optional(),
		status: taskStatus.optional().describe("Defaults to pending"),
	}),
	execute: async (
		ctx,
		input
	): Promise<WriteResult<{ taskId: string }>> => {
		try {
			const taskId = await ctx.runMutation(api.tasks.create, {
				title: input.title,
				description: input.description,
				date: dayStartMs(input.date),
				startTime: input.startTime,
				endTime: input.endTime,
				type: input.clientId ? "external" : "internal",
				clientId: input.clientId as Id<"clients"> | undefined,
				projectId: input.projectId as Id<"projects"> | undefined,
				assigneeUserId: input.assigneeUserId as Id<"users"> | undefined,
				status: input.status ?? "pending",
			});
			return { ok: true, taskId };
		} catch (e) {
			return writeError(e);
		}
	},
});

export const updateTask = createTool({
	description:
		"Update a task: reschedule (date/times), retitle, edit the description, reassign, or change its status (e.g. mark completed). Only pass the fields to change. Use the task id from getSchedule or getTasks.",
	inputSchema: z.object({
		taskId: z.string(),
		title: z.string().min(1).optional(),
		description: z.string().optional(),
		date: isoDate.optional().describe("New day (YYYY-MM-DD)"),
		startTime: timeHHMM.optional(),
		endTime: timeHHMM.optional(),
		assigneeUserId: z.string().optional(),
		status: taskStatus.optional(),
	}),
	execute: async (
		ctx,
		input
	): Promise<WriteResult<{ taskId: string }>> => {
		try {
			const taskId = await ctx.runMutation(api.tasks.update, {
				id: input.taskId as Id<"tasks">,
				title: input.title,
				description: input.description,
				date: input.date ? dayStartMs(input.date) : undefined,
				startTime: input.startTime,
				endTime: input.endTime,
				assigneeUserId: input.assigneeUserId as Id<"users"> | undefined,
				status: input.status,
			});
			return { ok: true, taskId };
		} catch (e) {
			return writeError(e);
		}
	},
});

export const updateClient = createTool({
	description:
		"Update a client's details: name, description, status, lead source, communication preference, tags, or notes. Only pass the fields to change. Resolve the client with listClients first.",
	inputSchema: z.object({
		clientId: z.string(),
		companyName: z.string().min(1).optional(),
		companyDescription: z.string().optional(),
		status: z.enum(["lead", "active", "inactive", "archived"]).optional(),
		leadSource: z
			.enum([
				"word-of-mouth",
				"website",
				"social-media",
				"referral",
				"advertising",
				"trade-show",
				"cold-outreach",
				"other",
			])
			.optional(),
		communicationPreference: z.enum(["email", "phone", "both"]).optional(),
		tags: z.array(z.string()).optional().describe("Replaces the full tag list"),
		notes: z.string().optional(),
	}),
	execute: async (
		ctx,
		input
	): Promise<WriteResult<{ clientId: string }>> => {
		try {
			const clientId = await ctx.runMutation(api.clients.update, {
				id: input.clientId as Id<"clients">,
				companyName: input.companyName,
				companyDescription: input.companyDescription,
				status: input.status,
				leadSource: input.leadSource,
				communicationPreference: input.communicationPreference,
				tags: input.tags,
				notes: input.notes,
			});
			return { ok: true, clientId };
		} catch (e) {
			return writeError(e);
		}
	},
});

export const updateProject = createTool({
	description:
		"Update a project's details: title, description, status, type, or start/end dates. Only pass the fields to change. Resolve the project with listProjects first.",
	inputSchema: z.object({
		projectId: z.string(),
		title: z.string().min(1).optional(),
		description: z.string().optional(),
		status: z
			.enum(["planned", "in-progress", "completed", "cancelled"])
			.optional(),
		projectType: z.enum(["one-off", "recurring"]).optional(),
		startDate: isoDate.optional().describe("YYYY-MM-DD"),
		endDate: isoDate.optional().describe("YYYY-MM-DD"),
	}),
	execute: async (
		ctx,
		input
	): Promise<WriteResult<{ projectId: string }>> => {
		try {
			const projectId = await ctx.runMutation(api.projects.update, {
				id: input.projectId as Id<"projects">,
				title: input.title,
				description: input.description,
				status: input.status,
				projectType: input.projectType,
				startDate: input.startDate ? dayStartMs(input.startDate) : undefined,
				endDate: input.endDate ? dayStartMs(input.endDate) : undefined,
			});
			return { ok: true, projectId };
		} catch (e) {
			return writeError(e);
		}
	},
});

// ---------------------------------------------------------------------------
// Routing tools
// ---------------------------------------------------------------------------

export const getRoute = createTool({
	description:
		"Fetch a route including per-stop completion. Defaults to today's whole-team daily route; pass assigneeUserId for a specific person's daily route, or savedRouteName to fetch a saved (reusable) route by name instead.",
	inputSchema: z.object({
		date: isoDate.optional().describe("YYYY-MM-DD; defaults to today"),
		assigneeUserId: z
			.string()
			.optional()
			.describe("resolve with getTeamMembers; omit for the whole-team route"),
		savedRouteName: z
			.string()
			.optional()
			.describe("fetch a saved route by name instead of a daily route"),
	}),
	execute: async (
		ctx,
		input
	): Promise<
		| { found: true; route: ShapedRoute }
		| { found: false; savedRouteNames: string[]; hint: string }
	> => {
		const routes = await ctx.runQuery(api.routes.list, {});
		const resolution = resolveRouteFromList(routes, {
			date: resolveDateMs(input.date),
			assigneeUserId: input.assigneeUserId as Id<"users"> | undefined,
			savedRouteName: input.savedRouteName,
		});
		if (resolution.found) return { found: true, route: shapeRoute(resolution.route) };

		// Daily-lookup miss: if exactly one daily route exists for the date,
		// return it — the user usually means "my route" whatever its assignee.
		if (!input.savedRouteName) {
			const sameDay = routes.filter(
				(r) => r.kind === "daily" && r.date === resolveDateMs(input.date)
			);
			if (sameDay.length === 1) {
				return { found: true, route: shapeRoute(sameDay[0]) };
			}
		}

		const savedRouteNames = routes
			.filter((r) => (r.kind ?? "saved") !== "daily")
			.map((r) => r.name)
			.slice(0, 20);
		const hint =
			resolution.reason === "ambiguous"
				? `Multiple saved routes match "${input.savedRouteName}": ${resolution.candidates.join(", ")}. Ask the user which one.`
				: input.savedRouteName
					? `No saved route named "${input.savedRouteName}" found.`
					: "No daily route for that day/assignee yet — use planRoute to build one.";
		return { found: false, savedRouteNames, hint };
	},
});

export const planRoute = createTool({
	description:
		"Build/refresh a daily route from the schedule, or start today's route from a saved route (fromSavedRouteName). Seeding from the schedule REPLACES the day's existing stop list — warn the user if they've already customized today's route.",
	inputSchema: z.object({
		date: isoDate.optional(),
		assigneeUserId: z.string().optional(),
		fromSavedRouteName: z
			.string()
			.optional()
			.describe("copy this saved route into the day instead of seeding from the schedule"),
	}),
	execute: async (
		ctx,
		input
	): Promise<
		WriteResult<{
			routeId: string;
			stopCount?: number;
			skippedNoAddress?: number;
			truncated?: number;
		}>
	> => {
		const dateMs = resolveDateMs(input.date);
		const assigneeUserId = input.assigneeUserId as Id<"users"> | undefined;
		try {
			if (input.fromSavedRouteName) {
				const routes = await ctx.runQuery(api.routes.list, {});
				const resolution = resolveRouteFromList(routes, {
					savedRouteName: input.fromSavedRouteName,
				});
				if (!resolution.found) {
					const savedRouteNames = routes
						.filter((r) => (r.kind ?? "saved") !== "daily")
						.map((r) => r.name);
					return {
						ok: false,
						error:
							resolution.reason === "ambiguous"
								? `Multiple saved routes match "${input.fromSavedRouteName}": ${resolution.candidates.join(", ")}.`
								: `No saved route named "${input.fromSavedRouteName}" found. Saved routes: ${savedRouteNames.join(", ") || "none"}.`,
					};
				}
				const routeId = await ctx.runMutation(api.routes.copyToDaily, {
					routeId: resolution.route._id,
					date: dateMs,
					assigneeUserId,
				});
				return { ok: true, routeId };
			}
			const result = await ctx.runMutation(api.routes.seedFromSchedule, {
				date: dateMs,
				assigneeUserId,
			});
			return {
				ok: true,
				routeId: result.routeId,
				stopCount: result.stopCount,
				skippedNoAddress: result.skippedNoAddress,
				truncated: result.truncated,
			};
		} catch (e) {
			return writeError(e);
		}
	},
});

export const updateRoute = createTool({
	description:
		"Edit today's (or a given day's) daily route — rename, round-trip, remove stops, reorder stops, or add client-property stops. Never edits saved routes. Editing stops clears the route's computed driving order/times — suggest optimizeRoute afterward.",
	inputSchema: z.object({
		date: isoDate.optional(),
		assigneeUserId: z.string().optional(),
		rename: z.string().optional(),
		roundTrip: z.boolean().optional(),
		removeStops: z
			.array(z.string())
			.optional()
			.describe("stop numbers as shown by getRoute, or label fragments"),
		addPropertyStops: z
			.array(z.string())
			.optional()
			.describe("client or property names to add as stops"),
		reorder: z
			.array(z.number())
			.optional()
			.describe(
				"new visiting order as current stop numbers, e.g. [3,1,2]; must include every stop exactly once"
			),
	}),
	execute: async (
		ctx,
		input
	): Promise<
		WriteResult<{ stopCount: number; removed: string[]; added: string[]; unmatched?: string[] }>
	> => {
		try {
			const routes = await ctx.runQuery(api.routes.list, {});
			const assigneeUserId = input.assigneeUserId as Id<"users"> | undefined;
			const resolution = resolveRouteFromList(routes, {
				date: resolveDateMs(input.date),
				assigneeUserId,
			});
			if (!resolution.found) {
				return { ok: false, error: "No daily route for that day — use planRoute first." };
			}
			const route = resolution.route;
			if ((route.kind ?? "saved") !== "daily") {
				return {
					ok: false,
					error: "That resolved to a saved route; updateRoute only edits daily routes.",
				};
			}

			const additions: {
				propertyId: Id<"clientProperties">;
				label: string;
				latitude: number;
				longitude: number;
			}[] = [];
			const unmatchedAdds: string[] = [];
			if (input.addPropertyStops?.length) {
				const { properties } = await ctx.runQuery(
					api.clientProperties.listGeocodedWithClients,
					{}
				);
				for (const term of input.addPropertyStops) {
					const needle = term.toLowerCase();
					const match = properties.find(
						(p) =>
							p.propertyName?.toLowerCase().includes(needle) ||
							p.clientCompanyName.toLowerCase().includes(needle)
					);
					if (!match) {
						unmatchedAdds.push(term);
						continue;
					}
					additions.push({
						propertyId: match._id,
						label: match.propertyName ?? match.streetAddress,
						latitude: match.latitude,
						longitude: match.longitude,
					});
				}
			}

			const hasStopEdits = Boolean(
				input.removeStops?.length || input.reorder?.length || additions.length
			);
			if (!hasStopEdits && input.rename === undefined && input.roundTrip === undefined) {
				return { ok: false, error: "No changes provided." };
			}

			const edit = applyStopEdits(route.stops, {
				removeStops: input.removeStops,
				reorder: input.reorder,
				additions,
			});
			if (edit.error) return { ok: false, error: edit.error };

			await ctx.runMutation(api.routes.update, {
				routeId: route._id,
				name: input.rename,
				roundTrip: input.roundTrip,
				stops: hasStopEdits ? edit.stops : undefined,
			});

			const unmatched = [...edit.unmatched, ...unmatchedAdds];
			return {
				ok: true,
				stopCount: (hasStopEdits ? edit.stops : route.stops).length,
				removed: edit.removed,
				added: edit.added,
				...(unmatched.length ? { unmatched } : {}),
			};
		} catch (e) {
			return writeError(e);
		}
	},
});

export const optimizeRoute = createTool({
	description:
		"Compute/optimize driving order and drive times for a daily or saved route. Spends a Mapbox call; rate-limited. Pass keepOrder:true to compute times for the current order instead of optimizing.",
	inputSchema: z.object({
		date: isoDate.optional(),
		assigneeUserId: z.string().optional(),
		savedRouteName: z.string().optional(),
		keepOrder: z
			.boolean()
			.optional()
			.describe("true = compute times for the current order instead of optimizing"),
	}),
	execute: async (
		ctx,
		input
	): Promise<
		| ({ ok: true } & {
				optimized: boolean;
				approximate: boolean;
				totalDistanceMeters: number;
				totalDurationSeconds: number;
				stopOrder: string[];
			})
		| { ok: false; error: string; unreachableStopNumbers?: number[] }
	> => {
		try {
			const routes = await ctx.runQuery(api.routes.list, {});
			const resolution = resolveRouteFromList(routes, {
				date: resolveDateMs(input.date),
				assigneeUserId: input.assigneeUserId as Id<"users"> | undefined,
				savedRouteName: input.savedRouteName,
			});
			if (!resolution.found) {
				return {
					ok: false,
					error:
						resolution.reason === "ambiguous"
							? `Multiple saved routes match "${input.savedRouteName}": ${resolution.candidates.join(", ")}.`
							: input.savedRouteName
								? `No saved route named "${input.savedRouteName}" found.`
								: "No route found for that day/assignee.",
				};
			}

			const routeId = resolution.route._id;
			await ctx.runAction(api.routingActions.computeRoute, {
				routeId,
				optimize: !input.keepOrder,
			});
			const updated = await ctx.runQuery(api.routes.get, { routeId });
			if (!updated) return { ok: false, error: "Route not found after computation." };
			const stopOrder = [...updated.stops]
				.sort((a, b) => a.order - b.order)
				.map((s) => s.label);
			return {
				ok: true,
				optimized: updated.optimized ?? false,
				approximate: updated.approximate ?? false,
				totalDistanceMeters: updated.totalDistanceMeters ?? 0,
				totalDurationSeconds: updated.totalDurationSeconds ?? 0,
				stopOrder,
			};
		} catch (e) {
			const data = convexErrorData(e);
			if (data?.code === "unreachable_stops") {
				const stopIndices = Array.isArray(data.stopIndices)
					? (data.stopIndices as number[])
					: [];
				const unreachableStopNumbers = stopIndices.map((i) => i + 1);
				return {
					ok: false,
					error: `Stops ${unreachableStopNumbers.join(", ")} can't be reached by road — remove them or fix their addresses`,
					unreachableStopNumbers,
				};
			}
			return writeError(e);
		}
	},
});

export const navigate = createTool({
	description: [
		"Open a page in the app for the user. Use when they ask to go somewhere, or after resolving the record they want to see.",
		"Valid paths: /home, /clients, /clients/{clientId}, /clients/import, /projects, /projects/{projectId}, /quotes, /quotes/{quoteId}, /invoices, /invoices/{invoiceId}, /tasks, /reports, /reports/{reportId}, /reports/new, /automations, /subscription, /organization/profile, /routing.",
		"Clients, projects and quotes are created in a dialog, not at a URL — there is no /clients/new, /projects/new or /quotes/new. To create one, send the user to the relevant list page and tell them to press the create button.",
		"IDs must come from lookup tools — never guess an ID.",
		"Never navigate while the user has the report builder open (current-screen has reportBuilderConfig) unless they explicitly ask to go somewhere else.",
	].join("\n"),
	inputSchema: z.object({
		path: z.string().describe("Workspace path starting with /"),
	}),
	execute: async (
		_ctx,
		input
	): Promise<{ ok: boolean; path: string; reason?: string }> => {
		if (!isAllowedWorkspacePath(input.path)) {
			return {
				ok: false,
				path: input.path,
				reason: "Not a valid app path. Use one of the documented paths.",
			};
		}
		return { ok: true, path: input.path };
	},
});

export const describeSchema = createTool({
	description:
		"Look up the fields, types, and valid enum values for a business-data table (clients, projects, tasks, quotes, invoices, payments, etc.). Call with no arguments to list the describable tables; call with a table name to get that table's fields. Use it to learn exact field names and allowed status/enum values before interpreting or filtering record data. Derived live from the schema, so it is always current. Returns only the data model — never any organization's actual records.",
	inputSchema: z.object({
		table: z
			.enum([...DESCRIBABLE_TABLES] as [string, ...string[]])
			.optional()
			.describe("The table to describe. Omit to list all describable tables."),
	}),
	execute: async (
		_ctx,
		input
	): Promise<
		| { tables: TableSummary[] }
		| TableSchema
		| { error: string; availableTables: string[] }
	> => {
		if (!input.table) {
			return { tables: listDescribableTables() };
		}
		const described = describeTable(input.table);
		if (!described) {
			return {
				error: `Unknown table "${input.table}".`,
				availableTables: [...DESCRIBABLE_TABLES],
			};
		}
		return described;
	},
});

type HelpCatalogCategory = {
	slug: string;
	name: string;
	articles: { ref: string; title: string }[];
};

export const searchHelp = createTool({
	description: [
		"Search the OneTool help center — the official how-to guides and feature explanations for the app itself.",
		"Use it whenever the user asks how to do something in OneTool, what a feature does, or which plan includes a feature. It covers the app, not the user's business data.",
		'Call with { query } to find matching articles. Call with { article: "category-slug/article-slug" } (a ref from a result) to fetch the full article as markdown. Call with no arguments to list every category and article.',
		"Answer from the article content and include a markdown link to the article's url (a same-domain path like /help/quotes/e-signatures) so the user can read more.",
	].join("\n"),
	inputSchema: z.object({
		query: z
			.string()
			.optional()
			.describe(
				'What the user wants to do or learn, e.g. "import clients from a spreadsheet"'
			),
		article: z
			.string()
			.optional()
			.describe(
				'Exact "category-slug/article-slug" ref from a prior search or listing.'
			),
	}),
	execute: async (
		_ctx,
		input
	): Promise<
		| { results: HelpSearchHit[]; note?: string }
		| { ref: string; url: string; title: string; markdown: string }
		| { categories: HelpCatalogCategory[] }
		| { error: string }
	> => {
		if (input.article) {
			const resolved = resolveHelpRef(input.article);
			if (!resolved) {
				return {
					error: `Unknown article "${input.article}". Call searchHelp with a query, or with no arguments to list valid refs.`,
				};
			}
			return {
				ref: input.article,
				url: `/help/${resolved.category.slug}/${resolved.article.slug}`,
				title: resolved.article.title,
				markdown: helpArticleMarkdown(resolved.article),
			};
		}
		if (input.query) {
			const results = searchHelpArticles(input.query, 5);
			if (results.length === 0) {
				return {
					results,
					note: "No matching help articles. Tell the user the help center does not cover this yet — do not guess.",
				};
			}
			return { results };
		}
		return {
			categories: HELP_CATEGORIES.map((category) => ({
				slug: category.slug,
				name: category.name,
				articles: category.articles.map((article) => ({
					ref: `${category.slug}/${article.slug}`,
					title: article.title,
				})),
			})),
		};
	},
});

// Permission denials become structured tool results instead of failing the
// whole turn — the model tells the user they lack access to that area.
function withPermissionFallback<T extends { execute?: unknown }>(tool: T): T {
	const original = tool.execute;
	if (typeof original !== "function") return tool;
	return {
		...tool,
		// The agent runtime injects ctx by spreading {...tool, ctx} and reading it
		// off `this` inside execute — must forward `this`, not call `original` bare.
		execute: async function (this: unknown, ...args: unknown[]) {
			try {
				return await original.apply(this, args);
			} catch (e) {
				const forbidden = forbiddenErrorData(e);
				if (forbidden) return noPermissionResult(forbidden);
				throw e;
			}
		},
	} as T;
}

function withPermissionFallbackAll<T extends Record<string, { execute?: unknown }>>(
	tools: T
): T {
	return Object.fromEntries(
		Object.entries(tools).map(([name, tool]) => [
			name,
			withPermissionFallback(tool),
		])
	) as T;
}

export const assistantTools = withPermissionFallbackAll({
	getSchedule,
	getTasks,
	getBusinessStats,
	runReport,
	createReport,
	configureReport,
	describeSchema,
	searchHelp,
	listClients,
	getClient,
	listProjects,
	getProject,
	listQuotes,
	getQuote,
	listInvoices,
	getInvoice,
	searchClientEmails,
	getEmailThread,
	getDocuments,
	getActivity,
	getTeamMembers,
	getAutomations,
	getAutomationRuns,
	listSavedReports,
	getSavedReport,
	listSkus,
	createTask,
	updateTask,
	updateClient,
	updateProject,
	getRoute,
	planRoute,
	updateRoute,
	optimizeRoute,
	navigate,
});
