/**
 * Report field registry — single source of truth for what report queries
 * can filter/group/aggregate on, per entity. Field names are verified
 * against schema.ts; do not invent fields here.
 *
 * Deliberately excluded from every entity:
 * - v.id(...) foreign keys (clientId, projectId, ...) — raw ids are useless in
 *   report cells; grouping on them goes through REPORT_GROUPABLE_FKS below,
 *   which label-resolves without exposing ids to filters/columns/AI.
 * - Nested objects/arrays (tags, pdfSettings, metadata, assignedUserIds).
 * - orgId / audit ids.
 * - Anything secret- or token-like (portalAccessId, publicToken, stripe*):
 *   must never be exposable via reports.
 */
import { literals } from "convex-helpers/validators";

export const REPORT_ENTITY_TYPES = [
	"clients",
	"projects",
	"tasks",
	"quotes",
	"invoices",
	"activities",
] as const;

export type ReportEntityType = (typeof REPORT_ENTITY_TYPES)[number];

export const reportEntityTypeValidator = literals(...REPORT_ENTITY_TYPES);

export type ReportFieldType =
	| "string"
	| "number"
	| "currency"
	| "timestamp"
	| "boolean";

export interface ReportFieldDef {
	type: ReportFieldType;
	/** Human-friendly label for filter/aggregation UI. */
	label: string;
	/** Literal union values, verified against schema.ts, for string fields with a fixed vocabulary. */
	options?: string[];
	/** Bucket labels that the default capitalization would get wrong (e.g. "one-off" → "One-off"). */
	optionLabels?: Record<string, string>;
}

export interface ReportEntityFields {
	/** The field dateRange filtering applies to for this entity. */
	dateField: string;
	/**
	 * Currency field summed into per-bucket metadata.totalValue (and a currency
	 * grand total) on grouped count reports — preserves the legacy quotes/invoices
	 * by-status "Value" column (§8 d11).
	 */
	summaryValueField?: string;
	fields: Record<string, ReportFieldDef>;
}

export const REPORT_FIELDS: Record<ReportEntityType, ReportEntityFields> = {
	clients: {
		dateField: "_creationTime",
		fields: {
			status: {
				type: "string",
				label: "Status",
				options: ["lead", "active", "inactive", "archived"],
			},
			// Free-text in schema.ts (v.optional(v.union(...))) — options ARE a
			// fixed vocabulary, but the field itself is optional/nullable, so it
			// still behaves like a string for filtering purposes.
			leadSource: {
				type: "string",
				label: "Lead Source",
				options: [
					"word-of-mouth",
					"website",
					"social-media",
					"referral",
					"advertising",
					"trade-show",
					"cold-outreach",
					"community-page",
					"other",
				],
			},
			companyName: { type: "string", label: "Company Name" },
			isActive: { type: "boolean", label: "Active" },
			_creationTime: { type: "timestamp", label: "Created" },
			companyDescription: { type: "string", label: "Company Description" },
			communicationPreference: {
				type: "string",
				label: "Communication Preference",
				options: ["email", "phone", "both"],
			},
			notes: { type: "string", label: "Notes" },
			archivedAt: { type: "timestamp", label: "Archived At" },
		},
	},
	projects: {
		dateField: "_creationTime",
		fields: {
			status: {
				type: "string",
				label: "Status",
				options: ["planned", "in-progress", "completed", "cancelled"],
			},
			projectType: {
				type: "string",
				label: "Project Type",
				options: ["one-off", "recurring"],
				optionLabels: { "one-off": "One-off" },
			},
			title: { type: "string", label: "Title" },
			_creationTime: { type: "timestamp", label: "Created" },
			description: { type: "string", label: "Description" },
			projectNumber: { type: "string", label: "Project Number" },
			startDate: { type: "timestamp", label: "Start Date" },
			endDate: { type: "timestamp", label: "End Date" },
			completedAt: { type: "timestamp", label: "Completed At" },
		},
	},
	tasks: {
		dateField: "date",
		fields: {
			status: {
				type: "string",
				label: "Status",
				options: ["pending", "in-progress", "completed", "cancelled"],
			},
			type: {
				type: "string",
				label: "Type",
				options: ["internal", "external"],
			},
			title: { type: "string", label: "Title" },
			date: { type: "timestamp", label: "Date" },
			assigneeUserId: { type: "string", label: "Assignee" },
			_creationTime: { type: "timestamp", label: "Created" },
			description: { type: "string", label: "Description" },
			startTime: { type: "string", label: "Start Time" },
			endTime: { type: "string", label: "End Time" },
			completedAt: { type: "timestamp", label: "Completed At" },
			repeat: {
				type: "string",
				label: "Repeat",
				options: ["none", "daily", "weekly", "monthly", "yearly"],
			},
			repeatUntil: { type: "timestamp", label: "Repeat Until" },
		},
	},
	quotes: {
		dateField: "_creationTime",
		summaryValueField: "total",
		fields: {
			status: {
				type: "string",
				label: "Status",
				options: ["draft", "sent", "approved", "declined", "expired"],
			},
			quoteNumber: { type: "string", label: "Quote Number" },
			total: { type: "currency", label: "Total" },
			subtotal: { type: "currency", label: "Subtotal" },
			taxAmount: { type: "currency", label: "Tax Amount" },
			_creationTime: { type: "timestamp", label: "Created" },
			title: { type: "string", label: "Title" },
			discountEnabled: { type: "boolean", label: "Discount Enabled" },
			// Dollars when discountType is "fixed", a percentage when
			// "percentage" — plain number, so we never mislabel a percent as $.
			discountAmount: { type: "number", label: "Discount Amount" },
			discountType: {
				type: "string",
				label: "Discount Type",
				options: ["percentage", "fixed"],
			},
			taxEnabled: { type: "boolean", label: "Tax Enabled" },
			taxRate: { type: "number", label: "Tax Rate (%)" },
			validUntil: { type: "timestamp", label: "Valid Until" },
			clientMessage: { type: "string", label: "Client Message" },
			terms: { type: "string", label: "Terms" },
			sentAt: { type: "timestamp", label: "Sent At" },
			approvedAt: { type: "timestamp", label: "Approved At" },
			declinedAt: { type: "timestamp", label: "Declined At" },
			requiresCountersignature: {
				type: "boolean",
				label: "Requires Countersignature",
			},
			signingOrder: {
				type: "string",
				label: "Signing Order",
				options: ["client_first", "org_first"],
			},
		},
	},
	invoices: {
		dateField: "issuedDate",
		summaryValueField: "total",
		fields: {
			status: {
				type: "string",
				label: "Status",
				options: ["draft", "sent", "paid", "overdue", "cancelled"],
			},
			invoiceNumber: { type: "string", label: "Invoice Number" },
			total: { type: "currency", label: "Total" },
			subtotal: { type: "currency", label: "Subtotal" },
			taxAmount: { type: "currency", label: "Tax Amount" },
			issuedDate: { type: "timestamp", label: "Issued Date" },
			dueDate: { type: "timestamp", label: "Due Date" },
			paidAt: { type: "timestamp", label: "Paid At" },
			_creationTime: { type: "timestamp", label: "Created" },
			discountAmount: { type: "currency", label: "Discount Amount" },
		},
	},
	activities: {
		dateField: "timestamp",
		fields: {
			activityType: {
				type: "string",
				label: "Activity Type",
				options: [
					"client_created",
					"client_updated",
					"project_created",
					"project_updated",
					"project_completed",
					"quote_created",
					"quote_sent",
					"quote_approved",
					"quote_declined",
					"quote_pdf_generated",
					"invoice_created",
					"invoice_sent",
					"invoice_paid",
					"payment_created",
					"payment_updated",
					"payment_paid",
					"payment_cancelled",
					"payments_configured",
					"task_created",
					"task_completed",
					"route_completed",
					"user_invited",
					"user_removed",
					"member_permissions_updated",
					"organization_updated",
					"email_sent",
					"email_delivered",
					"email_opened",
					"email_received",
				],
			},
			entityType: {
				type: "string",
				label: "Entity Type",
				options: [
					"client",
					"project",
					"quote",
					"invoice",
					"payment",
					"task",
					"route",
					"user",
					"organization",
				],
			},
			description: { type: "string", label: "Description" },
			timestamp: { type: "timestamp", label: "Timestamp" },
			_creationTime: { type: "timestamp", label: "Created" },
			entityName: { type: "string", label: "Entity Name" },
			isVisible: { type: "boolean", label: "Visible" },
		},
	},
};

/**
 * Canonical Group-by choices per entity — the builder's select, the AI
 * config generator, and saved-config hydration all share this list.
 * Values mix registry fields (status, leadSource…) with v1 magic keys
 * (month, client, conversionRate, completionRate, creationDate_*) that
 * normalizeReportConfig expands to explicit v2 configs; R8's v2-native
 * builder replaces the magic keys with the expanded forms.
 */
export const GROUP_BY_OPTIONS: Record<
	ReportEntityType,
	{ value: string; label: string }[]
> = {
	clients: [
		{ value: "status", label: "Status" },
		{ value: "leadSource", label: "Lead Source" },
		{ value: "creationDate_month", label: "Created by Month" },
		{ value: "creationDate_week", label: "Created by Week" },
		{ value: "creationDate_day", label: "Created by Day" },
	],
	projects: [
		{ value: "status", label: "Status" },
		{ value: "projectType", label: "Project Type" },
		{ value: "creationDate_month", label: "Created by Month" },
		{ value: "creationDate_week", label: "Created by Week" },
		{ value: "creationDate_day", label: "Created by Day" },
		{ value: "completedAt_month", label: "Completed by Month" },
	],
	tasks: [
		{ value: "status", label: "Status" },
		{ value: "completionRate", label: "Completion Rate" },
		{ value: "date_month", label: "By Month" },
		{ value: "date_week", label: "By Week" },
		{ value: "date_day", label: "By Day" },
		{ value: "assigneeUserId", label: "Assignee" },
	],
	quotes: [
		{ value: "status", label: "Status" },
		{ value: "conversionRate", label: "Conversion Rate" },
	],
	invoices: [
		{ value: "status", label: "Status" },
		{ value: "month", label: "Revenue by Month" },
		{ value: "client", label: "Revenue by Client" },
		{ value: "issuedDate_month", label: "Issued by Month" },
		{ value: "dueDate_month", label: "Due by Month" },
	],
	activities: [
		{ value: "activityType", label: "Activity Type" },
		{ value: "timestamp_month", label: "By Month" },
		{ value: "timestamp_week", label: "By Week" },
		{ value: "timestamp_day", label: "By Day" },
		{ value: "entityType", label: "Related record type" },
	],
};

/**
 * FK fields groupable via label resolution (§3.2 mechanism 1). Kept out of
 * `fields` on purpose: filter/column/AI enumeration must not expose raw ids —
 * these become user-pickable at R9 via RecordPicker.
 */
export interface ReportGroupableFk {
	refType: "clients" | "projects" | "users";
}

export const REPORT_GROUPABLE_FKS: Record<
	ReportEntityType,
	Record<string, ReportGroupableFk>
> = {
	clients: {},
	projects: { clientId: { refType: "clients" } },
	tasks: { assigneeUserId: { refType: "users" } },
	quotes: { clientId: { refType: "clients" } },
	invoices: { clientId: { refType: "clients" }, projectId: { refType: "projects" } },
	activities: {},
};

export function getGroupableFk(
	entityType: ReportEntityType,
	field: string
): ReportGroupableFk | undefined {
	return REPORT_GROUPABLE_FKS[entityType][field];
}

/** Legacy time keys bucket _creationTime under the "creationDate" name (metadata.groupBy keeps the alias). */
export const GROUP_BY_FIELD_ALIASES: Record<string, string> = {
	creationDate: "_creationTime",
};

/** Resolve a groupBy field name to its row property + def, honoring aliases. */
export function resolveGroupByField(
	entityType: ReportEntityType,
	field: string
): { sourceField: string; def: ReportFieldDef } | undefined {
	const sourceField = GROUP_BY_FIELD_ALIASES[field] ?? field;
	const def = getReportField(entityType, sourceField);
	return def ? { sourceField, def } : undefined;
}

export const RATIO_KEYS = ["conversionRate", "completionRate"] as const;

export type RatioKey = (typeof RATIO_KEYS)[number];

export interface RatioMetricDef {
	entityType: ReportEntityType;
	field: string;
	/** Values forming the denominator; absent = every scanned row. */
	denominatorValues?: string[];
	numeratorValues: string[];
	/**
	 * The two fixed data rows of the pinned legacy output shape. "rest" =
	 * denominator minus numerator; an explicit values list may undercount the
	 * denominator (completionRate keeps cancelled in the denominator with no
	 * row — §9 banked quirk, preserved byte-exact per §8 d11).
	 */
	rows: [
		{ label: string; from: "numerator" },
		{ label: string; from: "rest" } | { label: string; values: string[] },
	];
}

/** Named ratio metrics (§3.3): percentage = numerator / denominator, reported as `total`. */
export const RATIO_METRICS: Record<RatioKey, RatioMetricDef> = {
	conversionRate: {
		entityType: "quotes",
		field: "status",
		denominatorValues: ["sent", "approved", "declined", "expired"],
		numeratorValues: ["approved"],
		rows: [
			{ label: "Approved", from: "numerator" },
			{ label: "Not Approved", from: "rest" },
		],
	},
	completionRate: {
		entityType: "tasks",
		field: "status",
		numeratorValues: ["completed"],
		rows: [
			{ label: "Completed", from: "numerator" },
			{ label: "Pending", values: ["pending", "in-progress"] },
		],
	},
};

/**
 * The grouping legacy dispatch applied to bare calls (no groupBy). The web
 * never sends grouped no-groupBy requests (detail mode wins), so this pins the
 * assistant chat tool's behavior — made explicit there at R4c (§8 d11).
 */
export const DEFAULT_GROUP_BY: Record<ReportEntityType, string> = {
	clients: "status",
	projects: "status",
	tasks: "status",
	quotes: "status",
	invoices: "status",
	activities: "activityType",
};

/** Per-entity fallback columns for detail (raw-row) mode when nothing is checked. */
export const DEFAULT_DETAIL_COLUMNS: Record<ReportEntityType, string[]> = {
	clients: ["companyName", "status", "leadSource", "_creationTime"],
	projects: ["title", "status", "projectType"],
	tasks: ["title", "status", "date"],
	quotes: ["quoteNumber", "status", "total"],
	invoices: ["invoiceNumber", "status", "total", "issuedDate"],
	activities: ["activityType", "description", "timestamp"],
};

/**
 * True when the generic aggregation pipeline (executeReport with an explicit
 * `aggregation`) accepts this groupBy: a non-timestamp registry field, or a
 * `<timestamp-field>_day|week|month` bucket. Legacy specials (month, client,
 * conversionRate, completionRate, creationDate_*) only work through the
 * legacy dispatch, which ignores measures — so a non-count measure must
 * pair with a generic-safe groupBy (or none).
 */
export function isGenericGroupBy(
	entityType: ReportEntityType,
	groupBy: string
): boolean {
	if (getGroupableFk(entityType, groupBy)) return true;
	const direct = resolveGroupByField(entityType, groupBy);
	if (direct) return direct.def.type !== "timestamp";
	const timeMatch = groupBy.match(/^(.+)_(day|week|month)$/);
	if (!timeMatch) return false;
	return resolveGroupByField(entityType, timeMatch[1])?.def.type === "timestamp";
}

/** Look up a field def, or undefined if unknown for this entity. */
export function getReportField(
	entityType: ReportEntityType,
	field: string
): ReportFieldDef | undefined {
	return REPORT_FIELDS[entityType].fields[field];
}

/** The date field report dateRange filtering applies to for this entity. */
export function getReportDateField(entityType: ReportEntityType): string {
	return REPORT_FIELDS[entityType].dateField;
}
