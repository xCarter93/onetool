import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
	automationStatusValidator,
	executedNodeValidator,
	loopSummaryValidator,
	formulaResourceValidator,
	nodeConfigValidator,
	nodeTypeValidator,
	objectTypeValidator,
	triggerValidator,
	triggerableObjectTypeValidator,
} from "./lib/workflowTypes";
import {
	communityColorModeValidator,
	communityFaqItemsValidator,
	communitySectionConfigValidator,
	communityTeamMembersValidator,
} from "./lib/communityTypes";

// v2 workflow node shape: each node carries the unified `config` union
// (see lib/workflowTypes.ts). Legacy v1 fields were dropped post-migration.
const workflowNodeValidator = v.object({
	id: v.string(),
	type: nodeTypeValidator,
	// v2 unified config
	config: nodeConfigValidator,
	// Flow control
	nextNodeId: v.optional(v.string()),
	elseNodeId: v.optional(v.string()),
	// Loop body entry point (v2)
	bodyStartNodeId: v.optional(v.string()),
	// Condition continuation: where flow resumes after either branch chain
	// completes ("after the branches converge"). Conditions only.
	mergeNodeId: v.optional(v.string()),
	// UI position (persisted for manual drag positioning)
	position: v.optional(
		v.object({
			x: v.number(),
			y: v.number(),
		})
	),
});

export default defineSchema({
	// Users - synchronized from Clerk user records
	users: defineTable({
		name: v.string(),
		email: v.string(),
		image: v.string(),
		lastSignedInDate: v.optional(v.number()),
		externalId: v.string(), // Clerk user ID

		// Onboarding
		hasSeenTour: v.optional(v.boolean()), // Track if user has completed the product tour

		// Mirror of Clerk public_metadata.has_premium_feature_access, synced by the
		// user.created/user.updated webhook. Exists so identity-less contexts (cron)
		// can honor the override, which otherwise only reaches us via the JWT.
		hasPremiumFeatureAccess: v.optional(v.boolean()),

		// Subscription (user-level status only, billing handled at org level)
		subscriptionStatus: v.optional(
			v.union(
				v.literal("active"),
				v.literal("past_due"),
				v.literal("canceled"),
				v.literal("incomplete"),
				v.literal("incomplete_expired"),
				v.literal("trialing"),
				v.literal("unpaid")
			)
		),
	})
		.index("by_external_id", ["externalId"])
		.index("by_email", ["email"]),

	// Organizations - hybrid Clerk + custom metadata
	organizations: defineTable({
		// Clerk integration
		clerkOrganizationId: v.string(), // Primary identifier from Clerk
		name: v.string(), // Synced from Clerk
		ownerUserId: v.id("users"), // Mapped from Clerk organization admin

		// Custom business metadata (not in Clerk)
		email: v.optional(v.string()),
		website: v.optional(v.string()),
		logoUrl: v.optional(v.string()),
		logoInvertInDarkMode: v.optional(v.boolean()),
		address: v.optional(v.string()), // DEPRECATED: Use structured address fields below
		phone: v.optional(v.string()),
		companySize: v.optional(
			v.union(v.literal("1-10"), v.literal("10-100"), v.literal("100+"))
		),

		// Structured address fields (replaces legacy `address` string)
		addressStreet: v.optional(v.string()),
		addressCity: v.optional(v.string()),
		addressState: v.optional(v.string()),
		addressZip: v.optional(v.string()),
		addressCountry: v.optional(v.string()),

		// Geocoding (from Mapbox Address Autofill)
		latitude: v.optional(v.number()),
		longitude: v.optional(v.number()),

		// Email receiving configuration
		receivingAddress: v.optional(v.string()), // Unique receiving email address (e.g., "org-abc123@inbound.onetool.biz")

		// Clerk Billing & Subscription
		clerkSubscriptionId: v.optional(v.string()), // Clerk subscription ID
		clerkPlanId: v.optional(v.string()), // Clerk plan identifier
		clerkPlanSlug: v.optional(v.string()), // Active paid plan slug from webhook items[] (plan gate source of truth)

		// Mirror of Clerk public_metadata.has_premium_feature_access, synced by the
		// organization.created/organization.updated webhook. Grants premium to every
		// member; see the user-level twin for single-user overrides.
		hasPremiumFeatureAccess: v.optional(v.boolean()),

		subscriptionStatus: v.optional(
			v.union(
				v.literal("active"),
				v.literal("past_due"),
				v.literal("canceled"),
				v.literal("incomplete"),
				v.literal("incomplete_expired"),
				v.literal("trialing"),
				v.literal("unpaid")
			)
		),
		billingCycleStart: v.optional(v.number()), // Timestamp of current billing cycle start

		// Usage tracking for limits
		usageTracking: v.optional(
			v.object({
				clientsCount: v.number(),
				esignaturesSentThisMonth: v.number(),
				lastEsignatureReset: v.number(), // Timestamp of last monthly reset
			})
		),

		// Stripe Connect
		stripeConnectAccountId: v.optional(v.string()),
		// Cached Connect onboarding status (refreshed by account.updated webhook).
		stripeChargesEnabled: v.optional(v.boolean()),
		stripePayoutsEnabled: v.optional(v.boolean()),
		stripeDetailsSubmitted: v.optional(v.boolean()),
		stripeRequirementsCurrentlyDue: v.optional(v.array(v.string())),
		stripeRequirementsDisabledReason: v.optional(v.string()),
		stripeStatusUpdatedAt: v.optional(v.number()),
		// Stripe event `created` (epoch seconds) of the last applied status write.
		// Guards against out-of-order webhook redeliveries clobbering fresher state.
		stripeStatusEventCreated: v.optional(v.number()),
		// External bank-account fingerprint from Stripe webhooks.
		stripeExternalAccountLast4: v.optional(v.string()),
		stripeExternalAccountBankName: v.optional(v.string()),
		stripeExternalAccountUpdatedAt: v.optional(v.number()),
		plan: v.optional(
			v.union(v.literal("trial"), v.literal("pro"), v.literal("cancelled"))
		), // Deprecated: Use Clerk billing fields instead

		// Settings
		monthlyRevenueTarget: v.optional(v.number()), // Monthly Revenue target displayed on home page
		timezone: v.optional(v.string()), // IANA timezone (e.g., "America/New_York")
		// Celebration toasts (quote approved / invoice paid). Undefined = enabled, admins-only.
		celebrationsEnabled: v.optional(v.boolean()),
		celebrationsAudience: v.optional(
			v.union(v.literal("admins"), v.literal("everyone"))
		),

		// Sequential numbering counters
		lastQuoteNumber: v.optional(v.number()), // Last used quote number for sequential generation

		// Metadata flags
		isMetadataComplete: v.optional(v.boolean()), // Whether user completed additional onboarding
	})
		.index("by_owner", ["ownerUserId"])
		.index("by_clerk_org", ["clerkOrganizationId"])
		.index("by_receiving_address", ["receivingAddress"])
		.index("by_stripe_connect_account_id", ["stripeConnectAccountId"]),

	organizationMemberships: defineTable({
		orgId: v.id("organizations"),
		userId: v.id("users"),
		role: v.optional(v.string()), // role from Clerk membership payload
		// Granular RBAC per-object grants (PRD §3.7). Absent objects fall back to
		// the role default; admins/owners resolve to "all" and ignore stored grants.
		permissions: v.optional(
			v.record(
				v.string(), // PermissionObject key (validated against PERMISSION_OBJECTS at the mutation layer)
				v.object({
					level: v.union(
						v.literal("none"),
						v.literal("view"),
						v.literal("modify"),
						v.literal("delete")
					),
					allRecords: v.optional(v.boolean()),
				})
			)
		),
		permissionsVersion: v.optional(v.number()),
	})
		.index("by_org", ["orgId"])
		.index("by_user", ["userId"])
		.index("by_org_user", ["orgId", "userId"]),

	// Clients - main client information
	clients: defineTable({
		orgId: v.id("organizations"),
		// Company Information
		companyName: v.string(),
		companyDescription: v.optional(v.string()),

		// Status and Classification
		status: v.union(
			v.literal("lead"),
			v.literal("active"),
			v.literal("inactive"),
			v.literal("archived")
		),
		leadSource: v.optional(
			v.union(
				v.literal("word-of-mouth"),
				v.literal("website"),
				v.literal("social-media"),
				v.literal("referral"),
				v.literal("advertising"),
				v.literal("trade-show"),
				v.literal("cold-outreach"),
				v.literal("community-page"),
				v.literal("other")
			)
		),

		// Classification
		isActive: v.optional(v.boolean()),

		// Communication preferences
		communicationPreference: v.optional(
			v.union(v.literal("email"), v.literal("phone"), v.literal("both"))
		),

		// Metadata
		tags: v.optional(v.array(v.string())),
		notes: v.optional(v.string()),

		// Portal access — UUID-shaped link token used to construct the public
		// portal URL `https://app.example.com/portal/c/{portalAccessId}`. Plan
		// 13-02 introduces this field as optional; backfill mutation populates
		// existing rows. Generated on demand for newly created clients.
		portalAccessId: v.optional(v.string()),

		// Archive functionality
		archivedAt: v.optional(v.number()), // Timestamp when client was archived

		// Creator (optional — unset on historical + system-created rows)
		createdByUserId: v.optional(v.id("users")),
		// Search digest maintained by lib/triggers.ts (see lib/searchText.ts).
		searchText: v.optional(v.string()),
	})
		.index("by_org", ["orgId"])
		.index("by_status", ["orgId", "status"])
		.index("by_portal_access_id", ["portalAccessId"])
		.searchIndex("search_text", {
			searchField: "searchText",
			filterFields: ["orgId"],
		}),

	// Client Contacts - separate table for multiple contacts per client
	clientContacts: defineTable({
		clientId: v.id("clients"),
		orgId: v.id("organizations"),

		// Basic info
		firstName: v.string(),
		lastName: v.string(),
		email: v.optional(v.string()),
		phone: v.optional(v.string()),

		// Role information
		jobTitle: v.optional(v.string()),

		// Contact preferences
		isPrimary: v.boolean(), // Mark primary contact
		// Search digest maintained by lib/triggers.ts (see lib/searchText.ts).
		searchText: v.optional(v.string()),
	})
		.index("by_client", ["clientId"])
		.index("by_org", ["orgId"])
		.index("by_primary", ["clientId", "isPrimary"])
		.searchIndex("search_text", {
			searchField: "searchText",
			filterFields: ["orgId"],
		}),

	// Client Properties - separate table for multiple properties per client
	clientProperties: defineTable({
		clientId: v.id("clients"),
		orgId: v.id("organizations"),

		// Property details
		propertyName: v.optional(v.string()),
		propertyType: v.optional(
			v.union(
				v.literal("residential"),
				v.literal("commercial"),
				v.literal("industrial"),
				v.literal("retail"),
				v.literal("office"),
				v.literal("mixed-use")
			)
		),

		// Address
		streetAddress: v.string(),
		city: v.string(),
		state: v.string(),
		zipCode: v.string(),
		country: v.optional(v.string()),

		// Additional info
		isPrimary: v.boolean(), // Mark primary property

		// Geocoding (from Mapbox Address Autofill)
		latitude: v.optional(v.number()),
		longitude: v.optional(v.number()),
		formattedAddress: v.optional(v.string()), // Full formatted address from Mapbox
		// Search digest maintained by lib/triggers.ts (see lib/searchText.ts).
		searchText: v.optional(v.string()),
	})
		.index("by_client", ["clientId"])
		.index("by_org", ["orgId"])
		.index("by_primary", ["clientId", "isPrimary"])
		.searchIndex("search_text", {
			searchField: "searchText",
			filterFields: ["orgId"],
		}),

	// Planned multi-stop routes (Routing page)
	routes: defineTable({
		orgId: v.id("organizations"),
		name: v.string(),
		// undefined (pre-kind rows) reads as "saved"
		kind: v.optional(v.union(v.literal("daily"), v.literal("saved"))),
		date: v.optional(v.number()), // planned day, UTC midnight; required when kind === "daily"
		// daily-singleton key part: undefined = org-wide route
		assigneeUserId: v.optional(v.id("users")),
		status: v.union(v.literal("draft"), v.literal("finalized")),
		// Run state (daily routes): set when the route is started/finished in the field
		startedAt: v.optional(v.number()),
		completedAt: v.optional(v.number()),

		start: v.object({
			kind: v.union(v.literal("org"), v.literal("manual")),
			label: v.string(),
			latitude: v.number(),
			longitude: v.number(),
		}),
		roundTrip: v.boolean(),

		stops: v.array(
			v.object({
				propertyId: v.optional(v.id("clientProperties")), // absent for manual stops
				// Seed provenance: which schedule item produced this stop
				taskId: v.optional(v.id("tasks")),
				projectId: v.optional(v.id("projects")),
				label: v.string(),
				latitude: v.number(),
				longitude: v.number(),
				order: v.number(),
				// Completion tracking (daily routes); absent = pending
				status: v.optional(
					v.union(
						v.literal("pending"),
						v.literal("visited"),
						v.literal("skipped")
					)
				),
				visitedAt: v.optional(v.number()),
			})
		),

		// Computed route result; cleared whenever start/stops/roundTrip change
		optimized: v.optional(v.boolean()), // order came from the optimizer
		approximate: v.optional(v.boolean()), // local heuristic (stop count over API cap)
		geometry: v.optional(v.string()), // encoded polyline
		totalDistanceMeters: v.optional(v.number()),
		totalDurationSeconds: v.optional(v.number()),
		legs: v.optional(
			v.array(
				v.object({
					distanceMeters: v.number(),
					durationSeconds: v.number(),
				})
			)
		),
		computedAt: v.optional(v.number()),

		createdBy: v.id("users"),
	})
		.index("by_org", ["orgId"])
		.index("by_org_date", ["orgId", "date"]),

	// Projects
	projects: defineTable({
		orgId: v.id("organizations"),
		clientId: v.id("clients"),
		propertyId: v.optional(v.id("clientProperties")), // Which client property the work happens at

		// Basic info
		title: v.string(),
		description: v.optional(v.string()),
		projectNumber: v.optional(v.string()), // Custom project numbering

		// Status and type
		status: v.union(
			v.literal("planned"),
			v.literal("in-progress"),
			v.literal("completed"),
			v.literal("cancelled")
		),
		projectType: v.union(v.literal("one-off"), v.literal("recurring")),

		// Dates
		startDate: v.optional(v.number()),
		endDate: v.optional(v.number()),
		completedAt: v.optional(v.number()),

		// Team
		assignedUserIds: v.optional(v.array(v.id("users"))),

		// Creator (optional — unset on historical + system-created rows)
		createdByUserId: v.optional(v.id("users")),
		// Search digest maintained by lib/triggers.ts (see lib/searchText.ts).
		searchText: v.optional(v.string()),
	})
		.index("by_org", ["orgId"])
		.index("by_client", ["clientId"])
		.index("by_status", ["orgId", "status"])
		.searchIndex("search_text", {
			searchField: "searchText",
			filterFields: ["orgId"],
		}),

	// Tasks/Schedule items
	tasks: defineTable({
		orgId: v.id("organizations"),
		projectId: v.optional(v.id("projects")),
		clientId: v.optional(v.id("clients")), // Optional to support internal tasks
		propertyId: v.optional(v.id("clientProperties")), // Which client property the work happens at
		type: v.optional(v.union(v.literal("internal"), v.literal("external"))),
		// SEC-8: set only by communityPages.submitInterest, an unauthenticated
		// mutation, so the title/description are third-party text. The assistant
		// fences these rows before they reach the model.
		source: v.optional(v.literal("public_form")),

		title: v.string(),
		description: v.optional(v.string()),

		// Schedule
		date: v.number(), // Date as timestamp
		startTime: v.optional(v.string()), // e.g., "14:00"
		endTime: v.optional(v.string()),

		// Assignment
		assigneeUserId: v.optional(v.id("users")),

		// Status
		status: v.union(
			v.literal("pending"),
			v.literal("in-progress"),
			v.literal("completed"),
			v.literal("cancelled")
		),
		completedAt: v.optional(v.number()),

		// Recurrence
		repeat: v.optional(
			v.union(
				v.literal("none"),
				v.literal("daily"),
				v.literal("weekly"),
				v.literal("monthly"),
				v.literal("yearly")
			)
		),
		repeatUntil: v.optional(v.number()),
		parentTaskId: v.optional(v.id("tasks")), // Links recurring task instances to parent

		// Creator (optional — unset on historical + system-created rows)
		createdByUserId: v.optional(v.id("users")),
		// Search digest maintained by lib/triggers.ts (see lib/searchText.ts).
		searchText: v.optional(v.string()),
	})
		.index("by_org", ["orgId"])
		.index("by_project", ["projectId"])
		.index("by_client", ["clientId"])
		// Org-prefixed: a user can belong to several orgs, so a bare
		// assigneeUserId lookup reads their tasks in every tenant.
		.index("by_org_assignee", ["orgId", "assigneeUserId"])
		.index("by_date", ["orgId", "date"])
		.index("by_parent_task", ["parentTaskId"])
		.searchIndex("search_text", {
			searchField: "searchText",
			filterFields: ["orgId"],
		}),

	// Quotes
	quotes: defineTable({
		orgId: v.id("organizations"),
		clientId: v.id("clients"),
		projectId: v.optional(v.id("projects")),

		// Basic info
		title: v.optional(v.string()),
		quoteNumber: v.optional(v.string()), // Auto-generated or custom

		// Status
		status: v.union(
			v.literal("draft"),
			v.literal("sent"),
			v.literal("approved"),
			v.literal("declined"),
			v.literal("expired")
		),

		// Financial — all money fields are DOLLARS (see lib/money.ts).
		// Stored subtotal/taxAmount/total are kept in sync with line items by
		// syncQuoteTotals (lib/quoteTotals.ts).
		subtotal: v.number(), // dollars
		discountEnabled: v.optional(v.boolean()),
		// Percent (0-100) when discountType is "percentage", otherwise dollars
		discountAmount: v.optional(v.number()),
		discountType: v.optional(
			v.union(v.literal("percentage"), v.literal("fixed"))
		),
		taxEnabled: v.optional(v.boolean()),
		taxRate: v.optional(v.number()), // Percentage
		taxAmount: v.optional(v.number()), // dollars
		total: v.number(), // dollars

		// Terms and messaging
		validUntil: v.optional(v.number()),
		clientMessage: v.optional(v.string()),
		terms: v.optional(v.string()),

		// Tracking
		sentAt: v.optional(v.number()),
		approvedAt: v.optional(v.number()),
		declinedAt: v.optional(v.number()),

		// PDF settings for client view
		pdfSettings: v.optional(
			v.object({
				showQuantities: v.boolean(),
				showUnitPrices: v.boolean(),
				showLineItemTotals: v.boolean(),
				showTotals: v.boolean(),
			})
		),

		// Last time client-visible content (line items, pricing, PDF settings,
		// terms, validUntil) changed — drives PDF/document staleness on record
		// pages.
		contentUpdatedAt: v.optional(v.number()),

		// Reference to the latest document version
		latestDocumentId: v.optional(v.id("documents")),

		// Countersignature settings
		requiresCountersignature: v.optional(v.boolean()),
		countersignerId: v.optional(v.id("users")),
		signingOrder: v.optional(
			v.union(v.literal("client_first"), v.literal("org_first"))
		),

		// Creator (optional — unset on historical + system-created rows)
		createdByUserId: v.optional(v.id("users")),
		// Search digest maintained by lib/triggers.ts (see lib/searchText.ts).
		searchText: v.optional(v.string()),
	})
		.index("by_org", ["orgId"])
		.index("by_client", ["clientId"])
		.index("by_project", ["projectId"])
		.index("by_status", ["orgId", "status"])
		.searchIndex("search_text", {
			searchField: "searchText",
			filterFields: ["orgId"],
		}),

	// Quote Approvals — APPEND-ONLY audit trail for portal quote approve/decline
	// (Phase 14, QUOTE-04 + QUOTE-05). Never patch existing rows; re-approval
	// cycles append a new row. termsAcceptedAt is OPTIONAL — only set on
	// approval rows, omitted on decline rows (decline does not require terms
	// acceptance per CONTEXT §"Decline with reason" and REVIEWS feedback).
	quoteApprovals: defineTable({
		quoteId: v.id("quotes"),
		orgId: v.id("organizations"),
		clientContactId: v.id("clientContacts"),
		action: v.union(v.literal("approved"), v.literal("declined")),
		declineReason: v.optional(v.string()),
		signatureStorageId: v.optional(v.id("_storage")),
		signatureMode: v.optional(
			v.union(v.literal("typed"), v.literal("drawn"))
		),
		signatureRawData: v.optional(v.string()),
		ipAddress: v.string(),
		userAgent: v.string(),
		documentId: v.id("documents"),
		documentVersion: v.number(),
		lineItemsSnapshot: v.array(
			v.object({
				description: v.string(),
				quantity: v.number(),
				unit: v.string(),
				rate: v.number(),
				amount: v.number(),
				sortOrder: v.number(),
			})
		),
		subtotalSnapshot: v.number(), // dollars
		taxSnapshot: v.number(), // dollars
		totalSnapshot: v.number(), // dollars
		termsSnapshot: v.optional(v.string()),
		// termsAcceptedAt is OPTIONAL: only meaningful on approval rows.
		// Decline rows omit this field — decline does not require terms acceptance
		// (per CONTEXT §"Decline with reason" and REVIEWS feedback on Plan 14-01).
		termsAcceptedAt: v.optional(v.number()),
		// SEC-4: set only when the signer affirmed signing intent (ESIGN) on a
		// typed signature. Optional — rows predating the check, drawn
		// signatures, and declines all omit it.
		intentAffirmedAt: v.optional(v.number()),
		createdAt: v.number(),
	})
		.index("by_quote", ["quoteId", "createdAt"])
		.index("by_org", ["orgId", "createdAt"])
		.index("by_clientContact", ["clientContactId", "createdAt"]),

	// Quote Line Items
	quoteLineItems: defineTable({
		quoteId: v.id("quotes"),
		orgId: v.id("organizations"),

		description: v.string(),
		quantity: v.number(),
		unit: v.string(), // e.g., "hour", "item", "day"
		rate: v.number(), // Unit price, dollars
		amount: v.number(), // quantity * rate, dollars (cent-rounded)
		cost: v.optional(v.number()), // Cost per unit for margin calculation, dollars
		skuId: v.optional(v.id("skus")), // set when picked from the SKU list; drives QBO per-item sync

		sortOrder: v.number(), // For ordering items
	})
		.index("by_quote", ["quoteId"])
		.index("by_org", ["orgId"]),

	// Invoices
	invoices: defineTable({
		orgId: v.id("organizations"),
		clientId: v.id("clients"),
		projectId: v.optional(v.id("projects")),
		quoteId: v.optional(v.id("quotes")), // If created from quote

		// Basic info
		invoiceNumber: v.string(),

		// Status
		status: v.union(
			v.literal("draft"),
			v.literal("sent"),
			v.literal("paid"),
			v.literal("overdue"),
			v.literal("cancelled")
		),

		// Financial — all DOLLARS. Two pricing modes, see lib/invoiceTotals.ts:
		// LEGACY (none of discountEnabled/discountType/taxEnabled/taxRate set) —
		// discountAmount/taxAmount are pre-computed dollars, subtracted/added flat.
		// QUOTE-STYLE (any of them set) — discountAmount is a percent when
		// discountType is "percentage", taxRate drives a derived taxAmount, and
		// the math matches computeQuoteTotals exactly. Stored subtotal/total are
		// kept in sync with line items by syncInvoiceTotals.
		subtotal: v.number(), // dollars
		discountEnabled: v.optional(v.boolean()),
		// Percent (0-100) when discountType is "percentage", otherwise dollars
		discountAmount: v.optional(v.number()),
		discountType: v.optional(
			v.union(v.literal("percentage"), v.literal("fixed"))
		),
		taxEnabled: v.optional(v.boolean()),
		taxRate: v.optional(v.number()), // Percentage
		taxAmount: v.optional(v.number()), // dollars
		total: v.number(), // dollars

		// PDF settings for client view (mirrors quotes.pdfSettings)
		pdfSettings: v.optional(
			v.object({
				showQuantities: v.boolean(),
				showUnitPrices: v.boolean(),
				showLineItemTotals: v.boolean(),
				showTotals: v.boolean(),
			})
		),

		// Last time client-visible content (line items, pricing, PDF settings,
		// due date) changed — drives PDF/document staleness on record pages.
		contentUpdatedAt: v.optional(v.number()),

		// Dates
		issuedDate: v.number(),
		dueDate: v.number(),
		paidAt: v.optional(v.number()),

		// Payment
		stripeSessionId: v.optional(v.string()),
		stripePaymentIntentId: v.optional(v.string()),

		// Legacy pay-by-link token. Retired: no longer generated for new invoices
		// (portal payments correlate by paymentId). Optional so existing rows keep
		// theirs while net-new rows omit it.
		publicToken: v.optional(v.string()),

		// Creator (optional — unset on historical + system-created rows)
		createdByUserId: v.optional(v.id("users")),
		// Search digest maintained by lib/triggers.ts (see lib/searchText.ts).
		searchText: v.optional(v.string()),
	})
		.index("by_org", ["orgId"])
		.index("by_client", ["clientId"])
		.index("by_project", ["projectId"])
		.index("by_quote", ["quoteId"])
		.index("by_status", ["orgId", "status"])
		.index("by_due_date", ["orgId", "dueDate"])
		.index("by_public_token", ["publicToken"])
		.searchIndex("search_text", {
			searchField: "searchText",
			filterFields: ["orgId"],
		}),

	// Invoice Line Items
	invoiceLineItems: defineTable({
		invoiceId: v.id("invoices"),
		orgId: v.id("organizations"),

		description: v.string(),
		quantity: v.number(),
		unit: v.optional(v.string()), // e.g., "hour", "item", "day"
		unitPrice: v.number(), // dollars
		total: v.number(), // quantity * unitPrice, dollars (cent-rounded)
		cost: v.optional(v.number()), // Cost per unit for margin calculation, dollars
		skuId: v.optional(v.id("skus")), // set when picked from the SKU list; drives QBO per-item sync

		sortOrder: v.number(),
	})
		.index("by_invoice", ["invoiceId"])
		.index("by_org", ["orgId"]),

	// Payments - individual payment installments for invoices
	payments: defineTable({
		orgId: v.id("organizations"),
		invoiceId: v.id("invoices"),

		// Payment details
		paymentAmount: v.number(), // dollars (Stripe cents only at the API edge)
		dueDate: v.number(),
		description: v.optional(v.string()), // e.g., "Deposit", "Final Payment", "Milestone 1"

		// Sequential ordering
		sortOrder: v.number(),

		// Status tracking
		status: v.union(
			v.literal("pending"),
			v.literal("sent"),
			v.literal("paid"),
			v.literal("refunded"),
			v.literal("overdue"),
			v.literal("cancelled")
		),
		paidAt: v.optional(v.number()),
		// True when settled outside the portal (e.g. cash/check reconciled via
		// the workspace "Mark as Paid"), so the portal can label it as such.
		recordedOutsidePortal: v.optional(v.boolean()),

		// Legacy pay-by-link token. Retired: no longer generated for new payment
		// rows (portal PaymentIntents correlate by paymentId). Optional so existing
		// rows keep theirs while net-new rows omit it.
		publicToken: v.optional(v.string()),

		// Stripe integration
		stripeSessionId: v.optional(v.string()),
		stripePaymentIntentId: v.optional(v.string()),

		// Webhook-driven Stripe lifecycle state.
		disputed: v.optional(v.boolean()),
		disputeId: v.optional(v.string()),
		// Latest Stripe dispute status (needs_response, under_review, won, lost, …).
		disputeStatus: v.optional(v.string()),
		disputeResolvedAt: v.optional(v.number()),
		refundedAt: v.optional(v.number()),
		// Shared counter — advances for any flow that mints a new Stripe object (Checkout Session or PaymentIntent).
		checkoutAttemptCounter: v.optional(v.number()),
		// Active Checkout Session cache for retry reuse.
		pendingCheckoutSessionId: v.optional(v.string()),
		pendingCheckoutSessionUrl: v.optional(v.string()),
		pendingCheckoutSessionExpiresAt: v.optional(v.number()),
		// Active PaymentIntent cache for embedded Elements retry reuse.
		pendingPaymentIntentId: v.optional(v.string()),
		pendingPaymentIntentClientSecret: v.optional(v.string()),
		pendingPaymentIntentExpiresAt: v.optional(v.number()),
		// Receipt metadata cached from payment_intent.succeeded webhook (latest_charge).
		cardLast4: v.optional(v.string()),
		cardBrand: v.optional(v.string()),
		stripeReceiptUrl: v.optional(v.string()),
	})
		.index("by_org", ["orgId"])
		.index("by_invoice", ["invoiceId"])
		.index("by_public_token", ["publicToken"])
		.index("by_status", ["orgId", "status"])
		.index("by_due_date", ["orgId", "dueDate"])
		.index("by_invoice_sort", ["invoiceId", "sortOrder"]),

	// PDF Documents (for quotes and invoices)
	documents: defineTable({
		orgId: v.id("organizations"),
		documentType: v.union(v.literal("quote"), v.literal("invoice")),
		documentId: v.string(), // ID of the quote or invoice

		storageId: v.id("_storage"), // Reference to stored PDF (unsigned original)
		signedStorageId: v.optional(v.id("_storage")), // Reference to signed PDF from BoldSign
		generatedAt: v.number(),
		version: v.number(), // Version number for tracking PDF versions (starts at 1)

		// Top-level BoldSign document ID for efficient querying
		boldsignDocumentId: v.optional(v.string()),

		// BoldSign integration fields
		boldsign: v.optional(
			v.object({
				documentId: v.string(), // BoldSign document ID
				status: v.union(
					v.literal("Draft"), // Embedded request created, awaiting in-editor Send
					v.literal("Sent"),
					v.literal("Viewed"),
					v.literal("Signed"),
					v.literal("Completed"),
					v.literal("Declined"),
					v.literal("Revoked"),
					v.literal("Expired")
				),
				sentTo: v.array(
					v.object({
						id: v.optional(v.string()),
						name: v.string(),
						email: v.string(),
						signerType: v.string(), // "Signer" or "CC"
						signerOrder: v.optional(v.number()), // 1-based signing order
					})
				),
				sentAt: v.optional(v.number()),
				viewedAt: v.optional(v.number()),
				signedAt: v.optional(v.number()),
				completedAt: v.optional(v.number()),
				declinedAt: v.optional(v.number()),
				revokedAt: v.optional(v.number()),
				expiredAt: v.optional(v.number()),
				viewUrl: v.optional(v.string()), // Embedded sendUrl (Draft) or view link
				sendUrlExpiresAt: v.optional(v.number()), // Expiry for idempotent Draft reuse
				// When the Draft was created or last saved via Save & Close. Distinct
				// from generatedAt (the PDF's timestamp), which the UI used to show.
				draftSavedAt: v.optional(v.number()),
			})
		),
	})
		.index("by_org", ["orgId"])
		.index("by_document", ["documentType", "documentId"])
		.index("by_document_version", ["documentType", "documentId", "version"])
		.index("by_boldsign_documentId", ["boldsignDocumentId"]),

	// Activities - for home route activity feed
	activities: defineTable({
		orgId: v.id("organizations"),
		userId: v.id("users"), // User who performed the activity
		activityType: v.union(
			v.literal("client_created"),
			v.literal("client_updated"),
			v.literal("project_created"),
			v.literal("project_updated"),
			v.literal("project_completed"),
			v.literal("quote_created"),
			v.literal("quote_sent"),
			v.literal("quote_approved"),
			v.literal("quote_declined"),
			v.literal("quote_pdf_generated"),
			v.literal("invoice_created"),
			v.literal("invoice_sent"),
			v.literal("invoice_paid"),
			v.literal("payment_created"),
			v.literal("payment_updated"),
			v.literal("payment_paid"),
			v.literal("payment_cancelled"),
			v.literal("payments_configured"),
			v.literal("task_created"),
			v.literal("task_completed"),
			v.literal("route_completed"),
			v.literal("user_invited"),
			v.literal("user_removed"),
			v.literal("member_permissions_updated"),
			v.literal("organization_updated"),
			v.literal("email_sent"),
			v.literal("email_delivered"),
			v.literal("email_opened"),
			v.literal("email_received")
		),
		entityType: v.union(
			v.literal("client"),
			v.literal("project"),
			v.literal("quote"),
			v.literal("invoice"),
			v.literal("payment"),
			v.literal("task"),
			v.literal("route"),
			v.literal("user"),
			v.literal("organization")
		),
		entityId: v.string(), // ID of the affected entity
		entityName: v.string(), // Display name of the affected entity
		description: v.string(), // Human-readable activity description
		metadata: v.optional(v.any()), // Additional activity-specific data
		timestamp: v.number(), // When the activity occurred
		isVisible: v.boolean(), // Whether to show in activity feeds
	})
		.index("by_org_timestamp", ["orgId", "timestamp"])
		.index("by_org_entityType_timestamp", ["orgId", "entityType", "timestamp"])
		.index("by_user", ["userId"])
		.index("by_entity", ["entityType", "entityId"])
		.index("by_type", ["orgId", "activityType"]),

	// Notifications
	notifications: defineTable({
		orgId: v.id("organizations"),
		userId: v.id("users"), // Target user for the notification
		notificationType: v.union(
			v.literal("task_reminder"),
			v.literal("quote_approved"),
			v.literal("invoice_overdue"),
			v.literal("payment_received"),
			v.literal("project_deadline"),
			v.literal("team_assignment"),
			v.literal("client_mention"),
			v.literal("project_mention"),
			v.literal("quote_mention"),
			// Stripe webhook lifecycle notifications.
			v.literal("payment_failed"),
			v.literal("dispute_created"),
			v.literal("dispute_resolved"),
			v.literal("charge_refunded"),
			v.literal("refund_failed"),
			// Stripe Connect lifecycle additions.
			v.literal("payout_paid"),
			v.literal("payout_failed"),
			v.literal("capability_degraded"),
			v.literal("bank_account_changed"),
			v.literal("stripe_disconnected"),
			// Workflow-automation messages (send_notification / send_team_message).
			v.literal("automation_message"),
			// Workflow-automation production failure alert (admins, in-app only —
			// deliberately NOT in PUSHABLE_TYPES so failures don't push at 3am).
			v.literal("automation_failed"),
			// QuickBooks sync failure alert (admins, in-app only, debounced to
			// one while any unresolved terminal failure exists).
			v.literal("quickbooks_sync_failed")
		),
		title: v.string(), // Notification title
		message: v.string(), // Notification message content
		entityType: v.optional(
			v.union(
				v.literal("client"),
				v.literal("project"),
				v.literal("quote"),
				v.literal("invoice"),
				v.literal("task")
			)
		),
		entityId: v.optional(v.string()), // Related entity ID
		actionUrl: v.optional(v.string()), // URL to navigate when clicked
		isRead: v.boolean(), // Whether user has read the notification
		readAt: v.optional(v.number()), // When notification was read
		scheduledFor: v.optional(v.number()), // When to send the notification
		sentAt: v.optional(v.number()), // When notification was actually sent
		sentVia: v.optional(
			v.union(v.literal("email"), v.literal("sms"), v.literal("in_app"))
		),
		hasAttachments: v.optional(v.boolean()), // Quick flag for whether this notification has attachments
		// Optional Stripe webhook notification metadata.
		priority: v.optional(v.union(v.literal("normal"), v.literal("high"))),
		paymentId: v.optional(v.id("payments")),
		// Celebration metadata (quote_approved / payment_received confetti toasts).
		celebrationFlair: v.optional(v.string()), // Server-picked flair line shown on the toast
		celebratedAt: v.optional(v.number()), // When the confetti toast was shown (unset = pending)
	})
		.index("by_user_read", ["userId", "isRead"])
		.index("by_org", ["orgId"])
		.index("by_scheduled", ["scheduledFor"])
		.index("by_type", ["notificationType"])
		// Once-per-record celebration dedup lookup.
		.index("by_org_type_entity", ["orgId", "notificationType", "entityId"])
		// Per-user celebration feed, range-bounded on _creationTime.
		.index("by_user_type", ["userId", "notificationType"]),

	// Organization Document Folders - drive-explorer tree for organizationDocuments
	organizationDocumentFolders: defineTable({
		orgId: v.id("organizations"),
		name: v.string(),
		// Undefined = root-level folder.
		parentId: v.optional(v.id("organizationDocumentFolders")),
		createdAt: v.number(),
		createdBy: v.id("users"),
	})
		.index("by_org", ["orgId"])
		.index("by_org_parent", ["orgId", "parentId"]),

	// Organization Documents - reusable documents for quotes/invoices
	organizationDocuments: defineTable({
		orgId: v.id("organizations"),

		// Document metadata
		name: v.string(), // User-friendly name
		description: v.optional(v.string()), // Optional description

		// Storage
		storageId: v.id("_storage"), // Reference to stored PDF
		fileSize: v.optional(v.number()), // Size in bytes
		mimeType: v.optional(v.string()), // From _storage metadata; legacy rows read as application/pdf

		// Folder placement (undefined = root)
		folderId: v.optional(v.id("organizationDocumentFolders")),

		// Tracking
		uploadedAt: v.number(),
		uploadedBy: v.id("users"),
	})
		.index("by_org", ["orgId"])
		.index("by_org_uploaded", ["orgId", "uploadedAt"])
		.index("by_org_folder", ["orgId", "folderId"]),

	// SKUs - reusable stock keeping units for quotes
	skus: defineTable({
		orgId: v.id("organizations"),

		// SKU details
		name: v.string(), // Acts as description when used in quotes
		unit: v.string(), // Default unit (e.g., "hour", "item", "day")
		rate: v.number(), // Default price/rate, dollars
		cost: v.optional(v.number()), // Optional cost for margin calculation, dollars

		// Status
		isActive: v.boolean(), // Allow soft deletion

		// Tracking
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_org", ["orgId"])
		.index("by_org_active", ["orgId", "isActive"]),

	// Team Communication messages (feed on client/project/quote detail pages).
	// Go-forward home for both the human mention write path and the automation
	// send_team_message action. Bell notifications still live in `notifications`.
	teamMessages: defineTable({
		orgId: v.id("organizations"),
		entityType: v.union(
			v.literal("client"),
			v.literal("project"),
			v.literal("quote")
		),
		entityId: v.string(),
		message: v.string(), // RAW message (no authorId prefix)
		authorType: v.union(v.literal("user"), v.literal("automation")),
		authorUserId: v.optional(v.id("users")), // set when authorType === "user"
		automationId: v.optional(v.id("workflowAutomations")), // set when authorType === "automation"
		mentionedUserIds: v.optional(v.array(v.id("users"))),
		hasAttachments: v.optional(v.boolean()),
		createdAt: v.number(),
		// Set only by the one-shot notifications backfill; enables idempotent re-runs.
		migratedFromNotificationId: v.optional(v.id("notifications")),
	})
		.index("by_org", ["orgId"])
		.index("by_org_entity", ["orgId", "entityType", "entityId", "createdAt"])
		.index("by_migrated_from", ["migratedFromNotificationId"]),

	// Message Attachments - files attached to mention messages
	messageAttachments: defineTable({
		orgId: v.id("organizations"),
		// Legacy attachments key off notificationId; new attachments key off
		// teamMessageId. Exactly one is set.
		notificationId: v.optional(v.id("notifications")),
		teamMessageId: v.optional(v.id("teamMessages")),
		uploadedBy: v.id("users"),

		// Entity reference (denormalized from notification for efficient querying)
		entityType: v.union(
			v.literal("client"),
			v.literal("project"),
			v.literal("quote")
		),
		entityId: v.string(), // ID of the client, project, or quote

		// File metadata
		fileName: v.string(),
		fileSize: v.number(), // Size in bytes
		mimeType: v.string(),

		// Storage
		storageId: v.id("_storage"),

		// Tracking
		uploadedAt: v.number(),
	})
		.index("by_notification", ["notificationId"])
		.index("by_teamMessage", ["teamMessageId"])
		.index("by_org", ["orgId"])
		.index("by_uploader", ["uploadedBy"])
		.index("by_entity", ["entityType", "entityId"]) // NEW: Efficient lookup for "all attachments on entity X"
		.index("by_org_entity", ["orgId", "entityType", "entityId"]), // NEW: Org-scoped entity lookup

	// Push notification device tokens.
	// INTENTIONALLY userId-scoped, NOT orgId-scoped: a mention can originate in
	// any org the author shares with the tagged user, and the push must reach the
	// tagged user regardless of their active org. Deliberate exception to the
	// CLAUDE.md multi-tenant rule (see push.ts header).
	pushTokens: defineTable({
		userId: v.id("users"),
		token: v.string(), // "ExponentPushToken[...]"
		platform: v.union(v.literal("ios"), v.literal("android")),
		deviceName: v.optional(v.string()),
		lastSeenAt: v.number(),
	})
		.index("by_user", ["userId"])
		.index("by_token", ["token"]),

	// Service Status - monitoring for external service health
	serviceStatus: defineTable({
		serviceName: v.string(), // "convex", "clerk_auth", "clerk_billing", "boldsign_esignature", "stripe"
		provider: v.string(), // "convex", "clerk", "boldsign", or "stripe"
		status: v.union(
			v.literal("operational"),
			v.literal("degraded"),
			v.literal("partial_outage"),
			v.literal("major_outage"),
			v.literal("unknown")
		),
		lastChecked: v.number(), // Timestamp of last check
		lastUpdated: v.number(), // When the status was last updated (from API)
	})
		.index("by_service", ["serviceName"])
		.index("by_provider", ["provider"]),

	// Email Messages - track sent and received client emails via Resend
	emailMessages: defineTable({
		orgId: v.id("organizations"),
		// Nullable: inbound mail from an unrecognized sender persists on an
		// unlinked thread instead of being dropped. Existing rows keep their id.
		clientId: v.union(v.id("clients"), v.null()),
		resendEmailId: v.string(), // Resend's email ID for tracking

		// Direction and threading
		direction: v.union(v.literal("outbound"), v.literal("inbound")),
		threadId: v.optional(v.string()), // LEGACY string grouping key — being replaced by threadDocId; kept through the dual-write migration
		threadDocId: v.optional(v.id("emailThreads")), // Canonical thread grouping key
		rfcMessageId: v.optional(v.string()), // This message's own RFC 5322 Message-ID; canonical thread-match key
		inReplyTo: v.optional(v.string()), // Message-ID this email is replying to (RFC 5322)
		references: v.optional(v.array(v.string())), // Full chain of message IDs in thread
		idempotencyKey: v.optional(v.string()), // Per-logical-message send key (audit; also passed to provider)

		// Email content
		subject: v.string(),
		messageBody: v.string(), // Plain text body or HTML for outbound
		messagePreview: v.optional(v.string()), // First 100 chars for display
		htmlBody: v.optional(v.string()), // HTML body for received emails (raw, retained for re-parse)
		textBody: v.optional(v.string()), // Plain text body for received emails (raw, retained for re-parse)
		visibleText: v.optional(v.string()), // Derived new-content-only body (quotes/signature stripped on ingest)

		// Sender (for inbound emails)
		fromEmail: v.string(),
		fromName: v.string(),

		// Recipients
		toEmail: v.string(),
		toName: v.string(),

		// Attachments
		hasAttachments: v.optional(v.boolean()),

		// Status tracking
		status: v.union(
			v.literal("sent"),
			v.literal("delivered"),
			v.literal("opened"),
			v.literal("bounced"),
			v.literal("complained"),
			v.literal("failed") // permanent send failure (Resend email.failed)
		),

		// Timestamps
		sentAt: v.number(),
		deliveredAt: v.optional(v.number()),
		openedAt: v.optional(v.number()),
		bouncedAt: v.optional(v.number()),
		complainedAt: v.optional(v.number()),
		failedAt: v.optional(v.number()),

		// Tracking
		sentBy: v.optional(v.id("users")), // User who sent the email (optional for inbound)
	})
		.index("by_org", ["orgId"])
		.index("by_client", ["clientId"])
		.index("by_resend_id", ["resendEmailId"])
		.index("by_org_status", ["orgId", "status"])
		.index("by_client_status", ["clientId", "status"])
		.index("by_thread", ["threadId", "sentAt"])
		.index("by_rfc_message_id", ["rfcMessageId"])
		.index("by_thread_doc", ["threadDocId", "sentAt"])
		.index("by_idempotency_key", ["idempotencyKey"]),

	// Email Attachments - files attached to emails
	emailAttachments: defineTable({
		orgId: v.id("organizations"),
		emailMessageId: v.id("emailMessages"),

		// Attachment metadata (from Resend)
		attachmentId: v.string(), // Resend attachment ID
		filename: v.string(),
		contentType: v.string(),
		size: v.number(), // Size in bytes

		// Storage
		storageId: v.optional(v.id("_storage")), // After downloading from Resend

		// Tracking
		receivedAt: v.number(),
	})
		.index("by_email", ["emailMessageId"])
		.index("by_org", ["orgId"]),

	// Email Threads - first-class conversations keyed on the RFC Message-ID chain
	emailThreads: defineTable({
		orgId: v.id("organizations"),
		// Nullable: unknown-sender threads have no linked client until triaged
		clientId: v.union(v.id("clients"), v.null()),
		subjectNormalized: v.string(), // subject with all leading Re:/Fwd: stripped, lowercased
		subject: v.optional(v.string()), // human display subject (latest message; denormalized for the inbox list)
		lastMessagePreview: v.optional(v.string()), // snippet of the latest message (denormalized for the inbox list)
		lastMessageDirection: v.optional(
			v.union(v.literal("inbound"), v.literal("outbound"))
		), // direction of the latest message (inbox row affordance)
		rootRfcMessageId: v.optional(v.string()), // Message-ID of the thread's root message (best-effort for backfilled threads)
		lastMessageAt: v.number(), // timestamp of the most recent message (sort key for the inbox)
		messageCount: v.number(),
		unreadCount: v.number(),
		status: v.union(v.literal("open"), v.literal("archived")),
		participantEmails: v.array(v.string()), // distinct addresses seen on the thread
	})
		.index("by_org", ["orgId"])
		.index("by_org_last_message", ["orgId", "lastMessageAt"])
		.index("by_org_status", ["orgId", "status", "lastMessageAt"])
		.index("by_client", ["clientId"])
		.index("by_root_message_id", ["rootRfcMessageId"]),

	// Email Suppressions - addresses that must not be sent to (hard bounce / complaint / manual)
	emailSuppressions: defineTable({
		orgId: v.optional(v.id("organizations")), // org-scoped when set; a global suppression when absent
		email: v.string(),
		reason: v.union(
			v.literal("hard_bounce"),
			v.literal("complaint"),
			v.literal("manual")
		),
		source: v.string(), // where the suppression came from (e.g. "resend_webhook", "admin")
		createdAt: v.number(),
	})
		.index("by_email", ["email"])
		.index("by_org_email", ["orgId", "email"]),

	// Community Pages - public mini-websites for organizations
	communityPages: defineTable({
		orgId: v.id("organizations"),

		// URL and visibility
		slug: v.string(), // Unique URL slug (e.g., "joes-landscaping")
		isPublic: v.boolean(), // Whether the page is publicly accessible

		// Branding
		bannerStorageId: v.optional(v.id("_storage")), // Hero banner image
		avatarStorageId: v.optional(v.id("_storage")), // Avatar/logo (optional, falls back to org logo)

		// Content (TipTap JSON format)
		draftContent: v.optional(v.any()), // Current editing state (TipTap JSON)
		publishedContent: v.optional(v.any()), // What's publicly visible (TipTap JSON)
		draftBioContent: v.optional(v.any()),
		publishedBioContent: v.optional(v.any()),
		draftServicesContent: v.optional(v.any()),
		publishedServicesContent: v.optional(v.any()),
		pricingModeDraft: v.optional(v.union(v.literal("structured"), v.literal("richText"))),
		pricingModePublished: v.optional(
			v.union(v.literal("structured"), v.literal("richText"))
		),
		draftPricingContent: v.optional(v.any()),
		publishedPricingContent: v.optional(v.any()),
		draftPricingTiers: v.optional(
			v.array(
				v.object({
					name: v.string(),
					price: v.string(),
					description: v.optional(v.string()),
					features: v.optional(v.array(v.string())),
					highlighted: v.optional(v.boolean()),
				})
			)
		),
		publishedPricingTiers: v.optional(
			v.array(
				v.object({
					name: v.string(),
					price: v.string(),
					description: v.optional(v.string()),
					features: v.optional(v.array(v.string())),
					highlighted: v.optional(v.boolean()),
				})
			)
		),
		draftServiceTags: v.optional(v.array(v.string())),
		publishedServiceTags: v.optional(v.array(v.string())),

		// Public section order + visibility. Array order IS display order; an
		// absent config means "default order, everything visible", so legacy
		// pages keep rendering exactly as they did.
		draftSectionConfig: v.optional(communitySectionConfigValidator),
		publishedSectionConfig: v.optional(communitySectionConfigValidator),
		draftFaqItems: v.optional(communityFaqItemsValidator),
		publishedFaqItems: v.optional(communityFaqItemsValidator),
		draftTeamMembers: v.optional(communityTeamMembersValidator),
		publishedTeamMembers: v.optional(communityTeamMembersValidator),
		galleryItemsDraft: v.optional(
			v.array(
				v.object({
					storageId: v.id("_storage"),
					sortOrder: v.number(),
				})
			)
		),
		galleryItemsPublished: v.optional(
			v.array(
				v.object({
					storageId: v.id("_storage"),
					sortOrder: v.number(),
				})
			)
		),

		// Business info (Phase 7)
		draftOwnerInfo: v.optional(
			v.object({
				name: v.optional(v.string()),
				title: v.optional(v.string()),
			})
		),
		publishedOwnerInfo: v.optional(
			v.object({
				name: v.optional(v.string()),
				title: v.optional(v.string()),
			})
		),
		draftCredentials: v.optional(
			v.object({
				isLicensed: v.optional(v.boolean()),
				isBonded: v.optional(v.boolean()),
				isInsured: v.optional(v.boolean()),
				yearEstablished: v.optional(v.number()),
				licenseNumber: v.optional(v.string()),
				certifications: v.optional(v.array(v.string())),
			})
		),
		publishedCredentials: v.optional(
			v.object({
				isLicensed: v.optional(v.boolean()),
				isBonded: v.optional(v.boolean()),
				isInsured: v.optional(v.boolean()),
				yearEstablished: v.optional(v.number()),
				licenseNumber: v.optional(v.string()),
				certifications: v.optional(v.array(v.string())),
			})
		),
		draftBusinessHours: v.optional(
			v.object({
				byAppointmentOnly: v.boolean(),
				schedule: v.optional(
					v.array(
						v.object({
							day: v.string(),
							open: v.string(),
							close: v.string(),
							isClosed: v.boolean(),
						})
					)
				),
			})
		),
		publishedBusinessHours: v.optional(
			v.object({
				byAppointmentOnly: v.boolean(),
				schedule: v.optional(
					v.array(
						v.object({
							day: v.string(),
							open: v.string(),
							close: v.string(),
							isClosed: v.boolean(),
						})
					)
				),
			})
		),
		draftSocialLinks: v.optional(
			v.object({
				facebook: v.optional(v.string()),
				instagram: v.optional(v.string()),
				nextdoor: v.optional(v.string()),
				youtube: v.optional(v.string()),
				linkedin: v.optional(v.string()),
				yelp: v.optional(v.string()),
				google: v.optional(v.string()),
			})
		),
		publishedSocialLinks: v.optional(
			v.object({
				facebook: v.optional(v.string()),
				instagram: v.optional(v.string()),
				nextdoor: v.optional(v.string()),
				youtube: v.optional(v.string()),
				linkedin: v.optional(v.string()),
				yelp: v.optional(v.string()),
				google: v.optional(v.string()),
			})
		),

		// Which of the three page structures the public page renders
		// (showcase | storefront | directory). Named "theme" from Phase 8;
		// renaming would need a migration for a value change. Stays a loose
		// string so the legacy theme names on dev rows still validate — the
		// renderer maps anything unrecognised to showcase.
		draftTheme: v.optional(v.string()),
		publishedTheme: v.optional(v.string()),

		// Light/dark on the public page. Owner-decided, not visitor-decided.
		draftColorMode: v.optional(communityColorModeValidator),
		publishedColorMode: v.optional(communityColorModeValidator),
		// The owner's brand colour as they picked it, `#rrggbb`. Stored raw and
		// corrected against the page background at render time (see the web app's
		// lib/community-accent), so a published page inherits later solver work
		// and switching light/dark does not mean re-choosing. Shape is enforced in
		// the upsert handler — a validator cannot express a pattern.
		draftAccent: v.optional(v.string()),
		publishedAccent: v.optional(v.string()),

		// Short headline under the business name on the public page. Capped at
		// 80 characters in the upsert handler.
		draftTagline: v.optional(v.string()),
		publishedTagline: v.optional(v.string()),

		// Metadata
		pageTitle: v.optional(v.string()), // Custom page title (falls back to org name)
		metaDescription: v.optional(v.string()), // SEO description

		// Timestamps
		createdAt: v.number(),
		updatedAt: v.number(),
		publishedAt: v.optional(v.number()), // Last publish timestamp
	})
		.index("by_org", ["orgId"])
		.index("by_slug", ["slug"])
		.index("by_public", ["isPublic"]),

	// Community leads - quote requests submitted from a public community page.
	// Written by the public `submitInterest` mutation, so every field here is
	// the sanitized value, never the raw arg.
	communityLeads: defineTable({
		orgId: v.id("organizations"),
		communityPageId: v.id("communityPages"),
		slug: v.string(), // slug at submission time; the page's slug can change later

		// Submitted details (sanitized in submitInterest)
		name: v.string(),
		email: v.string(), // lowercased + trimmed
		phone: v.optional(v.string()),
		service: v.optional(v.string()), // matched against publishedServiceTags
		message: v.optional(v.string()),

		status: v.union(
			v.literal("new"),
			v.literal("contacted"),
			v.literal("quoted"),
			v.literal("converted"),
			v.literal("archived")
		),

		// Links to whatever the lead became
		taskId: v.optional(v.id("tasks")), // follow-up task created alongside the lead
		clientId: v.optional(v.id("clients")), // set by the explicit "Add as client" promotion

		submittedAt: v.number(),
		statusUpdatedAt: v.optional(v.number()),
		// Stamped once, the first time the lead leaves "new". statusUpdatedAt
		// keeps moving, so it cannot answer "how fast did we respond?".
		firstRespondedAt: v.optional(v.number()),
	})
		.index("by_org", ["orgId"])
		.index("by_org_status", ["orgId", "status"])
		.index("by_page", ["communityPageId"]),

	// Community page views — daily buckets, not one row per visit. A public page
	// can be hit far more often than it is edited, and the dashboard only ever
	// asks for day totals, so per-visit rows would grow without bound and buy
	// nothing. `day` is a UTC "YYYY-MM-DD" key.
	communityPageViews: defineTable({
		orgId: v.id("organizations"),
		communityPageId: v.id("communityPages"),
		day: v.string(),
		// Traffic channel, classified server-side in recordView — never a raw
		// referrer string. Absent on rows written before P5b; read as "direct".
		source: v.optional(
			v.union(
				v.literal("qr"),
				v.literal("link"),
				v.literal("search"),
				v.literal("social"),
				v.literal("referral"),
				v.literal("direct")
			)
		),
		count: v.number(),
	})
		.index("by_org_day", ["orgId", "day"])
		.index("by_page_day_source", ["communityPageId", "day", "source"]),

	// Reports - saved report configurations
	reports: defineTable({
		orgId: v.id("organizations"),
		createdBy: v.id("users"),
		name: v.string(),
		description: v.optional(v.string()),

		// Report configuration (what data to fetch)
		config: v.object({
			entityType: v.union(
				v.literal("clients"),
				v.literal("projects"),
				v.literal("tasks"),
				v.literal("quotes"),
				v.literal("invoices"),
				v.literal("activities")
			),
			filters: v.optional(v.any()), // Dynamic filter conditions
			aggregations: v.optional(
				v.array(
					v.object({
						field: v.string(),
						operation: v.union(
							v.literal("count"),
							v.literal("sum"),
							v.literal("avg"),
							v.literal("min"),
							v.literal("max")
						),
					})
				)
			),
			groupBy: v.optional(v.array(v.string())),
			columns: v.optional(v.array(v.string())),
			dateRange: v.optional(
				v.object({
					start: v.optional(v.number()),
					end: v.optional(v.number()),
				})
			),
		}),

		// Visualization settings
		visualization: v.object({
			type: v.union(
				v.literal("table"),
				v.literal("bar"),
				v.literal("column"),
				v.literal("line"),
				v.literal("pie"),
				v.literal("radar"),
				v.literal("radial")
			),
			options: v.optional(v.any()),
		}),

		// Metadata
		createdAt: v.number(),
		updatedAt: v.number(),
		isPublic: v.optional(v.boolean()), // Share within org
	})
		.index("by_org", ["orgId"])
		.index("by_creator", ["createdBy"]),

	// Domain Events - Event-driven architecture event store
	domainEvents: defineTable({
		orgId: v.id("organizations"),
		// Event metadata
		eventType: v.string(), // e.g., "entity.status_changed", "automation.triggered"
		eventSource: v.string(), // e.g., "quotes.update", "projects.update"
		// Event payload
		payload: v.object({
			entityType: v.union(
				v.literal("client"),
				v.literal("project"),
				v.literal("quote"),
				v.literal("invoice"),
				v.literal("task")
			),
			entityId: v.string(),
			field: v.optional(v.string()),
			oldValue: v.optional(v.any()),
			newValue: v.optional(v.any()),
			metadata: v.optional(v.any()), // Additional context
		}),
		// Processing state
		status: v.union(
			v.literal("pending"),
			v.literal("processing"),
			v.literal("completed"),
			v.literal("failed")
		),
		processedAt: v.optional(v.number()),
		failedAt: v.optional(v.number()),
		errorMessage: v.optional(v.string()),
		attemptCount: v.number(),
		// Event tracing
		correlationId: v.optional(v.string()), // Groups related events
		causationId: v.optional(v.string()), // Points to triggering event
		// Timestamps
		createdAt: v.number(),
	})
		.index("by_org", ["orgId"])
		.index("by_org_status", ["orgId", "status"])
		.index("by_status", ["status", "createdAt"])
		// Fair-batch org discovery: skip-scan distinct orgIds WITH pending work.
		.index("by_status_org", ["status", "orgId"])
		.index("by_type_status", ["eventType", "status"])
		.index("by_correlation", ["correlationId"]),

	// Single-row claim doc making processEvents effectively single-flight.
	// scheduledUntil is a TTL lease (0 = no wake scheduled); generation counts
	// claims for debugging.
	eventDispatchState: defineTable({
		scheduledUntil: v.number(),
		generation: v.number(),
	}),

	// Resume/stop state for long-running backfills (one row per job name).
	// Not org-scoped: backfills sweep whole tables. `generation` fences stale
	// scheduler chains when a job is restarted; flipping `status` to "paused"
	// from the dashboard stops the chain at the next batch.
	backfillState: defineTable({
		name: v.string(),
		status: v.union(
			v.literal("running"),
			v.literal("paused"),
			v.literal("done"),
			v.literal("failed")
		),
		generation: v.number(),
		// Index into the job's step list; step-local pagination cursor.
		step: v.number(),
		cursor: v.union(v.string(), v.null()),
		// Per-step one-time prep (aggregate clear) already ran.
		prepared: v.boolean(),
		processed: v.number(),
		// Rows actually written (processed minus no-op skips); jobs that only
		// repair drift use it to prove idempotency.
		written: v.optional(v.number()),
		errors: v.array(v.string()),
		// Recorded messages are capped; errorCount is the true total.
		errorCount: v.optional(v.number()),
		startedAt: v.number(),
		updatedAt: v.number(),
	}).index("by_name", ["name"]),

	// Workflow Automations - main automation definition
	workflowAutomations: defineTable({
		orgId: v.id("organizations"),
		name: v.string(),
		description: v.optional(v.string()),
		// Lifecycle: draft (never published), active (published + running),
		// paused (published but not firing).
		status: v.optional(automationStatusValidator),

		// Trigger definition (v2 union; see lib/workflowTypes.ts)
		trigger: triggerValidator,

		// Workflow nodes: flat array linked via nextNodeId/elseNodeId/bodyStartNodeId
		nodes: v.array(workflowNodeValidator),

		// Reusable named formula resources referenced as formula.<id>.
		formulas: v.optional(v.array(formulaResourceValidator)),

		// Immutable copy executed in production; the editor edits the working
		// copy above and `publish` refreshes this snapshot.
		publishedSnapshot: v.optional(
			v.object({
				trigger: triggerValidator,
				nodes: v.array(workflowNodeValidator),
				formulas: v.optional(v.array(formulaResourceValidator)),
				version: v.number(),
				publishedAt: v.number(),
			})
		),

		// Next due time for scheduled triggers (epoch ms); maintained on
		// publish/update and by the dispatch cron.
		nextRunAt: v.optional(v.number()),

		// Tracking
		createdBy: v.id("users"),
		createdAt: v.number(),
		updatedAt: v.number(),
		// DEPRECATED run counters — superseded by automationRunStats (writes go
		// there; reads overlay stats onto these docs). Kept as the seed/fallback
		// for automations that haven't run since the split.
		lastTriggeredAt: v.optional(v.number()),
		triggerCount: v.optional(v.number()),
	})
		.index("by_org", ["orgId"])
		.index("by_org_status", ["orgId", "status"])
		.index("by_status_nextRunAt", ["status", "nextRunAt"]),

	// Per-automation run counters, kept OFF workflowAutomations: every walk
	// chunk reads its automation doc, so counter writes there OCC-invalidate
	// all in-flight runs of a burst-triggered automation. One row per
	// automation, bumped by automationExecutor.bumpTriggerStats.
	automationRunStats: defineTable({
		orgId: v.id("organizations"),
		automationId: v.id("workflowAutomations"),
		lastTriggeredAt: v.number(),
		triggerCount: v.number(),
	})
		.index("by_automation", ["automationId"])
		.index("by_org", ["orgId"]),

	// Workflow Execution Logs - tracks automation execution history
	workflowExecutions: defineTable({
		orgId: v.id("organizations"),
		automationId: v.id("workflowAutomations"),
		triggeredBy: v.string(),
		triggeredAt: v.number(),
		status: v.union(
			v.literal("running"),
			v.literal("completed"),
			// Ran to the end, but a loop configured to continue skipped one or
			// more failing items. See loopSummary for which.
			v.literal("completed_with_errors"),
			v.literal("failed"),
			v.literal("skipped"),
			v.literal("cancelled")
		),
		completedAt: v.optional(v.number()),
		// Accumulated parked (delay) wall time, excluded from the derived
		// activeMs latency metric. activeMs = (completedAt - triggeredAt) - pausedMs.
		pausedMs: v.optional(v.number()),
		// production = fired by a real trigger; test = editor test run
		mode: v.optional(v.union(v.literal("production"), v.literal("test"))),
		// Test runs are dry runs: actions are simulated, nothing is written.
		dryRun: v.optional(v.boolean()),
		// Node currently executing (streamed test runs); cleared on completion.
		currentNodeId: v.optional(v.string()),
		// publishedSnapshot.version this run executed (production runs).
		snapshotVersion: v.optional(v.number()),
		// The record a test/manual run was started against.
		triggerRecord: v.optional(
			v.object({
				entityType: v.string(),
				entityId: v.string(),
				label: v.optional(v.string()),
			})
		),
		nodesExecuted: v.array(executedNodeValidator),
		// True when any node in this run consumed a fetch scan that stopped at
		// its scan cap with org rows still unscanned — results may be partial.
		dataTruncated: v.optional(v.boolean()),
		// Per-loop item tallies. Authoritative (nodesExecuted truncates and
		// compacts); drives the partial-progress banner and the terminal status.
		loopSummary: v.optional(v.array(loopSummaryValidator)),
		// Test runs (dry-run) precompute the full walk, then reveal one entry
		// per transaction so the getExecution subscription streams per-node
		// status live. `plan` holds the remaining-and-revealed ordered entries;
		// the number already revealed equals nodesExecuted.length.
		testCursor: v.optional(
			v.object({
				plan: v.array(executedNodeValidator),
				// Decided when the plan is built: a failed entry no longer implies a
				// failed run (a loop set to continue records it and carries on), and
				// the revealed entries alone can't tell the two apart.
				terminalStatus: v.optional(
					v.union(
						v.literal("completed"),
						v.literal("completed_with_errors"),
						v.literal("failed")
					)
				),
			})
		),
		error: v.optional(v.string()),
		// Recursion tracking - chain of automation IDs that led to this execution
		executionChain: v.optional(v.array(v.id("workflowAutomations"))),
		// Depth of recursion (for quick limit check)
		recursionDepth: v.optional(v.number()),
		// Delay/delay_until checkpoint: enough state to resume the walk after
		// the scheduled wait. Fetch outputs are stored as record ids and
		// re-resolved on resume (deleted records are skipped).
		resumeState: v.optional(
			v.object({
				resumeNodeId: v.string(),
				resumeAt: v.number(),
				// Wall-clock time the run was parked at this delay; on resume the
				// elapsed (now - checkpointAt) is added to pausedMs.
				checkpointAt: v.optional(v.number()),
				eventOldValue: v.optional(v.string()),
				eventNewValue: v.optional(v.string()),
				objectType: v.optional(triggerableObjectTypeValidator),
				objectId: v.optional(v.string()),
				fetchOutputs: v.array(
					v.object({
						nodeId: v.string(),
						objectType: objectTypeValidator,
						recordIds: v.array(v.string()),
						count: v.number(),
					})
				),
				// aggregate/adjust_time results computed before the delay, so
				// node.<id>.result still resolves after the run resumes.
				nodeResults: v.optional(
					v.array(v.object({ nodeId: v.string(), result: v.number() }))
				),
				// Present when parked at a loop chunk boundary (long loops run
				// LOOP_CHUNK_SIZE iterations per mutation, commit-per-chunk).
				loop: v.optional(
					v.object({
						nodeId: v.string(),
						// Original position of the first remaining item, so
						// loop.<id>.index stays stable across chunks.
						nextIndex: v.number(),
						// Items not yet processed; ids deleted between chunks are
						// skipped on resume without shifting the rest.
						remainingItemIds: v.array(v.string()),
					})
				),
			})
		),
		// De-dupe key for event-retry re-dispatch: `${domainEvents._id}:${automationId}`.
		// Set only on event-driven runs (matchAndScheduleAutomations); absent on
		// manual/scheduled runs, which have no retryable source event.
		dedupeKey: v.optional(v.string()),
		// Watchdog rescues consumed by this run (failStaleProductionRuns): a
		// missed-wake resume or a zero-progress re-drive. Bounds both so a run
		// can't be rescued forever.
		attemptCount: v.optional(v.number()),
		// Snapshot of the args executeAutomation was first scheduled with —
		// enough to re-drive it from scratch if its very first mutation never
		// committed (executionChain/recursionDepth already live on the row).
		// Set by matchAndScheduleAutomations (event-driven runs only); absent on
		// manual/scheduled runs, which the watchdog still terminally fails.
		startArgs: v.optional(
			v.object({
				objectType: triggerableObjectTypeValidator,
				objectId: v.string(),
				eventOldValue: v.optional(v.string()),
				eventNewValue: v.optional(v.string()),
			})
		),
	})
		.index("by_org", ["orgId"])
		.index("by_automation", ["automationId"])
		.index("by_org_triggeredAt", ["orgId", "triggeredAt"])
		.index("by_org_status_triggeredAt", ["orgId", "status", "triggeredAt"])
		.index("by_triggeredAt", ["triggeredAt"])
		// Retention cleanup: lets terminal-status rows be ranged by age without
		// re-scanning stuck "running" rows on every pass.
		.index("by_status_triggeredAt", ["status", "triggeredAt"])
		.index("by_org_dedupeKey", ["orgId", "dedupeKey"]),

	// Client Documents - files uploaded directly to client records
	clientDocuments: defineTable({
		orgId: v.id("organizations"),
		clientId: v.id("clients"),

		// Document metadata
		name: v.string(), // User-friendly display name
		fileName: v.string(), // Original filename
		fileSize: v.number(), // Size in bytes
		mimeType: v.string(),

		// Storage
		storageId: v.id("_storage"),

		// Tracking
		uploadedAt: v.number(),
		uploadedBy: v.id("users"),
	})
		.index("by_org", ["orgId"])
		.index("by_client", ["clientId"])
		.index("by_client_uploaded", ["clientId", "uploadedAt"]),

	// Project Documents - files uploaded directly to project records
	projectDocuments: defineTable({
		orgId: v.id("organizations"),
		projectId: v.id("projects"),

		// Document metadata
		name: v.string(), // User-friendly display name
		fileName: v.string(), // Original filename
		fileSize: v.number(), // Size in bytes
		mimeType: v.string(),

		// Storage
		storageId: v.id("_storage"),

		// Tracking
		uploadedAt: v.number(),
		uploadedBy: v.id("users"),
	})
		.index("by_org", ["orgId"])
		.index("by_project", ["projectId"])
		.index("by_project_uploaded", ["projectId", "uploadedAt"]),

	// User Favorites - user-specific client favorites
	userFavorites: defineTable({
		userId: v.id("users"),
		orgId: v.id("organizations"),
		clientId: v.id("clients"),
		createdAt: v.number(),
	})
		.index("by_user_org", ["userId", "orgId"])
		.index("by_user_client", ["userId", "clientId"])
		// by_org: drained by the org-deletion cascade.
		.index("by_org", ["orgId"]),

	// Portal OTP codes — short-lived 6-digit codes for portal sign-in
	// (PORTAL-01, PORTAL-04). One row per (clientPortalId, email) request.
	portalOtpCodes: defineTable({
		orgId: v.id("organizations"),
		clientId: v.id("clients"),
		clientContactId: v.id("clientContacts"),
		// Mirror of clients.portalAccessId — narrows OTP lookup to a specific
		// portal link [Review fix #7].
		clientPortalId: v.string(),
		// Normalized lowercase email.
		email: v.string(),
		// SHA-256(code || ":" || salt) hex.
		codeHash: v.string(),
		salt: v.string(),
		attempts: v.number(),
		// Date.now() + 10 * 60 * 1000.
		expiresAt: v.number(),
		createdAt: v.number(),
	})
		// [Review fix #7] PRIMARY lookup index: scoped by clientPortalId (UUID
		// from email link) + email, so a contact email shared across multiple
		// clients in the same org cannot cross-contaminate OTP rows.
		.index("by_portal_and_email", ["clientPortalId", "email"])
		// Kept for legacy diagnostic queries; NOT used by Plan 03 verifyOtp.
		.index("by_email_and_org", ["email", "orgId"])
		.index("by_contact", ["clientContactId"])
		.index("by_expires", ["expiresAt"])
		// by_org: drained by the org-deletion cascade.
		.index("by_org", ["orgId"]),

	// Portal sessions — one row per active device session (PORTAL-03,
	// multi-device allowed; revocation by jti).
	portalSessions: defineTable({
		orgId: v.id("organizations"),
		clientId: v.id("clients"),
		clientContactId: v.id("clientContacts"),
		// Mirror of clients.portalAccessId at issue time.
		clientPortalId: v.string(),
		// Unique JWT ID for revocation lookup.
		tokenJti: v.string(),
		createdAt: v.number(),
		lastActivityAt: v.number(),
		// createdAt + 24 * 60 * 60 * 1000 initially; sliding refresh updates.
		expiresAt: v.number(),
		userAgent: v.optional(v.string()),
		// SHA-256 of the IP for audit without storing PII.
		ipHash: v.optional(v.string()),
	})
		.index("by_contact", ["clientContactId"])
		.index("by_jti", ["tokenJti"])
		.index("by_expires", ["expiresAt"])
		// by_org: drained by the org-deletion cascade.
		.index("by_org", ["orgId"]),

	// Stripe Connect webhook event ledger.
	stripeWebhookEvents: defineTable({
		stripeEventId: v.string(),
		eventType: v.string(),
		accountId: v.optional(v.string()),
		status: v.union(
			v.literal("received"),
			v.literal("processing"),
			v.literal("processed"),
			v.literal("failed")
		),
		receivedAt: v.number(),
		processedAt: v.optional(v.number()),
		failedAt: v.optional(v.number()),
		failureReason: v.optional(v.string()),
		attemptCount: v.number(),
	})
		.index("by_stripe_event_id", ["stripeEventId"])
		.index("by_status", ["status"]),

	// App-side metadata for AI assistant threads. The @convex-dev/agent
	// component owns the threads/messages themselves; this table lets us list
	// and authorize threads through our own org-scoped queries.
	agentThreadMeta: defineTable({
		threadId: v.string(),
		orgId: v.id("organizations"),
		userId: v.id("users"),
		title: v.optional(v.string()),
		lastMessageAt: v.number(),
	})
		.index("by_thread", ["threadId"])
		.index("by_org_user", ["orgId", "userId", "lastMessageAt"]),

	// Per-generation token usage from the assistant's usageHandler.
	agentUsage: defineTable({
		orgId: v.optional(v.id("organizations")),
		userId: v.optional(v.id("users")),
		threadId: v.optional(v.string()),
		agentName: v.optional(v.string()),
		model: v.string(),
		provider: v.string(),
		inputTokens: v.number(),
		outputTokens: v.number(),
		totalTokens: v.number(),
	}).index("by_org", ["orgId"]),

	// QuickBooks Online connection — one per org, one org per realm
	quickbooksConnections: defineTable({
		orgId: v.id("organizations"),
		realmId: v.string(), // QBO company ID, required on every API URL
		environment: v.union(v.literal("sandbox"), v.literal("production")),

		// OAuth tokens. Intuit rotates the refresh token — always overwrite
		// with the value from the latest token response.
		accessToken: v.string(),
		accessTokenExpiresAt: v.number(),
		refreshToken: v.string(),
		refreshTokenExpiresAt: v.number(),

		status: v.union(
			v.literal("connected"),
			v.literal("needs_reauth"), // refresh failed / invalid_grant
			v.literal("disconnected")
		),
		connectedByUserId: v.id("users"),
		companyName: v.optional(v.string()), // from CompanyInfo, display only
		lastHealthCheckAt: v.optional(v.number()),

		// Sync settings (Jobber/Workiz-style toggles)
		syncInvoicesOn: v.union(v.literal("sent"), v.literal("created")),
		syncPayments: v.boolean(),
		autoDisambiguateNames: v.boolean(), // append " - 2" on 6240 collisions

		// QBO account/item mappings resolved during setup
		incomeAccountQboId: v.optional(v.string()),
		incomeAccountName: v.optional(v.string()),
		depositAccountQboId: v.optional(v.string()), // Undeposited Funds
		defaultServiceItemQboId: v.optional(v.string()), // "OneTool Service"
	})
		.index("by_org", ["orgId"])
		.index("by_realm", ["realmId"]),

	// OneTool entity ↔ QBO entity mapping (survives disconnect/reconnect)
	quickbooksEntityLinks: defineTable({
		orgId: v.id("organizations"),
		entityType: v.union(
			v.literal("client"),
			v.literal("invoice"),
			v.literal("payment"),
			v.literal("sku")
		),
		localId: v.string(), // Id<"clients"> | Id<"invoices"> | Id<"payments"> | Id<"skus">
		qboId: v.string(),
		qboSyncToken: v.string(), // optimistic-concurrency token, updated on every write
		lastSyncedAt: v.number(),
		syncWarning: v.optional(v.string()), // e.g. AST overrode tax amount
	})
		.index("by_org_entity", ["orgId", "entityType", "localId"])
		.index("by_org_qbo", ["orgId", "entityType", "qboId"]),

	// Durable sync queue with retry state
	quickbooksSyncJobs: defineTable({
		orgId: v.id("organizations"),
		entityType: v.union(
			v.literal("client"),
			v.literal("invoice"),
			v.literal("payment"),
			v.literal("sku")
		),
		localId: v.string(),
		operation: v.union(v.literal("upsert"), v.literal("void")),
		status: v.union(
			v.literal("pending"),
			v.literal("processing"),
			v.literal("succeeded"),
			v.literal("failed"), // exhausted retries — shows in error center
			v.literal("ignored") // user dismissed
		),
		attempts: v.number(),
		runAfter: v.number(), // backoff gate; worker skips jobs not yet due
		// Stamped when the worker flips a job to "processing"; the 15-minute
		// sweep reclaims jobs stranded in that state.
		claimedAt: v.optional(v.number()),
		failedAt: v.optional(v.number()), // terminal-failure time, error center sort
		lastError: v.optional(v.string()), // human-readable, shown in error center
		lastErrorCode: v.optional(v.string()), // QBO Fault code, e.g. "6240"
		dedupeKey: v.string(), // `${entityType}:${localId}` — collapse duplicate pending jobs
	})
		.index("by_org_status", ["orgId", "status"])
		.index("by_org_status_due", ["orgId", "status", "runAfter"])
		.index("by_status_due", ["status", "runAfter"])
		.index("by_org_dedupe", ["orgId", "dedupeKey", "status"]),

	// One-time QBO→OneTool customer import (wizard shown at connect). Kept
	// separate from quickbooksSyncJobs: different lifecycle (bounded run, not a
	// durable queue) and rows carry per-row human resolution actions.
	quickbooksImportRuns: defineTable({
		orgId: v.id("organizations"),
		realmId: v.string(),
		status: v.union(
			v.literal("running"), // fetching + matching QBO customers
			v.literal("reviewing"), // proposals written, waiting on the reviewer
			v.literal("committing"), // applying decisions page by page
			v.literal("awaiting_review"), // legacy: ambiguous rows need human picks
			v.literal("completed"),
			v.literal("failed")
		),
		startedByUserId: v.id("users"),
		startedAt: v.number(),
		completedAt: v.optional(v.number()),
		// Denormalized counters for the wizard progress/summary UI. The final
		// counters below are the post-commit truth; proposed* describe the plan.
		totalFetched: v.number(),
		autoLinked: v.number(),
		imported: v.number(),
		ambiguous: v.number(),
		skipped: v.number(),
		proposedLink: v.optional(v.number()),
		proposedImport: v.optional(v.number()),
		proposedSkip: v.optional(v.number()),
		proposedProperty: v.optional(v.number()),
		properties: v.optional(v.number()), // final: job sites created from sub-customers
		committedRows: v.optional(v.number()), // commit-loop progress
		// Stamped when the commit loop starts; a review can sit for days, so the
		// stalled-commit reclaim can't measure against startedAt.
		committingAt: v.optional(v.number()),
		lastError: v.optional(v.string()),
	}).index("by_org", ["orgId"]),

	quickbooksImportRows: defineTable({
		orgId: v.id("organizations"),
		runId: v.id("quickbooksImportRuns"),
		qboId: v.string(), // QBO Customer.Id
		qboDisplayName: v.string(),
		qboEmail: v.optional(v.string()),
		qboCompanyName: v.optional(v.string()),
		outcome: v.union(
			// Proposals written by the fetch pass — no client data touched yet.
			v.literal("proposed_link"), // one confident match, in linkedClientId
			v.literal("proposed_import"), // no match — would create a client
			v.literal("proposed_skip"), // sub-customer with no address; not overridable
			v.literal("proposed_property"), // sub-customer with an address — a job site
			v.literal("ambiguous"), // multiple candidates — needs a human pick
			// Final outcomes, written by the commit pass.
			v.literal("auto_linked"), // link written
			v.literal("imported"), // created as a new OneTool client
			v.literal("property_created"), // job site added to the parent's client
			v.literal("resolved"), // legacy: human picked a candidate pre-rework
			v.literal("skipped") // sub-customer, or user chose Don't import
		),
		// Fields the commit pass needs to create a client, captured at fetch time
		// (the QBO payload is long gone by the time the reviewer commits).
		qboSnapshot: v.optional(
			v.object({
				phone: v.optional(v.string()),
				givenName: v.optional(v.string()),
				familyName: v.optional(v.string()),
				billAddr: v.optional(
					v.object({
						line1: v.optional(v.string()),
						city: v.optional(v.string()),
						state: v.optional(v.string()),
						postalCode: v.optional(v.string()),
						country: v.optional(v.string()),
					})
				),
			})
		),
		candidateClientIds: v.optional(v.array(v.id("clients"))), // ambiguous only
		linkedClientId: v.optional(v.id("clients")),
		// proposed_property only: the QBO Customer.Id of the job's parent, plus
		// its display name captured at fetch time so the review table needs no
		// extra lookup.
		parentQboId: v.optional(v.string()),
		parentDisplayName: v.optional(v.string()),
		// Reviewer override; unset means "accept the proposal".
		decision: v.optional(
			v.union(v.literal("link"), v.literal("import"), v.literal("skip"))
		),
		decisionClientId: v.optional(v.id("clients")), // decision === "link"
		skipReason: v.optional(v.string()), // "sub_customer" | "user_skipped"
	})
		.index("by_run", ["runId"])
		.index("by_run_outcome", ["runId", "outcome"])
		.index("by_run_qbo", ["runId", "qboId"])
		.index("by_org", ["orgId"]),
});
