// Pure wizard helpers: per-step required-field validators, the webhook-race
// gate, and retry/timeout predicates. Mirrors the web /organization/complete
// createdOrgRef gate. No React/Convex imports — Vitest-testable.

export interface StepValidation {
	valid: boolean;
	fields: string[];
}

// Matches completeMetadata companySize v.union in convex/organizations.ts.
const COMPANY_SIZES = new Set(["1-10", "10-100", "100+"]);

function isEmpty(value: string | undefined): boolean {
	return !value || value.trim() === "";
}

export function validateStep1(v: { orgName: string }): StepValidation {
	const fields = isEmpty(v.orgName) ? ["orgName"] : [];
	return { valid: fields.length === 0, fields };
}

export function validateStep2(v: {
	streetAddress: string;
	city: string;
	state: string;
	zipCode: string;
	email: string;
	phone: string;
	website?: string;
}): StepValidation {
	// website is optional and intentionally excluded.
	const required: Array<keyof typeof v> = [
		"streetAddress",
		"city",
		"state",
		"zipCode",
		"email",
		"phone",
	];
	const fields = required.filter((k) => isEmpty(v[k] as string | undefined));
	return { valid: fields.length === 0, fields };
}

export function validateStep3(v: { companySize?: string }): StepValidation {
	const valid = v.companySize !== undefined && COMPANY_SIZES.has(v.companySize);
	return { valid, fields: valid ? [] : ["companySize"] };
}

// Webhook-race gate: only allow the metadata write once the Convex org row
// matches the SPECIFIC org created this session (not merely any non-null row,
// which could be a stale/other org). When createdOrgId is null (resume an
// existing membership — nothing created this session), fall back to non-null.
export function canWriteMetadata(
	convexOrg: unknown,
	createdOrgId: string | null
): boolean {
	if (createdOrgId === null) return convexOrg != null;
	if (convexOrg == null) return false;
	const id = (convexOrg as { clerkOrganizationId?: unknown })
		.clerkOrganizationId;
	return id === createdOrgId;
}

// A retry must call createOrganization only when no org exists yet; otherwise
// it re-waits for the Convex row (mirrors web createdOrgRef reuse).
export function shouldRetryOrgCreate(v: { createdOrgId: string | null }): boolean {
	return v.createdOrgId == null;
}

// Drives the "Setup is taking longer than expected" recovery copy.
export function isSetupTimedOut(elapsedMs: number, timeoutMs = 30000): boolean {
	return elapsedMs >= timeoutMs;
}
