"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import Modal from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup } from "@headlessui/react";
import { CheckCircleIcon } from "@heroicons/react/24/solid";
import { Loader2, Receipt } from "lucide-react";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { ApprovedQuote } from "@/types/quote";
import { formatCurrency } from "@/lib/money";

interface InvoiceGenerationModalProps {
	isOpen: boolean;
	onClose: () => void;
	approvedQuotes: ApprovedQuote[];
}

const formatDate = (timestamp: number) => {
	return new Date(timestamp).toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
};

export function InvoiceGenerationModal({
	isOpen,
	onClose,
	approvedQuotes,
}: InvoiceGenerationModalProps) {
	const router = useRouter();
	const toast = useToast();
	const [selectedQuoteId, setSelectedQuoteId] = useState<Id<"quotes"> | null>(
		approvedQuotes.length > 0 ? approvedQuotes[0]._id : null
	);
	const [isCreating, setIsCreating] = useState(false);

	const createInvoiceFromQuote = useMutation(api.invoices.createFromQuote);

	const handleCreateInvoice = async () => {
		if (!selectedQuoteId) {
			toast.error(
				"No Quote Selected",
				"Please select a quote to generate an invoice from."
			);
			return;
		}

		setIsCreating(true);
		try {
			const loadingId = toast.loading(
				"Creating Invoice",
				"Converting quote to invoice..."
			);

			// Create invoice with default dates (issued now, due in 30 days)
			const invoiceId = await createInvoiceFromQuote({
				quoteId: selectedQuoteId,
				issuedDate: Date.now(),
				dueDate: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days from now
			});

			toast.removeToast(loadingId);
			toast.success(
				"Invoice Created",
				"Quote converted to invoice successfully"
			);

			// Close modal and navigate to the new invoice
			onClose();
			router.push(`/invoices/${invoiceId}`);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to create invoice";
			toast.error("Invoice Creation Failed", message);
		} finally {
			setIsCreating(false);
		}
	};

	return (
		<Modal isOpen={isOpen} onClose={onClose} size="2xl" animation="scale">
			<div className="space-y-4">
				{/* Header */}
				<div className="mb-4">
					<div className="flex items-center gap-2 mb-2">
						<Receipt className="h-6 w-6 text-primary" />
						<h2 className="text-xl font-semibold text-gray-900 dark:text-white">
							Generate Invoice from Quote
						</h2>
					</div>
					<p className="text-sm text-gray-600 dark:text-gray-400">
						Select an approved quote to convert into an invoice. All line items
						and totals will be copied to the new invoice.
					</p>
				</div>

				{/* Content */}
				<div className="py-4">
					{approvedQuotes.length === 0 ? (
						<div className="text-center py-8">
							<Receipt className="h-12 w-12 text-gray-400 mx-auto mb-3" />
							<p className="text-sm text-gray-600 dark:text-gray-400">
								No approved quotes available for this project.
							</p>
							<p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
								Please approve a quote first before generating an invoice.
							</p>
						</div>
					) : (
						<RadioGroup value={selectedQuoteId} onChange={setSelectedQuoteId}>
							<div className="space-y-3">
								{approvedQuotes.map((quote) => (
									<RadioGroup.Option
										key={quote._id}
										value={quote._id}
										className={({ checked }) =>
											`relative flex cursor-pointer rounded-lg border-2 px-5 py-4 transition-all ${
												checked
													? "border-primary bg-primary/5 ring-2 ring-primary/20"
													: "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
											}`
										}
									>
										{({ checked }) => (
											<div className="flex w-full items-center justify-between">
												<div className="flex items-center gap-4">
													<div
														className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all ${
															checked
																? "border-primary bg-primary"
																: "border-gray-300 dark:border-gray-600"
														}`}
													>
														{checked && (
															<CheckCircleIcon className="h-5 w-5 text-white" />
														)}
													</div>
													<div className="flex-1">
														<div className="flex items-center gap-3">
													<p className="font-semibold text-gray-900 dark:text-white">
														Quote #
														{quote.quoteNumber || quote._id.slice(-6)}
													</p>
													<Badge variant="default" className="text-xs">
														Approved
													</Badge>
												</div>
												<p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
													Created on {formatDate(quote._creationTime || Date.now())}
												</p>
													</div>
												</div>
												<div className="text-right">
													<p className="text-lg font-bold text-gray-900 dark:text-white">
														{quote.total ? formatCurrency(quote.total) : "$0"}
													</p>
												</div>
											</div>
										)}
									</RadioGroup.Option>
								))}
							</div>
						</RadioGroup>
					)}
				</div>

				{/* Footer */}
				<div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
					<Button onClick={onClose} variant="outline" disabled={isCreating}>
						Cancel
					</Button>
					<Button
						onClick={handleCreateInvoice}
						disabled={
							!selectedQuoteId || isCreating || approvedQuotes.length === 0
						}
					>
						{isCreating && <Loader2 className="h-4 w-4 animate-spin" />}
						Create Invoice
					</Button>
				</div>
			</div>
		</Modal>
	);
}
