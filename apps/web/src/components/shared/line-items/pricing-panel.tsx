"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Percent } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
	NativeSelect,
	NativeSelectOption,
} from "@/components/ui/native-select";
import { formatCurrency } from "@/lib/money";
import { cn } from "@/lib/utils";
import { computeDisplayTotals, type LineItemsPricingSettings } from "./types";

const AUTOSAVE_MS = 500;

export interface PricingPanelProps {
	value: LineItemsPricingSettings;
	/** Called ~500ms after the last edit. */
	onSave: (next: LineItemsPricingSettings) => void;
	/** Line-item subtotal, for the live discount/tax preview. */
	subtotal: number;
	disabled?: boolean;
	/** Optional hint under the adjustments column (e.g. org default tax rate). */
	taxHint?: string;
}

function settingsKey(value: LineItemsPricingSettings): string {
	return JSON.stringify(value);
}

export function PricingPanel({
	value,
	onSave,
	subtotal,
	disabled = false,
	taxHint,
}: PricingPanelProps) {
	const [open, setOpen] = useState(false);
	const [form, setForm] = useState<LineItemsPricingSettings>(value);
	const [syncedKey, setSyncedKey] = useState(() => settingsKey(value));
	const [dirty, setDirty] = useState(false);

	// Adopt external changes (another tab, an automation) only while clean.
	const incomingKey = settingsKey(value);
	if (incomingKey !== syncedKey) {
		setSyncedKey(incomingKey);
		if (!dirty) setForm(value);
	}

	useEffect(() => {
		if (!dirty) return;
		const timer = setTimeout(() => {
			setDirty(false);
			onSave(form);
		}, AUTOSAVE_MS);
		return () => clearTimeout(timer);
	}, [dirty, form, onSave]);

	const edit = (patch: Partial<LineItemsPricingSettings>) => {
		setDirty(true);
		setForm((prev) => ({ ...prev, ...patch }));
	};

	const editPdf = (patch: Partial<LineItemsPricingSettings["pdfSettings"]>) => {
		setDirty(true);
		setForm((prev) => ({
			...prev,
			pdfSettings: { ...prev.pdfSettings, ...patch },
		}));
	};

	const totals = computeDisplayTotals(subtotal, form);
	const shownColumns = [
		form.pdfSettings.showQuantities,
		form.pdfSettings.showUnitPrices,
		form.pdfSettings.showLineItemTotals,
		form.pdfSettings.showTotals,
	].filter(Boolean).length;
	const summary = `${
		form.discountType === "percentage"
			? `${form.discountAmount || 0}% off`
			: `${formatCurrency(form.discountAmount || 0)} off`
	} · ${form.taxRate || 0}% tax · ${shownColumns} of 4 columns shown`;

	const pdfFields: Array<{
		key: keyof LineItemsPricingSettings["pdfSettings"];
		label: string;
	}> = [
		{ key: "showQuantities", label: "Quantities" },
		{ key: "showUnitPrices", label: "Unit prices" },
		{ key: "showLineItemTotals", label: "Line totals" },
		{ key: "showTotals", label: "Grand total" },
	];

	return (
		<div className="mt-5 overflow-hidden rounded-[10px] border border-border bg-background">
			<button
				type="button"
				onClick={() => setOpen((prev) => !prev)}
				aria-expanded={open}
				className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2"
			>
				<Percent className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
				<span className="flex-1 text-sm font-semibold">Pricing &amp; visibility</span>
				<span className="hidden text-[12.5px] text-muted-foreground sm:inline">
					{summary}
				</span>
				<ChevronDown
					className={cn(
						"h-4 w-4 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none",
						open && "rotate-180"
					)}
					aria-hidden="true"
				/>
			</button>

			{open && (
				<div className="grid gap-6 border-t border-border px-3.5 py-4 md:grid-cols-2">
					<div className="flex flex-col gap-3">
						<span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
							Adjustments
						</span>
						<div className="flex items-center gap-2.5">
							<label
								htmlFor="line-items-discount"
								className="w-[70px] text-[13.5px] text-muted-foreground"
							>
								Discount
							</label>
							<Input
								id="line-items-discount"
								type="number"
								min={0}
								step="0.01"
								disabled={disabled}
								value={String(form.discountAmount ?? 0)}
								onChange={(e) =>
									edit({ discountAmount: Number(e.target.value) || 0 })
								}
								className="h-8 w-[88px] rounded-r-none text-right tabular-nums"
							/>
							<NativeSelect
								size="sm"
								aria-label="Discount type"
								disabled={disabled}
								value={form.discountType}
								onChange={(e) =>
									edit({
										discountType: e.target.value as "percentage" | "fixed",
									})
								}
								className="-ml-2.5"
							>
								<NativeSelectOption value="fixed">$</NativeSelectOption>
								<NativeSelectOption value="percentage">%</NativeSelectOption>
							</NativeSelect>
							<span className="ml-auto text-[13.5px] font-medium text-destructive tabular-nums">
								-{formatCurrency(totals.discountAmount)}
							</span>
						</div>
						<div className="flex items-center gap-2.5">
							<label
								htmlFor="line-items-tax"
								className="w-[70px] text-[13.5px] text-muted-foreground"
							>
								Tax
							</label>
							<Input
								id="line-items-tax"
								type="number"
								min={0}
								step="0.01"
								disabled={disabled}
								value={String(form.taxRate ?? 0)}
								onChange={(e) => edit({ taxRate: Number(e.target.value) || 0 })}
								className="h-8 w-[88px] rounded-r-none text-right tabular-nums"
							/>
							<span className="-ml-2.5 flex h-8 items-center rounded-r-md border border-l-0 border-input bg-muted px-2.5 text-sm text-muted-foreground">
								%
							</span>
							<span className="ml-auto text-[13.5px] font-medium tabular-nums">
								{formatCurrency(totals.taxAmount)}
							</span>
						</div>
						{taxHint && (
							<p className="text-xs leading-relaxed text-muted-foreground">
								{taxHint}
							</p>
						)}
					</div>

					<div className="flex flex-col gap-3">
						<span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
							What the client sees
						</span>
						<div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
							{pdfFields.map((field) => (
								<label
									key={field.key}
									className="flex cursor-pointer items-center gap-2 text-[13.5px]"
								>
									<Checkbox
										checked={form.pdfSettings[field.key]}
										disabled={disabled}
										onCheckedChange={(checked) =>
											editPdf({ [field.key]: checked === true })
										}
									/>
									{field.label}
								</label>
							))}
						</div>
						<p className="text-xs leading-relaxed text-muted-foreground">
							Cost and margin are internal — never printed on the client PDF.
						</p>
					</div>
				</div>
			)}
		</div>
	);
}
