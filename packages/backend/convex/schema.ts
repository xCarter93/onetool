import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

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
		plan: v.optional(
			v.union(v.literal("trial"), v.literal("pro"), v.literal("cancelled"))
		), // Deprecated: Use Clerk billing fields instead

		// Settings
		monthlyRevenueTarget: v.optional(v.number()), // Monthly Revenue target displayed on home page
		timezone: v.optional(v.string()), // IANA timezone (e.g., "America/New_York")

		// Sequential numbering counters
		lastQuoteNumber: v.optional(v.number()), // Last used quote number for sequential generation

		// Metadata flags
		isMetadataComplete: v.optional(v.boolean()), // Whether user completed additional onboarding
	})
		.index("by_owner", ["ownerUserId"])
		.index("by_clerk_org", ["clerkOrganizationId"])
		.index("by_receiving_address", ["receivingAddress"]),

	organizationMemberships: defineTable({
		orgId: v.id("organizations"),
		userId: v.id("users"),
		role: v.optional(v.string()), // role from Clerk membership payload
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

		// Archive functionality
		archivedAt: v.optional(v.number()), // Timestamp when client was archived
	})
		.index("by_org", ["orgId"])
		.index("by_status", ["orgId", "status"]),

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
	})
		.index("by_client", ["clientId"])
		.index("by_org", ["orgId"])
		.index("by_primary", ["clientId", "isPrimary"]),

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
	})
		.index("by_client", ["clientId"])
		.index("by_org", ["orgId"])
		.index("by_primary", ["clientId", "isPrimary"]),

	// Projects
	projects: defineTable({
		orgId: v.id("organizations"),
		clientId: v.id("clients"),

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
	})
		.index("by_org", ["orgId"])
		.index("by_client", ["clientId"])
		.index("by_status", ["orgId", "status"]),

	// Tasks/Schedule items
	tasks: defineTable({
		orgId: v.id("organizations"),
		projectId: v.optional(v.id("projects")),
		clientId: v.optional(v.id("clients")), // Optional to support internal tasks
		type: v.optional(v.union(v.literal("internal"), v.literal("external"))),

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
	})
		.index("by_org", ["orgId"])
		.index("by_project", ["projectId"])
		.index("by_client", ["clientId"])
		.index("by_assignee", ["assigneeUserId"])
		.index("by_date", ["orgId", "date"])
		.index("by_parent_task", ["parentTaskId"]),

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

		// Financial
		subtotal: v.number(),
		discountEnabled: v.optional(v.boolean()),
		discountAmount: v.optional(v.number()),
		discountType: v.optional(
			v.union(v.literal("percentage"), v.literal("fixed"))
		),
		taxEnabled: v.optional(v.boolean()),
		taxRate: v.optional(v.number()), // Percentage
		taxAmount: v.optional(v.number()),
		total: v.number(),

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

		// Reference to the latest document version
		latestDocumentId: v.optional(v.id("documents")),

		// Countersignature settings
		requiresCountersignature: v.optional(v.boolean()),
		countersignerId: v.optional(v.id("users")),
		signingOrder: v.optional(
			v.union(v.literal("client_first"), v.literal("org_first"))
		),
	})
		.index("by_org", ["orgId"])
		.index("by_client", ["clientId"])
		.index("by_project", ["projectId"])
		.index("by_status", ["orgId", "status"]),

	// Quote Line Items
	quoteLineItems: defineTable({
		quoteId: v.id("quotes"),
		orgId: v.id("organizations"),

		description: v.string(),
		quantity: v.number(),
		unit: v.string(), // e.g., "hour", "item", "day"
		rate: v.number(), // Unit price
		amount: v.number(), // quantity * rate
		cost: v.optional(v.number()), // Cost per unit for margin calculation

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

		// Financial
		subtotal: v.number(),
		discountAmount: v.optional(v.number()),
		taxAmount: v.optional(v.number()),
		total: v.number(),

		// Dates
		issuedDate: v.number(),
		dueDate: v.number(),
		paidAt: v.optional(v.number()),

		// Payment
		stripeSessionId: v.optional(v.string()),
		stripePaymentIntentId: v.optional(v.string()),

		publicToken: v.string(), // For client payment access
	})
		.index("by_org", ["orgId"])
		.index("by_client", ["clientId"])
		.index("by_project", ["projectId"])
		.index("by_quote", ["quoteId"])
		.index("by_status", ["orgId", "status"])
		.index("by_due_date", ["orgId", "dueDate"])
		.index("by_public_token", ["publicToken"]),

	// Invoice Line Items
	invoiceLineItems: defineTable({
		invoiceId: v.id("invoices"),
		orgId: v.id("organizations"),

		description: v.string(),
		quantity: v.number(),
		unitPrice: v.number(),
		total: v.number(), // quantity * unitPrice

		sortOrder: v.number(),
	})
		.index("by_invoice", ["invoiceId"])
		.index("by_org", ["orgId"]),

	// Payments - individual payment installments for invoices
	payments: defineTable({
		orgId: v.id("organizations"),
		invoiceId: v.id("invoices"),

		// Payment details
		paymentAmount: v.number(),
		dueDate: v.number(),
		description: v.optional(v.string()), // e.g., "Deposit", "Final Payment", "Milestone 1"

		// Sequential ordering
		sortOrder: v.number(),

		// Status tracking
		status: v.union(
			v.literal("pending"),
			v.literal("sent"),
			v.literal("paid"),
			v.literal("overdue"),
			v.literal("cancelled")
		),
		paidAt: v.optional(v.number()),

		// Public access token for payment URL
		publicToken: v.string(),

		// Stripe integration
		stripeSessionId: v.optional(v.string()),
		stripePaymentIntentId: v.optional(v.string()),
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
				viewUrl: v.optional(v.string()), // Link to view document in BoldSign
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
			v.literal("user_invited"),
			v.literal("user_removed"),
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
			v.literal("quote_mention")
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
	})
		.index("by_user_read", ["userId", "isRead"])
		.index("by_org", ["orgId"])
		.index("by_scheduled", ["scheduledFor"])
		.index("by_type", ["notificationType"]),

	// Organization Documents - reusable documents for quotes/invoices
	organizationDocuments: defineTable({
		orgId: v.id("organizations"),

		// Document metadata
		name: v.string(), // User-friendly name
		description: v.optional(v.string()), // Optional description

		// Storage
		storageId: v.id("_storage"), // Reference to stored PDF
		fileSize: v.optional(v.number()), // Size in bytes

		// Tracking
		uploadedAt: v.number(),
		uploadedBy: v.id("users"),
	})
		.index("by_org", ["orgId"])
		.index("by_org_uploaded", ["orgId", "uploadedAt"]),

	// SKUs - reusable stock keeping units for quotes
	skus: defineTable({
		orgId: v.id("organizations"),

		// SKU details
		name: v.string(), // Acts as description when used in quotes
		unit: v.string(), // Default unit (e.g., "hour", "item", "day")
		rate: v.number(), // Default price/rate
		cost: v.optional(v.number()), // Optional cost for margin calculation

		// Status
		isActive: v.boolean(), // Allow soft deletion

		// Tracking
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_org", ["orgId"])
		.index("by_org_active", ["orgId", "isActive"]),

	// Message Attachments - files attached to mention messages
	messageAttachments: defineTable({
		orgId: v.id("organizations"),
		notificationId: v.id("notifications"),
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
		.index("by_org", ["orgId"])
		.index("by_uploader", ["uploadedBy"])
		.index("by_entity", ["entityType", "entityId"]) // NEW: Efficient lookup for "all attachments on entity X"
		.index("by_org_entity", ["orgId", "entityType", "entityId"]), // NEW: Org-scoped entity lookup

	// Service Status - monitoring for external service health
	serviceStatus: defineTable({
		serviceName: v.string(), // "convex_database", "convex_functions", "clerk_auth", "clerk_billing"
		provider: v.string(), // "convex" or "clerk"
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
		clientId: v.id("clients"),
		resendEmailId: v.string(), // Resend's email ID for tracking

		// Direction and threading
		direction: v.union(v.literal("outbound"), v.literal("inbound")),
		threadId: v.optional(v.string()), // Thread identifier for grouping related emails
		inReplyTo: v.optional(v.string()), // Message-ID this email is replying to (RFC 5322)
		references: v.optional(v.array(v.string())), // Full chain of message IDs in thread

		// Email content
		subject: v.string(),
		messageBody: v.string(), // Plain text body or HTML for outbound
		messagePreview: v.optional(v.string()), // First 100 chars for display
		htmlBody: v.optional(v.string()), // HTML body for received emails
		textBody: v.optional(v.string()), // Plain text body for received emails

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
			v.literal("complained")
		),

		// Timestamps
		sentAt: v.number(),
		deliveredAt: v.optional(v.number()),
		openedAt: v.optional(v.number()),
		bouncedAt: v.optional(v.number()),
		complainedAt: v.optional(v.number()),

		// Tracking
		sentBy: v.optional(v.id("users")), // User who sent the email (optional for inbound)
	})
		.index("by_org", ["orgId"])
		.index("by_client", ["clientId"])
		.index("by_resend_id", ["resendEmailId"])
		.index("by_org_status", ["orgId", "status"])
		.index("by_client_status", ["clientId", "status"])
		.index("by_thread", ["threadId", "sentAt"]),

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
				v.literal("line"),
				v.literal("pie")
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
		.index("by_type_status", ["eventType", "status"])
		.index("by_correlation", ["correlationId"]),

	// Workflow Automations - main automation definition
	workflowAutomations: defineTable({
		orgId: v.id("organizations"),
		name: v.string(),
		description: v.optional(v.string()),
		isActive: v.boolean(),

		// Trigger definition
		trigger: v.object({
			objectType: v.union(
				v.literal("client"),
				v.literal("project"),
				v.literal("quote"),
				v.literal("invoice"),
				v.literal("task")
			),
			fromStatus: v.optional(v.string()), // Optional: specific "from" status
			toStatus: v.string(), // Required: target status
		}),

		// Workflow nodes (linear with conditional branches)
		nodes: v.array(
			v.object({
				id: v.string(),
				type: v.union(v.literal("condition"), v.literal("action")),
				// Condition node fields
				condition: v.optional(
					v.object({
						field: v.string(), // e.g., "priorityLevel", "projectType"
						operator: v.union(
							v.literal("equals"),
							v.literal("not_equals"),
							v.literal("contains"),
							v.literal("exists")
						),
						value: v.any(),
					})
				),
				// Action node fields
				action: v.optional(
					v.object({
						targetType: v.union(
							v.literal("self"),
							v.literal("project"),
							v.literal("client"),
							v.literal("quote"),
							v.literal("invoice")
						),
						actionType: v.literal("update_status"),
						newStatus: v.string(),
					})
				),
				// Flow control
				nextNodeId: v.optional(v.string()),
				elseNodeId: v.optional(v.string()), // For condition nodes
			})
		),

		// Tracking
		createdBy: v.id("users"),
		createdAt: v.number(),
		updatedAt: v.number(),
		lastTriggeredAt: v.optional(v.number()),
		triggerCount: v.optional(v.number()),
	})
		.index("by_org", ["orgId"])
		.index("by_org_active", ["orgId", "isActive"]),

	// Workflow Execution Logs - tracks automation execution history
	workflowExecutions: defineTable({
		orgId: v.id("organizations"),
		automationId: v.id("workflowAutomations"),
		triggeredBy: v.string(), // ID of the object that triggered it
		triggeredAt: v.number(),
		status: v.union(
			v.literal("running"),
			v.literal("completed"),
			v.literal("failed"),
			v.literal("skipped")
		),
		completedAt: v.optional(v.number()),
		nodesExecuted: v.array(
			v.object({
				nodeId: v.string(),
				result: v.union(
					v.literal("success"),
					v.literal("skipped"),
					v.literal("failed")
				),
				error: v.optional(v.string()),
			})
		),
		error: v.optional(v.string()),
		// Recursion tracking - chain of automation IDs that led to this execution
		executionChain: v.optional(v.array(v.id("workflowAutomations"))),
		// Depth of recursion (for quick limit check)
		recursionDepth: v.optional(v.number()),
	})
		.index("by_org", ["orgId"])
		.index("by_automation", ["automationId"])
		.index("by_org_triggeredAt", ["orgId", "triggeredAt"]),

	// User Favorites - user-specific client favorites
	userFavorites: defineTable({
		userId: v.id("users"),
		orgId: v.id("organizations"),
		clientId: v.id("clients"),
		createdAt: v.number(),
	})
		.index("by_user_org", ["userId", "orgId"])
		.index("by_user_client", ["userId", "clientId"]),
});
