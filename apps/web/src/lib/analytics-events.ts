/**
 * Type-safe event name definitions for PostHog analytics.
 * Follow snake_case naming convention with object_action pattern.
 */
export const AnalyticsEvents = {
	// Client events
	CLIENT_CREATED: "client_created",
	CLIENT_UPDATED: "client_updated",
	CLIENT_ARCHIVED: "client_archived",

	// Project events
	PROJECT_CREATED: "project_created",
	PROJECT_COMPLETED: "project_completed",
	PROJECT_STATUS_CHANGED: "project_status_changed",

	// Quote events
	QUOTE_CREATED: "quote_created",
	QUOTE_SENT: "quote_sent",
	QUOTE_VIEWED: "quote_viewed",
	QUOTE_SIGNED: "quote_signed",
	QUOTE_DECLINED: "quote_declined",
	QUOTE_EXPIRED: "quote_expired",

	// Invoice events
	INVOICE_CREATED: "invoice_created",
	INVOICE_SENT: "invoice_sent",
	INVOICE_VIEWED: "invoice_viewed",
	INVOICE_PAID: "invoice_paid",
	INVOICE_PARTIAL_PAID: "invoice_partial_paid",
	INVOICE_OVERDUE: "invoice_overdue",

	// Task events
	TASK_CREATED: "task_created",
	TASK_COMPLETED: "task_completed",
	TASK_RESCHEDULED: "task_rescheduled",

	// Email events
	EMAIL_SENT: "email_sent",
	EMAIL_OPENED: "email_opened",
	EMAIL_CLICKED: "email_clicked",

	// Feature usage
	CSV_IMPORT_STARTED: "csv_import_started",
	CSV_IMPORT_COMPLETED: "csv_import_completed",
	CSV_IMPORT_STEP_TRANSITION: "csv_import_step_transition",
	CSV_IMPORT_ERROR: "csv_import_error",
	REPORT_GENERATED: "report_generated",
	STRIPE_CONNECTED: "stripe_connected",

	// Onboarding
	ONBOARDING_STARTED: "onboarding_started",
	ONBOARDING_COMPLETED: "onboarding_completed",
	TOUR_COMPLETED: "tour_completed",
} as const;

export type AnalyticsEventName =
	(typeof AnalyticsEvents)[keyof typeof AnalyticsEvents];

/**
 * Event property interfaces for type-safe event tracking.
 * Use these when calling trackEvent() to ensure consistent properties.
 */

export interface ClientEventProperties {
	client_id: string;
	client_status: string;
	lead_source?: string;
	has_contacts: boolean;
	has_properties: boolean;
}

export interface QuoteEventProperties {
	quote_id: string;
	quote_number: string;
	client_id: string;
	project_id?: string;
	total_amount_cents: number;
	line_item_count: number;
	has_discount: boolean;
	has_tax: boolean;
}

export interface InvoiceEventProperties {
	invoice_id: string;
	invoice_number: string;
	client_id: string;
	project_id?: string;
	total_amount_cents: number;
	payment_count: number;
	payment_method?: string;
}

export interface TaskEventProperties {
	task_id: string;
	client_id?: string;
	project_id?: string;
	task_type?: string;
	is_recurring: boolean;
}

export interface ProjectEventProperties {
	project_id: string;
	client_id: string;
	project_status: string;
	previous_status?: string;
}
