"use client";

import { useEffect, useState } from "react";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
	InputGroupText,
} from "@/components/ui/input-group";
import { cn } from "@/lib/utils";
import { ClientViewPopover } from "./client-view-popover";
import type { LineItemsPricingSettings } from "./types";

const AUTOSAVE_MS = 500;

export interface PricingFooterProps {
	/** Current pricing settings (legacy invoices seed these from stored dollars). */
	value: LineItemsPricingSettings;
	/** Called ~500ms after the last edit. */
	onSave: (next: LineItemsPricingSettings) => void;
	disabled?: boolean;
	className?: string;
}

function settingsKey(value: LineItemsPricingSettings): string {
	return JSON.stringify(value);
}

/**
 * Frame footer for the line-items section: one row of discount and tax input
 * groups plus the "Client view" popover. The computed figures live in the
 * totals stack below the frame — the inputs carry no duplicate preview.
 */
export function PricingFooter({
	value,
	onSave,
	disabled = false,
	className,
}: PricingFooterProps) {
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

	// 16px on narrow widths avoids the iOS focus-zoom; 14px from sm: up.
	const inputClass = "text-base tabular-nums text-right sm:text-sm";
	const labelClass = "shrink-0 text-[13px] text-muted-foreground";

	return (
		<div className={cn("flex flex-wrap items-center gap-x-4 gap-y-3", className)}>
			<div className="flex items-center gap-2">
				<label htmlFor="line-items-discount" className={labelClass}>
					Discount
				</label>
				<InputGroup className={cn("w-36", disabled && "opacity-70")}>
					<InputGroupInput
						id="line-items-discount"
						type="number"
						min={0}
						step="0.01"
						inputMode="decimal"
						disabled={disabled}
						aria-label="Discount amount"
						value={String(form.discountAmount ?? 0)}
						onChange={(e) =>
							edit({ discountAmount: Number(e.target.value) || 0 })
						}
						className={inputClass}
					/>
					<InputGroupAddon align="inline-end" className="gap-0.5">
						<InputGroupButton
							size="xs"
							aria-pressed={form.discountType === "fixed"}
							aria-label="Discount in dollars"
							disabled={disabled}
							className={cn(
								form.discountType === "fixed" && "bg-primary/10 text-primary"
							)}
							onClick={() => edit({ discountType: "fixed" })}
						>
							$
						</InputGroupButton>
						<InputGroupButton
							size="xs"
							aria-pressed={form.discountType === "percentage"}
							aria-label="Discount as a percentage"
							disabled={disabled}
							className={cn(
								form.discountType === "percentage" &&
									"bg-primary/10 text-primary"
							)}
							onClick={() => edit({ discountType: "percentage" })}
						>
							%
						</InputGroupButton>
					</InputGroupAddon>
				</InputGroup>
			</div>

			<div className="flex items-center gap-2">
				<label htmlFor="line-items-tax" className={labelClass}>
					Tax
				</label>
				<InputGroup className={cn("w-32", disabled && "opacity-70")}>
					<InputGroupInput
						id="line-items-tax"
						type="number"
						min={0}
						step="0.01"
						inputMode="decimal"
						disabled={disabled}
						aria-label="Tax rate percentage"
						value={String(form.taxRate ?? 0)}
						onChange={(e) => edit({ taxRate: Number(e.target.value) || 0 })}
						className={inputClass}
					/>
					<InputGroupAddon align="inline-end">
						<InputGroupText className="text-muted-foreground">%</InputGroupText>
					</InputGroupAddon>
				</InputGroup>
			</div>

			<ClientViewPopover
				value={form.pdfSettings}
				onChange={editPdf}
				disabled={disabled}
			/>
		</div>
	);
}
