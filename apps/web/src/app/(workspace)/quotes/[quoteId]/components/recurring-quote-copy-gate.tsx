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

type CopyAction = {
  onCopyToFuture?: () => void;
  copyToFutureDisabled?: boolean;
  copyToFutureDisabledReason?: string;
  onPrepareAgreement?: () => void;
  prepareAgreementDisabled?: boolean;
  prepareAgreementDisabledReason?: string;
  onRestoreAgreementPricing?: () => void;
  restoreAgreementPricingDisabled?: boolean;
  restoreAgreementPricingDisabledReason?: string;
  restoreAgreementPricingLabel?: string;
};

export function RecurringQuoteCopyGate({
  quoteId,
  quoteTitle,
  projectId,
  quoteStatus,
  children,
}: {
  quoteId: Id<"quotes">;
  quoteTitle: string;
  projectId?: Id<"projects">;
  quoteStatus: string;
  children: (action: CopyAction) => ReactNode;
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

	const agreementAvailable =
		agreementSetup &&
		agreementSetup.canPrepare &&
		!agreementSetup.recurringInheritedAt &&
		!agreementSetup.recurringQuoteOverride;
	const restoreAgreementPricing = agreementSetup?.canRestoreAgreementPricing
		? async () => {
				try {
					await restoreVisit({ quoteId });
					toast.success("Agreement pricing restored", "This visit is covered by the approved recurring agreement again.");
				} catch (error) {
					toast.error("Restore failed", convexErrorMessage(error, "Review the quote and try again."));
				}
			}
		: undefined;
	const restoreProps = restoreAgreementPricing ? {
		onRestoreAgreementPricing: () => void restoreAgreementPricing(),
		restoreAgreementPricingDisabled: false,
		restoreAgreementPricingDisabledReason: undefined,
		restoreAgreementPricingLabel: agreementSetup?.recurringQuoteOverride ? "Restore agreement pricing" : "Refresh agreement pricing",
	} : {};

  return (
    <RecurringQuoteCopyDialog
      quoteId={quoteId}
      quoteTitle={quoteTitle}
      canCopy={canManage && setup.canCopy}
    >
      {(openCopyDialog) => agreementAvailable ? (
			<RecurringAgreementSetupDialog
				quoteId={quoteId}
				quoteTitle={quoteTitle}
				seriesRevision={agreementSetup.revision}
				seriesSetup={agreementSetup.seriesSetup}
			>
				{(openAgreementDialog) => children({
					onCopyToFuture: openCopyDialog,
					copyToFutureDisabled: !setup.canCopy,
					copyToFutureDisabledReason: setup.canCopy ? undefined : setup.state === "active" ? "This series uses a recurring agreement" : "Resume this series to copy quote setup",
					onPrepareAgreement: openAgreementDialog,
					prepareAgreementDisabled: !agreementSetup.canPrepare,
					prepareAgreementDisabledReason: agreementSetup.state !== "active" ? "Resume this series to prepare an agreement" : quoteStatus !== "draft" ? "Revert this quote to draft to prepare an agreement" : !agreementSetup.canPrepare ? "This quote cannot be prepared as the agreement source" : undefined,
					...restoreProps,
				})}
			</RecurringAgreementSetupDialog>
		) : children({
			onCopyToFuture: openCopyDialog,
			copyToFutureDisabled: !setup.canCopy,
			copyToFutureDisabledReason: setup.canCopy ? undefined : setup.state === "active" ? "This series uses a recurring agreement" : "Resume this series to copy quote setup",
			...restoreProps,
		})}
    </RecurringQuoteCopyDialog>
  );
}
