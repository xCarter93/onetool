"use client";

import { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import { useCallback, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { HighlightMetricGrid } from "@/components/shared/highlight-metric-grid";
import { DollarSign, CreditCard, Eye } from "lucide-react";
import {
	Frame,
	FrameFooter,
	FrameHeader,
	FramePanel,
	FrameTitle,
} from "@/components/reui/frame";
import { formatCurrency } from "@/lib/money";
import { useToast } from "@/hooks/use-toast";
import { convexErrorMessage } from "@/lib/convex-error";
import {
	LineItemGrid,
	LineItemGridHints,
} from "@/components/shared/line-items/line-item-grid";
import { LineItemsTotals } from "@/components/shared/line-items/line-items-totals";
import { PricingFooter } from "@/components/shared/line-items/pricing-footer";
import { SaveStateIndicator } from "@/components/shared/line-items/save-state-indicator";
import { SelectionActions } from "@/components/shared/line-items/selection-actions";
import { useInvoiceLineItemsController } from "@/components/shared/line-items/use-invoice-line-items-controller";
import {
	computeDisplayTotals,
	type LineItemsPricingSettings,
} from "@/components/shared/line-items/types";
import {
	deriveInvoiceDisplayPricing,
	legacyTaxRateFromAmounts,
	resolveInvoicePricingMode,
} from "@/components/shared/line-items/invoice-pricing";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";

interface OverviewTabProps {
	invoice: Doc<"invoices">;
	invoiceId: Id<"invoices">;
	lineItems: Doc<"invoiceLineItems">[] | undefined;
	/** Payment schedule rows — a settled row locks line items and pricing. */
	payments: Doc<"payments">[] | undefined;
	paymentSummary?: {
		totalPayments: number;
		paidCount: number;
	};
	onPreviewPdf: () => void;
	/** True while the invoice has nothing to render (loading or no line items). */
	previewDisabled: boolean;
}

export function OverviewTab({
	invoice,
	invoiceId,
	lineItems,
	payments,
	paymentSummary,
	onPreviewPdf,
	previewDisabled,
}: OverviewTabProps) {
	const toast = useToast();
	const updateInvoice = useMutation(api.invoices.update);

	const controller = useInvoiceLineItemsController({
		invoice,
		invoiceId,
		lineItems,
		payments,
	});

	// Row selection lives here so the frame header can host the bulk actions.
	// Pruned at derivation time — a deleted row must not linger as selected.
	const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);
	const selection = useMemo(
		() =>
			selectedLineIds.filter((id) =>
				controller.items.some((item) => item.id === id)
			),
		[selectedLineIds, controller.items]
	);

	const pricingMode = resolveInvoicePricingMode(invoice);

	// Panel state. A legacy invoice has no rate fields yet, so seed the panel
	// from its stored dollar amounts — the first save writes the quote-style
	// fields and flips the invoice to quote mode permanently.
	const pricing: LineItemsPricingSettings = useMemo(() => {
		const pdfSettings = {
			showQuantities: invoice.pdfSettings?.showQuantities ?? true,
			showUnitPrices: invoice.pdfSettings?.showUnitPrices ?? true,
			showLineItemTotals: invoice.pdfSettings?.showLineItemTotals ?? true,
			showTotals: invoice.pdfSettings?.showTotals ?? true,
		};

		if (pricingMode === "legacy") {
			const discountAmount = invoice.discountAmount ?? 0;
			return {
				discountAmount,
				discountType: "fixed" as const,
				taxRate: legacyTaxRateFromAmounts(
					invoice.subtotal,
					discountAmount,
					invoice.taxAmount ?? 0
				),
				pdfSettings,
			};
		}

		return {
			discountAmount: invoice.discountEnabled ? (invoice.discountAmount ?? 0) : 0,
			discountType: invoice.discountType ?? "fixed",
			taxRate: invoice.taxEnabled ? (invoice.taxRate ?? 0) : 0,
			pdfSettings,
		};
	}, [
		pricingMode,
		invoice.subtotal,
		invoice.discountEnabled,
		invoice.discountAmount,
		invoice.discountType,
		invoice.taxEnabled,
		invoice.taxRate,
		invoice.taxAmount,
		invoice.pdfSettings,
	]);

	const subtotal = useMemo(
		() =>
			controller.items.reduce((sum, item) => sum + item.quantity * item.rate, 0),
		[controller.items]
	);
	const totalCost = useMemo(
		() =>
			controller.items.reduce(
				(sum, item) => sum + item.quantity * (item.cost ?? 0),
				0
			),
		[controller.items]
	);

	// Legacy invoices show their STORED figures — their discount/tax dollars were
	// never derived from a rate, so recomputing would move numbers the client has
	// already seen. Quote-style invoices compute live like the quote tab.
	const legacyPricing = deriveInvoiceDisplayPricing(invoice);
	const totals =
		pricingMode === "legacy"
			? {
					subtotal: invoice.subtotal,
					discountAmount: legacyPricing.discountDollars,
					taxAmount: legacyPricing.taxDollars,
					total: invoice.total,
				}
			: computeDisplayTotals(subtotal, pricing);

	const savePricing = useCallback(
		async (next: LineItemsPricingSettings) => {
			try {
				// Sending the mode fields flips a legacy invoice to quote-style
				// pricing, so a PDF-columns-only edit must not include them.
				const pricingChanged =
					next.discountAmount !== pricing.discountAmount ||
					next.discountType !== pricing.discountType ||
					next.taxRate !== pricing.taxRate;
				// Never send subtotal/total/taxAmount — the server recomputes them
				// from the line items via syncInvoiceTotals.
				await updateInvoice({
					id: invoiceId,
					...(pricingChanged
						? {
								discountEnabled: next.discountAmount > 0,
								discountAmount: next.discountAmount,
								discountType: next.discountType,
								taxEnabled: next.taxRate > 0,
								taxRate: next.taxRate,
							}
						: {}),
					pdfSettings: next.pdfSettings,
				});
			} catch (err) {
				toast.error(
					"Couldn't save pricing",
					convexErrorMessage(err, "Failed to save")
				);
			}
		},
		[invoiceId, pricing, toast, updateInvoice]
	);

	return (
		<div className="space-y-8">
			{/* Summary Cards */}
			<HighlightMetricGrid
				metrics={[
					{
						icon: DollarSign,
						label: "Total Amount",
						value: formatCurrency(invoice.total),
						description: "Invoice grand total",
					},
					{
						icon: CreditCard,
						label: "Payments",
						value: paymentSummary?.totalPayments ?? 0,
						description:
							paymentSummary && paymentSummary.totalPayments > 0
								? `${paymentSummary.paidCount} paid`
								: "No payments yet",
					},
				]}
			/>

			{/* Line Items */}
			<div className="space-y-3">
				{!controller.locked && <LineItemGridHints />}

				<Frame dense spacing="sm">
					<FrameHeader className="flex-row items-center justify-between gap-3">
						<FrameTitle>Line Items</FrameTitle>
						<div className="flex items-center gap-2.5">
							{selection.length > 0 ? (
								<SelectionActions
									className="duration-150 ease-out animate-in fade-in-0 motion-reduce:animate-none"
									count={selection.length}
									onDuplicate={() => {
										void controller.duplicateItems(selection);
										setSelectedLineIds([]);
									}}
									onDelete={() => {
										void controller.removeItems(selection);
										setSelectedLineIds([]);
									}}
									onClear={() => setSelectedLineIds([])}
								/>
							) : (
								<div className="flex items-center gap-2.5 duration-150 ease-out animate-in fade-in-0 motion-reduce:animate-none">
									<SaveStateIndicator state={controller.saveState} />
									<Tooltip>
										<TooltipTrigger
											render={
												<span
													// A disabled button swallows pointer events, so
													// the tooltip needs a live wrapper to hang off.
													tabIndex={previewDisabled ? 0 : -1}
													className="inline-flex rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
												/>
											}
										>
											<Button
												variant="outline"
												size="sm"
												disabled={previewDisabled}
												onClick={onPreviewPdf}
											>
												<Eye className="h-4 w-4" aria-hidden="true" />
												Preview Document
											</Button>
										</TooltipTrigger>
										{previewDisabled && (
											<TooltipContent>
												Add a line item to preview this invoice
											</TooltipContent>
										)}
									</Tooltip>
								</div>
							)}
						</div>
					</FrameHeader>

					<FramePanel className="px-0 py-0">
						<LineItemGrid
							bare
							showHints={false}
							selectedIds={selection}
							onSelectionChange={setSelectedLineIds}
							controller={controller}
							isLoading={lineItems === undefined}
						/>
					</FramePanel>

					<FrameFooter>
						<PricingFooter
							value={pricing}
							onSave={savePricing}
							disabled={controller.locked}
						/>
					</FrameFooter>
				</Frame>

				<LineItemsTotals
					subtotal={totals.subtotal}
					discountAmount={totals.discountAmount}
					taxAmount={totals.taxAmount}
					total={totals.total}
					showCostMargin={controller.showCostMargin}
					totalCost={totalCost}
					className="mt-0"
				/>
			</div>
		</div>
	);
}
