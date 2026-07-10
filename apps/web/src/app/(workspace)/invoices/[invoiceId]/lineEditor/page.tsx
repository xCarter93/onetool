"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { useToast } from "@/hooks/use-toast";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { StatusBadge } from "@/components/domain/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	FileText,
	ArrowLeft,
	Plus,
	Save,
	Trash2,
	Calculator,
	X,
} from "lucide-react";
import { SKUSelector } from "@/components/shared/sku-selector";

type LineItem = {
	_id: Id<"invoiceLineItems">;
	description: string;
	quantity: number;
	unitPrice: number;
	total: number;
	sortOrder: number;
	isNew?: boolean;
};

// Status formatting functions
const formatStatus = (status: string) => {
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

const formatCurrency = (amount: number) => {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(amount);
};

export default function InvoiceLineEditorPage() {
	const router = useRouter();
	const params = useParams();
	const toast = useToast();
	const invoiceId = params.invoiceId as Id<"invoices">;

	// Fetch data from Convex
	const invoice = useQuery(api.invoices.get, { id: invoiceId });
	const client = useQuery(
		api.clients.get,
		invoice?.clientId ? { id: invoice.clientId } : "skip"
	);
	const project = useQuery(
		api.projects.get,
		invoice?.projectId ? { id: invoice.projectId } : "skip"
	);
	const lineItems = useQuery(api.invoiceLineItems.listByInvoice, { invoiceId });

	// Mutations
	const updateInvoice = useMutation(api.invoices.update);
	const createLineItem = useMutation(api.invoiceLineItems.create);
	const updateLineItem = useMutation(api.invoiceLineItems.update);
	const deleteLineItem = useMutation(api.invoiceLineItems.remove);

	// Local state
	const [hasChanges, setHasChanges] = useState(false);

	// Tax and discount state
	const [discount, setDiscount] = useState<{
		enabled: boolean;
		amount: number;
		type: "percentage" | "fixed";
	}>({
		enabled: false,
		amount: 0,
		type: "percentage",
	});
	const [tax, setTax] = useState<{ enabled: boolean; rate: number }>({
		enabled: false,
		rate: 0,
	});

	// Initialize discount and tax state when invoice data loads/changes
	const [prevInvoice, setPrevInvoice] = useState(invoice);
	if (invoice && invoice !== prevInvoice) {
		setPrevInvoice(invoice);

		// Check if discount is enabled based on discountAmount
		const hasDiscount =
			invoice.discountAmount !== undefined && invoice.discountAmount > 0;
		setDiscount({
			enabled: hasDiscount,
			amount: invoice.discountAmount || 0,
			type: "fixed", // Invoice stores fixed amounts
		});

		// Check if tax is enabled based on taxAmount
		const hasTax = invoice.taxAmount !== undefined && invoice.taxAmount > 0;
		// Calculate approximate tax rate from the stored amount
		const approxTaxRate =
			hasTax && invoice.subtotal > 0
				? (invoice.taxAmount! / invoice.subtotal) * 100
				: 0;
		setTax({
			enabled: hasTax,
			rate: approxTaxRate,
		});
	}

	// Use line items directly from the database
	const allLineItems = useMemo(() => {
		if (!lineItems) return [];

		// Convert saved items to our LineItem type
		return lineItems
			.map((item) => ({
				...item,
				isNew: false,
			}))
			.sort((a, b) => a.sortOrder - b.sortOrder);
	}, [lineItems]);

	// Calculate totals
	const totals = useMemo(() => {
		if (allLineItems.length === 0)
			return {
				subtotal: 0,
				discountAmount: 0,
				afterDiscount: 0,
				taxAmount: 0,
				total: 0,
			};

		const subtotal = allLineItems.reduce((sum, item) => sum + item.total, 0);

		// Calculate discount
		const discountAmount = discount.enabled
			? discount.type === "percentage"
				? (subtotal * discount.amount) / 100
				: discount.amount
			: 0;

		const afterDiscount = subtotal - discountAmount;

		// Calculate tax
		const taxAmount = tax.enabled ? (afterDiscount * tax.rate) / 100 : 0;

		const total = afterDiscount + taxAmount;

		return {
			subtotal,
			discountAmount,
			afterDiscount,
			taxAmount,
			total,
		};
	}, [allLineItems, discount, tax]);

	// Loading state
	if (invoice === undefined) {
		return (
			<div className="relative px-6 pt-8 pb-20">
				<div className="animate-pulse space-y-8">
					<div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
					<div className="h-96 bg-gray-200 dark:bg-gray-700 rounded"></div>
				</div>
			</div>
		);
	}

	// Invoice not found
	if (invoice === null) {
		return (
			<div className="relative px-6 pt-8 pb-20 flex flex-col items-center justify-center h-96 space-y-4">
				<div className="text-6xl">📄</div>
				<h1 className="text-2xl font-bold text-gray-900 dark:text-white">
					Invoice Not Found
				</h1>
				<p className="text-gray-600 dark:text-gray-400 text-center">
					The invoice you&apos;re looking for doesn&apos;t exist or you don&apos;t
					have permission to view it.
				</p>
				<Button onClick={() => router.push("/invoices")}>Back to Invoices</Button>
			</div>
		);
	}

	const handleAddLineItem = async () => {
		const newSortOrder = allLineItems.length;

		try {
			await createLineItem({
				invoiceId,
				description: "New Item",
				quantity: 1,
				unitPrice: 0,
				sortOrder: newSortOrder,
			});
			toast.success(
				"Line Item Added",
				"You can now edit the line item details."
			);
		} catch (error) {
			console.error("Failed to add line item:", error);
			toast.error("Error", "Failed to add line item. Please try again.");
		}
	};

	const handleUpdateLineItem = async (
		id: Id<"invoiceLineItems">,
		updates: Partial<LineItem>
	) => {
		try {
			await updateLineItem({
				id,
				...updates,
			});
		} catch (error) {
			console.error("Failed to update line item:", error);
			toast.error("Error", "Failed to update line item. Please try again.");
		}
	};

	const handleDeleteLineItem = async (id: Id<"invoiceLineItems">) => {
		try {
			await deleteLineItem({ id });
		} catch (error) {
			console.error("Failed to delete line item:", error);
			toast.error("Error", "Failed to delete line item. Please try again.");
		}
	};

	const handleSaveInvoice = async () => {
		try {
			// Update invoice totals
			await updateInvoice({
				id: invoiceId,
				subtotal: totals.subtotal,
				total: totals.total,
				discountAmount: discount.enabled ? totals.discountAmount : undefined,
				taxAmount: tax.enabled ? totals.taxAmount : undefined,
			});

			setHasChanges(false);
			toast.success("Invoice Saved", "Invoice has been successfully updated!");
			router.push(`/invoices/${invoiceId}`);
		} catch (error) {
			console.error("Failed to save invoice:", error);
			toast.error("Error", "Failed to save invoice. Please try again.");
		}
	};

	const handleCancel = () => {
		if (hasChanges) {
			if (
				confirm("You have unsaved changes. Are you sure you want to leave?")
			) {
				router.push(`/invoices/${invoiceId}`);
			}
		} else {
			router.push(`/invoices/${invoiceId}`);
		}
	};

	const handleAddDiscount = () => {
		setDiscount({ enabled: true, amount: 0, type: "percentage" });
		setHasChanges(true);
	};

	const handleRemoveDiscount = () => {
		setDiscount({ enabled: false, amount: 0, type: "percentage" });
		setHasChanges(true);
	};

	const handleAddTax = () => {
		setTax({ enabled: true, rate: 0 });
		setHasChanges(true);
	};

	const handleRemoveTax = () => {
		setTax({ enabled: false, rate: 0 });
		setHasChanges(true);
	};

	return (
		<div className="relative px-6 pt-8 pb-20">
			<div className="mx-auto">
				{/* Header */}
				<div className="flex items-center justify-between mb-8">
					<div className="flex items-center gap-4">
						<Button
							variant="outline"
							size="icon-sm"
							onClick={handleCancel}
							aria-label="Go back"
						>
							<ArrowLeft className="h-4 w-4" />
						</Button>
						<div className="flex items-center gap-4">
							<div className="flex items-center justify-center w-12 h-12 rounded-lg bg-blue-100 dark:bg-blue-900/30">
								<FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
							</div>
							<div>
								<div className="flex items-center gap-3">
									<h1 className="text-3xl font-bold text-gray-900 dark:text-white">
										Invoice Line Editor
									</h1>
									<StatusBadge
										status={invoice.status}
										appearance={
											invoice.status === "paid"
												? "solid"
												: invoice.status === "draft"
													? "outline"
													: "soft"
										}
									>
										{formatStatus(invoice.status)}
									</StatusBadge>
								</div>
								<p className="text-muted-foreground text-sm mt-1">
									{invoice.invoiceNumber || `#${invoice._id.slice(-6)}`} •{" "}
									{client?.companyName || "Unknown Client"} •{" "}
									{project?.title || "No Project"}
								</p>
							</div>
						</div>
					</div>
					<div className="flex items-center gap-3">
						<Button size="sm" onClick={handleSaveInvoice} disabled={!hasChanges}>
							<Save className="h-4 w-4" />
							Save Changes
						</Button>
					</div>
				</div>

				{/* Unsaved Changes Notification */}
				{hasChanges && (
					<div className="mb-6 flex items-center gap-2.5 px-4 py-2.5 rounded-lg bg-yellow-100 dark:bg-yellow-900/40 border-2 border-yellow-400 dark:border-yellow-600 shrink-0 shadow-md animate-pulse">
						<div className="w-2.5 h-2.5 bg-yellow-500 rounded-full shrink-0 animate-pulse" />
						<div className="flex flex-col">
							<p className="text-sm font-semibold text-yellow-900 dark:text-yellow-100 leading-tight">
								Unsaved changes
							</p>
							<p className="text-xs font-medium text-yellow-800 dark:text-yellow-200 leading-tight">
								Save or cancel your changes
							</p>
						</div>
					</div>
				)}

				{/* Main Content */}
				<div className="space-y-8">
					{/* Line Items Editor */}
					<div>
						<div className="bg-card dark:bg-card backdrop-blur-md border border-border dark:border-border rounded-xl shadow-lg dark:shadow-black/50 ring-1 ring-border/30 dark:ring-border/50">
							<Card className="bg-transparent border-none shadow-none ring-0">
								<CardHeader>
									<CardTitle className="flex items-center gap-2 text-xl">
										<FileText className="h-5 w-5" />
										Line Items Configuration
									</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="overflow-hidden rounded-lg border">
										<Table>
											<TableHeader className="bg-muted sticky top-0 z-10">
												<TableRow>
													<TableHead className="w-[45%]">Description</TableHead>
													<TableHead className="w-[12%] text-center">
														Qty
													</TableHead>
													<TableHead className="w-[15%] text-right">
														Unit Price
													</TableHead>
													<TableHead className="w-[15%] text-right">
														Total
													</TableHead>
													<TableHead className="w-[8%]">Actions</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{allLineItems.map((item) => (
													<InvoiceLineItemRow
														key={item._id}
														item={item}
														onUpdate={handleUpdateLineItem}
														onDelete={() => handleDeleteLineItem(item._id)}
													/>
												))}
											</TableBody>
										</Table>
									</div>

									{/* Add Line Item Button */}
									<div className="mt-6 pt-4 border-t border-border">
										<div className="flex items-center justify-between">
											<div className="text-sm text-muted-foreground">
												{allLineItems.length === 0
													? "No line items yet. Add your first item to get started."
													: `${allLineItems.length} line item${allLineItems.length !== 1 ? "s" : ""} configured`}
											</div>
											<Button
												variant="outline"
												size="sm"
												onClick={handleAddLineItem}
											>
												<Plus className="h-4 w-4 mr-2" />
												Add Line Item
											</Button>
										</div>
									</div>
								</CardContent>
							</Card>
						</div>
					</div>

					{/* Invoice Summary */}
					<div className="max-w-md ml-auto">
						<div className="bg-card dark:bg-card backdrop-blur-md border border-border dark:border-border rounded-xl shadow-lg dark:shadow-black/50 ring-1 ring-border/30 dark:ring-border/50">
							<Card className="bg-transparent border-none shadow-none ring-0">
								<CardHeader>
									<CardTitle className="flex items-center gap-2 text-lg">
										<Calculator className="h-5 w-5" />
										Invoice Summary
									</CardTitle>
								</CardHeader>
								<CardContent className="space-y-4">
									<div className="space-y-3">
										<div className="flex justify-between">
											<span className="text-sm text-gray-600 dark:text-gray-400">
												Subtotal:
											</span>
											<span className="text-sm font-medium">
												{formatCurrency(totals.subtotal)}
											</span>
										</div>

										{/* Discount */}
										{discount.enabled ? (
											<div className="flex justify-between items-center">
												<span className="text-sm text-gray-600 dark:text-gray-400">
													Discount:
												</span>
												<div className="flex items-center gap-2">
													<div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden">
														<Input
															type="number"
															value={discount.amount}
															onChange={(e) => {
																setDiscount((prev) => ({
																	...prev,
																	amount: parseFloat(e.target.value) || 0,
																}));
																setHasChanges(true);
															}}
															className="w-20 text-right h-8 text-sm border-0 rounded-none focus:ring-0 focus:border-0"
															min="0"
															step="0.01"
														/>
														<select
															value={discount.type}
															onChange={(e) => {
																setDiscount((prev) => ({
																	...prev,
																	type: e.target.value as
																		| "percentage"
																		| "fixed",
																}));
																setHasChanges(true);
															}}
															className="text-sm border-0 bg-background px-2 py-2 h-8 rounded-none focus:ring-0 focus:border-0 cursor-pointer"
														>
															<option value="percentage">%</option>
															<option value="fixed">$</option>
														</select>
													</div>
													<span className="text-sm font-medium text-red-600 dark:text-red-400 min-w-[60px] text-right">
														-{formatCurrency(totals.discountAmount)}
													</span>
													<Button
														variant="outline"
														size="icon-sm"
														onClick={handleRemoveDiscount}
														aria-label="Remove discount"
														className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
													>
														<X className="h-3 w-3" />
													</Button>
												</div>
											</div>
										) : (
											<div className="flex justify-between items-center">
												<span className="text-sm text-gray-600 dark:text-gray-400">
													Discount:
												</span>
												<Button
													variant="outline"
													size="sm"
													onClick={handleAddDiscount}
													className="text-green-600 dark:text-green-400 border-green-200 dark:border-green-800 hover:bg-green-50 dark:hover:bg-green-900/20"
												>
													Add Discount
												</Button>
											</div>
										)}

										{/* Tax */}
										{tax.enabled ? (
											<div className="flex justify-between items-center">
												<span className="text-sm text-gray-600 dark:text-gray-400">
													Tax:
												</span>
												<div className="flex items-center gap-2">
													<div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden">
														<Input
															type="number"
															value={tax.rate}
															onChange={(e) => {
																setTax((prev) => ({
																	...prev,
																	rate: parseFloat(e.target.value) || 0,
																}));
																setHasChanges(true);
															}}
															className="w-20 text-right h-8 text-sm border-0 rounded-none focus:ring-0 focus:border-0"
															min="0"
															step="0.01"
															max="100"
														/>
														<span className="text-sm text-gray-600 dark:text-gray-400 px-2 py-2 h-8 flex items-center bg-gray-50 dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700">
															%
														</span>
													</div>
													<span className="text-sm font-medium min-w-[60px] text-right">
														{formatCurrency(totals.taxAmount)}
													</span>
													<Button
														variant="outline"
														size="icon-sm"
														onClick={handleRemoveTax}
														aria-label="Remove tax"
														className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
													>
														<X className="h-3 w-3" />
													</Button>
												</div>
											</div>
										) : (
											<div className="flex justify-between items-center">
												<span className="text-sm text-gray-600 dark:text-gray-400">
													Tax:
												</span>
												<Button
													variant="outline"
													size="sm"
													onClick={handleAddTax}
													className="text-green-600 dark:text-green-400 border-green-200 dark:border-green-800 hover:bg-green-50 dark:hover:bg-green-900/20"
												>
													Add Tax
												</Button>
											</div>
										)}

										<div className="border-t pt-3">
											<div className="flex justify-between">
												<span className="text-lg font-bold">Total:</span>
												<span className="text-lg font-bold text-primary">
													{formatCurrency(totals.total)}
												</span>
											</div>
										</div>
									</div>
								</CardContent>
							</Card>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

// InvoiceLineItemRow Component with auto-save on blur
function InvoiceLineItemRow({
	item,
	onUpdate,
	onDelete,
}: {
	item: LineItem;
	onUpdate: (
		id: Id<"invoiceLineItems">,
		updates: Partial<LineItem>
	) => Promise<void>;
	onDelete: () => void;
}) {
	const [editedItem, setEditedItem] = useState<LineItem>(item);
	const [isSaving, setIsSaving] = useState(false);

	// Reset local edits when the underlying item changes
	const [prevItem, setPrevItem] = useState(item);
	if (item !== prevItem) {
		setPrevItem(item);
		setEditedItem(item);
	}

	const handleFieldChange = (field: keyof LineItem, value: string | number) => {
		setEditedItem((prev) => ({
			...prev,
			[field]: value,
		}));
	};

	const handleBlur = async (field: keyof LineItem) => {
		// Only save if the value actually changed
		if (editedItem[field] === item[field]) {
			return;
		}

		setIsSaving(true);
		try {
			const updates: Partial<LineItem> = { [field]: editedItem[field] };
			await onUpdate(item._id, updates);
		} finally {
			setIsSaving(false);
		}
	};

	const handleSKUSelect = async (sku: {
		name: string;
		unit: string;
		rate: number;
		cost?: number;
	}) => {
		const updates = {
			description: sku.name,
			unitPrice: sku.rate,
		};

		setEditedItem((prev) => ({
			...prev,
			...updates,
		}));

		setIsSaving(true);
		try {
			await onUpdate(item._id, updates);
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<TableRow className={`hover:bg-muted/30 ${isSaving ? "opacity-60" : ""}`}>
			<TableCell>
				<div className="flex gap-2">
					<Input
						value={editedItem.description}
						onChange={(e) => handleFieldChange("description", e.target.value)}
						onBlur={() => handleBlur("description")}
						placeholder="Enter description..."
						className="flex-1"
						disabled={isSaving}
					/>
					<SKUSelector onSelect={handleSKUSelect} disabled={isSaving} />
				</div>
			</TableCell>
			<TableCell>
				<Input
					type="number"
					value={editedItem.quantity}
					onChange={(e) =>
						handleFieldChange("quantity", parseInt(e.target.value) || 0)
					}
					onBlur={() => handleBlur("quantity")}
					className="w-full text-center"
					min="0"
					disabled={isSaving}
				/>
			</TableCell>
			<TableCell>
				<Input
					type="number"
					value={editedItem.unitPrice}
					onChange={(e) =>
						handleFieldChange("unitPrice", parseFloat(e.target.value) || 0)
					}
					onBlur={() => handleBlur("unitPrice")}
					className="w-full text-right"
					min="0"
					step="0.01"
					disabled={isSaving}
				/>
			</TableCell>
			<TableCell className="text-right font-medium">
				{isSaving ? (
					<span className="text-xs text-gray-500">Saving...</span>
				) : (
					formatCurrency(editedItem.quantity * editedItem.unitPrice)
				)}
			</TableCell>
			<TableCell>
				<div className="flex gap-1">
					<Button
						variant="outline"
						size="icon-sm"
						onClick={onDelete}
						aria-label="Delete"
						disabled={isSaving}
					>
						<Trash2 className="h-3 w-3" />
					</Button>
				</div>
			</TableCell>
		</TableRow>
	);
}
