"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
	Check,
	Pencil,
	Plus,
	PowerOff,
	RotateCcw,
	Trash2,
	X,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/reui/badge";
import {
	Frame,
	FrameFooter,
	FrameHeader,
	FramePanel,
	FrameTitle,
} from "@/components/reui/frame";
import { useToast } from "@/hooks/use-toast";
import { useConfirmDialog } from "@/hooks/use-confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { logError, getUserFriendlyErrorMessage } from "@/lib/error-logger";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { SectionHeading } from "./settings-card";
import { formatCurrency } from "@/lib/money";
import { EmptyState } from "@/components/domain/empty-state";

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
	"px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

// SKUs Tab Component
export function SKUsTab() {
	const toast = useToast();
	const { confirm: confirmDialog } = useConfirmDialog();
	const { can } = usePermissions();
	const canModify = can("skus", "modify");
	const canDelete = can("skus", "delete");
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
	const permanentlyDeleteSKU = useMutation(api.skus.permanentlyDelete);

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
		if (!canModify) return;
		resetForm();
		setIsEditing(true);
	};

	const handleEdit = (sku: SKUDoc) => {
		if (!canModify || !sku) return;
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
		if (!canDelete) return;
		const confirmed = await confirmDialog({
			title: "Delete SKU",
			message:
				"Permanently delete this SKU from your library? This can't be undone. Quotes that already use it are unaffected.",
			confirmLabel: "Delete SKU",
			cancelLabel: "Cancel",
			variant: "destructive",
		});

		if (!confirmed) return;

		try {
			await permanentlyDeleteSKU({ id });
			toast.success("SKU deleted", "The SKU has been permanently removed");
		} catch (error) {
			logError(error, {
				action: "delete_sku",
				metadata: { skuId: id },
			});
			const userMessage = getUserFriendlyErrorMessage(error);
			toast.error("Delete failed", userMessage);
		}
	};

	const handleReactivate = async (id: Id<"skus">) => {
		if (!canModify) return;
		try {
			await updateSKU({ id, isActive: true });
			toast.success("SKU reactivated", "It will appear in new quotes again");
		} catch (error) {
			logError(error, {
				action: "reactivate_sku",
				metadata: { skuId: id },
			});
			const userMessage = getUserFriendlyErrorMessage(error);
			toast.error("Reactivate failed", userMessage);
		}
	};

	const handleDeactivate = async (id: Id<"skus">) => {
		if (!canModify) return;
		try {
			await updateSKU({ id, isActive: false });
			toast.success("SKU deactivated", "It won't appear in new quotes");
		} catch (error) {
			logError(error, {
				action: "deactivate_sku",
				metadata: { skuId: id },
			});
			const userMessage = getUserFriendlyErrorMessage(error);
			toast.error("Deactivate failed", userMessage);
		}
	};

	const calculateMargin = (rate: number, cost?: number) => {
		if (cost === undefined || rate === 0) return null;
		return ((rate - cost) / rate) * 100;
	};

	const activeCount = skus?.filter((s: SKUDoc) => s.isActive).length ?? 0;
	const hasSKUs = Boolean(skus && skus.length > 0);

	// The inline editor row, reused in-place for edits and appended at the bottom
	// for a new SKU so new rows land where users expect them.
	const renderEditingRow = (rowKey: string) => (
		<tr
			key={rowKey}
			className="border-t border-l-4 border-border border-l-primary bg-primary/5"
		>
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
				<span className="text-sm text-muted-foreground">-</span>
			</td>
			<td className="px-4 py-3 text-center">
				<Badge variant="primary-light" radius="full" size="sm">
					{editingSKU ? "Editing" : "New"}
				</Badge>
			</td>
			<td className="px-4 py-3">
				<div className="flex justify-end gap-1">
					<Button
						variant="outline"
						size="icon-sm"
						onClick={handleSave}
						disabled={isSaving}
						aria-label={isSaving ? "Saving..." : "Save SKU"}
						className="border-emerald-500/25 bg-emerald-500/10 text-emerald-600 hover:border-emerald-500/40 hover:bg-emerald-500/15 dark:text-emerald-400"
					>
						<Check className="h-3 w-3" />
					</Button>
					<Button
						variant="outline"
						size="icon-sm"
						onClick={closeForm}
						disabled={isSaving}
						aria-label="Cancel"
						className="hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
					>
						<X className="h-3 w-3" />
					</Button>
				</div>
			</td>
		</tr>
	);

	return (
		<div className="space-y-6">
			<SectionHeading
				title="SKUs"
				description="Create reusable SKUs with predefined rates and costs to quickly add line items to quotes."
			/>

			{skus === undefined ? (
				<div className="py-16 text-center">
					<div className="mx-auto animate-pulse space-y-4">
						<div className="mx-auto h-8 w-1/3 rounded bg-muted"></div>
						<div className="mx-auto h-4 w-1/2 rounded bg-muted"></div>
					</div>
				</div>
			) : skus.length === 0 && !isEditing ? (
				<div className="rounded-xl border border-dashed border-border bg-muted/20">
					<EmptyState
						illustration="skus-none"
						size="md"
						title="No SKUs created yet"
						description="Save your common services and products as reusable line items, then drop them into any quote."
						action={
							canModify ? (
								<Button onClick={handleCreate}>
									<Plus className="size-4" />
									Create your first SKU
								</Button>
							) : undefined
						}
					/>
				</div>
			) : (
				<Frame variant="default" className="w-full">
					<FrameHeader className="flex-row items-center justify-between gap-3">
						<FrameTitle>Line items</FrameTitle>
						{!isEditing && hasSKUs && canModify && (
							<Button size="sm" onClick={handleCreate}>
								<Plus className="h-4 w-4" />
								Add SKU
							</Button>
						)}
					</FrameHeader>

					<FramePanel className="p-0">
						<div className="overflow-x-auto">
							<table className="w-full">
								<thead className="bg-muted">
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
								<tbody>
									{skus.map((sku: SKUDoc) => {
										// Edit in place: the editor replaces this row while editing it.
										if (isEditing && editingSKU === sku._id) {
											return renderEditingRow(sku._id);
										}
										const margin = calculateMargin(sku.rate, sku.cost);
										return (
											<tr
												key={sku._id}
												className={`border-t border-border transition-colors hover:bg-muted/30 ${
													!sku.isActive ? "opacity-50" : ""
												}`}
											>
												<td className="px-4 py-3 text-sm font-semibold text-foreground">
													{sku.name}
												</td>
												<td className="px-4 py-3 text-sm text-muted-foreground">
													{sku.unit}
												</td>
												<td className="px-4 py-3 text-right text-sm font-semibold text-foreground">
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
															variant="outline"
															radius="full"
															size="sm"
															className={
																margin >= 0
																	? "border-transparent bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
																	: "border-transparent bg-destructive/10 text-destructive"
															}
														>
															{margin.toFixed(1)}%
														</Badge>
													) : (
														<span className="text-sm text-muted-foreground">-</span>
													)}
												</td>
												<td className="px-4 py-3 text-center">
													<Badge
														variant="outline"
														radius="full"
														size="sm"
														className={
															sku.isActive
																? "border-transparent bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
																: "border-transparent bg-muted text-muted-foreground"
														}
													>
														<span
															className={`h-1.5 w-1.5 rounded-full ${
																sku.isActive
																	? "bg-emerald-500"
																	: "bg-muted-foreground/50"
															}`}
														/>
														{sku.isActive ? "Active" : "Inactive"}
													</Badge>
												</td>
												<td className="px-4 py-3">
													<div className="flex justify-end gap-1">
														{canModify &&
															(sku.isActive ? (
																<Button
																	variant="outline"
																	size="icon-sm"
																	onClick={() => handleDeactivate(sku._id)}
																	aria-label="Deactivate SKU"
																	className="hover:border-amber-500/40 hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-400"
																>
																	<PowerOff className="h-3 w-3" />
																</Button>
															) : (
																<Button
																	variant="outline"
																	size="icon-sm"
																	onClick={() => handleReactivate(sku._id)}
																	aria-label="Reactivate SKU"
																	className="hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400"
																>
																	<RotateCcw className="h-3 w-3" />
																</Button>
															))}
														{canModify && (
															<Button
																variant="outline"
																size="icon-sm"
																onClick={() => handleEdit(sku)}
																aria-label="Edit SKU"
																className="hover:bg-primary/10 hover:text-primary"
															>
																<Pencil className="h-3 w-3" />
															</Button>
														)}
														{canDelete && (
															<Button
																variant="outline"
																size="icon-sm"
																onClick={() => handleDelete(sku._id)}
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

									{/* New SKU: append the editor at the bottom of the table. */}
									{isEditing &&
										editingSKU === null &&
										renderEditingRow("__new__")}
								</tbody>
							</table>
						</div>
						{hasSKUs && !isEditing && (
							<>
								<Separator />
								<FrameFooter className="bg-muted text-xs text-muted-foreground">
									{activeCount} active SKU{activeCount !== 1 ? "s" : ""} ·{" "}
									{skus!.length} total
								</FrameFooter>
							</>
						)}
					</FramePanel>
				</Frame>
			)}
		</div>
	);
}
