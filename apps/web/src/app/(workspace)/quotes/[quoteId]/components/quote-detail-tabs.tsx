"use client";

import { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import type { ActivityWithUser } from "@/app/(workspace)/home/components/activity-item";
import {
	StyledTabs,
	StyledTabsList,
	StyledTabsTrigger,
	StyledTabsContent,
} from "@/components/ui/styled";
import { OverviewTab } from "./tabs/overview-tab";
import { SignaturesTab } from "./tabs/signatures-tab";
import { ActivityTab } from "./tabs/activity-tab";
import { QuoteDetailSidebar } from "./quote-detail-sidebar";

interface QuoteDetailTabsProps {
	activeTab: string;
	onTabChange: (tab: string) => void;
	quote: Doc<"quotes">;
	quoteId: Id<"quotes">;
	// Data
	lineItems: Doc<"quoteLineItems">[] | undefined;
	activities: ActivityWithUser[] | undefined;
	client: Doc<"clients"> | null | undefined;
	project: Doc<"projects"> | null | undefined;
	primaryContact: Doc<"clientContacts"> | null | undefined;
	primaryProperty: Doc<"clientProperties"> | null | undefined;
	// Signature data
	documentsWithSignatures:
		| Array<{
				_id: string;
				version: number;
				generatedAt: number;
				boldsign: {
					status:
						| "Sent"
						| "Viewed"
						| "Signed"
						| "Completed"
						| "Declined"
						| "Revoked"
						| "Expired";
					sentAt?: number;
					viewedAt?: number;
					signedAt?: number;
					completedAt?: number;
					declinedAt?: number;
					revokedAt?: number;
					expiredAt?: number;
					sentTo: Array<{
						name: string;
						email: string;
						signerType: string;
					}>;
				};
		  }>
		| null
		| undefined;
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

export function QuoteDetailTabs({
	activeTab,
	onTabChange,
	quote,
	quoteId,
	lineItems,
	activities,
	client,
	project,
	primaryContact,
	primaryProperty,
	documentsWithSignatures,
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
}: QuoteDetailTabsProps) {
	const sidebarProps = {
		quote,
		quoteId,
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
						<StyledTabsTrigger value="signatures">
							Signatures
						</StyledTabsTrigger>
						<StyledTabsTrigger value="activity">
							Activity
						</StyledTabsTrigger>
					</StyledTabsList>

					<StyledTabsContent value="overview" className="mt-0 pt-5">
						<OverviewTab
							quote={quote}
							quoteId={quoteId}
							lineItems={lineItems}
						/>
					</StyledTabsContent>

					<StyledTabsContent
						value="signatures"
						className="mt-0 pt-5"
					>
						<SignaturesTab
							quoteId={quoteId}
							requiresCountersignature={
								quote?.requiresCountersignature
							}
							countersignerId={quote?.countersignerId}
							signingOrder={quote?.signingOrder}
							primaryContact={primaryContact}
							documentsWithSignatures={documentsWithSignatures}
						/>
					</StyledTabsContent>

					<StyledTabsContent value="activity" className="mt-0 pt-5">
						<ActivityTab activities={activities} />
					</StyledTabsContent>
				</div>

				{/* Right: Persistent sidebar (desktop) */}
				<div className="hidden xl:block w-[480px] shrink-0 border-l border-border/80 min-h-screen bg-muted/40 dark:bg-muted/50">
					<div className="sticky top-24">
						<QuoteDetailSidebar {...sidebarProps} />
					</div>
				</div>
			</div>

			{/* Sidebar for mobile (below content) */}
			<div className="xl:hidden mt-6 border-t-2 border-border/80 pt-6 bg-muted/40 dark:bg-muted/50 rounded-lg">
				<QuoteDetailSidebar {...sidebarProps} />
			</div>
		</StyledTabs>
	);
}
