/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as __tests___fixtures_stripeEvents from "../__tests__/fixtures/stripeEvents.js";
import type * as activities from "../activities.js";
import type * as aggregates from "../aggregates.js";
import type * as assistantAgent from "../assistantAgent.js";
import type * as assistantChat from "../assistantChat.js";
import type * as assistantTools from "../assistantTools.js";
import type * as automationExecutor from "../automationExecutor.js";
import type * as automations from "../automations.js";
import type * as billingWebhook from "../billingWebhook.js";
import type * as boldsign from "../boldsign.js";
import type * as boldsignActions from "../boldsignActions.js";
import type * as calendar from "../calendar.js";
import type * as clientContacts from "../clientContacts.js";
import type * as clientDocuments from "../clientDocuments.js";
import type * as clientProperties from "../clientProperties.js";
import type * as clients from "../clients.js";
import type * as communityPages from "../communityPages.js";
import type * as crons from "../crons.js";
import type * as documents from "../documents.js";
import type * as email_durableResend from "../email/durableResend.js";
import type * as email_outbound from "../email/outbound.js";
import type * as email_replyParser from "../email/replyParser.js";
import type * as email_suppressions from "../email/suppressions.js";
import type * as email_threads from "../email/threads.js";
import type * as email_types from "../email/types.js";
import type * as emailAttachments from "../emailAttachments.js";
import type * as emailMessages from "../emailMessages.js";
import type * as emailThreads from "../emailThreads.js";
import type * as emails_portalOtp from "../emails/portalOtp.js";
import type * as eventBus from "../eventBus.js";
import type * as favorites from "../favorites.js";
import type * as homeStats from "../homeStats.js";
import type * as homeStatsOptimized from "../homeStatsOptimized.js";
import type * as http from "../http.js";
import type * as invoiceLineItems from "../invoiceLineItems.js";
import type * as invoices from "../invoices.js";
import type * as lib_activities from "../lib/activities.js";
import type * as lib_aggregates from "../lib/aggregates.js";
import type * as lib_assistantShared from "../lib/assistantShared.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_changeTracking from "../lib/changeTracking.js";
import type * as lib_conditionEval from "../lib/conditionEval.js";
import type * as lib_crud from "../lib/crud.js";
import type * as lib_factories from "../lib/factories.js";
import type * as lib_fieldRegistry from "../lib/fieldRegistry.js";
import type * as lib_formula_ast from "../lib/formula/ast.js";
import type * as lib_formula_coerce from "../lib/formula/coerce.js";
import type * as lib_formula_context from "../lib/formula/context.js";
import type * as lib_formula_errors from "../lib/formula/errors.js";
import type * as lib_formula_evaluator from "../lib/formula/evaluator.js";
import type * as lib_formula_functions from "../lib/formula/functions.js";
import type * as lib_formula_index from "../lib/formula/index.js";
import type * as lib_formula_parser from "../lib/formula/parser.js";
import type * as lib_formula_tokenizer from "../lib/formula/tokenizer.js";
import type * as lib_lineItems from "../lib/lineItems.js";
import type * as lib_memberships from "../lib/memberships.js";
import type * as lib_orgCascade from "../lib/orgCascade.js";
import type * as lib_orgScan from "../lib/orgScan.js";
import type * as lib_organization from "../lib/organization.js";
import type * as lib_payments from "../lib/payments.js";
import type * as lib_permissionKeys from "../lib/permissionKeys.js";
import type * as lib_permissions from "../lib/permissions.js";
import type * as lib_queries from "../lib/queries.js";
import type * as lib_quoteTotals from "../lib/quoteTotals.js";
import type * as lib_reportFields from "../lib/reportFields.js";
import type * as lib_reportFilters from "../lib/reportFilters.js";
import type * as lib_reportPresets from "../lib/reportPresets.js";
import type * as lib_resendClient from "../lib/resendClient.js";
import type * as lib_schedule from "../lib/schedule.js";
import type * as lib_schemaIntrospection from "../lib/schemaIntrospection.js";
import type * as lib_shared from "../lib/shared.js";
import type * as lib_storage from "../lib/storage.js";
import type * as lib_stripe from "../lib/stripe.js";
import type * as lib_webhooks from "../lib/webhooks.js";
import type * as lib_workflowTypes from "../lib/workflowTypes.js";
import type * as messageAttachments from "../messageAttachments.js";
import type * as migrations_addReceivingAddresses from "../migrations/addReceivingAddresses.js";
import type * as migrations_backfillEmailThreads from "../migrations/backfillEmailThreads.js";
import type * as migrations_backfillMemberPermissions from "../migrations/backfillMemberPermissions.js";
import type * as migrations_fixInvoiceTotals from "../migrations/fixInvoiceTotals.js";
import type * as migrations_geocodeAddresses from "../migrations/geocodeAddresses.js";
import type * as migrations_initializeQuoteCounters from "../migrations/initializeQuoteCounters.js";
import type * as migrations_populateAggregates from "../migrations/populateAggregates.js";
import type * as migrations_revalidateStripeConnectAccounts from "../migrations/revalidateStripeConnectAccounts.js";
import type * as migrations_seedServiceStatus from "../migrations/seedServiceStatus.js";
import type * as notifications from "../notifications.js";
import type * as orgCascade from "../orgCascade.js";
import type * as organizationDocuments from "../organizationDocuments.js";
import type * as organizations from "../organizations.js";
import type * as payments from "../payments.js";
import type * as portal_branding from "../portal/branding.js";
import type * as portal_email from "../portal/email.js";
import type * as portal_helpers from "../portal/helpers.js";
import type * as portal_invoices from "../portal/invoices.js";
import type * as portal_invoicesActions from "../portal/invoicesActions.js";
import type * as portal_migrations from "../portal/migrations.js";
import type * as portal_otp from "../portal/otp.js";
import type * as portal_quotes from "../portal/quotes.js";
import type * as portal_sessions from "../portal/sessions.js";
import type * as projectDocuments from "../projectDocuments.js";
import type * as projects from "../projects.js";
import type * as push from "../push.js";
import type * as quoteLineItems from "../quoteLineItems.js";
import type * as quotes from "../quotes.js";
import type * as rateLimits from "../rateLimits.js";
import type * as reportConfigGeneration from "../reportConfigGeneration.js";
import type * as reportData from "../reportData.js";
import type * as reports from "../reports.js";
import type * as resend from "../resend.js";
import type * as resendReceiving from "../resendReceiving.js";
import type * as resendWebhook from "../resendWebhook.js";
import type * as serviceStatus from "../serviceStatus.js";
import type * as serviceStatusActions from "../serviceStatusActions.js";
import type * as skus from "../skus.js";
import type * as stripePaymentActions from "../stripePaymentActions.js";
import type * as stripeWebhookActions from "../stripeWebhookActions.js";
import type * as stripeWebhookEvents from "../stripeWebhookEvents.js";
import type * as tasks from "../tasks.js";
import type * as usage from "../usage.js";
import type * as userTour from "../userTour.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "__tests__/fixtures/stripeEvents": typeof __tests___fixtures_stripeEvents;
  activities: typeof activities;
  aggregates: typeof aggregates;
  assistantAgent: typeof assistantAgent;
  assistantChat: typeof assistantChat;
  assistantTools: typeof assistantTools;
  automationExecutor: typeof automationExecutor;
  automations: typeof automations;
  billingWebhook: typeof billingWebhook;
  boldsign: typeof boldsign;
  boldsignActions: typeof boldsignActions;
  calendar: typeof calendar;
  clientContacts: typeof clientContacts;
  clientDocuments: typeof clientDocuments;
  clientProperties: typeof clientProperties;
  clients: typeof clients;
  communityPages: typeof communityPages;
  crons: typeof crons;
  documents: typeof documents;
  "email/durableResend": typeof email_durableResend;
  "email/outbound": typeof email_outbound;
  "email/replyParser": typeof email_replyParser;
  "email/suppressions": typeof email_suppressions;
  "email/threads": typeof email_threads;
  "email/types": typeof email_types;
  emailAttachments: typeof emailAttachments;
  emailMessages: typeof emailMessages;
  emailThreads: typeof emailThreads;
  "emails/portalOtp": typeof emails_portalOtp;
  eventBus: typeof eventBus;
  favorites: typeof favorites;
  homeStats: typeof homeStats;
  homeStatsOptimized: typeof homeStatsOptimized;
  http: typeof http;
  invoiceLineItems: typeof invoiceLineItems;
  invoices: typeof invoices;
  "lib/activities": typeof lib_activities;
  "lib/aggregates": typeof lib_aggregates;
  "lib/assistantShared": typeof lib_assistantShared;
  "lib/auth": typeof lib_auth;
  "lib/changeTracking": typeof lib_changeTracking;
  "lib/conditionEval": typeof lib_conditionEval;
  "lib/crud": typeof lib_crud;
  "lib/factories": typeof lib_factories;
  "lib/fieldRegistry": typeof lib_fieldRegistry;
  "lib/formula/ast": typeof lib_formula_ast;
  "lib/formula/coerce": typeof lib_formula_coerce;
  "lib/formula/context": typeof lib_formula_context;
  "lib/formula/errors": typeof lib_formula_errors;
  "lib/formula/evaluator": typeof lib_formula_evaluator;
  "lib/formula/functions": typeof lib_formula_functions;
  "lib/formula/index": typeof lib_formula_index;
  "lib/formula/parser": typeof lib_formula_parser;
  "lib/formula/tokenizer": typeof lib_formula_tokenizer;
  "lib/lineItems": typeof lib_lineItems;
  "lib/memberships": typeof lib_memberships;
  "lib/orgCascade": typeof lib_orgCascade;
  "lib/orgScan": typeof lib_orgScan;
  "lib/organization": typeof lib_organization;
  "lib/payments": typeof lib_payments;
  "lib/permissionKeys": typeof lib_permissionKeys;
  "lib/permissions": typeof lib_permissions;
  "lib/queries": typeof lib_queries;
  "lib/quoteTotals": typeof lib_quoteTotals;
  "lib/reportFields": typeof lib_reportFields;
  "lib/reportFilters": typeof lib_reportFilters;
  "lib/reportPresets": typeof lib_reportPresets;
  "lib/resendClient": typeof lib_resendClient;
  "lib/schedule": typeof lib_schedule;
  "lib/schemaIntrospection": typeof lib_schemaIntrospection;
  "lib/shared": typeof lib_shared;
  "lib/storage": typeof lib_storage;
  "lib/stripe": typeof lib_stripe;
  "lib/webhooks": typeof lib_webhooks;
  "lib/workflowTypes": typeof lib_workflowTypes;
  messageAttachments: typeof messageAttachments;
  "migrations/addReceivingAddresses": typeof migrations_addReceivingAddresses;
  "migrations/backfillEmailThreads": typeof migrations_backfillEmailThreads;
  "migrations/backfillMemberPermissions": typeof migrations_backfillMemberPermissions;
  "migrations/fixInvoiceTotals": typeof migrations_fixInvoiceTotals;
  "migrations/geocodeAddresses": typeof migrations_geocodeAddresses;
  "migrations/initializeQuoteCounters": typeof migrations_initializeQuoteCounters;
  "migrations/populateAggregates": typeof migrations_populateAggregates;
  "migrations/revalidateStripeConnectAccounts": typeof migrations_revalidateStripeConnectAccounts;
  "migrations/seedServiceStatus": typeof migrations_seedServiceStatus;
  notifications: typeof notifications;
  orgCascade: typeof orgCascade;
  organizationDocuments: typeof organizationDocuments;
  organizations: typeof organizations;
  payments: typeof payments;
  "portal/branding": typeof portal_branding;
  "portal/email": typeof portal_email;
  "portal/helpers": typeof portal_helpers;
  "portal/invoices": typeof portal_invoices;
  "portal/invoicesActions": typeof portal_invoicesActions;
  "portal/migrations": typeof portal_migrations;
  "portal/otp": typeof portal_otp;
  "portal/quotes": typeof portal_quotes;
  "portal/sessions": typeof portal_sessions;
  projectDocuments: typeof projectDocuments;
  projects: typeof projects;
  push: typeof push;
  quoteLineItems: typeof quoteLineItems;
  quotes: typeof quotes;
  rateLimits: typeof rateLimits;
  reportConfigGeneration: typeof reportConfigGeneration;
  reportData: typeof reportData;
  reports: typeof reports;
  resend: typeof resend;
  resendReceiving: typeof resendReceiving;
  resendWebhook: typeof resendWebhook;
  serviceStatus: typeof serviceStatus;
  serviceStatusActions: typeof serviceStatusActions;
  skus: typeof skus;
  stripePaymentActions: typeof stripePaymentActions;
  stripeWebhookActions: typeof stripeWebhookActions;
  stripeWebhookEvents: typeof stripeWebhookEvents;
  tasks: typeof tasks;
  usage: typeof usage;
  userTour: typeof userTour;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  clientCounts: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"clientCounts">;
  projectCounts: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"projectCounts">;
  quoteCounts: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"quoteCounts">;
  invoiceRevenue: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"invoiceRevenue">;
  invoiceCounts: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"invoiceCounts">;
  resend: import("@convex-dev/resend/_generated/component.js").ComponentApi<"resend">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  migrations: import("@convex-dev/migrations/_generated/component.js").ComponentApi<"migrations">;
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
};
