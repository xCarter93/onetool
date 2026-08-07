"use client";

import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import type { LineItemsPricingSettings } from "./types";

type PdfSettings = LineItemsPricingSettings["pdfSettings"];

const FIELDS: Array<{ key: keyof PdfSettings; label: string }> = [
	{ key: "showQuantities", label: "Quantities" },
	{ key: "showUnitPrices", label: "Unit prices" },
	{ key: "showLineItemTotals", label: "Line totals" },
	{ key: "showTotals", label: "Grand total" },
];

export interface ClientViewPopoverProps {
	value: PdfSettings;
	onChange: (patch: Partial<PdfSettings>) => void;
	disabled?: boolean;
}

/** Which line-item columns print on the client-facing PDF. */
export function ClientViewPopover({
	value,
	onChange,
	disabled = false,
}: ClientViewPopoverProps) {
	const shown = FIELDS.filter((field) => value[field.key]).length;

	return (
		<Popover>
			<PopoverTrigger
				render={
					<Button
						variant="outline"
						size="sm"
						disabled={disabled}
						aria-label={`Client view: ${shown} of ${FIELDS.length} columns shown on the PDF`}
					/>
				}
			>
				<Eye className="h-4 w-4" aria-hidden="true" />
				Client view
				<span className="text-muted-foreground" aria-hidden="true">
					· {shown} of {FIELDS.length}
				</span>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="w-72 origin-(--transform-origin) p-3 transition-[opacity,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0 data-[ending-style]:scale-[0.97] data-[ending-style]:opacity-0 motion-reduce:transition-none"
			>
				<p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
					What the client sees
				</p>
				<div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
					{FIELDS.map((field) => (
						<label
							key={field.key}
							className="flex cursor-pointer items-center gap-2 text-[13.5px]"
						>
							<Checkbox
								checked={value[field.key]}
								disabled={disabled}
								onCheckedChange={(checked) =>
									onChange({ [field.key]: checked === true })
								}
							/>
							{field.label}
						</label>
					))}
				</div>
				<p className="mt-3 text-xs leading-relaxed text-muted-foreground">
					Cost and margin are internal — never printed on the client PDF.
				</p>
			</PopoverContent>
		</Popover>
	);
}
