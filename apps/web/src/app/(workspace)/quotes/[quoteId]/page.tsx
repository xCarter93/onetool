"use client";

import { PermissionGate } from "@/components/domain/permission-gate";
import { usePermissions } from "@/hooks/use-permissions";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useConvex } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { useToast } from "@/hooks/use-toast";
import { useEntitlements } from "@/hooks/use-entitlements";
import { useClientSendMeter } from "@/hooks/use-client-send-meter";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import type { Id as StorageId } from "@onetool/backend/convex/_generated/dataModel";
import { useState, useMemo, useCallback, useRef } from "react";
import { DocumentSelectionModal } from "@/app/(workspace)/quotes/components/document-selection-modal";
import { DocumentPreviewModal } from "@/components/shared/document-preview-modal";
import { buildQuotePdfBlob } from "./components/build-quote-pdf-blob";
import DeleteConfirmationModal from "@/components/ui/delete-confirmation-modal";
import { Skeleton } from "@/components/ui/skeleton";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { QuoteDetailHeader } from "./components/quote-detail-header";
import { QuoteDetailTabs } from "./components/quote-detail-tabs";
import { localDateToUtcMidnightMs, todayUtcMidnightMs } from "@/lib/dates";
import { convexErrorMessage } from "@/lib/convex-error";

type QuoteStatus = "draft" | "sent" | "approved" | "declined" | "expired";

const getQuoteStatus = (
	status: QuoteStatus,
	validUntilDate?: number
): QuoteStatus => {
	if (status === "expired") return "expired";
	if (validUntilDate && validUntilDate < todayUtcMidnightMs()) return "expired";
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

function QuoteDetailPageContent() {
	const router = useRouter();
	const params = useParams();
	const toast = useToast();
	const convex = useConvex();
	const quoteId = params.quoteId as Id<"quotes">;
	const { can } = usePermissions();

	// State
	const [activeTab, setActiveTab] = useState("overview");
	const [selectedVersionId, setSelectedVersionId] =
		useState<Id<"documents"> | null>(null);
	const [showVersionHistory, setShowVersionHistory] = useState(false);
	const [showDocumentModal, setShowDocumentModal] = useState(false);
	const [showPreviewModal, setShowPreviewModal] = useState(false);
	const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const [isConverting, setIsConverting] = useState(false);
	const [isSending, setIsSending] = useState(false);

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
	// Gate on the quote resolving: a cross-org id makes quotes.get return null,
	// so skip listByQuote rather than let it throw an org-mismatch error.
	const lineItems = useQuery(
		api.quoteLineItems.listByQuote,
		quote ? { quoteId } : "skip"
	);
	const organization = useQuery(api.organizations.get, {});
	// Skip document queries without the documents grant — they call
	// requireLevel("documents","view") server-side and throw FORBIDDEN otherwise.
	const latestDocument = useQuery(
		api.documents.getLatest,
		quote && can("documents")
			? { documentType: "quote", documentId: quote._id }
			: "skip"
	);
	const allDocumentVersions = useQuery(
		api.documents.getAllVersions,
		quote && can("documents")
			? { documentType: "quote", documentId: quote._id }
			: "skip"
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
		quote && can("documents")
			? { documentType: "quote", documentId: quote._id }
			: "skip"
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
	const sendQuoteToClient = useMutation(api.quotes.sendToClient);

	// Plan gate for e-signature sends (server-enforced; this drives button UX).
	const { meter } = useEntitlements();
	const esignMeter = meter("esignatures");
	// Only treat as blocked once the meter has resolved, so the button doesn't
	// flash disabled while usage is loading. remaining null = unlimited.
	const sendBlocked =
		esignMeter !== undefined &&
		esignMeter.remaining !== null &&
		esignMeter.remaining <= 0;
	const esignReason =
		esignMeter === undefined
			? "Loading..."
			: esignMeter.remaining !== null && esignMeter.remaining <= 0
				? `You've reached your limit of ${esignMeter.limit} e-signatures this month. Upgrade for unlimited.`
				: undefined;
	// clientSends pre-flight: only a first send debits, so resends stay enabled.
	const { exhausted: sendsExhausted, reason: sendsReason } =
		useClientSendMeter();
	// undefined = the latest-document query is still resolving; null = no PDF.
	const isLatestDocumentLoading = latestDocument === undefined;

	// Last render produced by the preview, kept so Generate can skip a second
	// identical render. Invalidated by any client-visible content change.
	const previewBlobRef = useRef<{
		blob: Blob;
		contentUpdatedAt: number | undefined;
		renderInputsFingerprint: string;
		quoteId: Id<"quotes">;
	} | null>(null);

	// The PDF also renders client/org/property/countersigner data that
	// contentUpdatedAt never tracks. "loading" keeps a blob rendered before
	// those queries resolved from matching one rendered after.
	const renderInputsFingerprint = useMemo(
		() =>
			JSON.stringify(
				[client, organization, primaryProperty, countersigner].map((doc) =>
					doc === undefined ? "loading" : doc
				)
			),
		[client, organization, primaryProperty, countersigner]
	);

	// The generated PDF is stale once the quote's client-visible content moved
	// after the newest document was stored. No stamp means nothing to compare.
	const isPdfStale = Boolean(
		latestDocument &&
			quote?.contentUpdatedAt !== undefined &&
			quote.contentUpdatedAt > latestDocument.generatedAt
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
		selectedDocument && can("documents")
			? { id: selectedDocument._id }
			: "skip"
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
			toast.error("Error", convexErrorMessage(err, "Failed to update status"));
		}
	};

	const handleConvertToInvoice = async () => {
		if (isConverting) return;
		setIsConverting(true);
		try {
			// Default dates as UTC-midnight calendar days (issued today, due in 30 days)
			const issuedDate = localDateToUtcMidnightMs(new Date());
			const invoiceId = await createInvoiceFromQuote({
				quoteId,
				issuedDate,
				dueDate: issuedDate + 30 * 24 * 60 * 60 * 1000,
			});
			toast.success(
				"Invoice Created",
				"Quote converted to invoice successfully"
			);
			router.push(`/invoices/${invoiceId}`);
			// Leave the action disabled through navigation; the page unmounts.
		} catch (err) {
			const message = convexErrorMessage(err, "Failed to create invoice");
			toast.error("Error", message);
			setIsConverting(false);
		}
	};

	const confirmDeleteQuote = async () => {
		setIsDeleting(true);
		try {
			await deleteQuote({ id: quoteId });
			// Success toast + modal close are owned by DeleteConfirmationModal.
			router.push("/quotes");
		} catch (err) {
			// Re-throw so the modal shows a single error toast and stays open.
			setIsDeleting(false);
			throw err;
		}
	};

	// Renders the quote PDF exactly the way Generate does, so what the preview
	// shows is what gets uploaded. The result is cached against the quote's
	// contentUpdatedAt stamp and reused by Generate while it stays valid.
	const renderQuotePdf = useCallback(async () => {
		if (!quote || !lineItems) {
			throw new Error("This quote is still loading. Try again in a moment.");
		}
		const blob = await buildQuotePdfBlob({
			quote,
			lineItems,
			client,
			organization,
			primaryProperty,
			countersigner,
		});
		previewBlobRef.current = {
			blob,
			contentUpdatedAt: quote.contentUpdatedAt,
			renderInputsFingerprint,
			quoteId: quote._id,
		};
		return blob;
	}, [
		quote,
		lineItems,
		client,
		organization,
		primaryProperty,
		countersigner,
		renderInputsFingerprint,
	]);

	const takeCachedPdfBlob = (): Blob | null => {
		const cached = previewBlobRef.current;
		if (!cached || !quote) return null;
		if (cached.quoteId !== quote._id) return null;
		// Any client-visible edit since the preview invalidates it.
		if (cached.contentUpdatedAt !== quote.contentUpdatedAt) return null;
		if (cached.renderInputsFingerprint !== renderInputsFingerprint)
			return null;
		return cached.blob;
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

			// Reuse the preview's render when the quote content has not moved since;
			// appending org documents never re-renders the quote pages.
			const quoteBlob = takeCachedPdfBlob() ?? (await renderQuotePdf());

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

	const handleSendForSignature = () => {
		if (isLatestDocumentLoading) return; // still resolving — ignore the click
		if (latestDocument === null) {
			toast.error("No PDF", "Generate a PDF first");
			return;
		}
		if (isPdfStale) {
			// Non-blocking: warning toasts survive the route change into /sign,
			// so the notice rides along with the user instead of preventing send.
			toast.warning(
				"PDF may be out of date",
				"The attached PDF is older than the latest edits. Regenerate first?"
			);
		}
		router.push(`/quotes/${quoteId}/sign`);
	};

	const handleSendToClient = async () => {
		if (isSending) return;
		setIsSending(true);
		try {
			await sendQuoteToClient({ id: quoteId });
			toast.success(
				"Quote sent",
				"Your client will get an email to view and approve it in the portal."
			);
		} catch (err) {
			const message = convexErrorMessage(err, "Failed to send quote");
			toast.error("Couldn't send quote", message);
		} finally {
			setIsSending(false);
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
					onSendToClient={handleSendToClient}
					sending={isSending}
					onSendForSignature={handleSendForSignature}
					sendDisabled={sendBlocked || isLatestDocumentLoading}
					sendDisabledReason={
						isLatestDocumentLoading
							? "Checking for a generated PDF…"
							: esignReason
					}
					clientSendDisabled={sendsExhausted && !quote.sentAt}
					clientSendDisabledReason={sendsReason}
					onGeneratePdf={() => setShowDocumentModal(true)}
					onDelete={() => setIsDeleteModalOpen(true)}
					onConvertToInvoice={handleConvertToInvoice}
					converting={isConverting}
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
					onPreviewPdf={() => setShowPreviewModal(true)}
					previewDisabled={!lineItems || lineItems.length === 0}
					isPdfStale={isPdfStale}
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
			<DocumentPreviewModal
				open={showPreviewModal}
				onOpenChange={setShowPreviewModal}
				title="Quote preview"
				description="This is exactly what gets saved when you generate the PDF."
				renderDocument={renderQuotePdf}
				downloadFileName={`Quote-${quote.quoteNumber || quote._id.slice(-6)}.pdf`}
				primaryAction={{
					label: "Generate PDF",
					disabled: !can("quotes", "modify"),
					onAction: () => {
						setShowPreviewModal(false);
						setShowDocumentModal(true);
					},
				}}
			/>
		</>
	);
}

export default function QuoteDetailPage() {
	return (
		<PermissionGate object="quotes">
			<QuoteDetailPageContent />
		</PermissionGate>
	);
}
