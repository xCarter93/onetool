"use client";

import React, { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Package, Search } from "lucide-react";

// Define SKU type - will be generated after Convex schema update
type SKU = {
	_id: string;
	_creationTime: number;
	orgId: string;
	name: string;
	unit: string;
	rate: number;
	cost?: number;
	isActive: boolean;
	createdAt: number;
	updatedAt: number;
};

interface SKUSelectorProps {
	onSelect: (sku: SKU) => void;
	disabled?: boolean;
}

const formatCurrency = (amount: number) => {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(amount);
};

export function SKUSelector({ onSelect, disabled = false }: SKUSelectorProps) {
	const [open, setOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const skus = useQuery(api.skus.list);

	const filteredSKUs = React.useMemo(() => {
		if (!skus) return [];
		if (!searchQuery.trim()) return skus;

		const query = searchQuery.toLowerCase();
		return skus.filter(
			(sku: SKU) =>
				sku.name.toLowerCase().includes(query) ||
				sku.unit.toLowerCase().includes(query)
		);
	}, [skus, searchQuery]);

	const handleSelectSKU = (sku: SKU) => {
		onSelect(sku);
		setOpen(false);
		setSearchQuery("");
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				render={
					<Button
						variant="outline"
						size="icon-sm"
						disabled={disabled}
						aria-label="Select SKU"
						className="shrink-0"
					/>
				}
			>
				<Package className="h-4 w-4" />
			</PopoverTrigger>
			<PopoverContent
				className="w-[400px] p-0 bg-white dark:bg-gray-900 border border-border shadow-xl opacity-100"
				align="start"
				style={{ backgroundColor: "var(--background)", opacity: 1 }}
			>
				<div className="flex flex-col bg-white dark:bg-gray-900">
					{/* Search Input */}
					<div className="p-3 border-b border-border bg-white dark:bg-gray-900">
						<div className="relative">
							<Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
							<Input
								placeholder="Search SKUs..."
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className="pl-9 bg-background dark:bg-background"
							/>
						</div>
					</div>

					{/* SKU List */}
					<div className="max-h-[300px] overflow-y-auto bg-white dark:bg-gray-900">
						{skus === undefined ? (
							<div className="p-4 text-center text-sm text-muted-foreground bg-white dark:bg-gray-900">
								Loading SKUs...
							</div>
						) : filteredSKUs.length === 0 ? (
							<div className="p-4 text-center text-sm text-muted-foreground bg-white dark:bg-gray-900">
								{searchQuery
									? "No SKUs found matching your search"
									: "No SKUs available"}
							</div>
						) : (
							<div className="divide-y divide-border bg-white dark:bg-gray-900">
								{filteredSKUs.map((sku) => (
									<button
										key={sku._id}
										onClick={() => handleSelectSKU(sku)}
										className="w-full px-4 py-3 text-left bg-white dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:outline-none focus:bg-gray-100 dark:focus:bg-gray-800"
									>
										<div className="flex items-start justify-between gap-3">
											<div className="flex-1 min-w-0">
												<p className="font-medium text-sm text-foreground truncate">
													{sku.name}
												</p>
												<div className="flex items-center gap-2 mt-1">
													<span className="text-xs text-muted-foreground">
														{sku.unit}
													</span>
													<span className="text-xs text-muted-foreground">
														•
													</span>
													<span className="text-xs font-medium text-foreground">
														{formatCurrency(sku.rate)}
													</span>
													{sku.cost !== undefined && (
														<>
															<span className="text-xs text-muted-foreground">
																•
															</span>
															<span className="text-xs text-muted-foreground">
																Cost: {formatCurrency(sku.cost)}
															</span>
														</>
													)}
												</div>
											</div>
											{sku.cost !== undefined &&
												sku.rate > 0 &&
												(() => {
													const marginPct =
														((sku.rate - sku.cost) / sku.rate) * 100;
													return (
														<div className="shrink-0">
															<span
																className={`text-xs font-medium ${
																	marginPct >= 0
																		? "text-green-600 dark:text-green-400"
																		: "text-red-600 dark:text-red-400"
																}`}
															>
																{marginPct.toFixed(1)}% margin
															</span>
														</div>
													);
												})()}
										</div>
									</button>
								))}
							</div>
						)}
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}
