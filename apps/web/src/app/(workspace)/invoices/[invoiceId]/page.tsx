"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { useToast } from "@/hooks/use-toast";
import { pdf } from "@react-pdf/renderer";
import InvoicePDF from "@/app/(workspace)/invoices/components/InvoicePDF";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import type { Id as StorageId } from "@onetool/backend/convex/_generated/dataModel";
import { useState, useMemo } from "react";
import DeleteConfirmationModal from "@/components/ui/delete-confirmation-modal";
import { Skeleton } from "@/components/ui/skeleton";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { InvoiceDetailHeader } from "./components/invoice-detail-header";
import { InvoiceDetailTabs } from "./components/invoice-detail-tabs";
import { PaymentsConfigurationModal } from "../components/payments-configuration-modal";

type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled";

const getInvoiceStatus = (
	status: InvoiceStatus,
	dueDate?: number
): InvoiceStatus => {
	if (status === "sent" && dueDate && dueDate < Date.now()) return "overdue";
	return status;
};

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

export default function InvoiceDetailPage() {
	const router = useRouter();
	const params = useParams();
	const toast = useToast();
	const invoiceId = params.invoiceId as Id<"invoices">;

	// State
	const [activeTab, setActiveTab] = useState("overview");
	const [selectedVersionId, setSelectedVersionId] =
		useState<Id<"documents"> | null>(null);
	const [showVersionHistory, setShowVersionHistory] = useState(false);
	const [isPaymentsModalOpen, setIsPaymentsModalOpen] = useState(false);
	const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);

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
	const lineItems = useQuery(api.invoiceLineItems.listByInvoice, {
		invoiceId,
	});
	const organization = useQuery(api.organizations.get, {});
	const latestDocument = useQuery(
		api.documents.getLatest,
		invoice
			? { documentType: "invoice", documentId: invoice._id }
			: "skip"
	);
	const allDocumentVersions = useQuery(
		api.documents.getAllVersions,
		invoice
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
	const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
	const createDocument = useMutation(api.documents.create);

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
		selectedDocument ? { id: selectedDocument._id } : "skip"
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
			const message =
				err instanceof Error
					? err.message
					: "Failed to update status";
			toast.error("Error", message);
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
		try {
			await updateInvoice({ id: invoiceId, status: "cancelled" });
			toast.success(
				"Invoice Cancelled",
				"Invoice has been cancelled"
			);
			setIsCancelModalOpen(false);
		} catch (err) {
			const message =
				err instanceof Error
					? err.message
					: "Failed to cancel invoice";
			toast.error("Error", message);
			setIsCancelModalOpen(false);
		}
	};

	const handleGeneratePdf = async () => {
		let loadingId;
		try {
			if (!invoice || !lineItems) return;
			loadingId = toast.loading(
				"Generating PDF",
				"Rendering and uploading..."
			);

			const element = (
				<InvoicePDF
					invoice={invoice}
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
					payments={invoiceWithPayments?.payments}
				/>
			);
			const invoiceBlob = await pdf(element).toBlob();

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

	const currentStatus = getInvoiceStatus(
		invoice.status as InvoiceStatus,
		invoice.dueDate
	);

	return (
		<>
			<div className="relative min-h-screen pl-6 pt-6">
				{/* Header */}
				<InvoiceDetailHeader
					invoice={invoice}
					currentStatus={currentStatus}
					onStatusChange={handleStatusChange}
					onMarkPaid={handleMarkPaid}
					onSendToClient={() => {
						// TODO: Implement send email sheet for invoices
						toast.info(
							"Coming soon",
							"Email sending for invoices is coming soon."
						);
					}}
					onGeneratePdf={handleGeneratePdf}
					onCancel={() => setIsCancelModalOpen(true)}
				/>

				{/* Tabs + Sidebar */}
				<InvoiceDetailTabs
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
					invoiceWithPayments={invoiceWithPayments!}
					onConfigurePayments={() => setIsPaymentsModalOpen(true)}
					latestDocument={latestDocument}
					allDocumentVersions={allDocumentVersions}
					selectedDocument={selectedDocument}
					selectedDocumentUrl={selectedDocumentUrl}
					onGeneratePdf={handleGeneratePdf}
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
				isOpen={isCancelModalOpen}
				onClose={() => setIsCancelModalOpen(false)}
				onConfirm={confirmCancelInvoice}
				title="Cancel Invoice"
				itemName={
					invoice.invoiceNumber ||
					`Invoice #${invoice._id.slice(-6)}`
				}
				itemType="Invoice"
				isArchive={true}
			/>

			{invoice && (
				<PaymentsConfigurationModal
					isOpen={isPaymentsModalOpen}
					onClose={() => setIsPaymentsModalOpen(false)}
					invoiceId={invoiceId}
					invoiceTotal={invoice.total}
					existingPayments={
						invoiceWithPayments?.payments?.map((p) => ({
							_id: p._id,
							paymentAmount: p.paymentAmount,
							dueDate: p.dueDate,
							description: p.description,
							status: p.status,
							sortOrder: p.sortOrder,
						})) || []
					}
				/>
			)}
		</>
	);
}
