import type {
	AutomationObjectType,
	ConditionOperator,
	TriggerableObjectType,
} from "./workflowTypes";

/**
 * Shared entity field registry for workflow automations.
 *
 * Single source of truth for which fields on each automation object type can
 * be read in conditions/filters and written by update_field actions. Consumed
 * by both the execution engine (automationExecutor.ts) and the web builder UI
 * (via @onetool/backend).
 *
 * Field keys and select options mirror schema.ts exactly — fieldRegistry.test.ts
 * fails intentionally when the schema drifts.
 *
 * Must stay free of ./_generated and convex/server imports so the web app can
 * import it without pulling in the backend type cycle.
 */

export type FieldType =
	| "text"
	| "number"
	| "boolean"
	| "date"
	| "datetime"
	| "select"
	| "currency"
	| "id";

export interface FieldDefinition {
	key: string;
	label: string;
	type: FieldType;
	/** Required for "select" fields — the exact enum values from schema.ts. */
	options?: { value: string; label: string }[];
	/** Whether update_field actions may write this field. */
	writable: boolean;
	/** Why a non-writable field is excluded from the action field picker. */
	writeExclusionReason?: string;
	/** Whether the field can be used in condition rules / fetch filters. */
	filterable: boolean;
	/**
	 * Whether a create_record action may set this field at insert time. Distinct
	 * from `writable`: relationship FKs (clientId, projectId) are set-on-create
	 * only, never editable afterwards, so they are `creatable` but not `writable`.
	 */
	creatable?: boolean;
	/**
	 * A creatable field the record can't be inserted without (and that has no
	 * sensible code default). The executor and publish validation both require
	 * it to be supplied — unless a `linkToScope` link satisfies the relation.
	 */
	requiredOnCreate?: boolean;
	/**
	 * For an `id` field, the entity it points at. On creatable FKs it drives
	 * org-validation before insert (the executor runs unscoped, so an arbitrary
	 * id string must be checked against the org; "user" resolves via membership).
	 * On read-only FKs it lets the builder render a record picker instead of a
	 * raw-id text box in condition/filter rules.
	 */
	refType?: "client" | "project" | "user" | "quote" | "invoice";
	/**
	 * The field holds an array of `type` values, not one. Filters match on
	 * membership (`equals` = "is one of them"), and feeding one into a
	 * single-valued destination takes the first element.
	 */
	isArray?: boolean;
}

const opt = (value: string, label: string) => ({ value, label });

export const FIELD_REGISTRY: Record<AutomationObjectType, FieldDefinition[]> = {
	client: [
		{ key: "companyName", label: "Company Name", type: "text", writable: true, filterable: true, creatable: true, requiredOnCreate: true },
		{ key: "companyDescription", label: "Company Description", type: "text", writable: true, filterable: true, creatable: true },
		{
			key: "status",
			label: "Status",
			type: "select",
			options: [
				opt("lead", "Lead"),
				opt("active", "Active"),
				opt("inactive", "Inactive"),
				opt("archived", "Archived"),
			],
			writable: true,
			filterable: true,
			creatable: true,
		},
		{
			key: "leadSource",
			label: "Lead Source",
			type: "select",
			options: [
				opt("word-of-mouth", "Word of Mouth"),
				opt("website", "Website"),
				opt("social-media", "Social Media"),
				opt("referral", "Referral"),
				opt("advertising", "Advertising"),
				opt("trade-show", "Trade Show"),
				opt("cold-outreach", "Cold Outreach"),
				opt("community-page", "Community Page"),
				opt("other", "Other"),
			],
			writable: true,
			filterable: true,
			creatable: true,
		},
		{ key: "isActive", label: "Is Active", type: "boolean", writable: true, filterable: true, creatable: true },
		{
			key: "communicationPreference",
			label: "Communication Preference",
			type: "select",
			options: [opt("email", "Email"), opt("phone", "Phone"), opt("both", "Both")],
			writable: true,
			filterable: true,
			creatable: true,
		},
		{ key: "notes", label: "Notes", type: "text", writable: true, filterable: true, creatable: true },
		{
			key: "archivedAt",
			label: "Archived At",
			type: "datetime",
			writable: false,
			writeExclusionReason: "Set by archive/unarchive code alongside status",
			filterable: true,
		},
	],

	project: [
		{ key: "title", label: "Title", type: "text", writable: true, filterable: true, creatable: true, requiredOnCreate: true },
		{ key: "description", label: "Description", type: "text", writable: true, filterable: true, creatable: true },
		{
			key: "projectNumber",
			label: "Project Number",
			type: "text",
			writable: false,
			writeExclusionReason: "System-managed numbering",
			filterable: true,
		},
		{
			key: "status",
			label: "Status",
			type: "select",
			options: [
				opt("planned", "Planned"),
				opt("in-progress", "In Progress"),
				opt("completed", "Completed"),
				opt("cancelled", "Cancelled"),
			],
			writable: true,
			filterable: true,
			creatable: true,
		},
		{
			key: "projectType",
			label: "Project Type",
			type: "select",
			options: [opt("one-off", "One-off"), opt("recurring", "Recurring")],
			writable: true,
			filterable: true,
			creatable: true,
		},
		{ key: "startDate", label: "Start Date", type: "date", writable: true, filterable: true, creatable: true },
		{ key: "endDate", label: "End Date", type: "date", writable: true, filterable: true, creatable: true },
		{
			key: "completedAt",
			label: "Completed At",
			type: "datetime",
			writable: false,
			writeExclusionReason: "Set automatically when status changes to completed",
			filterable: true,
		},
		{
			key: "clientId",
			label: "Client",
			type: "id",
			writable: false,
			writeExclusionReason: "Relationship set when the project is created",
			filterable: true,
			creatable: true,
			requiredOnCreate: true,
			refType: "client",
		},
		{
			key: "assignedUserIds",
			label: "Assigned team",
			type: "id",
			writable: false,
			writeExclusionReason: "References user records; assign from the project",
			filterable: true,
			refType: "user",
			isArray: true,
		},
	],

	quote: [
		{ key: "title", label: "Title", type: "text", writable: true, filterable: true },
		{
			key: "quoteNumber",
			label: "Quote Number",
			type: "text",
			writable: false,
			writeExclusionReason: "System-generated sequential number",
			filterable: true,
		},
		{
			key: "status",
			label: "Status",
			type: "select",
			options: [
				opt("draft", "Draft"),
				opt("sent", "Sent"),
				opt("approved", "Approved"),
				opt("declined", "Declined"),
				opt("expired", "Expired"),
			],
			writable: true,
			filterable: true,
		},
		{
			key: "subtotal",
			label: "Subtotal",
			type: "currency",
			writable: false,
			writeExclusionReason: "Computed from line items",
			filterable: true,
		},
		{
			key: "discountAmount",
			label: "Discount Amount",
			type: "currency",
			writable: false,
			writeExclusionReason: "Totals are recomputed from line items; edit via the quote editor",
			filterable: true,
		},
		{
			key: "taxRate",
			label: "Tax Rate",
			type: "number",
			writable: false,
			writeExclusionReason: "Totals are recomputed from line items; edit via the quote editor",
			filterable: true,
		},
		{
			key: "taxAmount",
			label: "Tax Amount",
			type: "currency",
			writable: false,
			writeExclusionReason: "Computed from subtotal and tax rate",
			filterable: true,
		},
		{
			key: "total",
			label: "Total",
			type: "currency",
			writable: false,
			writeExclusionReason: "Computed from line items",
			filterable: true,
		},
		{ key: "validUntil", label: "Valid Until", type: "date", writable: true, filterable: true },
		{ key: "clientMessage", label: "Client Message", type: "text", writable: true, filterable: true },
		{ key: "terms", label: "Terms", type: "text", writable: true, filterable: true },
		{
			key: "sentAt",
			label: "Sent At",
			type: "datetime",
			writable: false,
			writeExclusionReason: "Timestamp set by code when the quote is sent",
			filterable: true,
		},
		{
			key: "approvedAt",
			label: "Approved At",
			type: "datetime",
			writable: false,
			writeExclusionReason: "Timestamp set by code on client approval",
			filterable: true,
		},
		{
			key: "declinedAt",
			label: "Declined At",
			type: "datetime",
			writable: false,
			writeExclusionReason: "Timestamp set by code on client decline",
			filterable: true,
		},
		{
			key: "clientId",
			label: "Client",
			type: "id",
			refType: "client",
			writable: false,
			writeExclusionReason: "Relationship set when the quote is created",
			filterable: true,
		},
		{
			key: "projectId",
			label: "Project",
			type: "id",
			refType: "project",
			writable: false,
			writeExclusionReason: "Relationship set when the quote is created",
			filterable: true,
		},
	],

	invoice: [
		{
			key: "invoiceNumber",
			label: "Invoice Number",
			type: "text",
			writable: false,
			writeExclusionReason: "System-generated numbering",
			filterable: true,
		},
		{
			key: "status",
			label: "Status",
			type: "select",
			options: [
				opt("draft", "Draft"),
				opt("sent", "Sent"),
				opt("paid", "Paid"),
				opt("overdue", "Overdue"),
				opt("cancelled", "Cancelled"),
			],
			writable: true,
			filterable: true,
		},
		{
			key: "subtotal",
			label: "Subtotal",
			type: "currency",
			writable: false,
			writeExclusionReason: "Computed from line items",
			filterable: true,
		},
		{
			key: "discountAmount",
			label: "Discount Amount",
			type: "currency",
			writable: false,
			writeExclusionReason: "Financial field maintained by the invoice editor",
			filterable: true,
		},
		{
			key: "taxAmount",
			label: "Tax Amount",
			type: "currency",
			writable: false,
			writeExclusionReason: "Financial field maintained by the invoice editor",
			filterable: true,
		},
		{
			key: "total",
			label: "Total",
			type: "currency",
			writable: false,
			writeExclusionReason: "Computed from line items; payments must sum to it exactly",
			filterable: true,
		},
		{ key: "issuedDate", label: "Issued Date", type: "date", writable: true, filterable: true },
		{ key: "dueDate", label: "Due Date", type: "date", writable: true, filterable: true },
		{
			key: "paidAt",
			label: "Paid At",
			type: "datetime",
			writable: false,
			writeExclusionReason: "Set by code when payment is recorded",
			filterable: true,
		},
		{
			key: "stripeSessionId",
			label: "Stripe Session ID",
			type: "text",
			writable: false,
			writeExclusionReason: "Managed by the Stripe integration",
			filterable: false,
		},
		{
			key: "stripePaymentIntentId",
			label: "Stripe Payment Intent ID",
			type: "text",
			writable: false,
			writeExclusionReason: "Managed by the Stripe integration",
			filterable: false,
		},
		{
			key: "clientId",
			label: "Client",
			type: "id",
			refType: "client",
			writable: false,
			writeExclusionReason: "Relationship set when the invoice is created",
			filterable: true,
		},
		{
			key: "projectId",
			label: "Project",
			type: "id",
			refType: "project",
			writable: false,
			writeExclusionReason: "Relationship set when the invoice is created",
			filterable: true,
		},
		{
			key: "quoteId",
			label: "Quote",
			type: "id",
			refType: "quote",
			writable: false,
			writeExclusionReason: "Set when the invoice is created from a quote",
			filterable: true,
		},
	],

	/**
	 * Line items are FETCH+AGGREGATE only: every field is writable:false and none
	 * is creatable, so getWritableFields()/CREATABLE_OBJECT_TYPES exclude them
	 * with no type-level guard needed. Aggregating over amount/total — the
	 * headline use case — needs no engine change beyond the fetch switch.
	 * Field names differ per table: quotes use rate/amount, invoices unitPrice/total.
	 */
	quote_line_item: [
		{
			key: "description",
			label: "Description",
			type: "text",
			writable: false,
			writeExclusionReason: "Line items can be read and aggregated; editing them from automations isn't supported yet",
			filterable: true,
		},
		{
			key: "quantity",
			label: "Quantity",
			type: "number",
			writable: false,
			writeExclusionReason: "Line items can be read and aggregated; editing them from automations isn't supported yet",
			filterable: true,
		},
		{
			key: "unit",
			label: "Unit",
			type: "text",
			writable: false,
			writeExclusionReason: "Line items can be read and aggregated; editing them from automations isn't supported yet",
			filterable: true,
		},
		{
			key: "rate",
			label: "Rate",
			type: "currency",
			writable: false,
			writeExclusionReason: "Line items can be read and aggregated; editing them from automations isn't supported yet",
			filterable: true,
		},
		{
			key: "amount",
			label: "Amount",
			type: "currency",
			writable: false,
			writeExclusionReason: "Line items can be read and aggregated; editing them from automations isn't supported yet",
			filterable: true,
		},
		{
			key: "cost",
			label: "Cost",
			type: "currency",
			writable: false,
			writeExclusionReason: "Line items can be read and aggregated; editing them from automations isn't supported yet",
			filterable: true,
		},
		{
			key: "quoteId",
			label: "Quote",
			type: "id",
			refType: "quote",
			writable: false,
			writeExclusionReason: "Line items can be read and aggregated; editing them from automations isn't supported yet",
			filterable: true,
		},
	],

	invoice_line_item: [
		{
			key: "description",
			label: "Description",
			type: "text",
			writable: false,
			writeExclusionReason: "Line items can be read and aggregated; editing them from automations isn't supported yet",
			filterable: true,
		},
		{
			key: "quantity",
			label: "Quantity",
			type: "number",
			writable: false,
			writeExclusionReason: "Line items can be read and aggregated; editing them from automations isn't supported yet",
			filterable: true,
		},
		{
			key: "unitPrice",
			label: "Unit Price",
			type: "currency",
			writable: false,
			writeExclusionReason: "Line items can be read and aggregated; editing them from automations isn't supported yet",
			filterable: true,
		},
		{
			key: "total",
			label: "Total",
			type: "currency",
			writable: false,
			writeExclusionReason: "Line items can be read and aggregated; editing them from automations isn't supported yet",
			filterable: true,
		},
		{
			key: "invoiceId",
			label: "Invoice",
			type: "id",
			refType: "invoice",
			writable: false,
			writeExclusionReason: "Line items can be read and aggregated; editing them from automations isn't supported yet",
			filterable: true,
		},
	],

	task: [
		{ key: "title", label: "Title", type: "text", writable: true, filterable: true, creatable: true, requiredOnCreate: true },
		{ key: "description", label: "Description", type: "text", writable: true, filterable: true, creatable: true },
		{
			key: "type",
			label: "Type",
			type: "select",
			options: [opt("internal", "Internal"), opt("external", "External")],
			writable: true,
			filterable: true,
			creatable: true,
		},
		{
			key: "status",
			label: "Status",
			type: "select",
			options: [
				opt("pending", "Pending"),
				opt("in-progress", "In Progress"),
				opt("completed", "Completed"),
				opt("cancelled", "Cancelled"),
			],
			writable: true,
			filterable: true,
			creatable: true,
		},
		{ key: "date", label: "Date", type: "date", writable: true, filterable: true, creatable: true },
		{ key: "startTime", label: "Start Time", type: "text", writable: true, filterable: true },
		{ key: "endTime", label: "End Time", type: "text", writable: true, filterable: true },
		{
			key: "completedAt",
			label: "Completed At",
			type: "datetime",
			writable: false,
			writeExclusionReason: "Set automatically when status changes to completed",
			filterable: true,
		},
		{
			key: "repeat",
			label: "Repeat",
			type: "select",
			options: [
				opt("none", "None"),
				opt("daily", "Daily"),
				opt("weekly", "Weekly"),
				opt("monthly", "Monthly"),
				opt("yearly", "Yearly"),
			],
			writable: false,
			writeExclusionReason: "Recurrence is managed by the recurring-task scheduler",
			filterable: true,
		},
		{
			key: "assigneeUserId",
			label: "Assignee",
			type: "id",
			writable: false,
			writeExclusionReason: "References a user record; assign via dedicated actions",
			filterable: true,
			creatable: true,
			refType: "user",
		},
		{
			key: "projectId",
			label: "Project",
			type: "id",
			writable: false,
			writeExclusionReason: "Relationship set when the task is created",
			filterable: true,
			creatable: true,
			refType: "project",
		},
		{
			key: "clientId",
			label: "Client",
			type: "id",
			writable: false,
			writeExclusionReason: "Relationship set when the task is created",
			filterable: true,
			creatable: true,
			refType: "client",
		},
	],
};

export const OPERATORS_BY_TYPE: Record<FieldType, ConditionOperator[]> = {
	text: ["equals", "not_equals", "contains", "not_contains", "is_empty", "is_not_empty"],
	number: [
		"equals",
		"not_equals",
		"greater_than",
		"less_than",
		"gte",
		"lte",
		"is_empty",
		"is_not_empty",
	],
	currency: [
		"equals",
		"not_equals",
		"greater_than",
		"less_than",
		"gte",
		"lte",
		"is_empty",
		"is_not_empty",
	],
	boolean: ["is_true", "is_false"],
	date: ["on", "before", "after", "is_empty", "is_not_empty"],
	datetime: ["on", "before", "after", "is_empty", "is_not_empty"],
	select: ["equals", "not_equals", "is_empty", "is_not_empty"],
	id: ["equals", "not_equals", "is_empty", "is_not_empty"],
};

export function getFieldDefinition(
	objectType: AutomationObjectType,
	key: string
): FieldDefinition | undefined {
	return FIELD_REGISTRY[objectType]?.find((f) => f.key === key);
}

export function getWritableFields(
	objectType: AutomationObjectType
): FieldDefinition[] {
	return FIELD_REGISTRY[objectType].filter((f) => f.writable);
}

/**
 * Object types a create_record action can insert. Derived from the registry:
 * a type with at least one creatable field. Quote/invoice have none (their
 * required subtotal/total are computed from line items), so they're excluded
 * until the line-item creation story exists.
 */
export const CREATABLE_OBJECT_TYPES: AutomationObjectType[] = (
	Object.keys(FIELD_REGISTRY) as AutomationObjectType[]
).filter((t) => FIELD_REGISTRY[t].some((f) => f.creatable));

export function isCreatableObjectType(
	objectType: AutomationObjectType
): boolean {
	return CREATABLE_OBJECT_TYPES.includes(objectType);
}

export function getCreatableFields(
	objectType: AutomationObjectType
): FieldDefinition[] {
	return FIELD_REGISTRY[objectType].filter((f) => f.creatable);
}

export function getRequiredCreateFields(
	objectType: AutomationObjectType
): FieldDefinition[] {
	return FIELD_REGISTRY[objectType].filter(
		(f) => f.creatable && f.requiredOnCreate
	);
}

export function getFilterableFields(
	objectType: AutomationObjectType
): FieldDefinition[] {
	return FIELD_REGISTRY[objectType].filter((f) => f.filterable);
}

export function operatorsForField(
	objectType: AutomationObjectType,
	key: string
): ConditionOperator[] {
	const field = getFieldDefinitionForKey(objectType, key);
	if (!field) return [];
	return OPERATORS_BY_TYPE[field.type];
}

/**
 * Split a relation-qualified field key ("client.companyName") into its
 * relation + related-type field, validated against RELATED_OBJECTS and the
 * related type's registry. Returns undefined for flat keys: an existing flat
 * key always wins (field keys may themselves contain dots), and an unknown
 * relation segment stays a flat key rather than erroring.
 */
export function parseRelationKey(
	objectType: AutomationObjectType,
	key: string
):
	| { relation: TriggerableObjectType; fieldKey: string; field: FieldDefinition }
	| undefined {
	if (getFieldDefinition(objectType, key)) return undefined;
	const dot = key.indexOf(".");
	if (dot === -1) return undefined;
	const relation = key.slice(0, dot) as TriggerableObjectType;
	if (!RELATED_OBJECTS[objectType]?.includes(relation)) return undefined;
	const fieldKey = key.slice(dot + 1);
	const field = getFieldDefinition(relation, fieldKey);
	if (!field) return undefined;
	return { relation, fieldKey, field };
}

/** Field definition for a flat OR one-hop relation-qualified key. */
export function getFieldDefinitionForKey(
	objectType: AutomationObjectType,
	key: string
): FieldDefinition | undefined {
	return (
		getFieldDefinition(objectType, key) ?? parseRelationKey(objectType, key)?.field
	);
}

export function getStatusOptions(
	objectType: AutomationObjectType
): { value: string; label: string }[] {
	return getFieldDefinition(objectType, "status")?.options ?? [];
}

/**
 * Related records an action can target from a record in scope, per actual
 * schema FKs. Only relations that resolve to a single record are listed.
 */
export const RELATED_OBJECTS: Record<
	AutomationObjectType,
	TriggerableObjectType[]
> = {
	client: [],
	project: ["client"],
	quote: ["client", "project"],
	invoice: ["client", "project", "quote"],
	task: ["project", "client"],
	// Direct FK only — item -> parent -> client is two-hop traversal (Item 13).
	quote_line_item: ["quote"],
	invoice_line_item: ["invoice"],
};

/**
 * User-reference fields selectable as a `recordField` notification recipient,
 * per object type. `isArray` distinguishes single-user fields from arrays
 * (project team). Keys mirror schema.ts exactly. Shared with the web builder.
 */
export const USER_REF_RECIPIENT_FIELDS: Record<
	AutomationObjectType,
	Array<{ key: string; label: string; isArray: boolean }>
> = {
	project: [
		{ key: "assignedUserIds", label: "Assigned team", isArray: true },
		{ key: "createdByUserId", label: "Creator", isArray: false },
	],
	task: [
		{ key: "assigneeUserId", label: "Assignee", isArray: false },
		{ key: "createdByUserId", label: "Creator", isArray: false },
	],
	quote: [
		{ key: "countersignerId", label: "Countersigner", isArray: false },
		{ key: "createdByUserId", label: "Creator", isArray: false },
	],
	client: [{ key: "createdByUserId", label: "Creator", isArray: false }],
	invoice: [{ key: "createdByUserId", label: "Creator", isArray: false }],
	quote_line_item: [],
	invoice_line_item: [],
};

/** FK field on the source record used to resolve each relation. */
export const RELATION_FIELD: Record<
	AutomationObjectType,
	Partial<Record<AutomationObjectType, string>>
> = {
	client: {},
	project: { client: "clientId" },
	quote: { client: "clientId", project: "projectId" },
	invoice: { client: "clientId", project: "projectId", quote: "quoteId" },
	task: { project: "projectId", client: "clientId" },
	quote_line_item: { quote: "quoteId" },
	invoice_line_item: { invoice: "invoiceId" },
};
