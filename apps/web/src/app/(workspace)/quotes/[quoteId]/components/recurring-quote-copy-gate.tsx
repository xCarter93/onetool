"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { usePermissions } from "@/hooks/use-permissions";
import { RecurringQuoteCopyDialog } from "./recurring-quote-copy-dialog";
import { RecurringAgreementSetupDialog } from "./recurring-agreement-setup-dialog";
import { RecurringSeriesChooserDialog } from "./recurring-series-chooser-dialog";
import { useToast } from "@/hooks/use-toast";
import { convexErrorMessage } from "@/lib/convex-error";

export type AgreementDeliveryState =
	| "draft"
	| "ready_to_send"
	| "awaiting_approval"
	| "approved"
	| "withdrawn"
	| "declined"
	| "expired"
	| "revoked"
	| "not_activated"
	| "replaced";

export type RecurringQuoteActions = {
	onCopyToFuture?: () => void;
	copyToFutureDisabled?: boolean;
	copyToFutureDisabledReason?: string;
	onPrepareAgreement?: () => void;
	prepareAgreementLabel?: string;
	/** Single entry point while the series has no agreement: opens the chooser. */
	onUseForSeries?: () => void;
	onRestoreAgreementPricing?: () => void;
	/** Set only when this quote is the agreement's source or a revision of it. */
	agreementDeliveryState?: AgreementDeliveryState;
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
	const [chooserOpen, setChooserOpen] = useState(false);
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
				? "Revise the agreement from the series page to change future visits"
				: "Resume this series to copy quote setup",
	};
	const restoreActions = agreementSetup?.canRestoreAgreementPricing
		? {
				onRestoreAgreementPricing: async () => {
					try {
						await restoreVisit({ quoteId });
						toast.success(
							"Agreement pricing applied",
							agreementSetup.recurringQuoteOverride
								? "This visit's changes were replaced with the approved agreement pricing."
								: "This visit now matches the current approved agreement.",
						);
					} catch (error) {
						toast.error("Update failed", convexErrorMessage(error, "Review the quote and try again."));
					}
				},
			}
		: {};
	const ownRevision = [agreementSetup?.pending, agreementSetup?.active].find(
		(revision) => revision?.quoteId === quoteId,
	);
	const progress = ownRevision
		? { agreementDeliveryState: ownRevision.deliveryState }
		: {};
	const agreementAvailable =
		agreementSetup?.canPrepare &&
		!agreementSetup.recurringInheritedAt &&
		!agreementSetup.recurringQuoteOverride;
	const hasAgreement = Boolean(agreementSetup?.agreementQuoteId);

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
						{(openAgreementDialog) => (
							<>
								{!hasAgreement && (
									<RecurringSeriesChooserDialog
										open={chooserOpen}
										onOpenChange={setChooserOpen}
										onSetUpAgreement={openAgreementDialog}
										onCopyDrafts={openCopyDialog}
									/>
								)}
								{children({
									...copyActions,
									onCopyToFuture: openCopyDialog,
									...(hasAgreement
										? {
												onPrepareAgreement: openAgreementDialog,
												prepareAgreementLabel: ownRevision
													? "Edit agreement terms"
													: "Set up agreement",
											}
										: { onUseForSeries: () => setChooserOpen(true) }),
									...restoreActions,
									...progress,
								})}
							</>
						)}
					</RecurringAgreementSetupDialog>
				) : (
					children({
						...copyActions,
						onCopyToFuture: openCopyDialog,
						...restoreActions,
						...progress,
					})
				)
			}
		</RecurringQuoteCopyDialog>
	);
}
