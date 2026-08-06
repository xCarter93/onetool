"use client";

import { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import { useCallback, useMemo } from "react";
import { useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { HighlightMetricGrid } from "@/components/shared/highlight-metric-grid";
import { Check, DollarSign, CreditCard, Loader2, Plus, TriangleAlert } from "lucide-react";
import { formatCurrency } from "@/lib/money";
import { useToast } from "@/hooks/use-toast";
import { LineItemGrid } from "@/components/shared/line-items/line-item-grid";
import { LineItemsTotals } from "@/components/shared/line-items/line-items-totals";
import { PricingPanel } from "@/components/shared/line-items/pricing-panel";
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
import { cn } from "@/lib/utils";

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
}

export function OverviewTab({
	invoice,
	invoiceId,
	lineItems,
	payments,
	paymentSummary,
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

			{/* Line Items Section */}
			<div>
				<div className="flex items-center justify-between mb-1 min-h-8 gap-3">
					<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
						Line Items
					</h3>
					{/* Actions rail — a "Preview Document" button lands here next. */}
					<div className="flex items-center gap-2.5">
						<span
							className={cn(
								"flex items-center gap-1.5 text-xs",
								controller.saveState === "error"
									? "text-destructive"
									: controller.saveState === "saving"
										? "text-muted-foreground"
										: "text-success"
							)}
							aria-live="polite"
						>
							{controller.saveState === "saving" ? (
								<>
									<Loader2
										className="h-3 w-3 animate-spin motion-reduce:animate-none"
										aria-hidden="true"
									/>
									Saving…
								</>
							) : controller.saveState === "error" ? (
								<>
									<TriangleAlert className="h-3 w-3" aria-hidden="true" />
									Couldn&apos;t save
								</>
							) : (
								<>
									<Check className="h-3 w-3" aria-hidden="true" />
									All changes saved
								</>
							)}
						</span>
						{!controller.locked && (
							<Button
								variant="outline"
								size="sm"
								// Until the query resolves the row count is 0, which would
								// hand the new line a colliding sortOrder.
								disabled={lineItems === undefined}
								onClick={() => void controller.addItem()}
							>
								<Plus className="h-4 w-4" />
								Add line
							</Button>
						)}
					</div>
				</div>
				<Separator className="mb-4" />

				<LineItemGrid
					controller={controller}
					isLoading={lineItems === undefined}
				/>

				<LineItemsTotals
					subtotal={totals.subtotal}
					discountAmount={totals.discountAmount}
					taxAmount={totals.taxAmount}
					total={totals.total}
					showCostMargin={controller.showCostMargin}
					totalCost={totalCost}
				/>

				<PricingPanel
					value={pricing}
					onSave={savePricing}
					subtotal={subtotal}
					disabled={controller.locked}
				/>
			</div>
		</div>
	);
}
