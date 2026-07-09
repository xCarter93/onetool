/**
 * Report field registry — single source of truth for what report queries
 * can filter/group/aggregate on, per entity. Field names are verified
 * against schema.ts; do not invent fields here.
 *
 * Deliberately excluded from every entity:
 * - v.id(...) foreign keys (clientId, projectId, userId, ...) — raw ids are
 *   useless in report cells; label-resolving joins are future work.
 * - Nested objects/arrays (tags, pdfSettings, metadata, assignedUserIds).
 * - orgId / audit ids.
 * - Anything secret- or token-like (portalAccessId, publicToken, stripe*):
 *   must never be exposable via reports.
 */

export type ReportEntityType =
	| "clients"
	| "projects"
	| "tasks"
	| "quotes"
	| "invoices"
	| "activities";

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
}

export interface ReportEntityFields {
	/** The field dateRange filtering applies to for this entity. */
	dateField: string;
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
					"user_invited",
					"user_removed",
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
