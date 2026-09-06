"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type RecurringPaymentRuleValue =
	| { type: "percentage"; installments: Array<{ percentage: number; dayOffset: number }> }
	| { type: "fixed_plus_balance"; installments: Array<{ amount: number; dayOffset: number }>; balance: { dayOffset: number } };

export function recurringPaymentRuleError(value: RecurringPaymentRuleValue): string | null {
	const validOffset = (offset: number) => Number.isSafeInteger(offset) && offset >= 0;
	if (value.type === "percentage") {
		if (!value.installments.length) return "Add at least one installment.";
		if (value.installments.some((item) => !Number.isFinite(item.percentage) || item.percentage <= 0 || !validOffset(item.dayOffset)))
			return "Use positive percentages and whole-number due days.";
		if (Math.abs(value.installments.reduce((sum, item) => sum + item.percentage, 0) - 100) > 0.0000001)
			return "Percentage installments must total 100%.";
		return null;
	}
	if (value.installments.some((item) => !Number.isFinite(item.amount) || item.amount <= 0 || !validOffset(item.dayOffset)) || !validOffset(value.balance.dayOffset))
		return "Use positive fixed amounts and whole-number due days.";
	return null;
}

export function RecurringPaymentRuleEditor({ value, onChange }: { value: RecurringPaymentRuleValue; onChange: (value: RecurringPaymentRuleValue) => void }) {
	const error = recurringPaymentRuleError(value);
	const rows = value.installments;
	return (
		<FieldGroup className="gap-4">
			<Field>
				<FieldLabel htmlFor="payment-rule-type">Payment schedule</FieldLabel>
				<Select
					value={value.type}
					onValueChange={(type) => onChange(type === "percentage"
						? { type: "percentage", installments: [{ percentage: 100, dayOffset: 30 }] }
						: { type: "fixed_plus_balance", installments: [], balance: { dayOffset: 30 } })}
				>
					<SelectTrigger id="payment-rule-type"><SelectValue /></SelectTrigger>
					<SelectContent>
						<SelectItem value="percentage">Percentage installments</SelectItem>
						<SelectItem value="fixed_plus_balance">Fixed amounts plus balance</SelectItem>
					</SelectContent>
				</Select>
			</Field>

			<div className="space-y-3">
				{rows.map((row, index) => (
					<div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.75rem] items-end gap-3">
						<Field>
							<FieldLabel htmlFor={`payment-value-${index}`}>{value.type === "percentage" ? "Percentage" : "Amount"}</FieldLabel>
							<Input
								id={`payment-value-${index}`}
								type="number"
								min={0}
								step={value.type === "percentage" ? "any" : "0.01"}
								value={"percentage" in row ? row.percentage : row.amount}
								onChange={(event) => {
									const number = Number(event.target.value);
									const installments = rows.map((item, itemIndex) => itemIndex === index
										? value.type === "percentage" ? { percentage: number, dayOffset: item.dayOffset } : { amount: number, dayOffset: item.dayOffset }
										: item);
									onChange({ ...value, installments } as RecurringPaymentRuleValue);
								}}
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor={`payment-offset-${index}`}>Days after issue</FieldLabel>
							<Input
								id={`payment-offset-${index}`}
								type="number"
								min={0}
								step={1}
								value={row.dayOffset}
								onChange={(event) => {
									const installments = rows.map((item, itemIndex) => itemIndex === index ? { ...item, dayOffset: Number(event.target.value) } : item);
									onChange({ ...value, installments } as RecurringPaymentRuleValue);
								}}
							/>
						</Field>
						<Button variant="ghost" size="icon" className="min-h-11" aria-label={`Remove installment ${index + 1}`} onClick={() => onChange({ ...value, installments: rows.filter((_, itemIndex) => itemIndex !== index) } as RecurringPaymentRuleValue)}>
							<Trash2 className="size-4" />
						</Button>
					</div>
				))}
				<Button variant="outline" size="sm" onClick={() => onChange({ ...value, installments: [...rows, value.type === "percentage" ? { percentage: 0, dayOffset: 30 } : { amount: 0, dayOffset: 30 }] } as RecurringPaymentRuleValue)}>
					<Plus className="size-4" /> Add installment
				</Button>
			</div>

			{value.type === "fixed_plus_balance" && (
				<Field>
					<FieldLabel htmlFor="balance-offset">Remaining balance due</FieldLabel>
					<Input id="balance-offset" type="number" min={0} step={1} value={value.balance.dayOffset} onChange={(event) => onChange({ ...value, balance: { dayOffset: Number(event.target.value) } })} />
				</Field>
			)}
			{error && <p role="alert" className="text-sm text-danger">{error}</p>}
		</FieldGroup>
	);
}
