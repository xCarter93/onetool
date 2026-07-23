"use client";

import { PermissionGate } from "@/components/domain/permission-gate";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
	FileText,
	ArrowLeft,
	Plus,
	Save,
	Trash2,
	Calculator,
	X,
	Eye,
} from "lucide-react";
import { SKUSelector } from "@/components/shared/sku-selector";
import { formatCurrency } from "@/lib/money";

type LineItem = {
	_id: Id<"quoteLineItems">;
	description: string;
	quantity: number;
	unit: string;
	rate: number;
	amount: number;
	cost?: number;
	sortOrder: number;
	isNew?: boolean; // Track if this is a new item not yet saved
};

// Status formatting functions
const formatStatus = (status: string) => {
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

function QuoteLineEditorPageContent() {
	const router = useRouter();
	const params = useParams();
	const toast = useToast();
	const quoteId = params.quoteId as Id<"quotes">;

	// Fetch data from Convex
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

	// Mutations
	const updateQuote = useMutation(api.quotes.update);
	const createLineItem = useMutation(api.quoteLineItems.create);
	const updateLineItem = useMutation(api.quoteLineItems.update);
	const deleteLineItem = useMutation(api.quoteLineItems.remove);

	// Local state
	const [hasChanges, setHasChanges] = useState(false);

	// PDF visibility controls
	const [pdfSettings, setPdfSettings] = useState({
		showQuantities: true,
		showUnitPrices: true,
		showLineItemTotals: true,
		showTotals: true,
	});

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

	// Sync local PDF/discount/tax state when quote data changes
	const [syncedQuote, setSyncedQuote] = useState<typeof quote>(undefined);
	if (quote && quote !== syncedQuote) {
		setSyncedQuote(quote);
		if (quote.pdfSettings) {
			setPdfSettings({
				showQuantities: quote.pdfSettings.showQuantities ?? true,
				showUnitPrices: quote.pdfSettings.showUnitPrices ?? true,
				showLineItemTotals: quote.pdfSettings.showLineItemTotals ?? true,
				showTotals: quote.pdfSettings.showTotals ?? true,
			});
		}
		setDiscount({
			enabled: quote.discountEnabled || false,
			amount: quote.discountAmount || 0,
			type: quote.discountType || "percentage",
		});
		setTax({
			enabled: quote.taxEnabled || false,
			rate: quote.taxRate || 0,
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

	// Calculate totals (must be before early returns)
	const totals = useMemo(() => {
		if (allLineItems.length === 0)
			return {
				subtotal: 0,
				discountAmount: 0,
				afterDiscount: 0,
				taxAmount: 0,
				total: 0,
				totalCosts: 0,
				margin: 0,
				marginPercentage: 0,
			};

		const subtotal = allLineItems.reduce((sum, item) => sum + item.amount, 0);
		const totalCosts = allLineItems.reduce(
			(sum, item) => sum + (item.cost ? item.quantity * item.cost : 0),
			0
		);

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
		const margin = subtotal - totalCosts;
		const marginPercentage = subtotal > 0 ? (margin / subtotal) * 100 : 0;

		return {
			subtotal,
			discountAmount,
			afterDiscount,
			taxAmount,
			total,
			totalCosts,
			margin,
			marginPercentage,
		};
	}, [allLineItems, discount, tax]);

	// Loading state
	if (quote === undefined) {
		return (
			<div className="relative px-6 pt-8 pb-20">
				<div className="animate-pulse space-y-8">
					<div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
					<div className="h-96 bg-gray-200 dark:bg-gray-700 rounded"></div>
				</div>
			</div>
		);
	}

	// Quote not found
	if (quote === null) {
		return (
			<div className="relative px-6 pt-8 pb-20 flex flex-col items-center justify-center h-96 space-y-4">
				<div className="text-6xl">📄</div>
				<h1 className="text-2xl font-bold text-gray-900 dark:text-white">
					Quote Not Found
				</h1>
				<p className="text-gray-600 dark:text-gray-400 text-center">
					The quote you&apos;re looking for doesn&apos;t exist or you don&apos;t
					have permission to view it.
				</p>
				<Button onClick={() => router.push("/quotes")}>Back to Quotes</Button>
			</div>
		);
	}

	const handleAddLineItem = async () => {
		const newSortOrder = allLineItems.length;

		try {
			await createLineItem({
				quoteId,
				description: "New Item",
				quantity: 1,
				unit: "hour",
				rate: 0,
				cost: 0,
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
		id: Id<"quoteLineItems">,
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

	const handleDeleteLineItem = async (id: Id<"quoteLineItems">) => {
		try {
			await deleteLineItem({ id });
		} catch (error) {
			console.error("Failed to delete line item:", error);
			toast.error("Error", "Failed to delete line item. Please try again.");
		}
	};

	const handleSaveQuote = async () => {
		try {
			// Update quote totals and settings
			await updateQuote({
				id: quoteId,
				subtotal: totals.subtotal,
				total: totals.total,
				discountEnabled: discount.enabled,
				discountAmount: discount.enabled ? discount.amount : undefined,
				discountType: discount.enabled ? discount.type : undefined,
				taxEnabled: tax.enabled,
				taxRate: tax.enabled ? tax.rate : undefined,
				taxAmount: tax.enabled ? totals.taxAmount : undefined,
				pdfSettings: {
					showQuantities: pdfSettings.showQuantities,
					showUnitPrices: pdfSettings.showUnitPrices,
					showLineItemTotals: pdfSettings.showLineItemTotals,
					showTotals: pdfSettings.showTotals,
				},
			});

			setHasChanges(false);
			toast.success("Quote Saved", "Quote has been successfully updated!");
			router.push(`/quotes/${quoteId}`);
		} catch (error) {
			console.error("Failed to save quote:", error);
			toast.error("Error", "Failed to save quote. Please try again.");
		}
	};

	const handleCancel = () => {
		if (hasChanges) {
			if (
				confirm("You have unsaved changes. Are you sure you want to leave?")
			) {
				router.push(`/quotes/${quoteId}`);
			}
		} else {
			router.push(`/quotes/${quoteId}`);
		}
	};

	const handlePdfSettingChange = (
		setting: keyof typeof pdfSettings,
		checked: boolean
	) => {
		setPdfSettings((prev) => ({ ...prev, [setting]: checked }));
		setHasChanges(true);
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
										Quote Line Editor
									</h1>
									<StatusBadge
										status={quote.status}
										appearance={
											quote.status === "approved"
												? "solid"
												: quote.status === "draft"
													? "outline"
													: "soft"
										}
									>
										{formatStatus(quote.status)}
									</StatusBadge>
								</div>
								<p className="text-muted-foreground text-sm mt-1">
									{quote.quoteNumber || `#${quote._id.slice(-6)}`} •{" "}
									{client?.companyName || "Unknown Client"} •{" "}
									{project?.title || "No Project"}
								</p>
							</div>
						</div>
					</div>
					<div className="flex items-center gap-3">
						<Button size="sm" onClick={handleSaveQuote} disabled={!hasChanges}>
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
													<TableHead className="w-[30%]">Description</TableHead>
													<TableHead className="w-[10%] text-center">
														Qty
													</TableHead>
													<TableHead className="w-[10%] text-center">
														Unit
													</TableHead>
													<TableHead className="w-[12%] text-right">
														Rate
													</TableHead>
													<TableHead className="w-[12%] text-right">
														<div className="flex flex-col items-end">
															<span>Cost</span>
															<span className="text-xs text-muted-foreground font-normal">
																per unit
															</span>
														</div>
													</TableHead>
													<TableHead className="w-[12%] text-right">
														Amount
													</TableHead>
													<TableHead className="w-[10%] text-center">
														Margin
													</TableHead>
													<TableHead className="w-[4%]">Actions</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{allLineItems.map((item) => (
													<LineItemRow
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

					{/* Quote Summary - New Layout */}
					<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
						{/* Client View Settings */}
						<div className="bg-card dark:bg-card backdrop-blur-md border border-border dark:border-border rounded-xl shadow-lg dark:shadow-black/50 ring-1 ring-border/30 dark:ring-border/50">
							<Card className="bg-transparent border-none shadow-none ring-0">
								<CardHeader>
									<CardTitle className="flex items-center gap-2 text-lg">
										<Eye className="h-5 w-5" />
										Client view
									</CardTitle>
									<p className="text-sm text-muted-foreground mt-1">
										Adjust what your client will see on this quote. To change
										the default for all future quotes, visit the PDF Style.
									</p>
								</CardHeader>
								<CardContent className="space-y-4">
									<div className="grid grid-cols-2 gap-4">
										<div className="flex items-center space-x-2">
											<Checkbox
												id="quantities"
												checked={pdfSettings.showQuantities}
												onCheckedChange={(checked) =>
													handlePdfSettingChange("showQuantities", !!checked)
												}
											/>
											<label
												htmlFor="quantities"
												className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
											>
												Quantities
											</label>
										</div>
										<div className="flex items-center space-x-2">
											<Checkbox
												id="unitPrices"
												checked={pdfSettings.showUnitPrices}
												onCheckedChange={(checked) =>
													handlePdfSettingChange("showUnitPrices", !!checked)
												}
											/>
											<label
												htmlFor="unitPrices"
												className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
											>
												Unit prices
											</label>
										</div>
										<div className="flex items-center space-x-2">
											<Checkbox
												id="lineItemTotals"
												checked={pdfSettings.showLineItemTotals}
												onCheckedChange={(checked) =>
													handlePdfSettingChange(
														"showLineItemTotals",
														!!checked
													)
												}
											/>
											<label
												htmlFor="lineItemTotals"
												className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
											>
												Line item totals
											</label>
										</div>
										<div className="flex items-center space-x-2">
											<Checkbox
												id="totals"
												checked={pdfSettings.showTotals}
												onCheckedChange={(checked) =>
													handlePdfSettingChange("showTotals", !!checked)
												}
											/>
											<label
												htmlFor="totals"
												className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
											>
												Totals
											</label>
										</div>
									</div>
								</CardContent>
							</Card>
						</div>

						{/* Financial Summary */}
						<div className="bg-card dark:bg-card backdrop-blur-md border border-border dark:border-border rounded-xl shadow-lg dark:shadow-black/50 ring-1 ring-border/30 dark:ring-border/50">
							<Card className="bg-transparent border-none shadow-none ring-0">
								<CardHeader>
									<CardTitle className="flex items-center gap-2 text-lg">
										<Calculator className="h-5 w-5" />
										Quote Summary
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

										<div className="border-t pt-3 space-y-2">
											<div className="flex justify-between">
												<span className="text-sm text-gray-600 dark:text-gray-400">
													Costs:
												</span>
												<span className="text-sm font-medium text-red-600 dark:text-red-400">
													{formatCurrency(totals.totalCosts)}
												</span>
											</div>
											<div className="flex justify-between">
												<span className="text-sm text-gray-600 dark:text-gray-400">
													Estimated margin:
												</span>
												<span
													className={`text-sm font-medium ${
														totals.margin >= 0
															? "text-green-600 dark:text-green-400"
															: "text-red-600 dark:text-red-400"
													}`}
												>
													{formatCurrency(totals.margin)} (
													{totals.marginPercentage.toFixed(1)}%)
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

export default function QuoteLineEditorPage() {
	return (
		<PermissionGate object="quotes" level="modify">
			<QuoteLineEditorPageContent />
		</PermissionGate>
	);
}

// LineItemRow Component with auto-save on blur
function LineItemRow({
	item,
	onUpdate,
	onDelete,
}: {
	item: LineItem;
	onUpdate: (
		id: Id<"quoteLineItems">,
		updates: Partial<LineItem>
	) => Promise<void>;
	onDelete: () => void;
}) {
	const [editedItem, setEditedItem] = useState<LineItem>(item);
	const [isSaving, setIsSaving] = useState(false);

	// Resync local edits when the underlying item changes
	const [syncedItem, setSyncedItem] = useState(item);
	if (item !== syncedItem) {
		setSyncedItem(item);
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
			unit: sku.unit,
			rate: sku.rate,
			cost: sku.cost || 0,
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
					value={editedItem.unit}
					onChange={(e) => handleFieldChange("unit", e.target.value)}
					onBlur={() => handleBlur("unit")}
					className="w-full text-center"
					placeholder="hour"
					disabled={isSaving}
				/>
			</TableCell>
			<TableCell>
				<Input
					type="number"
					value={editedItem.rate}
					onChange={(e) =>
						handleFieldChange("rate", parseFloat(e.target.value) || 0)
					}
					onBlur={() => handleBlur("rate")}
					className="w-full text-right"
					min="0"
					step="0.01"
					disabled={isSaving}
				/>
			</TableCell>
			<TableCell>
				<Input
					type="number"
					value={editedItem.cost || 0}
					onChange={(e) =>
						handleFieldChange("cost", parseFloat(e.target.value) || 0)
					}
					onBlur={() => handleBlur("cost")}
					className="w-full text-right"
					min="0"
					step="0.01"
					placeholder="0.00"
					disabled={isSaving}
				/>
			</TableCell>
			<TableCell className="text-right font-medium">
				{isSaving ? (
					<span className="text-xs text-gray-500">Saving...</span>
				) : (
					formatCurrency(editedItem.quantity * editedItem.rate)
				)}
			</TableCell>
			<TableCell className="text-center">
				{(() => {
					const itemAmount = editedItem.quantity * editedItem.rate;
					const itemCost = editedItem.quantity * (editedItem.cost || 0);
					const itemMargin = itemAmount - itemCost;
					const marginPercent =
						itemAmount > 0 ? (itemMargin / itemAmount) * 100 : 0;
					return (
						<span
							className={`text-xs font-medium ${
								marginPercent >= 0
									? "text-green-600 dark:text-green-400"
									: "text-red-600 dark:text-red-400"
							}`}
						>
							{marginPercent.toFixed(1)}%
						</span>
					);
				})()}
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
