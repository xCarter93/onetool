"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Building2, Check, Edit, Plus, Trash2, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/reui/badge";
import { useToast } from "@/hooks/use-toast";
import { useConfirmDialog } from "@/hooks/use-confirm-dialog";
import { logError, getUserFriendlyErrorMessage } from "@/lib/error-logger";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { SettingsSection } from "./settings-section";

// SKU Type - will be generated after Convex schema update
type SKUDoc = {
	_id: Id<"skus">;
	_creationTime: number;
	orgId: Id<"organizations">;
	name: string;
	unit: string;
	rate: number;
	cost?: number;
	isActive: boolean;
	createdAt: number;
	updatedAt: number;
};

const headCellClass =
	"px-4 py-3 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground";

// SKUs Tab Component
export function SKUsTab() {
	const toast = useToast();
	const { confirm: confirmDialog } = useConfirmDialog();
	const [isEditing, setIsEditing] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [editingSKU, setEditingSKU] = useState<Id<"skus"> | null>(null);
	const [skuForm, setSKUForm] = useState({
		name: "",
		unit: "",
		rate: "",
		cost: "",
	});

	const skus = useQuery(api.skus.listAll);
	const createSKU = useMutation(api.skus.create);
	const updateSKU = useMutation(api.skus.update);
	const removeSKU = useMutation(api.skus.remove);

	const resetForm = () => {
		setSKUForm({
			name: "",
			unit: "",
			rate: "",
			cost: "",
		});
		setEditingSKU(null);
	};

	const closeForm = () => {
		resetForm();
		setIsEditing(false);
		setIsSaving(false);
	};

	const handleCreate = () => {
		resetForm();
		setIsEditing(true);
	};

	const handleEdit = (sku: SKUDoc) => {
		if (!sku) return;
		setSKUForm({
			name: sku.name,
			unit: sku.unit,
			rate: sku.rate.toString(),
			cost: sku.cost !== undefined ? sku.cost.toString() : "",
		});
		setEditingSKU(sku._id);
		setIsEditing(true);
	};

	const handleSave = async () => {
		// Prevent duplicate submissions
		if (isSaving) return;

		if (!skuForm.name.trim()) {
			toast.warning("Name required", "Please enter a SKU name");
			return;
		}

		if (!skuForm.unit.trim()) {
			toast.warning("Unit required", "Please enter a unit");
			return;
		}

		const rate = parseFloat(skuForm.rate);
		if (isNaN(rate) || rate < 0) {
			toast.warning("Invalid rate", "Please enter a valid rate");
			return;
		}

		const cost = skuForm.cost.trim() ? parseFloat(skuForm.cost) : undefined;
		if (cost !== undefined && (isNaN(cost) || cost < 0)) {
			toast.warning("Invalid cost", "Please enter a valid cost");
			return;
		}

		try {
			setIsSaving(true);
			if (editingSKU) {
				await updateSKU({
					id: editingSKU,
					name: skuForm.name.trim(),
					unit: skuForm.unit.trim(),
					rate,
					cost,
				});
				toast.success("SKU updated", "SKU has been successfully updated");
			} else {
				await createSKU({
					name: skuForm.name.trim(),
					unit: skuForm.unit.trim(),
					rate,
					cost,
				});
				toast.success("SKU created", "SKU has been successfully created");
			}
			closeForm();
		} catch (error) {
			logError(error, {
				action: editingSKU ? "update_sku" : "create_sku",
				metadata: { skuForm },
			});
			const userMessage = getUserFriendlyErrorMessage(error);
			toast.error(editingSKU ? "Update failed" : "Create failed", userMessage);
		} finally {
			setIsSaving(false);
		}
	};

	const handleDelete = async (id: Id<"skus">) => {
		const confirmed = await confirmDialog({
			title: "Delete SKU",
			message:
				"Are you sure you want to delete this SKU? It will be marked as inactive and won't appear in new quotes.",
			confirmLabel: "Delete SKU",
			cancelLabel: "Cancel",
			variant: "destructive",
		});

		if (!confirmed) return;

		try {
			await removeSKU({ id });
			toast.success("SKU deleted", "The SKU has been removed");
		} catch (error) {
			logError(error, {
				action: "delete_sku",
				metadata: { skuId: id },
			});
			const userMessage = getUserFriendlyErrorMessage(error);
			toast.error("Delete failed", userMessage);
		}
	};

	const formatCurrency = (amount: number) => {
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: "USD",
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		}).format(amount);
	};

	const calculateMargin = (rate: number, cost?: number) => {
		if (cost === undefined || rate === 0) return null;
		return ((rate - cost) / rate) * 100;
	};

	const activeCount = skus?.filter((s: SKUDoc) => s.isActive).length ?? 0;
	const hasSKUs = Boolean(skus && skus.length > 0);

	return (
		<SettingsSection
			title="SKUs"
			description="Create reusable SKUs with predefined rates and costs to quickly add line items to quotes."
			texture
			headerAside={
				!isEditing && hasSKUs ? (
					<Button intent="outline" size="sm" onPress={handleCreate}>
						<Plus className="h-4 w-4" />
						Add SKU
					</Button>
				) : undefined
			}
			panelClassName="p-0"
			footer={
				hasSKUs && !isEditing ? (
					<p className="text-sm text-muted-foreground">
						{activeCount} active SKU{activeCount !== 1 ? "s" : ""} ·{" "}
						{skus!.length} total
					</p>
				) : undefined
			}
		>
			{skus === undefined ? (
				<div className="py-16 text-center">
					<div className="mx-auto animate-pulse space-y-4">
						<div className="mx-auto h-8 w-1/3 rounded bg-muted"></div>
						<div className="mx-auto h-4 w-1/2 rounded bg-muted"></div>
					</div>
				</div>
			) : skus.length === 0 && !isEditing ? (
				<div className="px-6 py-16 text-center">
					<div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
						<Building2 className="h-8 w-8 text-muted-foreground" />
					</div>
					<h3 className="mb-2 text-lg font-semibold text-foreground">
						No SKUs created yet
					</h3>
					<p className="mx-auto mb-6 max-w-sm text-muted-foreground">
						Create your first SKU to streamline your quote creation process
						with reusable line items.
					</p>
					<Button intent="primary" size="lg" onPress={handleCreate}>
						<Plus className="h-5 w-5" />
						Create Your First SKU
					</Button>
				</div>
			) : (
				<div className="overflow-x-auto">
					<table className="w-full">
						<thead className="border-b border-border bg-muted/40">
							<tr>
								<th className={`${headCellClass} text-left`}>Name</th>
								<th className={`${headCellClass} text-left`}>Unit</th>
								<th className={`${headCellClass} text-right`}>Rate</th>
								<th className={`${headCellClass} text-right`}>Cost</th>
								<th className={`${headCellClass} text-center`}>Margin</th>
								<th className={`${headCellClass} text-center`}>Status</th>
								<th className={`${headCellClass} text-right`}>Actions</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-border">
							{/* Editing Row */}
							{isEditing && (
								<tr className="border-l-4 border-l-primary bg-primary/5 dark:bg-primary/10">
									<td className="px-4 py-3">
										<Input
											value={skuForm.name}
											onChange={(e) =>
												setSKUForm((prev) => ({
													...prev,
													name: e.target.value,
												}))
											}
											placeholder="Enter SKU name..."
											className="w-full"
											autoFocus
										/>
									</td>
									<td className="px-4 py-3">
										<Input
											value={skuForm.unit}
											onChange={(e) =>
												setSKUForm((prev) => ({
													...prev,
													unit: e.target.value,
												}))
											}
											placeholder="hour, day, item"
											className="w-full"
										/>
									</td>
									<td className="px-4 py-3">
										<Input
											type="number"
											value={skuForm.rate}
											onChange={(e) =>
												setSKUForm((prev) => ({
													...prev,
													rate: e.target.value,
												}))
											}
											placeholder="0.00"
											min="0"
											step="0.01"
											className="w-full text-right"
										/>
									</td>
									<td className="px-4 py-3">
										<Input
											type="number"
											value={skuForm.cost}
											onChange={(e) =>
												setSKUForm((prev) => ({
													...prev,
													cost: e.target.value,
												}))
											}
											placeholder="0.00"
											min="0"
											step="0.01"
											className="w-full text-right"
										/>
									</td>
									<td className="px-4 py-3 text-center">
										<span className="text-xs text-muted-foreground">-</span>
									</td>
									<td className="px-4 py-3 text-center">
										<Badge variant="primary-light" radius="full" size="sm">
											{editingSKU ? "Editing" : "New"}
										</Badge>
									</td>
									<td className="px-4 py-3">
										<div className="flex justify-end gap-1">
											<Button
												intent="outline"
												size="sq-sm"
												onPress={handleSave}
												isDisabled={isSaving}
												aria-label={isSaving ? "Saving..." : "Save SKU"}
												className="border-success/25 bg-success/10 text-success hover:border-success/40 hover:bg-success/15"
											>
												<Check className="h-3 w-3" />
											</Button>
											<Button
												intent="outline"
												size="sq-sm"
												onPress={closeForm}
												isDisabled={isSaving}
												aria-label="Cancel"
												className="hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
											>
												<X className="h-3 w-3" />
											</Button>
										</div>
									</td>
								</tr>
							)}

							{/* Existing SKUs */}
							{skus.map((sku: SKUDoc) => {
								const margin = calculateMargin(sku.rate, sku.cost);
								return (
									<tr
										key={sku._id}
										className={`transition-colors hover:bg-muted/30 ${
											!sku.isActive ? "opacity-50" : ""
										}`}
									>
										<td className="px-4 py-3 text-sm font-medium text-foreground">
											{sku.name}
										</td>
										<td className="px-4 py-3 text-sm text-muted-foreground">
											{sku.unit}
										</td>
										<td className="px-4 py-3 text-right text-sm font-medium text-foreground">
											{formatCurrency(sku.rate)}
										</td>
										<td className="px-4 py-3 text-right text-sm text-muted-foreground">
											{sku.cost !== undefined
												? formatCurrency(sku.cost)
												: "-"}
										</td>
										<td className="px-4 py-3 text-center">
											{margin !== null ? (
												<Badge
													variant={
														margin >= 0 ? "success-light" : "destructive-light"
													}
													radius="full"
													size="sm"
												>
													{margin.toFixed(1)}%
												</Badge>
											) : (
												<span className="text-sm text-muted-foreground">-</span>
											)}
										</td>
										<td className="px-4 py-3 text-center">
											<Badge
												variant={sku.isActive ? "success-light" : "secondary"}
												radius="full"
												size="sm"
											>
												{sku.isActive ? "Active" : "Inactive"}
											</Badge>
										</td>
										<td className="px-4 py-3">
											<div className="flex justify-end gap-1">
												<Button
													intent="outline"
													size="sq-sm"
													onPress={() => handleEdit(sku)}
													aria-label="Edit SKU"
													className="hover:bg-primary/10 hover:text-primary"
												>
													<Edit className="h-3 w-3" />
												</Button>
												{sku.isActive && (
													<Button
														intent="outline"
														size="sq-sm"
														onPress={() => handleDelete(sku._id)}
														aria-label="Delete SKU"
														className="hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
													>
														<Trash2 className="h-3 w-3" />
													</Button>
												)}
											</div>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}
		</SettingsSection>
	);
}
