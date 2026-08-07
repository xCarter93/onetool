"use client";

import { useEffect, useRef, useState } from "react";
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
	// Raw input text so intermediate entries ("6.", "0.0") survive a keystroke.
	const [discountText, setDiscountText] = useState(() =>
		String(value.discountAmount ?? 0)
	);
	const [taxText, setTaxText] = useState(() => String(value.taxRate ?? 0));

	// Adopt external changes (another tab, an automation) only while clean.
	const incomingKey = settingsKey(value);
	if (incomingKey !== syncedKey) {
		setSyncedKey(incomingKey);
		if (!dirty) {
			setForm(value);
			setDiscountText(String(value.discountAmount ?? 0));
			setTaxText(String(value.taxRate ?? 0));
		}
	}

	// Invalid values never save — the field flags the problem inline instead of
	// letting the server bounce the write. Saving resumes once the value is valid.
	const discountInvalid =
		form.discountAmount < 0 ||
		(form.discountType === "percentage" && form.discountAmount > 100);
	const taxInvalid = form.taxRate < 0;
	const validationError = discountInvalid
		? form.discountAmount < 0
			? "A discount can't be negative."
			: "A percentage discount can't exceed 100%. Lower it or switch to $."
		: taxInvalid
			? "A tax rate can't be negative."
			: null;
	const invalid = validationError !== null;

	// Latest values for the unmount flush; written in an effect, never in render.
	const formRef = useRef(form);
	const dirtyRef = useRef(dirty);
	const invalidRef = useRef(invalid);
	const onSaveRef = useRef(onSave);
	useEffect(() => {
		formRef.current = form;
		dirtyRef.current = dirty;
		invalidRef.current = invalid;
		onSaveRef.current = onSave;
	});

	useEffect(() => {
		if (!dirty || invalid) return;
		const timer = setTimeout(() => {
			dirtyRef.current = false;
			setDirty(false);
			onSave(form);
		}, AUTOSAVE_MS);
		return () => clearTimeout(timer);
	}, [dirty, invalid, form, onSave]);

	// Flush on unmount only. The debounce effect's cleanup runs every keystroke,
	// so the flush cannot live there.
	useEffect(() => {
		return () => {
			if (!dirtyRef.current || invalidRef.current) return;
			dirtyRef.current = false;
			onSaveRef.current(formRef.current);
		};
	}, []);

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
				<InputGroup
					className={cn(
						"w-36",
						disabled && "opacity-70",
						discountInvalid && "border-destructive"
					)}
				>
					<InputGroupInput
						id="line-items-discount"
						type="number"
						min={0}
						step="0.01"
						inputMode="decimal"
						disabled={disabled}
						aria-label="Discount amount"
						aria-invalid={discountInvalid || undefined}
						value={discountText}
						onChange={(e) => {
							setDiscountText(e.target.value);
							edit({ discountAmount: Number(e.target.value) || 0 });
						}}
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
				<InputGroup
					className={cn(
						"w-32",
						disabled && "opacity-70",
						taxInvalid && "border-destructive"
					)}
				>
					<InputGroupInput
						id="line-items-tax"
						type="number"
						min={0}
						step="0.01"
						inputMode="decimal"
						disabled={disabled}
						aria-label="Tax rate percentage"
						aria-invalid={taxInvalid || undefined}
						value={taxText}
						onChange={(e) => {
							setTaxText(e.target.value);
							edit({ taxRate: Number(e.target.value) || 0 });
						}}
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

			{validationError && (
				<p role="alert" className="w-full text-xs text-destructive">
					{validationError}
				</p>
			)}
		</div>
	);
}
