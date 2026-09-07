import type { Doc } from "@onetool/backend/convex/_generated/dataModel";
import {
	formatRecurringPaymentRule,
	formatRecurringSchedule,
} from "@onetool/backend/pdf/recurringAgreementFormat";

import { formatDate, formatMoney } from "@/lib/portal/format";

type RecurringAgreementTerms = NonNullable<Doc<"quotes">["recurringAgreementTerms"]>;

// Mirror of the api.portal.quotes recurringAgreement metadata.
export interface PortalRecurringAgreement {
	revisionId: string;
	reference: string;
	revisionNumber: number;
	sourceQuoteId: string;
	sourceVisible: boolean;
	seriesId: string;
	isAgreement: boolean;
	inherited: boolean;
	visitOverride: boolean;
	serviceDate?: number;
	agreementPerVisitTotal: number;
	previousRevision: {
		revisionNumber: number;
		perVisitTotal: number;
		schedule: RecurringAgreementTerms["schedule"];
		billingMode: RecurringAgreementTerms["billingMode"];
		paymentRule: RecurringAgreementTerms["paymentRule"];
	} | null;
}

export interface RecurringChange {
	label: string;
	detail: string;
}

export function describeRecurringChange(
	agreement: PortalRecurringAgreement | null | undefined,
): RecurringChange | null {
	if (!agreement) return null;
	if (agreement.visitOverride)
		return {
			label: `Change to the visit on ${formatDate(agreement.serviceDate)}`,
			detail: `Your agreement ${agreement.reference} is ${formatMoney(agreement.agreementPerVisitTotal)} per visit`,
		};
	if (!agreement.isAgreement || agreement.revisionNumber <= 1) return null;
	const prior = agreement.previousRevision;
	if (!prior)
		return {
			label: `Revised agreement, revision ${agreement.revisionNumber}`,
			detail: "Replaces the terms you approved earlier",
		};
	return {
		label: `Revised agreement, replaces revision ${prior.revisionNumber}`,
		detail: `Revision ${prior.revisionNumber} was ${formatMoney(prior.perVisitTotal)} per visit. Schedule: ${formatRecurringSchedule(prior.schedule.rule)}. Payment: ${formatRecurringPaymentRule(prior.paymentRule)}`,
	};
}
