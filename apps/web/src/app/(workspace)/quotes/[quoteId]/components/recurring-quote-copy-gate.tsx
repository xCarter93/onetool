"use client";

import type { ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { usePermissions } from "@/hooks/use-permissions";
import { RecurringQuoteCopyDialog } from "./recurring-quote-copy-dialog";
import { RecurringAgreementSetupDialog } from "./recurring-agreement-setup-dialog";
import { useToast } from "@/hooks/use-toast";
import { convexErrorMessage } from "@/lib/convex-error";

export type RecurringQuoteActions = {
	onCopyToFuture?: () => void;
	copyToFutureDisabled?: boolean;
	copyToFutureDisabledReason?: string;
	onPrepareAgreement?: () => void;
	onRestoreAgreementPricing?: () => void;
	restoreAgreementPricingLabel?: string;
};

export function RecurringQuoteCopyGate({
	quoteId,
	quoteTitle,
	projectId,
	children,
}: {
	quoteId: Id<"quotes">;
	quoteTitle: string;
	projectId?: Id<"projects">;
	children: (actions: RecurringQuoteActions) => ReactNode;
}) {
	const { can, hasAllRecords } = usePermissions();
	const toast = useToast();
	const restoreVisit = useMutation(api.projectSeriesAgreements.restoreVisit);
	const canManage =
		can("quotes", "modify") &&
		can("projects", "modify") &&
		hasAllRecords("quotes") &&
		hasAllRecords("projects");
	const setup = useQuery(
		api.projectSeriesQuotes.getSetup,
		projectId && canManage ? { projectId } : "skip",
	);
	const agreementSetup = useQuery(
		api.projectSeriesAgreements.getSetup,
		setup ? { quoteId } : "skip",
	);

	if (!canManage || !setup) return children({});

	const copyActions = {
		onCopyToFuture: undefined as (() => void) | undefined,
		copyToFutureDisabled: !setup.canCopy,
		copyToFutureDisabledReason: setup.canCopy
			? undefined
			: setup.state === "active"
				? "This series uses a recurring agreement"
				: "Resume this series to copy quote setup",
	};
	const restoreActions = agreementSetup?.canRestoreAgreementPricing
		? {
				onRestoreAgreementPricing: async () => {
					try {
						await restoreVisit({ quoteId });
						toast.success("Agreement pricing restored", "This visit is covered by the approved recurring agreement again.");
					} catch (error) {
						toast.error("Restore failed", convexErrorMessage(error, "Review the quote and try again."));
					}
				},
				restoreAgreementPricingLabel: agreementSetup.recurringQuoteOverride
					? "Restore agreement pricing"
					: "Refresh agreement pricing",
			}
		: {};
	const agreementAvailable =
		agreementSetup?.canPrepare &&
		!agreementSetup.recurringInheritedAt &&
		!agreementSetup.recurringQuoteOverride;

	return (
		<RecurringQuoteCopyDialog
			quoteId={quoteId}
			quoteTitle={quoteTitle}
			canCopy={setup.canCopy}
		>
			{(openCopyDialog) =>
				agreementAvailable ? (
					<RecurringAgreementSetupDialog
						quoteId={quoteId}
						quoteTitle={quoteTitle}
						seriesRevision={agreementSetup.revision}
						seriesSetup={agreementSetup.seriesSetup}
						savedTerms={agreementSetup.savedTerms}
					>
						{(openAgreementDialog) =>
							children({
								...copyActions,
								onCopyToFuture: openCopyDialog,
								onPrepareAgreement: openAgreementDialog,
								...restoreActions,
							})
						}
					</RecurringAgreementSetupDialog>
				) : (
					children({ ...copyActions, onCopyToFuture: openCopyDialog, ...restoreActions })
				)
			}
		</RecurringQuoteCopyDialog>
	);
}
