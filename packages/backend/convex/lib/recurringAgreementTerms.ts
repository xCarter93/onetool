import { type Infer, v } from "convex/values";
import { projectRecurrenceRuleValidator } from "./projectRecurrence";
import { recurringPaymentRuleValidator, type RecurringPaymentRule } from "./recurringPaymentRules";

export const recurringAgreementTermsValidator = v.object({
	schemaVersion: v.literal(1),
	revisionId: v.id("projectSeriesAgreementRevisions"),
	seriesId: v.id("projectSeries"),
	revisionNumber: v.number(),
	agreementReference: v.string(),
	client: v.object({ id: v.id("clients"), name: v.string() }),
	property: v.optional(v.object({ id: v.id("clientProperties"), name: v.optional(v.string()), address: v.string() })),
	scope: v.object({ title: v.optional(v.string()), description: v.optional(v.string()) }),
	schedule: v.object({ rule: projectRecurrenceRuleValidator, anchorDateKey: v.string(), timezone: v.string() }),
	monthlyPaymentScheduleVersionId: v.optional(v.id("clientMonthlyPaymentScheduleVersions")),
	paymentChangeActivation: v.optional(v.literal("next_full_month_after_all_approvals")),
	billingMode: v.union(v.literal("per_visit"), v.literal("monthly")),
	paymentRule: recurringPaymentRuleValidator,
});

export type RecurringAgreementTerms = Infer<typeof recurringAgreementTermsValidator>;
export type AgreementPaymentRule = RecurringPaymentRule;
