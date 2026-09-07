"use client";

import {
	RecurringPaymentRuleError,
	validateRecurringPaymentRule,
	type RecurringPaymentRule,
} from "@onetool/backend/convex/lib/recurringPaymentRules";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

export type RecurringPaymentRuleValue = RecurringPaymentRule;

export function recurringPaymentRuleError(
	value: RecurringPaymentRuleValue,
): string | null {
	try {
		validateRecurringPaymentRule(value);
		return null;
	} catch (error) {
		return error instanceof RecurringPaymentRuleError
			? error.message
			: "Check the payment schedule.";
	}
}

export function RecurringPaymentRuleEditor({
	value,
	onChange,
}: {
	value: RecurringPaymentRuleValue;
	onChange: (value: RecurringPaymentRuleValue) => void;
}) {
	const error = recurringPaymentRuleError(value);
	const rows = value.installments;
	const remainingPercentage =
		value.type === "percentage"
			? Math.max(
					0,
					100 -
						value.installments.reduce((sum, item) => sum + item.percentage, 0),
				)
			: 0;
	return (
		<FieldGroup className="gap-4">
			<Field>
				<FieldLabel htmlFor="payment-rule-type">Payment schedule</FieldLabel>
				<Select
					value={value.type}
					onValueChange={(type) =>
						onChange(
							type === "percentage"
								? {
										type: "percentage",
										installments: [{ percentage: 100, dayOffset: 30 }],
									}
								: {
										type: "fixed_plus_balance",
										installments: [],
										balance: { dayOffset: 30 },
									},
						)
					}
				>
					<SelectTrigger id="payment-rule-type">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="percentage">Percentage installments</SelectItem>
						<SelectItem value="fixed_plus_balance">
							Fixed amounts plus balance
						</SelectItem>
					</SelectContent>
				</Select>
			</Field>

			<div className="space-y-3">
				{rows.map((row, index) => (
					<div
						key={index}
						className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.75rem] items-end gap-3"
					>
						<Field>
							<FieldLabel htmlFor={`payment-value-${index}`}>
								{value.type === "percentage" ? "Percentage" : "Amount"}
							</FieldLabel>
							<Input
								id={`payment-value-${index}`}
								type="number"
								min={0}
								step={value.type === "percentage" ? "any" : "0.01"}
								value={"percentage" in row ? row.percentage : row.amount}
								onChange={(event) => {
									const number = Number(event.target.value);
									const installments = rows.map((item, itemIndex) =>
										itemIndex === index
											? value.type === "percentage"
												? { percentage: number, dayOffset: item.dayOffset }
												: { amount: number, dayOffset: item.dayOffset }
											: item,
									);
									onChange({
										...value,
										installments,
									} as RecurringPaymentRuleValue);
								}}
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor={`payment-offset-${index}`}>
								Days after issue
							</FieldLabel>
							<Input
								id={`payment-offset-${index}`}
								type="number"
								min={0}
								step={1}
								value={row.dayOffset}
								onChange={(event) => {
									const installments = rows.map((item, itemIndex) =>
										itemIndex === index
											? { ...item, dayOffset: Number(event.target.value) }
											: item,
									);
									onChange({
										...value,
										installments,
									} as RecurringPaymentRuleValue);
								}}
							/>
						</Field>
						<Button
							variant="ghost"
							size="icon"
							className="size-11"
							aria-label={`Remove installment ${index + 1}`}
							onClick={() =>
								onChange({
									...value,
									installments: rows.filter(
										(_, itemIndex) => itemIndex !== index,
									),
								} as RecurringPaymentRuleValue)
							}
						>
							<Trash2 className="size-4" />
						</Button>
					</div>
				))}
				<Button
					variant="outline"
					size="sm"
					onClick={() =>
						onChange({
							...value,
							installments: [
								...rows,
								value.type === "percentage"
									? { percentage: remainingPercentage, dayOffset: 30 }
									: { amount: 0, dayOffset: 30 },
							],
						} as RecurringPaymentRuleValue)
					}
				>
					<Plus className="size-4" /> Add installment
				</Button>
			</div>

			{value.type === "fixed_plus_balance" && (
				<Field>
					<FieldLabel htmlFor="balance-offset">
						Remaining balance due (days after issue)
					</FieldLabel>
					<Input
						id="balance-offset"
						type="number"
						min={0}
						step={1}
						value={value.balance.dayOffset}
						onChange={(event) =>
							onChange({
								...value,
								balance: { dayOffset: Number(event.target.value) },
							})
						}
					/>
				</Field>
			)}
			{error && (
				<p role="alert" className="text-sm text-danger-foreground">
					{error}
				</p>
			)}
		</FieldGroup>
	);
}
