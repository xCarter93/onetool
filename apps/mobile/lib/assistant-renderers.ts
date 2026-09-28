import type { RatioKey } from "@onetool/backend/convex/lib/reportFields";
import { formatCurrency } from "@/lib/format";

// Pure shaping for the assistant's tool-result renderers
// (components/assistant/renderers). Output shapes mirror
// packages/backend/convex/assistantTools.ts, same as web's renderers.

export const ROW_CAP = 8;

export interface RecordRow {
	id: string;
	primary: string;
	secondary?: string;
	status?: string;
	amount?: number;
	/** Web workspace path; the renderer maps it to a mobile route. */
	href?: string;
}

// ISO day strings; outputs replayed from older threads carry epoch ms.
export type DayValue = string | number;

export function humanize(value: string): string {
	return value.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
}

// Stored days are UTC midnight — formatting in local time shifts them a day in the US.
export function formatUtcDay(day: DayValue, withWeekday = false): string {
	return new Date(day).toLocaleDateString("en-US", {
		...(withWeekday ? { weekday: "short" as const } : {}),
		month: "short",
		day: "numeric",
		timeZone: "UTC",
	});
}

/** Sort key: undated or unparseable entries go last. */
export function dayMs(day: DayValue | undefined): number {
	if (day === undefined) return Number.POSITIVE_INFINITY;
	const ms = typeof day === "number" ? day : Date.parse(day);
	return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
}

/** How many rows past ROW_CAP the "+N more" line reports. */
export function hiddenCount(shownSource: number, totalCount?: number): number {
	const shown = Math.min(shownSource, ROW_CAP);
	return Math.max(totalCount ?? shownSource, shownSource) - shown;
}

// Shapes the renderers need; a malformed or missing output gets the error chip
// instead of an empty result.
const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;
const hasArray = (key: string) => (output: unknown) =>
	isObject(output) && Array.isArray(output[key]);

const OUTPUT_SHAPES: Record<string, (output: unknown) => boolean> = {
	runReport: hasArray("data"),
	getSchedule: (o) => hasArray("tasks")(o) || hasArray("projects")(o),
	searchClientEmails: hasArray("items"),
	getBusinessStats: (o) =>
		isObject(o) && isObject(o.totalClients) && isObject(o.revenueGoal),
	searchHelp: isObject,
	listClients: hasArray("items"),
	listProjects: hasArray("items"),
	listQuotes: hasArray("items"),
	listInvoices: hasArray("items"),
	listSkus: hasArray("items"),
	getTeamMembers: hasArray("items"),
};

export function isRenderableOutput(tool: string, output: unknown): boolean {
	return OUTPUT_SHAPES[tool]?.(output) ?? false;
}

// Tool-name prefix → chip verbs; anything else falls back to Ran/Running.
const TOOL_VERBS: Record<string, { done: string; active: string }> = {
	get: { done: "Checked", active: "Checking" },
	list: { done: "Looked up", active: "Looking up" },
	search: { done: "Searched", active: "Searching" },
	create: { done: "Created", active: "Creating" },
	update: { done: "Updated", active: "Updating" },
	plan: { done: "Planned", active: "Planning" },
	optimize: { done: "Optimized", active: "Optimizing" },
	run: { done: "Ran", active: "Running" },
	describe: { done: "Looked up", active: "Looking up" },
};

/** "getSchedule" → { done: "Checked schedule", active: "Checking schedule…" }. */
export function toolChipLabels(name: string): { done: string; active: string } {
	const words = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(" ").filter(Boolean);
	const verb = TOOL_VERBS[words[0]?.toLowerCase() ?? ""];
	const rest = (verb ? words.slice(1) : words).join(" ").toLowerCase();
	const { done, active } = verb ?? { done: "Ran", active: "Running" };
	return {
		done: rest ? `${done} ${rest}` : done,
		active: `${rest ? `${active} ${rest}` : active}…`,
	};
}

export function helpArticleUrl(ref: string): string {
	return `https://onetool.biz/help/${ref}`;
}

// ---------------------------------------------------------------------------
// runReport
// ---------------------------------------------------------------------------

export type ReportVisualization =
	| "bar"
	| "column"
	| "line"
	| "pie"
	| "radar"
	| "radial"
	| "table";

export interface ReportOutput {
	data: { label: string; value: number }[];
	total: number;
	visualization?: ReportVisualization;
	metadata?: {
		groupBy?: string;
		truncated?: boolean;
		totalIsCurrency?: boolean;
		itemValueIsCurrency?: boolean;
	};
}

export interface ReportRow {
	label: string;
	value: number;
	valueText: string;
	/** Share of the item sum, "46.0%". */
	percent: string;
	/** Bar length relative to the largest value, 0–1. */
	ratio: number;
}

export interface ReportView {
	visualization: ReportVisualization;
	/** Largest first — the list layouts. */
	ranked: ReportRow[];
	/** Backend order — the line chart (time buckets arrive in order). */
	ordered: ReportRow[];
	totalText: string;
	/** Absent for ratio reports — averaging their rows' counts reads as the rate. */
	averageText?: string;
	truncated: boolean;
}

// Typed as a Record so a new backend ratio key fails typecheck here; importing
// RATIO_KEYS would pull the whole report registry into the app bundle.
const RATIO_KEYS: Record<RatioKey, true> = {
	conversionRate: true,
	completionRate: true,
};

function formatReportValue(value: number, isCurrency: boolean): string {
	return isCurrency ? formatCurrency(value) : value.toLocaleString("en-US");
}

export function buildReportView(output: unknown): ReportView | null {
	const report = output as ReportOutput | undefined;
	if (!Array.isArray(report?.data)) return null;

	// Ratio reports carry the ratioKey as groupBy and an integer percentage as total.
	const isRatio = Object.hasOwn(RATIO_KEYS, report.metadata?.groupBy ?? "");
	// Flags are emitted only when true — absent means counts.
	const totalIsCurrency = report.metadata?.totalIsCurrency === true;
	const itemIsCurrency = report.metadata?.itemValueIsCurrency === true;

	// The item sum drives %-share and average only; the headline total is
	// `report.total` (a ratio metric's total is not the sum).
	const itemSum = report.data.reduce((sum, d) => sum + d.value, 0);
	const max = Math.max(0, ...report.data.map((d) => d.value));

	const ordered = report.data.map((d) => ({
		label: d.label,
		value: d.value,
		valueText: formatReportValue(d.value, itemIsCurrency),
		percent: `${itemSum > 0 ? ((d.value / itemSum) * 100).toFixed(1) : "0"}%`,
		ratio: max > 0 ? Math.max(0, d.value) / max : 0,
	}));
	const average = itemSum / (ordered.length || 1);

	return {
		visualization: report.visualization ?? "bar",
		ranked: [...ordered].sort((a, b) => b.value - a.value),
		ordered,
		totalText: isRatio
			? `${report.total}%`
			: formatReportValue(report.total, totalIsCurrency),
		averageText: isRatio
			? undefined
			: itemIsCurrency
				? formatCurrency(average)
				: average.toFixed(1),
		truncated: report.metadata?.truncated === true,
	};
}

// ---------------------------------------------------------------------------
// list* / getTeamMembers
// ---------------------------------------------------------------------------

interface ClientListItem {
	id: string;
	companyName: string;
	status: string;
	leadSource?: string;
}

interface ProjectItem {
	id: string;
	title: string;
	projectNumber?: string;
	status: string;
	projectType: string;
}

interface QuoteItem {
	id: string;
	quoteNumber?: string;
	title?: string;
	status: string;
	total: number;
	validUntil?: string;
}

interface InvoiceItem {
	id: string;
	invoiceNumber: string;
	status: string;
	total: number;
	issuedDate?: string;
	dueDate?: string;
}

interface SkuItem {
	id: string;
	name: string;
	unit: string;
	rate: number;
	isActive: boolean;
}

interface TeamMemberItem {
	id: string;
	name: string;
	email: string;
}

export const clientRow = (client: ClientListItem): RecordRow => ({
	id: client.id,
	primary: client.companyName,
	secondary: client.leadSource ? humanize(client.leadSource) : undefined,
	status: client.status,
	href: `/clients/${client.id}`,
});

export const projectRow = (project: ProjectItem): RecordRow => ({
	id: project.id,
	primary: project.title,
	secondary: project.projectNumber
		? `#${project.projectNumber}`
		: humanize(project.projectType),
	status: project.status,
	href: `/projects/${project.id}`,
});

export const quoteRow = (quote: QuoteItem): RecordRow => ({
	id: quote.id,
	primary:
		quote.title?.trim() ||
		(quote.quoteNumber ? `Quote ${quote.quoteNumber}` : "Untitled quote"),
	secondary:
		quote.title && quote.quoteNumber
			? `#${quote.quoteNumber}`
			: quote.validUntil
				? `Valid until ${formatUtcDay(quote.validUntil)}`
				: undefined,
	status: quote.status,
	amount: quote.total,
	href: `/quotes/${quote.id}`,
});

export const invoiceRow = (invoice: InvoiceItem): RecordRow => ({
	id: invoice.id,
	primary: `Invoice ${invoice.invoiceNumber}`,
	secondary: invoice.dueDate
		? `Due ${formatUtcDay(invoice.dueDate)}`
		: invoice.issuedDate
			? `Issued ${formatUtcDay(invoice.issuedDate)}`
			: undefined,
	status: invoice.status,
	amount: invoice.total,
	href: `/invoices/${invoice.id}`,
});

export const skuRow = (sku: SkuItem): RecordRow => ({
	id: sku.id,
	primary: sku.name,
	secondary: sku.unit,
	status: sku.isActive ? "active" : "inactive",
	amount: sku.rate,
});

export const teamMemberRow = (member: TeamMemberItem): RecordRow => ({
	id: member.id,
	primary: member.name,
	secondary: member.email,
});

// ---------------------------------------------------------------------------
// getSchedule
// ---------------------------------------------------------------------------

export interface ScheduleOutput {
	projects: {
		id: string;
		title: string;
		startDate?: DayValue;
		endDate?: DayValue;
		status: string;
		clientName: string;
	}[];
	tasks: {
		id: string;
		title: string;
		date?: DayValue;
		startTime?: string;
		endTime?: string;
		status: string;
		clientName: string;
	}[];
}

export interface ScheduleRow {
	id: string;
	primary: string;
	secondary?: string;
	when: string;
}

export function buildScheduleRows(output: unknown): {
	tasks: ScheduleRow[];
	projects: ScheduleRow[];
} {
	const schedule = output as ScheduleOutput | undefined;
	const tasks = Array.isArray(schedule?.tasks) ? schedule.tasks : [];
	const projects = Array.isArray(schedule?.projects) ? schedule.projects : [];

	return {
		tasks: [...tasks]
			.sort((a, b) => dayMs(a.date) - dayMs(b.date))
			.map((task) => ({
				id: task.id,
				primary: task.title,
				secondary: task.clientName,
				when:
					task.date === undefined
						? (task.startTime ?? "")
						: task.startTime
							? `${formatUtcDay(task.date, true)} · ${task.startTime}`
							: formatUtcDay(task.date, true),
			})),
		projects: [...projects]
			.sort((a, b) => dayMs(a.startDate) - dayMs(b.startDate))
			.map((project) => ({
				id: project.id,
				primary: project.title,
				secondary: project.clientName,
				when: project.startDate
					? project.endDate && project.endDate !== project.startDate
						? `${formatUtcDay(project.startDate, true)} – ${formatUtcDay(project.endDate, true)}`
						: formatUtcDay(project.startDate, true)
					: humanize(project.status),
			})),
	};
}
