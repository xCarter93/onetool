import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { HomeStats } from "./homeStats";
import type { ReportDataResult } from "./reportData";

/**
 * Read-only tools for the AI assistant. Every tool wraps an existing public
 * org-scoped query via ctx.runQuery — the caller's identity propagates, so
 * org isolation (and member-role actor scoping) is inherited, never rebuilt.
 *
 * Output discipline: lists are capped, long text truncated, and fields that
 * are sensitive or useless to an LLM (publicToken, Stripe session internals,
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

// ---------------------------------------------------------------------------
// Compact output shapes (what the LLM sees)
// ---------------------------------------------------------------------------

interface ScheduleProjectItem {
	id: string;
	title: string;
	description?: string;
	startDate?: number;
	endDate?: number;
	status: string;
	clientId?: string;
	clientName: string;
	projectNumber?: string;
}

interface ScheduleTaskItem {
	id: string;
	title: string;
	description?: string;
	date: number;
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
	date: number;
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
	startDate?: number;
	endDate?: number;
	completedAt?: number;
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
	validUntil?: number;
	sentAt?: number;
	approvedAt?: number;
}

interface QuoteDetail {
	found: true;
	quote: QuoteItem & {
		discountAmount?: number;
		discountType?: string;
		taxRate?: number;
		clientMessage?: string;
		terms?: string;
		declinedAt?: number;
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
	issuedDate: number;
	dueDate: number;
	paidAt?: number;
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
		dueDate: number;
		description?: string;
		status: string;
		paidAt?: number;
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
	sentAt: number;
	clientId: string;
	threadId?: string;
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
		sentAt: number;
	}[];
}

interface GeneratedPdfItem {
	id: string;
	documentType: string;
	documentId: string;
	version: number;
	generatedAt: number;
	signatureStatus?: string;
	signers?: string[];
}

interface FileItem {
	name: string;
	fileName: string;
	fileSize: number;
	uploadedAt: number;
}

interface ActivityItem {
	type: string;
	description?: string;
	timestamp: number;
	user?: string;
}

type NotFound = { found: false };

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
				startDate: p.startDate,
				endDate: p.endDate,
				status: p.status,
				clientId: p.clientId,
				clientName: p.clientName,
				projectNumber: p.projectNumber,
			})),
			tasks: events.tasks.map((t) => ({
				id: t.id,
				title: t.title,
				description: truncate(t.description, TEXT_CAP),
				date: t.startDate,
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
		"List the organization's tasks for a scope: today's tasks, overdue tasks, or upcoming tasks (next N days).",
	inputSchema: z.object({
		scope: z.enum(["today", "overdue", "upcoming"]),
		daysAhead: z
			.number()
			.int()
			.min(1)
			.max(90)
			.optional()
			.describe("Only for scope=upcoming; defaults to 7"),
	}),
	execute: async (ctx, input): Promise<Capped<TaskItem>> => {
		const tasks =
			input.scope === "today"
				? await ctx.runQuery(api.tasks.getToday, {})
				: input.scope === "overdue"
					? await ctx.runQuery(api.tasks.getOverdue, {})
					: await ctx.runQuery(api.tasks.getUpcoming, {
							daysAhead: input.daysAhead,
						});
		return capped(
			tasks.map((t) => ({
				id: t._id,
				title: t.title,
				description: truncate(t.description, TEXT_CAP),
				date: t.date,
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
	}),
	execute: async (ctx, input): Promise<ReportDataResult> => {
		return await ctx.runQuery(api.reportData.executeReport, {
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
				startDate: p.startDate,
				endDate: p.endDate,
				completedAt: p.completedAt,
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
				startDate: project.startDate,
				endDate: project.endDate,
				completedAt: project.completedAt,
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
				validUntil: q.validUntil,
				sentAt: q.sentAt,
				approvedAt: q.approvedAt,
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
				validUntil: quote.validUntil,
				clientMessage: truncate(quote.clientMessage, BODY_CAP),
				terms: truncate(quote.terms, BODY_CAP),
				sentAt: quote.sentAt,
				approvedAt: quote.approvedAt,
				declinedAt: quote.declinedAt,
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
				issuedDate: i.issuedDate,
				dueDate: i.dueDate,
				paidAt: i.paidAt,
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
				issuedDate: invoice.issuedDate,
				dueDate: invoice.dueDate,
				paidAt: invoice.paidAt,
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
				dueDate: p.dueDate,
				description: p.description,
				status: p.status,
				paidAt: p.paidAt,
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
				sentAt: e.sentAt,
				clientId: e.clientId,
				threadId: e.threadId,
			})),
			input.limit ?? EMAIL_CAP
		);
	},
});

export const getEmailThread = createTool({
	description:
		"Get the full messages of one email thread, oldest first. Use the threadId from searchClientEmails.",
	inputSchema: z.object({ threadId: z.string() }),
	execute: async (ctx, input): Promise<EmailThreadResult | NotFound> => {
		const thread = await ctx.runQuery(api.emailMessages.getEmailThread, {
			threadId: input.threadId,
		});
		if (!thread) return { found: false };
		return {
			found: true,
			messages: thread.map((m) => ({
				direction: m.direction,
				subject: m.subject,
				body: truncate(m.textBody ?? m.messageBody, BODY_CAP),
				from: `${m.fromName} <${m.fromEmail}>`,
				to: `${m.toName} <${m.toEmail}>`,
				status: m.status,
				sentAt: m.sentAt,
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
					uploadedAt: d.uploadedAt,
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
					uploadedAt: d.uploadedAt,
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
				generatedAt: d.generatedAt,
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
				timestamp: a._creationTime,
				user: a.user?.name,
			})),
			limit
		);
	},
});

export const assistantTools = {
	getSchedule,
	getTasks,
	getBusinessStats,
	runReport,
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
};
