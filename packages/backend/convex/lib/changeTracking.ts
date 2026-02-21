/**
 * Field-level change tracking for activity logging.
 *
 * Computes diffs between old and new entity records and produces
 * human-readable descriptions of what changed.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FieldChange {
	field: string; // Human-readable label (e.g. "Company Name")
	oldValue: unknown;
	newValue: unknown;
}

// ---------------------------------------------------------------------------
// Field label maps — only tracked fields appear here.
// Keys absent from the map are silently excluded from diffs.
// ---------------------------------------------------------------------------

const CLIENT_FIELD_LABELS: Record<string, string> = {
	companyName: "Company Name",
	companyDescription: "Description",
	status: "Status",
	leadSource: "Lead Source",
	isActive: "Active",
	communicationPreference: "Communication Preference",
	tags: "Tags",
	notes: "Notes",
};

const PROJECT_FIELD_LABELS: Record<string, string> = {
	title: "Title",
	description: "Description",
	status: "Status",
	projectType: "Project Type",
	startDate: "Start Date",
	endDate: "End Date",
	assignedUserIds: "Assigned Users",
	clientId: "Client",
	projectNumber: "Project Number",
};

const QUOTE_FIELD_LABELS: Record<string, string> = {
	title: "Title",
	status: "Status",
	subtotal: "Subtotal",
	total: "Total",
	discountAmount: "Discount",
	taxRate: "Tax Rate",
	taxAmount: "Tax Amount",
	validUntil: "Valid Until",
	clientMessage: "Client Message",
	terms: "Terms",
};

const INVOICE_FIELD_LABELS: Record<string, string> = {
	status: "Status",
	subtotal: "Subtotal",
	total: "Total",
	discountAmount: "Discount",
	taxAmount: "Tax Amount",
	dueDate: "Due Date",
	paymentMethod: "Payment Method",
};

const CLIENT_CONTACT_FIELD_LABELS: Record<string, string> = {
	firstName: "Contact First Name",
	lastName: "Contact Last Name",
	email: "Contact Email",
	phone: "Contact Phone",
	jobTitle: "Contact Job Title",
	isPrimary: "Primary Contact",
};

const CLIENT_PROPERTY_FIELD_LABELS: Record<string, string> = {
	propertyName: "Property Name",
	propertyType: "Property Type",
	streetAddress: "Street Address",
	city: "City",
	state: "State",
	zipCode: "Zip Code",
	isPrimary: "Primary Property",
};

const LABEL_MAPS: Record<string, Record<string, string>> = {
	client: CLIENT_FIELD_LABELS,
	project: PROJECT_FIELD_LABELS,
	quote: QUOTE_FIELD_LABELS,
	invoice: INVOICE_FIELD_LABELS,
	clientContact: CLIENT_CONTACT_FIELD_LABELS,
	clientProperty: CLIENT_PROPERTY_FIELD_LABELS,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deep-equal for primitives, arrays of primitives, and simple objects. */
function isEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (a == null || b == null) return a == b;

	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return false;
		return a.every((val, i) => isEqual(val, b[i]));
	}

	return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compare an existing record against an updates object and return the list of
 * fields that actually changed, with human-readable labels.
 *
 * Only fields present in the label map for `entityType` are considered.
 * Internal/system fields (e.g. _id, orgId, stripeSessionId) are ignored.
 */
export function computeFieldChanges(
	entityType: string,
	existingRecord: Record<string, unknown>,
	updates: Record<string, unknown>
): FieldChange[] {
	const labelMap = LABEL_MAPS[entityType];
	if (!labelMap) return [];

	const changes: FieldChange[] = [];

	for (const key of Object.keys(updates)) {
		const label = labelMap[key];
		if (!label) continue; // skip unmapped (internal) fields

		const oldValue = existingRecord[key];
		const newValue = updates[key];

		if (!isEqual(oldValue, newValue)) {
			changes.push({ field: label, oldValue, newValue });
		}
	}

	return changes;
}

/**
 * Build a concise description string from a set of field changes.
 *
 * Examples:
 *   0 changes → "Updated {entityName}"
 *   1 change  → "Updated status on {entityName}"
 *   2+ changes → "Updated 3 fields on {entityName}"
 */
export function buildChangeDescription(
	entityName: string,
	changes: FieldChange[]
): string {
	if (changes.length === 0) {
		return `Updated ${entityName}`;
	}
	if (changes.length === 1) {
		return `Updated ${changes[0].field.toLowerCase()} on ${entityName}`;
	}
	return `Updated ${changes.length} fields on ${entityName}`;
}
