"use client";

import { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import {
	StyledTabs,
	StyledTabsList,
	StyledTabsTrigger,
	StyledTabsContent,
} from "@/components/ui/styled";
import { OverviewTab } from "./tabs/overview-tab";
import { PaymentScheduleTab } from "./tabs/payment-schedule-tab";
import { InvoiceDetailSidebar } from "./invoice-detail-sidebar";

interface InvoiceDetailTabsProps {
	activeTab: string;
	onTabChange: (tab: string) => void;
	invoice: Doc<"invoices">;
	invoiceId: Id<"invoices">;
	// Data
	lineItems: Doc<"invoiceLineItems">[] | undefined;
	client: Doc<"clients"> | null | undefined;
	project: Doc<"projects"> | null | undefined;
	primaryContact: Doc<"clientContacts"> | null | undefined;
	primaryProperty: Doc<"clientProperties"> | null | undefined;
	organization: Doc<"organizations"> | null | undefined;
	// Payment data
	invoiceWithPayments: {
		payments: Doc<"payments">[];
		paymentSummary: {
			totalPayments: number;
			paidCount: number;
			pendingCount: number;
			paidAmount: number;
			remainingAmount: number;
			allPaymentsPaid: boolean;
			percentPaid: number;
		};
	};
	onConfigurePayments: () => void;
	// PDF section
	latestDocument: Doc<"documents"> | null | undefined;
	allDocumentVersions: Doc<"documents">[] | undefined;
	selectedDocument: Doc<"documents"> | null | undefined;
	selectedDocumentUrl: string | null | undefined;
	onGeneratePdf: () => void;
	onDownloadPdf: () => void;
	selectedVersionId: Id<"documents"> | null;
	onSelectVersion: (id: Id<"documents"> | null) => void;
	showVersionHistory: boolean;
	onToggleVersionHistory: () => void;
}

export function InvoiceDetailTabs({
	activeTab,
	onTabChange,
	invoice,
	invoiceId,
	lineItems,
	client,
	project,
	primaryContact,
	primaryProperty,
	organization,
	invoiceWithPayments,
	onConfigurePayments,
	latestDocument,
	allDocumentVersions,
	selectedDocument,
	selectedDocumentUrl,
	onGeneratePdf,
	onDownloadPdf,
	selectedVersionId,
	onSelectVersion,
	showVersionHistory,
	onToggleVersionHistory,
}: InvoiceDetailTabsProps) {
	const sidebarProps = {
		invoice,
		invoiceId,
		client,
		project,
		primaryContact,
		primaryProperty,
		latestDocument,
		allDocumentVersions,
		selectedDocument,
		selectedDocumentUrl,
		onGeneratePdf,
		onDownloadPdf,
		selectedVersionId,
		onSelectVersion,
		showVersionHistory,
		onToggleVersionHistory,
	};

	return (
		<StyledTabs value={activeTab} onValueChange={onTabChange}>
			{/* Two-column layout: tabs + content on left, sidebar on right */}
			<div className="flex gap-0">
				{/* Left: Tabs list + tab content */}
				<div className="flex-1 min-w-0 pr-6 pt-6 pb-20">
					<StyledTabsList className="overflow-x-auto">
						<StyledTabsTrigger value="overview">
							Overview
						</StyledTabsTrigger>
						<StyledTabsTrigger value="payments">
							Payment Schedule
						</StyledTabsTrigger>
					</StyledTabsList>

					<StyledTabsContent
						value="overview"
						className="mt-0 pt-5"
					>
						<OverviewTab
							invoice={invoice}
							invoiceId={invoiceId}
							lineItems={lineItems}
							paymentSummary={invoiceWithPayments?.paymentSummary}
						/>
					</StyledTabsContent>

					<StyledTabsContent
						value="payments"
						className="mt-0 pt-5"
					>
						<PaymentScheduleTab
							invoiceWithPayments={invoiceWithPayments}
							organization={organization}
							onConfigurePayments={onConfigurePayments}
						/>
					</StyledTabsContent>
				</div>

				{/* Right: Persistent sidebar (desktop) */}
				<div className="hidden xl:block w-[480px] shrink-0 border-l border-border/80 min-h-screen bg-muted/20">
					<div className="sticky top-24">
						<InvoiceDetailSidebar {...sidebarProps} />
					</div>
				</div>
			</div>

			{/* Sidebar for mobile (below content) */}
			<div className="xl:hidden mt-6 border-t-2 border-border/80 pt-6 bg-muted/20 rounded-lg">
				<InvoiceDetailSidebar {...sidebarProps} />
			</div>
		</StyledTabs>
	);
}
