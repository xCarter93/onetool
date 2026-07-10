"use client";

import { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { GlassCard, GlassCardContent } from "@/components/shared/glass-card";
import {
	DataGrid,
	DataGridContainer,
} from "@/components/reui/data-grid/data-grid";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import {
	ColumnDef,
	getCoreRowModel,
	useReactTable,
} from "@tanstack/react-table";
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

const columns: ColumnDef<Doc<"invoiceLineItems">>[] = [
	{
		accessorKey: "description",
		header: "Description",
		meta: { cellClassName: "font-medium" },
		cell: ({ row }) => row.original.description,
	},
	{
		accessorKey: "quantity",
		header: "Qty",
		meta: { headerClassName: "text-center", cellClassName: "text-center" },
		cell: ({ row }) => row.original.quantity,
	},
	{
		accessorKey: "unitPrice",
		header: "Unit Price",
		meta: { headerClassName: "text-right", cellClassName: "text-right" },
		cell: ({ row }) => formatCurrency(row.original.unitPrice),
	},
	{
		accessorKey: "total",
		header: "Total",
		meta: {
			headerClassName: "text-right",
			cellClassName: "text-right font-medium",
		},
		cell: ({ row }) => formatCurrency(row.original.total),
	},
];

export function OverviewTab({
	invoice,
	invoiceId,
	lineItems,
	paymentSummary,
}: OverviewTabProps) {
	const router = useRouter();
	const table = useReactTable({
		data: lineItems ?? [],
		columns,
		getCoreRowModel: getCoreRowModel(),
	});

	return (
		<div className="space-y-8">
			{/* Summary Cards */}
			<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<GlassCard>
					<GlassCardContent className="flex items-center gap-3 p-4">
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
					</GlassCardContent>
				</GlassCard>

				<GlassCard>
					<GlassCardContent className="flex items-center gap-3 p-4">
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
					</GlassCardContent>
				</GlassCard>
			</div>

			{/* Line Items Section */}
			<div>
				<div className="flex items-center justify-between mb-1 min-h-8">
					<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
						Line Items
					</h3>
					<Button
						variant="outline"
						size="sm"
						onClick={() =>
							router.push(
								`/invoices/${invoiceId}/lineEditor`
							)
						}
					>
						<Settings className="h-4 w-4" />
						Edit Line Items
					</Button>
				</div>
				<Separator className="mb-4" />

				{lineItems && lineItems.length > 0 ? (
					<>
						<DataGrid
							table={table}
							recordCount={lineItems.length}
							tableLayout={{ width: "auto", headerBackground: true }}
						>
							<DataGridContainer className="rounded-lg border">
								<DataGridTable />
							</DataGridContainer>
						</DataGrid>

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
