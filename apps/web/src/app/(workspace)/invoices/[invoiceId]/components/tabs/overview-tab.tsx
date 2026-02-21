"use client";

import { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { StyledButton } from "@/components/ui/styled/styled-button";
import { StyledCard, StyledCardContent } from "@/components/ui/styled";
import { Settings, ClipboardList, DollarSign, CreditCard } from "lucide-react";
import { useRouter } from "next/navigation";

function formatCurrency(amount: number) {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(amount);
}

interface OverviewTabProps {
	invoice: Doc<"invoices">;
	invoiceId: Id<"invoices">;
	lineItems: Doc<"invoiceLineItems">[] | undefined;
	paymentSummary?: {
		totalPayments: number;
		paidCount: number;
	};
}

export function OverviewTab({
	invoice,
	invoiceId,
	lineItems,
	paymentSummary,
}: OverviewTabProps) {
	const router = useRouter();

	return (
		<div className="space-y-8">
			{/* Summary Cards */}
			<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<StyledCard>
					<StyledCardContent className="flex items-center gap-3 p-4">
						<div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
							<DollarSign className="h-5 w-5 text-primary" />
						</div>
						<div>
							<p className="text-2xl font-bold text-foreground">
								{formatCurrency(invoice.total)}
							</p>
							<p className="text-xs text-muted-foreground">
								Total Amount
							</p>
						</div>
					</StyledCardContent>
				</StyledCard>

				<StyledCard>
					<StyledCardContent className="flex items-center gap-3 p-4">
						<div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
							<CreditCard className="h-5 w-5 text-primary" />
						</div>
						<div>
							<p className="text-2xl font-bold text-foreground">
								{paymentSummary?.totalPayments ?? 0}
							</p>
							<p className="text-xs text-muted-foreground">
								Payments{paymentSummary && paymentSummary.totalPayments > 0
									? ` \u00B7 ${paymentSummary.paidCount} paid`
									: ""}
							</p>
						</div>
					</StyledCardContent>
				</StyledCard>
			</div>

			{/* Line Items Section */}
			<div>
				<div className="flex items-center justify-between mb-1 min-h-8">
					<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
						Line Items
					</h3>
					<StyledButton
						intent="outline"
						size="sm"
						onClick={() =>
							router.push(
								`/invoices/${invoiceId}/lineEditor`
							)
						}
						icon={<Settings className="h-4 w-4" />}
						label="Edit Line Items"
						showArrow={false}
					/>
				</div>
				<Separator className="mb-4" />

				{lineItems && lineItems.length > 0 ? (
					<>
						<div className="overflow-hidden rounded-lg border">
							<Table>
								<TableHeader className="bg-muted">
									<TableRow>
										<TableHead>Description</TableHead>
										<TableHead className="text-center">
											Qty
										</TableHead>
										<TableHead className="text-right">
											Unit Price
										</TableHead>
										<TableHead className="text-right">
											Total
										</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{lineItems.map((item) => (
										<TableRow key={item._id}>
											<TableCell className="font-medium">
												{item.description}
											</TableCell>
											<TableCell className="text-center">
												{item.quantity}
											</TableCell>
											<TableCell className="text-right">
												{formatCurrency(
													item.unitPrice
												)}
											</TableCell>
											<TableCell className="text-right font-medium">
												{formatCurrency(item.total)}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>

						{/* Totals */}
						<div className="mt-6 space-y-2">
							<div className="flex justify-between text-sm">
								<span className="text-muted-foreground">
									Subtotal:
								</span>
								<span className="font-medium">
									{formatCurrency(invoice.subtotal)}
								</span>
							</div>
							{invoice.discountAmount != null &&
								invoice.discountAmount > 0 && (
									<div className="flex justify-between text-sm">
										<span className="text-muted-foreground">
											Discount:
										</span>
										<span className="font-medium text-red-600 dark:text-red-400">
											-
											{formatCurrency(
												invoice.discountAmount
											)}
										</span>
									</div>
								)}
							{invoice.taxAmount != null &&
								invoice.taxAmount > 0 && (
									<div className="flex justify-between text-sm">
										<span className="text-muted-foreground">
											Tax:
										</span>
										<span className="font-medium">
											{formatCurrency(invoice.taxAmount)}
										</span>
									</div>
								)}
							<div className="border-t pt-2">
								<div className="flex justify-between text-lg font-bold">
									<span>Total:</span>
									<span>
										{formatCurrency(invoice.total)}
									</span>
								</div>
							</div>
						</div>
					</>
				) : (
					<div className="flex flex-col items-center justify-center py-12 text-center">
						<div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center mb-3">
							<ClipboardList className="h-6 w-6 text-muted-foreground" />
						</div>
						<p className="text-sm text-muted-foreground">
							No line items added yet
						</p>
					</div>
				)}
			</div>

		</div>
	);
}
