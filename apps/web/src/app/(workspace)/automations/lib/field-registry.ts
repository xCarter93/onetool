export type FieldType = "string" | "number" | "boolean" | "date" | "enum";

export type FieldDefinition = {
	key: string;
	label: string;
	type: FieldType;
	editable: boolean;
	editExclusionReason?: string;
	enumValues?: { value: string; label: string }[];
};

export type EntityFieldRegistry = Record<string, FieldDefinition[]>;

export const OPERATORS_BY_TYPE: Record<FieldType, string[]> = {
	string: ["equals", "not_equals", "contains", "exists"],
	number: ["equals", "not_equals", "greater_than", "less_than", "exists"],
	boolean: ["is_true", "is_false"],
	date: ["before", "after", "equals", "exists"],
	enum: ["equals", "not_equals", "exists"],
};

export const FIELD_REGISTRY: EntityFieldRegistry = {
	client: [
		{
			key: "status",
			label: "Status",
			type: "enum",
			editable: true,
			enumValues: [
				{ value: "lead", label: "Lead" },
				{ value: "prospect", label: "Prospect" },
				{ value: "active", label: "Active" },
				{ value: "inactive", label: "Inactive" },
				{ value: "archived", label: "Archived" },
			],
		},
		{
			key: "priorityLevel",
			label: "Priority Level",
			type: "enum",
			editable: true,
			enumValues: [
				{ value: "low", label: "Low" },
				{ value: "medium", label: "Medium" },
				{ value: "high", label: "High" },
				{ value: "critical", label: "Critical" },
			],
		},
		{ key: "clientType", label: "Client Type", type: "string", editable: true },
		{ key: "clientSize", label: "Client Size", type: "string", editable: true },
		{ key: "category", label: "Category", type: "string", editable: true },
		{ key: "industry", label: "Industry", type: "string", editable: true },
		{
			key: "name",
			label: "Name",
			type: "string",
			editable: false,
			editExclusionReason: "Identity field",
		},
		{
			key: "email",
			label: "Email",
			type: "string",
			editable: false,
			editExclusionReason: "Identity field",
		},
	],
	project: [
		{
			key: "status",
			label: "Status",
			type: "enum",
			editable: true,
			enumValues: [
				{ value: "planned", label: "Planned" },
				{ value: "in-progress", label: "In Progress" },
				{ value: "completed", label: "Completed" },
				{ value: "cancelled", label: "Cancelled" },
			],
		},
		{ key: "projectType", label: "Project Type", type: "string", editable: true },
		{ key: "title", label: "Title", type: "string", editable: true },
		{ key: "startDate", label: "Start Date", type: "date", editable: true },
		{ key: "endDate", label: "End Date", type: "date", editable: true },
	],
	quote: [
		{
			key: "status",
			label: "Status",
			type: "enum",
			editable: true,
			enumValues: [
				{ value: "draft", label: "Draft" },
				{ value: "sent", label: "Sent" },
				{ value: "approved", label: "Approved" },
				{ value: "declined", label: "Declined" },
				{ value: "expired", label: "Expired" },
			],
		},
		{ key: "title", label: "Title", type: "string", editable: true },
		{
			key: "subtotal",
			label: "Subtotal",
			type: "number",
			editable: false,
			editExclusionReason: "Financial field",
		},
		{
			key: "total",
			label: "Total",
			type: "number",
			editable: false,
			editExclusionReason: "Financial field",
		},
		{
			key: "taxRate",
			label: "Tax Rate",
			type: "number",
			editable: false,
			editExclusionReason: "Financial field",
		},
		{ key: "expiresAt", label: "Expires At", type: "date", editable: true },
	],
	invoice: [
		{
			key: "status",
			label: "Status",
			type: "enum",
			editable: true,
			enumValues: [
				{ value: "draft", label: "Draft" },
				{ value: "sent", label: "Sent" },
				{ value: "paid", label: "Paid" },
				{ value: "overdue", label: "Overdue" },
				{ value: "cancelled", label: "Cancelled" },
			],
		},
		{
			key: "invoiceNumber",
			label: "Invoice Number",
			type: "string",
			editable: false,
			editExclusionReason: "System-generated",
		},
		{
			key: "total",
			label: "Total",
			type: "number",
			editable: false,
			editExclusionReason: "Financial field",
		},
		{
			key: "subtotal",
			label: "Subtotal",
			type: "number",
			editable: false,
			editExclusionReason: "Financial field",
		},
		{ key: "dueDate", label: "Due Date", type: "date", editable: true },
	],
	task: [
		{
			key: "status",
			label: "Status",
			type: "enum",
			editable: true,
			enumValues: [
				{ value: "pending", label: "Pending" },
				{ value: "in-progress", label: "In Progress" },
				{ value: "completed", label: "Completed" },
				{ value: "cancelled", label: "Cancelled" },
			],
		},
		{
			key: "priority",
			label: "Priority",
			type: "enum",
			editable: true,
			enumValues: [
				{ value: "low", label: "Low" },
				{ value: "medium", label: "Medium" },
				{ value: "high", label: "High" },
			],
		},
		{ key: "type", label: "Type", type: "string", editable: true },
		{ key: "title", label: "Title", type: "string", editable: true },
		{ key: "scheduledDate", label: "Scheduled Date", type: "date", editable: true },
	],
};

/** Get editable fields only (for action node field picker) */
export function getEditableFields(entityType: string): FieldDefinition[] {
	return (FIELD_REGISTRY[entityType] || []).filter((f) => f.editable);
}

/** Get operators valid for a field */
export function getOperatorsForField(entityType: string, fieldKey: string): string[] {
	const field = (FIELD_REGISTRY[entityType] || []).find((f) => f.key === fieldKey);
	if (!field) return [];
	return OPERATORS_BY_TYPE[field.type] || [];
}
