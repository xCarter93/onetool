"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useAction, useConvex } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { useToast } from "@/hooks/use-toast";
import { pdf } from "@react-pdf/renderer";
import QuotePDF from "@/app/(workspace)/quotes/components/QuotePDF";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import type { Id as StorageId } from "@onetool/backend/convex/_generated/dataModel";
import { useState, useMemo } from "react";
import { DocumentSelectionModal } from "@/app/(workspace)/quotes/components/document-selection-modal";
import { SendEmailSheet } from "@/app/(workspace)/quotes/components/send-email-sheet";
import DeleteConfirmationModal from "@/components/ui/delete-confirmation-modal";
import { Skeleton } from "@/components/ui/skeleton";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { QuoteDetailHeader } from "./components/quote-detail-header";
import { QuoteDetailTabs } from "./components/quote-detail-tabs";
import { Recipient } from "@/types/quote";

type QuoteStatus = "draft" | "sent" | "approved" | "declined" | "expired";

const getQuoteStatus = (
	status: QuoteStatus,
	validUntilDate?: number
): QuoteStatus => {
	if (status === "expired") return "expired";
	if (validUntilDate && validUntilDate < Date.now()) return "expired";
	return status;
};

const formatStatus = (status: QuoteStatus) => {
	switch (status) {
		case "draft":
			return "Draft";
		case "sent":
			return "Sent";
		case "approved":
			return "Approved";
		case "declined":
			return "Declined";
		case "expired":
			return "Expired";
		default:
			return status;
	}
};

export default function QuoteDetailPage() {
	const router = useRouter();
	const params = useParams();
	const toast = useToast();
	const convex = useConvex();
	const quoteId = params.quoteId as Id<"quotes">;

	// State
	const [activeTab, setActiveTab] = useState("overview");
	const [selectedVersionId, setSelectedVersionId] =
		useState<Id<"documents"> | null>(null);
	const [showVersionHistory, setShowVersionHistory] = useState(false);
	const [showDocumentModal, setShowDocumentModal] = useState(false);
	const [sendEmailSheetOpen, setSendEmailSheetOpen] = useState(false);
	const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);

	// Queries
	const quote = useQuery(api.quotes.get, { id: quoteId });
	const client = useQuery(
		api.clients.get,
		quote?.clientId ? { id: quote.clientId } : "skip"
	);
	const project = useQuery(
		api.projects.get,
		quote?.projectId ? { id: quote.projectId } : "skip"
	);
	const lineItems = useQuery(api.quoteLineItems.listByQuote, { quoteId });
	const organization = useQuery(api.organizations.get, {});
	const latestDocument = useQuery(
		api.documents.getLatest,
		quote ? { documentType: "quote", documentId: quote._id } : "skip"
	);
	const allDocumentVersions = useQuery(
		api.documents.getAllVersions,
		quote ? { documentType: "quote", documentId: quote._id } : "skip"
	);
	const primaryContact = useQuery(
		api.clientContacts.getPrimaryContact,
		quote?.clientId ? { clientId: quote.clientId } : "skip"
	);
	const primaryProperty = useQuery(
		api.clientProperties.getPrimaryProperty,
		quote?.clientId ? { clientId: quote.clientId } : "skip"
	);
	const documentsWithSignatures = useQuery(
		api.documents.getAllDocumentsWithSignatures,
		quote ? { documentType: "quote", documentId: quote._id } : "skip"
	);
	const countersigner = useQuery(
		api.users.get,
		quote?.countersignerId ? { id: quote.countersignerId } : "skip"
	);
	const activities = useQuery(
		api.activities.getByEntity,
		quote === null || isDeleting
			? "skip"
			: { entityType: "quote" as const, entityId: quoteId as string }
	);

	// Mutations
	const updateQuote = useMutation(api.quotes.update);
	const deleteQuote = useMutation(api.quotes.remove);
	const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
	const createDocument = useMutation(api.documents.create);
	const createInvoiceFromQuote = useMutation(api.invoices.createFromQuote);

	// Actions
	const sendForSignature = useAction(
		api.boldsignActions.sendDocumentForSignature
	);

	// Derived state
	const selectedDocument = useMemo(() => {
		if (selectedVersionId && allDocumentVersions) {
			return allDocumentVersions.find((v) => v._id === selectedVersionId);
		}
		return latestDocument;
	}, [selectedVersionId, allDocumentVersions, latestDocument]);

	const selectedDocumentUrl = useQuery(
		api.documents.getDocumentUrl,
		selectedDocument ? { id: selectedDocument._id } : "skip"
	);

	// Handlers
	const handleStatusChange = async (status: QuoteStatus) => {
		try {
			await updateQuote({ id: quoteId, status });
			toast.success(
				"Quote Updated",
				`Status changed to ${formatStatus(status)}`
			);
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to update status";
			toast.error("Error", message);
		}
	};

	const handleConvertToInvoice = async () => {
		try {
			const invoiceId = await createInvoiceFromQuote({
				quoteId,
				issuedDate: Date.now(),
				dueDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
			});
			toast.success(
				"Invoice Created",
				"Quote converted to invoice successfully"
			);
			router.push(`/invoices/${invoiceId}`);
		} catch (err) {
			const message =
				err instanceof Error
					? err.message
					: "Failed to create invoice";
			toast.error("Error", message);
		}
	};

	const confirmDeleteQuote = async () => {
		setIsDeleting(true);
		try {
			await deleteQuote({ id: quoteId });
			toast.success(
				"Quote Deleted",
				"Quote has been successfully deleted"
			);
			setIsDeleteModalOpen(false);
			router.push("/quotes");
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to delete quote";
			toast.error("Error", message);
			setIsDeleteModalOpen(false);
			setIsDeleting(false);
		}
	};

	const handleGeneratePdf = async (
		appendDocumentIds: Id<"organizationDocuments">[] = []
	) => {
		try {
			if (!quote || !lineItems) return;
			const loadingId = toast.loading(
				"Generating PDF",
				appendDocumentIds.length > 0
					? `Merging with ${appendDocumentIds.length} document${appendDocumentIds.length !== 1 ? "s" : ""}…`
					: "Rendering and uploading…"
			);

			const element = (
				<QuotePDF
					quote={quote}
					client={
						client
							? {
									companyName: client.companyName,
									streetAddress:
										primaryProperty?.streetAddress,
									city: primaryProperty?.city,
									state: primaryProperty?.state,
									zipCode: primaryProperty?.zipCode,
									country: primaryProperty?.country,
								}
							: undefined
					}
					items={lineItems}
					organization={
						organization
							? {
									name: organization.name,
									logoUrl:
										organization.logoUrl || undefined,
									address:
										organization.address || undefined,
									phone: organization.phone || undefined,
									email: organization.email || undefined,
								}
							: undefined
					}
					countersigner={
						quote.requiresCountersignature && countersigner
							? {
									name:
										countersigner.name ||
										countersigner.email,
									email: countersigner.email,
								}
							: null
					}
					signingOrder={quote.signingOrder}
				/>
			);
			const quoteBlob = await pdf(element).toBlob();

			let finalBlob = quoteBlob;
			if (appendDocumentIds.length > 0) {
				try {
					const { PDFDocument } = await import("pdf-lib");
					const documentUrls = await convex.query(
						api.organizationDocuments.getDocumentUrls,
						{ ids: appendDocumentIds }
					);
					const mergedPdf = await PDFDocument.create();
					const quotePdfDoc = await PDFDocument.load(
						await quoteBlob.arrayBuffer()
					);
					const quotePages = await mergedPdf.copyPages(
						quotePdfDoc,
						quotePdfDoc.getPageIndices()
					);
					quotePages.forEach((page) => mergedPdf.addPage(page));

					for (const docInfo of documentUrls) {
						try {
							if (!docInfo.url) continue;
							const docResponse = await fetch(docInfo.url);
							if (!docResponse.ok) continue;
							const docBytes = await docResponse.arrayBuffer();
							const docPdf = await PDFDocument.load(docBytes);
							const docPages = await mergedPdf.copyPages(
								docPdf,
								docPdf.getPageIndices()
							);
							docPages.forEach((page) =>
								mergedPdf.addPage(page)
							);
						} catch {
							continue;
						}
					}

					const pdfBytes = await mergedPdf.save();
					finalBlob = new Blob([pdfBytes as BlobPart], {
						type: "application/pdf",
					});
				} catch {
					toast.error(
						"Merge failed",
						"Failed to merge documents. Using quote only."
					);
					finalBlob = quoteBlob;
				}
			}

			const uploadUrl = await generateUploadUrl({});
			const res = await fetch(uploadUrl, {
				method: "POST",
				headers: { "Content-Type": "application/pdf" },
				body: finalBlob,
			});
			if (!res.ok) throw new Error("Failed to upload PDF");
			const { storageId } = await res.json();
			await createDocument({
				documentType: "quote",
				documentId: quote._id,
				storageId: storageId as unknown as StorageId<"_storage">,
			});
			toast.removeToast(loadingId);
			toast.success(
				"PDF generated",
				appendDocumentIds.length > 0
					? `Quote PDF with ${appendDocumentIds.length} appended document${appendDocumentIds.length !== 1 ? "s" : ""} is ready.`
					: "Your quote PDF is ready."
			);
		} catch (error) {
			console.error(error);
			const message =
				error instanceof Error ? error.message : "Unknown error";
			toast.error("PDF generation failed", message);
		}
	};

	const handleDownloadPdf = async () => {
		if (!selectedDocumentUrl) return;
		try {
			const response = await fetch(selectedDocumentUrl);
			if (!response.ok) throw new Error("Failed to fetch PDF");
			const blob = await response.blob();
			const blobUrl = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = blobUrl;
			const versionSuffix = selectedDocument?.version
				? `-v${selectedDocument.version}`
				: "";
			link.download = `Quote-${quote?.quoteNumber || quote?._id.slice(-6) || "document"}${versionSuffix}.pdf`;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(blobUrl);
		} catch (error) {
			console.error(error);
			const message =
				error instanceof Error ? error.message : "Unknown error";
			toast.error("Download failed", message);
		}
	};

	const handleSendForSignature = async (
		recipients: Recipient[],
		message?: string
	) => {
		if (!selectedDocumentUrl || !latestDocument) {
			toast.error("No PDF", "Generate a PDF first");
			return;
		}

		try {
			const validRecipients = recipients.filter(
				(r): r is Recipient & { signerType: "Signer" | "CC" } =>
					r.signerType === "Signer" || r.signerType === "CC"
			);

			await sendForSignature({
				quoteId,
				documentId: latestDocument._id,
				recipients: validRecipients,
				documentUrl: selectedDocumentUrl,
				message,
			});
			toast.success("Sent!", "Quote sent for signature via BoldSign");
			setSendEmailSheetOpen(false);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Unknown error";
			toast.error("Send failed", message);
		}
	};

	// Loading state
	if (quote === undefined) {
		return (
			<div className="relative pl-6 pt-8 pb-20">
				<div className="mx-auto">
					<div className="space-y-6">
						<Skeleton className="h-12 w-64" />
						<Skeleton className="h-32 w-full" />
						<Skeleton className="h-64 w-full" />
						<Skeleton className="h-64 w-full" />
					</div>
				</div>
			</div>
		);
	}

	// Quote not found
	if (quote === null) {
		return (
			<div className="relative pl-6 pt-8 pb-20">
				<div className="mx-auto">
					<div className="flex flex-col items-center justify-center py-12 text-center">
						<div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center mb-4">
							<ExclamationTriangleIcon className="h-8 w-8 text-red-600 dark:text-red-400" />
						</div>
						<h3 className="text-lg font-medium text-foreground mb-2">
							Quote not found
						</h3>
						<p className="text-muted-foreground">
							The quote you&apos;re looking for doesn&apos;t
							exist or you don&apos;t have permission to view it.
						</p>
					</div>
				</div>
			</div>
		);
	}

	const currentStatus = getQuoteStatus(quote.status, quote.validUntil);

	return (
		<>
			<div className="relative min-h-screen pl-6 pt-6">
				{/* Header */}
				<QuoteDetailHeader
					quote={quote}
					currentStatus={currentStatus}
					onStatusChange={handleStatusChange}
					onSendToClient={() => setSendEmailSheetOpen(true)}
					onGeneratePdf={() => setShowDocumentModal(true)}
					onDelete={() => setIsDeleteModalOpen(true)}
					onConvertToInvoice={handleConvertToInvoice}
				/>

				{/* Tabs + Sidebar */}
				<QuoteDetailTabs
					activeTab={activeTab}
					onTabChange={setActiveTab}
					quote={quote}
					quoteId={quoteId}
					lineItems={lineItems}
					activities={activities}
					client={client}
					project={project}
					primaryContact={primaryContact}
					primaryProperty={primaryProperty}
					documentsWithSignatures={documentsWithSignatures}
					latestDocument={latestDocument}
					allDocumentVersions={allDocumentVersions}
					selectedDocument={selectedDocument}
					selectedDocumentUrl={selectedDocumentUrl}
					onGeneratePdf={() => setShowDocumentModal(true)}
					onDownloadPdf={handleDownloadPdf}
					selectedVersionId={selectedVersionId}
					onSelectVersion={setSelectedVersionId}
					showVersionHistory={showVersionHistory}
					onToggleVersionHistory={() =>
						setShowVersionHistory(!showVersionHistory)
					}
				/>
			</div>

			{/* Modals */}
			<DeleteConfirmationModal
				isOpen={isDeleteModalOpen}
				onClose={() => setIsDeleteModalOpen(false)}
				onConfirm={confirmDeleteQuote}
				title="Delete Quote"
				itemName={
					quote.title ||
					`Quote ${quote.quoteNumber || `#${quote._id.slice(-6)}`}`
				}
				itemType="Quote"
				isArchive={false}
			/>
			<DocumentSelectionModal
				isOpen={showDocumentModal}
				onClose={() => setShowDocumentModal(false)}
				onConfirm={(selectedIds) => handleGeneratePdf(selectedIds)}
			/>
			<SendEmailSheet
				isOpen={sendEmailSheetOpen}
				onOpenChange={setSendEmailSheetOpen}
				onConfirm={handleSendForSignature}
				primaryContact={primaryContact}
				quoteNumber={quote?.quoteNumber || quote?._id.slice(-6)}
				documentVersion={latestDocument?.version}
				countersigner={
					quote?.requiresCountersignature && countersigner
						? {
								name:
									countersigner.name || countersigner.email,
								email: countersigner.email,
							}
						: null
				}
				signingOrder={quote?.signingOrder}
			/>
		</>
	);
}
