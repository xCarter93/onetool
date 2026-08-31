"use client";

import { deriveInvoiceStatus } from "@onetool/backend/convex/lib/invoiceLateness";
import {
	isPayableRow,
	refundedAmountOf,
	remainingBalance,
} from "@onetool/backend/convex/lib/paymentInsights";
import { PermissionGate } from "@/components/domain/permission-gate";
import { usePermissions } from "@/hooks/use-permissions";
import { useOrgToday } from "@/hooks/use-org-today";
import { useClientSendMeter } from "@/hooks/use-client-send-meter";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { useToast } from "@/hooks/use-toast";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import type { Id as StorageId } from "@onetool/backend/convex/_generated/dataModel";
import { useState, useMemo, useCallback, useRef } from "react";
import { DocumentPreviewModal } from "@/components/shared/document-preview-modal";
import { EntityEmailModal } from "@/components/shared/email/entity-email-modal";
import { buildInvoicePdfBlob } from "./components/build-invoice-pdf-blob";
import DeleteConfirmationModal from "@/components/ui/delete-confirmation-modal";
import {
	Alert,
	AlertAction,
	AlertDescription,
	AlertTitle,
} from "@/components/reui/alert";
import { Frame, FramePanel } from "@/components/reui/frame";
import { Button } from "@/components/ui/button";
import { CalendarClock, Undo2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCalendarDate } from "@/lib/dates";
import { formatCurrency } from "@/lib/money";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { InvoiceDetailHeader } from "./components/invoice-detail-header";
import { InvoiceDetailTabs } from "./components/invoice-detail-tabs";
import { PaymentsConfigurationModal } from "../components/payments-configuration-modal";
import { convexErrorMessage } from "@/lib/convex-error";

type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled";

const formatStatus = (status: InvoiceStatus) => {
	switch (status) {
		case "draft":
			return "Draft";
		case "sent":
			return "Sent";
		case "paid":
			return "Paid";
		case "overdue":
			return "Overdue";
		case "cancelled":
			return "Cancelled";
		default:
			return status;
	}
};

function InvoiceDetailPageContent() {
	const params = useParams();
	const toast = useToast();
	const invoiceId = params.invoiceId as Id<"invoices">;
	const { can } = usePermissions();
	const orgToday = useOrgToday();

	// State
	const [activeTab, setActiveTab] = useState("overview");
	const [selectedVersionId, setSelectedVersionId] =
		useState<Id<"documents"> | null>(null);
	const [showVersionHistory, setShowVersionHistory] = useState(false);
	const [isPaymentsModalOpen, setIsPaymentsModalOpen] = useState(false);
	const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
	const [showPreviewModal, setShowPreviewModal] = useState(false);
	const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);

	// Queries
	const invoiceWithPayments = useQuery(api.invoices.getWithPayments, {
		id: invoiceId,
	});
	const invoice = invoiceWithPayments;
	const client = useQuery(
		api.clients.get,
		invoice?.clientId ? { id: invoice.clientId } : "skip"
	);
	const project = useQuery(
		api.projects.get,
		invoice?.projectId ? { id: invoice.projectId } : "skip"
	);
	// Gate on the invoice resolving: a cross-org id makes getWithPayments return
	// null, so skip listByInvoice rather than let it throw an org-mismatch error.
	const lineItems = useQuery(
		api.invoiceLineItems.listByInvoice,
		invoice ? { invoiceId } : "skip"
	);
	const organization = useQuery(api.organizations.get, {});
	// Skip document queries without the documents grant — they call
	// requireLevel("documents","view") server-side and throw FORBIDDEN otherwise.
	const latestDocument = useQuery(
		api.documents.getLatest,
		invoice && can("documents")
			? { documentType: "invoice", documentId: invoice._id }
			: "skip"
	);
	const allDocumentVersions = useQuery(
		api.documents.getAllVersions,
		invoice && can("documents")
			? { documentType: "invoice", documentId: invoice._id }
			: "skip"
	);
	const primaryContact = useQuery(
		api.clientContacts.getPrimaryContact,
		invoice?.clientId ? { clientId: invoice.clientId } : "skip"
	);
	const primaryProperty = useQuery(
		api.clientProperties.getPrimaryProperty,
		invoice?.clientId ? { clientId: invoice.clientId } : "skip"
	);

	// Mutations
	const updateInvoice = useMutation(api.invoices.update);
	// clientSends pre-flight: draft sends and Mark as Sent debit; resends never do.
	const { exhausted: sendsExhausted, reason: sendsReason } =
		useClientSendMeter();
	const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
	const createDocument = useMutation(api.documents.create);

	// Last render produced by the preview, kept so Generate can skip a second
	// identical render. Invalidated by any client-visible content change.
	const previewBlobRef = useRef<{
		blob: Blob;
		contentUpdatedAt: number | undefined;
		paymentsFingerprint: string;
		renderInputsFingerprint: string;
		invoiceId: Id<"invoices">;
	} | null>(null);

	// The PDF also renders client/org/property data that contentUpdatedAt never
	// tracks. "loading" keeps a blob rendered before those queries resolved from
	// matching one rendered after.
	const renderInputsFingerprint = useMemo(
		() =>
			JSON.stringify(
				[client, organization, primaryProperty].map((doc) =>
					doc === undefined ? "loading" : doc
				)
			),
		[client, organization, primaryProperty]
	);

	// The PDF prints the payment schedule, but payment writes do not stamp the
	// invoice's contentUpdatedAt — fingerprint the rendered fields separately.
	const paymentsFingerprint = useMemo(
		() =>
			JSON.stringify(
				(invoiceWithPayments?.payments ?? []).map((p) => [
					p._id,
					p.paymentAmount,
					p.dueDate,
					p.description,
					p.sortOrder,
				])
			),
		[invoiceWithPayments?.payments]
	);

	// The generated PDF is stale once the invoice's client-visible content moved
	// after the newest document was stored. No stamp means nothing to compare.
	const isPdfStale = Boolean(
		latestDocument &&
			invoice?.contentUpdatedAt !== undefined &&
			invoice.contentUpdatedAt > latestDocument.generatedAt
	);

	// Derived state
	const selectedDocument = useMemo(() => {
		if (selectedVersionId && allDocumentVersions) {
			return allDocumentVersions.find(
				(v) => v._id === selectedVersionId
			);
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
	const handleStatusChange = async (status: InvoiceStatus) => {
		try {
			await updateInvoice({ id: invoiceId, status });
			toast.success(
				"Invoice Updated",
				`Status changed to ${formatStatus(status)}`
			);
		} catch (err) {
			toast.error("Error", convexErrorMessage(err, "Failed to update status"));
		}
	};

	const handleMarkPaid = async () => {
		try {
			await updateInvoice({ id: invoiceId, status: "paid" });
			toast.success(
				"Invoice Paid",
				"Invoice marked as paid successfully"
			);
		} catch (err) {
			const message =
				err instanceof Error
					? err.message
					: "Failed to mark as paid";
			toast.error("Error", message);
		}
	};

	const confirmCancelInvoice = async () => {
		// Success toast + modal close are owned by DeleteConfirmationModal;
		// let errors propagate so the modal shows a single error toast.
		await updateInvoice({ id: invoiceId, status: "cancelled" });
	};

	// Renders the invoice PDF exactly the way Generate does, so what the preview
	// shows is what gets uploaded. The result is cached against the invoice's
	// contentUpdatedAt stamp and reused by Generate while it stays valid.
	const renderInvoicePdf = useCallback(async () => {
		if (!invoice || !lineItems) {
			throw new Error(
				"This invoice is still loading. Try again in a moment."
			);
		}
		const blob = await buildInvoicePdfBlob({
			invoice,
			lineItems,
			payments: invoiceWithPayments?.payments,
			client,
			organization,
			primaryProperty,
		});
		previewBlobRef.current = {
			blob,
			contentUpdatedAt: invoice.contentUpdatedAt,
			paymentsFingerprint,
			renderInputsFingerprint,
			invoiceId: invoice._id,
		};
		return blob;
	}, [
		invoice,
		lineItems,
		invoiceWithPayments?.payments,
		paymentsFingerprint,
		renderInputsFingerprint,
		client,
		organization,
		primaryProperty,
	]);

	const takeCachedPdfBlob = (): Blob | null => {
		const cached = previewBlobRef.current;
		if (!cached || !invoice) return null;
		if (cached.invoiceId !== invoice._id) return null;
		// Any client-visible edit since the preview invalidates it.
		if (cached.contentUpdatedAt !== invoice.contentUpdatedAt) return null;
		if (cached.paymentsFingerprint !== paymentsFingerprint) return null;
		if (cached.renderInputsFingerprint !== renderInputsFingerprint)
			return null;
		return cached.blob;
	};

	const handleGeneratePdf = async () => {
		let loadingId;
		try {
			if (!invoice || !lineItems) return;
			loadingId = toast.loading(
				"Generating PDF",
				"Rendering and uploading..."
			);

			// Reuse the preview's render when the invoice content has not moved since.
			const invoiceBlob = takeCachedPdfBlob() ?? (await renderInvoicePdf());

			const uploadUrl = await generateUploadUrl({});
			const res = await fetch(uploadUrl, {
				method: "POST",
				headers: { "Content-Type": "application/pdf" },
				body: invoiceBlob,
			});
			if (!res.ok) throw new Error("Failed to upload PDF");
			const { storageId } = await res.json();
			await createDocument({
				documentType: "invoice",
				documentId: invoice._id,
				storageId: storageId as unknown as StorageId<"_storage">,
			});
			toast.removeToast(loadingId);
			toast.success("PDF generated", "Your invoice PDF is ready.");
		} catch (error) {
			if (loadingId) {
				toast.removeToast(loadingId);
			}
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
			link.download = `Invoice-${invoice?.invoiceNumber || invoice?._id.slice(-6) || "document"}${versionSuffix}.pdf`;
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

	// Loading state
	if (invoice === undefined) {
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

	// Invoice not found
	if (invoice === null) {
		return (
			<div className="relative pl-6 pt-8 pb-20">
				<div className="mx-auto">
					<div className="flex flex-col items-center justify-center py-12 text-center">
						<div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center mb-4">
							<ExclamationTriangleIcon className="h-8 w-8 text-red-600 dark:text-red-400" />
						</div>
						<h3 className="text-lg font-medium text-foreground mb-2">
							Invoice not found
						</h3>
						<p className="text-muted-foreground">
							The invoice you&apos;re looking for doesn&apos;t
							exist or you don&apos;t have permission to view
							it.
						</p>
					</div>
				</div>
			</div>
		);
	}

	const currentStatus = deriveInvoiceStatus(invoice, orgToday);

	// A refund reopens the balance but never mints a row to collect it, so the
	// client is left with nothing to pay until the owner schedules one.
	const payments = invoiceWithPayments?.payments ?? [];
	const uncoveredByRefund =
		payments.some((p) => refundedAmountOf(p) > 0) &&
		!payments.some(isPayableRow) &&
		remainingBalance(invoice.total, payments) > 0;

	return (
		<>
			<div className="relative min-h-screen pl-6 pt-6">
				{/* Header */}
				<InvoiceDetailHeader
					invoice={invoice}
					currentStatus={currentStatus}
					onStatusChange={handleStatusChange}
					onMarkPaid={handleMarkPaid}
					onSendEmail={() => setIsEmailModalOpen(true)}
					sendCapReached={sendsExhausted && !invoice.firstSentAt}
					sendCapReason={sendsReason}
					onGeneratePdf={handleGeneratePdf}
					onCancel={() => setIsCancelModalOpen(true)}
				/>

				{/* Tabs + Sidebar */}
				<InvoiceDetailTabs
					banner={
						// A refund the schedule doesn't cover blocks payment outright, so
						// it outranks a deadline the client cannot act on anyway.
						uncoveredByRefund ? (
							<Frame>
								<FramePanel className="overflow-hidden p-0!">
									<Alert
										variant="warning"
										// The warning token is a bright amber; its icon needs the
										// readable-on-tint counterpart to clear AA in light mode.
										className="border-0 bg-warning/5 shadow-none [&>svg]:text-warning-foreground"
									>
										<Undo2 />
										<AlertTitle>Your client cannot pay this invoice</AlertTitle>
										{can("invoices", "modify") && (
											<AlertAction>
												<Button
													size="xs"
													variant="outline"
													onClick={() => setIsPaymentsModalOpen(true)}
												>
													Configure
												</Button>
											</AlertAction>
										)}
										<AlertDescription>
											A refund reopened{" "}
											{formatCurrency(
												remainingBalance(invoice.total, payments)
											)}{" "}
											of the balance, and no installment covers it. Add one to
											the schedule and the Pay button comes back.
										</AlertDescription>
									</Alert>
								</FramePanel>
							</Frame>
						) : currentStatus === "overdue" ? (
							<Frame>
								<FramePanel className="overflow-hidden p-0!">
									<Alert
										variant="destructive"
										className="border-0 bg-destructive/5 shadow-none"
									>
										<CalendarClock />
										<AlertTitle>This invoice is past due</AlertTitle>
										{can("invoices", "modify") && (
											<AlertAction>
												<Button
													size="xs"
													variant="destructive"
													onClick={() => setIsPaymentsModalOpen(true)}
												>
													Reschedule payments
												</Button>
											</AlertAction>
										)}
										<AlertDescription>
											It was due {formatCalendarDate(invoice.dueDate)}.
											Reschedule the payments to give the client a new deadline.
										</AlertDescription>
									</Alert>
								</FramePanel>
							</Frame>
						) : null
					}
					activeTab={activeTab}
					onTabChange={setActiveTab}
					invoice={invoice}
					invoiceId={invoiceId}
					lineItems={lineItems}
					client={client}
					project={project}
					primaryContact={primaryContact}
					primaryProperty={primaryProperty}
					organization={organization}
					invoiceWithPayments={invoiceWithPayments}
					onConfigurePayments={() => setIsPaymentsModalOpen(true)}
					latestDocument={latestDocument}
					allDocumentVersions={allDocumentVersions}
					selectedDocument={selectedDocument}
					selectedDocumentUrl={selectedDocumentUrl}
					onGeneratePdf={handleGeneratePdf}
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
			<EntityEmailModal
				open={isEmailModalOpen}
				onOpenChange={setIsEmailModalOpen}
				entity={{
					type: "invoice",
					id: invoiceId,
					number: invoice.invoiceNumber,
					clientId: invoice.clientId,
					total: invoice.total,
					dateStamp: invoice.dueDate,
					contentUpdatedAt: invoice.contentUpdatedAt,
					firstSentAt: invoice.firstSentAt,
				}}
				onRegeneratePdf={handleGeneratePdf}
			/>
			<DeleteConfirmationModal
				isOpen={isCancelModalOpen}
				onClose={() => setIsCancelModalOpen(false)}
				onConfirm={confirmCancelInvoice}
				title="Cancel Invoice"
				itemName={
					invoice.invoiceNumber ||
					`Invoice #${invoice._id.slice(-6)}`
				}
				itemType="Invoice"
				mode="cancel"
			/>

			<DocumentPreviewModal
				open={showPreviewModal}
				onOpenChange={setShowPreviewModal}
				title="Invoice preview"
				description="This is exactly what gets saved when you generate the PDF."
				renderDocument={renderInvoicePdf}
				downloadFileName={`Invoice-${invoice.invoiceNumber || invoice._id.slice(-6)}.pdf`}
				primaryAction={{
					label: "Generate PDF",
					disabled: !can("invoices", "modify"),
					onAction: () => {
						setShowPreviewModal(false);
						void handleGeneratePdf();
					},
				}}
			/>

			{invoice && (
				<PaymentsConfigurationModal
					isOpen={isPaymentsModalOpen}
					onClose={() => setIsPaymentsModalOpen(false)}
					invoiceId={invoiceId}
					invoiceTotal={invoice.total}
					invoiceDueDate={invoice.dueDate}
					existingPayments={
						invoiceWithPayments?.payments?.map((p) => ({
							_id: p._id,
							paymentAmount: p.paymentAmount,
							dueDate: p.dueDate,
							description: p.description,
							status: p.status,
							sortOrder: p.sortOrder,
							refundedAmount: p.refundedAmount,
						})) || []
					}
				/>
			)}
		</>
	);
}

export default function InvoiceDetailPage() {
	return (
		<PermissionGate object="invoices">
			<InvoiceDetailPageContent />
		</PermissionGate>
	);
}
