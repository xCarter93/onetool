import { createTool } from "@convex-dev/agent";
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
		groupBy?: string[];
		dateRange?: { start?: string; end?: string };
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
function forbiddenErrorData(e: unknown): Record<string, unknown> | null {
	if (!(e instanceof ConvexError)) return null;
	let data: unknown = e.data;
	try {
		while (typeof data === "string") data = JSON.parse(data);
	} catch {
		return null;
	}
	if (
		typeof data === "object" &&
		data !== null &&
		(data as Record<string, unknown>).code === "FORBIDDEN"
	) {
		return data as Record<string, unknown>;
	}
	return null;
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

const NAVIGATE_ALLOWED_PATHS: RegExp[] = [
	/^\/home$/,
	/^\/clients$/,
	/^\/clients\/new$/,
	/^\/clients\/import$/,
	/^\/clients\/[A-Za-z0-9_-]+$/,
	/^\/projects$/,
	/^\/projects\/new$/,
	/^\/projects\/[A-Za-z0-9_-]+$/,
	/^\/quotes$/,
	/^\/quotes\/new$/,
	/^\/quotes\/[A-Za-z0-9_-]+$/,
	/^\/invoices$/,
	/^\/invoices\/[A-Za-z0-9_-]+$/,
	/^\/tasks$/,
	/^\/reports$/,
	/^\/reports\/new$/,
	/^\/reports\/[A-Za-z0-9_-]+$/,
	/^\/automations$/,
	/^\/subscription$/,
	/^\/organization\/profile$/,
];

export function isAllowedWorkspacePath(path: string): boolean {
	return NAVIGATE_ALLOWED_PATHS.some((pattern) => pattern.test(path));
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
				title: t.title,
				description: truncate(t.description, TEXT_CAP),
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
				title: t.title,
				description: truncate(t.description, TEXT_CAP),
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
		"Valid groupBy values per entityType:",
		"- clients: 'leadSource', 'creationDate_day|week|month', default = by status",
		"- projects: 'projectType', 'creationDate_day|week|month', default = by status",
		"- tasks: 'completionRate', 'date_day|week|month', default = by status",
		"- quotes: 'conversionRate', default = by status",
		"- invoices: 'month' (revenue by month), 'client' (revenue by client, top 10), default = by status",
		"- activities: 'timestamp_day|week|month', default = by type",
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
		const result = await ctx.runQuery(api.reportData.executeReport, {
			entityType: input.entityType,
			groupBy: input.groupBy,
			dateRange:
				input.startDate || input.endDate
					? {
							start: input.startDate ? dayStartMs(input.startDate) : undefined,
							end: input.endDate ? dayEndMs(input.endDate) : undefined,
						}
					: undefined,
		});
		return { ...result, visualization: input.visualization ?? "bar" };
	},
});

export const createReport = createTool({
	description: [
		"Build and SAVE a report from the user's plain-English description. Supports the full builder surface: grouping (or raw-row tables with columns), sum/avg/min/max measures, field filters, date ranges, and chart type.",
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
				notes: truncate(client.notes, BODY_CAP),
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
				subject: e.subject,
				preview: e.messagePreview ?? truncate(e.messageBody, TEXT_CAP),
				from: `${e.fromName} <${e.fromEmail}>`,
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
				subject: m.subject,
				body: truncate(
					(m.visibleText?.trim() ? m.visibleText : undefined) ??
						m.textBody ??
						m.messageBody,
					BODY_CAP
				),
				from: `${m.fromName} <${m.fromEmail}>`,
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
				description: truncate(a.description, TEXT_CAP),
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
				trigger: `${a.trigger.type}${"objectType" in a.trigger ? ` (${a.trigger.objectType})` : ""}`,
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
		"Get one saved report's settings (entity type, groupBy, date range, visualization). Re-run it by passing those settings to runReport.",
	inputSchema: z.object({ reportId: z.string() }),
	execute: async (ctx, input): Promise<SavedReportDetail | NotFound> => {
		const report = await ctx.runQuery(api.reports.get, {
			id: input.reportId as Id<"reports">,
		});
		if (!report) return { found: false };
		return {
			found: true,
			report: {
				id: report._id,
				name: report.name,
				description: truncate(report.description, TEXT_CAP),
				entityType: report.config.entityType,
				visualization: report.visualization.type,
				updatedAt: isoInstant(report.updatedAt),
				groupBy: report.config.groupBy,
				dateRange: report.config.dateRange
					? {
							start: isoDay(report.config.dateRange.start),
							end: isoDay(report.config.dateRange.end),
						}
					: undefined,
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
// - Consequential, externally visible actions (e.g. anything that emails a
//   client) must set needsApproval — none of the current writes qualify.
//   Note: status changes DO fire emitStatusChangeEvent and can trigger org
//   automations (PRD risk R3, shipped ungated by decision 2026-07-03).
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

export const navigate = createTool({
	description: [
		"Open a page in the app for the user. Use when they ask to go somewhere, or after resolving the record they want to see.",
		"Valid paths: /home, /clients, /clients/{clientId}, /clients/new, /clients/import, /projects, /projects/{projectId}, /projects/new, /quotes, /quotes/{quoteId}, /quotes/new, /invoices, /invoices/{invoiceId}, /tasks, /reports, /reports/{reportId}, /reports/new, /automations, /subscription, /organization/profile.",
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

// Permission denials become structured tool results instead of failing the
// whole turn — the model tells the user they lack access to that area.
function withPermissionFallback<T extends { execute?: unknown }>(tool: T): T {
	const original = tool.execute;
	if (typeof original !== "function") return tool;
	return {
		...tool,
		execute: async (...args: unknown[]) => {
			try {
				return await original(...args);
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
	navigate,
});
