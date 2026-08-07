"use client";

import { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import { useCallback, useMemo } from "react";
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
import {
	LineItemGrid,
	LineItemGridHints,
} from "@/components/shared/line-items/line-item-grid";
import { LineItemsTotals } from "@/components/shared/line-items/line-items-totals";
import { PricingFooter } from "@/components/shared/line-items/pricing-footer";
import { SaveStateIndicator } from "@/components/shared/line-items/save-state-indicator";
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
				// Never send subtotal/total/taxAmount — the server recomputes them
				// from the line items via syncInvoiceTotals.
				await updateInvoice({
					id: invoiceId,
					discountEnabled: next.discountAmount > 0,
					discountAmount: next.discountAmount,
					discountType: next.discountType,
					taxEnabled: next.taxRate > 0,
					taxRate: next.taxRate,
					pdfSettings: next.pdfSettings,
				});
			} catch (err) {
				const message = err instanceof Error ? err.message : "Failed to save";
				toast.error("Error", message);
			}
		},
		[invoiceId, toast, updateInvoice]
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
							<SaveStateIndicator state={controller.saveState} />
							<Tooltip>
								<TooltipTrigger
									render={
										<span
											// A disabled button swallows pointer events, so the
											// tooltip needs a live wrapper to hang off.
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
					</FrameHeader>

					<FramePanel className="px-0 py-0">
						<LineItemGrid
							bare
							showHints={false}
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
