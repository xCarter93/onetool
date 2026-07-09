/**
 * Report field registry — single source of truth for what report queries
 * can filter/group/aggregate on, per entity. Field names are verified
 * against schema.ts; do not invent fields here.
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
			status: { type: "string" },
			leadSource: { type: "string" },
			companyName: { type: "string" },
			isActive: { type: "boolean" },
			_creationTime: { type: "timestamp" },
		},
	},
	projects: {
		dateField: "_creationTime",
		fields: {
			status: { type: "string" },
			projectType: { type: "string" },
			title: { type: "string" },
			_creationTime: { type: "timestamp" },
		},
	},
	tasks: {
		dateField: "date",
		fields: {
			status: { type: "string" },
			type: { type: "string" },
			title: { type: "string" },
			date: { type: "timestamp" },
			assigneeUserId: { type: "string" },
			_creationTime: { type: "timestamp" },
		},
	},
	quotes: {
		dateField: "_creationTime",
		fields: {
			status: { type: "string" },
			total: { type: "currency" },
			subtotal: { type: "currency" },
			taxAmount: { type: "currency" },
			_creationTime: { type: "timestamp" },
		},
	},
	invoices: {
		dateField: "issuedDate",
		fields: {
			status: { type: "string" },
			total: { type: "currency" },
			subtotal: { type: "currency" },
			taxAmount: { type: "currency" },
			issuedDate: { type: "timestamp" },
			dueDate: { type: "timestamp" },
			paidAt: { type: "timestamp" },
			_creationTime: { type: "timestamp" },
		},
	},
	activities: {
		dateField: "timestamp",
		fields: {
			activityType: { type: "string" },
			entityType: { type: "string" },
			timestamp: { type: "timestamp" },
			_creationTime: { type: "timestamp" },
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
