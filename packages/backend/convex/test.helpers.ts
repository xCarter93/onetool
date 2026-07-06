import { Id, Doc } from "./_generated/dataModel";
import { MutationCtx } from "./_generated/server";

/**
 * Test helper utilities for Convex backend tests
 * These functions reduce boilerplate when setting up test data
 */

export interface TestOrgSetup {
	userId: Id<"users">;
	orgId: Id<"organizations">;
	clerkUserId: string;
	clerkOrgId: string;
}

/**
 * Creates a standard test organization with an admin user
 * Returns the user ID, org ID, and Clerk IDs for use in withIdentity()
 */
export async function createTestOrg(
	ctx: { db: MutationCtx["db"] },
	overrides: {
		userName?: string;
		userEmail?: string;
		orgName?: string;
		clerkUserId?: string;
		clerkOrgId?: string;
	} = {}
): Promise<TestOrgSetup> {
	const clerkUserId = overrides.clerkUserId ?? `user_${Date.now()}`;
	const clerkOrgId = overrides.clerkOrgId ?? `org_${Date.now()}`;

	const userId = await ctx.db.insert("users", {
		name: overrides.userName ?? "Test User",
		email: overrides.userEmail ?? "test@example.com",
		image: "https://example.com/image.jpg",
		externalId: clerkUserId,
	});

	const orgId = await ctx.db.insert("organizations", {
		clerkOrganizationId: clerkOrgId,
		name: overrides.orgName ?? "Test Org",
		ownerUserId: userId,
	});

	await ctx.db.insert("organizationMemberships", {
		orgId,
		userId,
		role: "admin",
	});

	return { userId, orgId, clerkUserId, clerkOrgId };
}

/**
 * Adds a member user to an existing organization
 */
export async function addMemberToOrg(
	ctx: { db: MutationCtx["db"] },
	orgId: Id<"organizations">,
	overrides: {
		userName?: string;
		userEmail?: string;
		clerkUserId?: string;
		role?: "admin" | "member";
	} = {}
): Promise<{ userId: Id<"users">; clerkUserId: string }> {
	const clerkUserId = overrides.clerkUserId ?? `member_${Date.now()}`;

	const userId = await ctx.db.insert("users", {
		name: overrides.userName ?? "Member User",
		email: overrides.userEmail ?? `member_${Date.now()}@example.com`,
		image: "https://example.com/member.jpg",
		externalId: clerkUserId,
	});

	await ctx.db.insert("organizationMemberships", {
		orgId,
		userId,
		role: overrides.role ?? "member",
	});

	return { userId, clerkUserId };
}

/**
 * Creates a test client in an organization
 */
export async function createTestClient(
	ctx: { db: MutationCtx["db"] },
	orgId: Id<"organizations">,
	overrides: {
		companyName?: string;
		status?: "lead" | "active" | "inactive" | "archived";
		leadSource?:
			| "word-of-mouth"
			| "website"
			| "social-media"
			| "referral"
			| "advertising"
			| "trade-show"
			| "cold-outreach"
			| "other";
		notes?: string;
	} = {}
): Promise<Id<"clients">> {
	return await ctx.db.insert("clients", {
		orgId,
		companyName: overrides.companyName ?? "Test Client",
		status: overrides.status ?? "active",
		leadSource: overrides.leadSource,
		notes: overrides.notes,
	});
}

/**
 * Creates a test project for a client
 */
export async function createTestProject(
	ctx: { db: MutationCtx["db"] },
	orgId: Id<"organizations">,
	clientId: Id<"clients">,
	overrides: {
		title?: string;
		description?: string;
		status?: "planned" | "in-progress" | "completed" | "cancelled";
		projectType?: "one-off" | "recurring";
		startDate?: number;
		endDate?: number;
	} = {}
): Promise<Id<"projects">> {
	return await ctx.db.insert("projects", {
		orgId,
		clientId,
		title: overrides.title ?? "Test Project",
		description: overrides.description,
		status: overrides.status ?? "planned",
		projectType: overrides.projectType ?? "one-off",
		startDate: overrides.startDate,
		endDate: overrides.endDate,
	});
}

/**
 * Creates a test task
 */
export async function createTestTask(
	ctx: { db: MutationCtx["db"] },
	orgId: Id<"organizations">,
	overrides: {
		title?: string;
		description?: string;
		date?: number;
		startTime?: string;
		endTime?: string;
		status?: "pending" | "in-progress" | "completed" | "cancelled";
		type?: "internal" | "external";
		clientId?: Id<"clients">;
		projectId?: Id<"projects">;
		assigneeUserId?: Id<"users">;
	} = {}
): Promise<Id<"tasks">> {
	return await ctx.db.insert("tasks", {
		orgId,
		title: overrides.title ?? "Test Task",
		description: overrides.description,
		date: overrides.date ?? Date.now(),
		startTime: overrides.startTime,
		endTime: overrides.endTime,
		status: overrides.status ?? "pending",
		type: overrides.type ?? "internal",
		clientId: overrides.clientId,
		projectId: overrides.projectId,
		assigneeUserId: overrides.assigneeUserId,
	});
}

/**
 * Creates a test quote
 */
export async function createTestQuote(
	ctx: { db: MutationCtx["db"] },
	orgId: Id<"organizations">,
	clientId: Id<"clients">,
	overrides: {
		title?: string;
		quoteNumber?: string;
		status?: "draft" | "sent" | "approved" | "declined" | "expired";
		subtotal?: number;
		taxAmount?: number;
		total?: number;
		projectId?: Id<"projects">;
	} = {}
): Promise<Id<"quotes">> {
	return await ctx.db.insert("quotes", {
		orgId,
		clientId,
		projectId: overrides.projectId,
		title: overrides.title ?? "Test Quote",
		quoteNumber: overrides.quoteNumber ?? `Q-${Date.now()}`,
		status: overrides.status ?? "draft",
		subtotal: overrides.subtotal ?? 1000,
		taxAmount: overrides.taxAmount ?? 100,
		total: overrides.total ?? 1100,
	});
}

/**
 * Creates a test invoice
 */
export async function createTestInvoice(
	ctx: { db: MutationCtx["db"] },
	orgId: Id<"organizations">,
	clientId: Id<"clients">,
	overrides: {
		invoiceNumber?: string;
		status?: "draft" | "sent" | "paid" | "overdue" | "cancelled";
		subtotal?: number;
		taxAmount?: number;
		total?: number;
		projectId?: Id<"projects">;
		quoteId?: Id<"quotes">;
		issuedDate?: number;
		dueDate?: number;
		paidAt?: number;
		publicToken?: string;
	} = {}
): Promise<Id<"invoices">> {
	return await ctx.db.insert("invoices", {
		orgId,
		clientId,
		projectId: overrides.projectId,
		quoteId: overrides.quoteId,
		invoiceNumber: overrides.invoiceNumber ?? `INV-${Date.now()}`,
		status: overrides.status ?? "draft",
		subtotal: overrides.subtotal ?? 1000,
		taxAmount: overrides.taxAmount ?? 100,
		total: overrides.total ?? 1100,
		issuedDate: overrides.issuedDate ?? Date.now(),
		dueDate: overrides.dueDate ?? Date.now() + 30 * 24 * 60 * 60 * 1000,
		paidAt: overrides.paidAt,
		publicToken: overrides.publicToken ?? `token_${Date.now()}`,
	});
}

/**
 * Creates an identity object for use with t.withIdentity()
 */
export function createTestIdentity(clerkUserId: string, clerkOrgId: string) {
	return {
		subject: clerkUserId,
		activeOrgId: clerkOrgId,
	};
}

/**
 * Identity carrying the premium metadata flag — passes hasPremiumAccess
 * (lib/permissions.ts), e.g. the AI assistant plan gate.
 */
export function createPremiumTestIdentity(
	clerkUserId: string,
	clerkOrgId: string
) {
	return {
		...createTestIdentity(clerkUserId, clerkOrgId),
		publicMetadata: { has_premium_feature_access: true },
	};
}

/**
 * Creates a client contact
 */
export async function createTestClientContact(
	ctx: { db: MutationCtx["db"] },
	orgId: Id<"organizations">,
	clientId: Id<"clients">,
	overrides: {
		firstName?: string;
		lastName?: string;
		email?: string;
		phone?: string;
		jobTitle?: string;
		isPrimary?: boolean;
	} = {}
): Promise<Id<"clientContacts">> {
	return await ctx.db.insert("clientContacts", {
		orgId,
		clientId,
		firstName: overrides.firstName ?? "John",
		lastName: overrides.lastName ?? "Doe",
		email: overrides.email ?? "john.doe@example.com",
		phone: overrides.phone,
		jobTitle: overrides.jobTitle,
		isPrimary: overrides.isPrimary ?? false,
	});
}

/**
 * Creates a client property
 */
export async function createTestClientProperty(
	ctx: { db: MutationCtx["db"] },
	orgId: Id<"organizations">,
	clientId: Id<"clients">,
	overrides: {
		propertyName?: string;
		propertyType?:
			| "residential"
			| "commercial"
			| "industrial"
			| "retail"
			| "office"
			| "mixed-use";
		streetAddress?: string;
		city?: string;
		state?: string;
		zipCode?: string;
		country?: string;
		isPrimary?: boolean;
		// Geocoding fields (from Mapbox Address Autofill)
		latitude?: number;
		longitude?: number;
		formattedAddress?: string;
	} = {}
): Promise<Id<"clientProperties">> {
	return await ctx.db.insert("clientProperties", {
		orgId,
		clientId,
		propertyName: overrides.propertyName,
		propertyType: overrides.propertyType,
		streetAddress: overrides.streetAddress ?? "123 Main St",
		city: overrides.city ?? "Test City",
		state: overrides.state ?? "TS",
		zipCode: overrides.zipCode ?? "12345",
		country: overrides.country,
		isPrimary: overrides.isPrimary ?? false,
		// Geocoding fields
		latitude: overrides.latitude,
		longitude: overrides.longitude,
		formattedAddress: overrides.formattedAddress,
	});
}

/**
 * Creates a test organization with structured address fields
 */
export async function createTestOrgWithAddress(
	ctx: { db: MutationCtx["db"] },
	overrides: {
		userName?: string;
		userEmail?: string;
		orgName?: string;
		clerkUserId?: string;
		clerkOrgId?: string;
		// Structured address fields
		addressStreet?: string;
		addressCity?: string;
		addressState?: string;
		addressZip?: string;
		addressCountry?: string;
		// Geocoding fields
		latitude?: number;
		longitude?: number;
	} = {}
): Promise<TestOrgSetup> {
	const clerkUserId = overrides.clerkUserId ?? `user_${Date.now()}`;
	const clerkOrgId = overrides.clerkOrgId ?? `org_${Date.now()}`;

	const userId = await ctx.db.insert("users", {
		name: overrides.userName ?? "Test User",
		email: overrides.userEmail ?? "test@example.com",
		image: "https://example.com/image.jpg",
		externalId: clerkUserId,
	});

	const orgId = await ctx.db.insert("organizations", {
		clerkOrganizationId: clerkOrgId,
		name: overrides.orgName ?? "Test Org",
		ownerUserId: userId,
		// Structured address fields
		addressStreet: overrides.addressStreet,
		addressCity: overrides.addressCity,
		addressState: overrides.addressState,
		addressZip: overrides.addressZip,
		addressCountry: overrides.addressCountry,
		// Geocoding fields
		latitude: overrides.latitude,
		longitude: overrides.longitude,
	});

	await ctx.db.insert("organizationMemberships", {
		orgId,
		userId,
		role: "admin",
	});

	return { userId, orgId, clerkUserId, clerkOrgId };
}
