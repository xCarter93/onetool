"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import type { ProjectRecurrenceRule } from "@onetool/backend/convex/lib/projectRecurrence";
import { FileSignature, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { convexErrorMessage } from "@/lib/convex-error";
import {
	RecurringPaymentRuleEditor,
	recurringPaymentRuleError,
	type RecurringPaymentRuleValue,
} from "@/components/shared/recurring-payment-rule-editor";

type BillingMode = "per_visit" | "monthly";
type SavedAgreementTerms = {
	scope: { title?: string; description?: string };
	schedule: { rule: ProjectRecurrenceRule };
	billingMode: BillingMode;
	paymentRule: RecurringPaymentRuleValue;
};

export function RecurringAgreementSetupDialog({
	quoteId,
	quoteTitle,
	seriesRevision,
	seriesSetup,
	savedTerms,
	children,
}: {
	quoteId: Id<"quotes">;
	quoteTitle: string;
	seriesRevision: number;
	seriesSetup: { title: string; description?: string; rule: ProjectRecurrenceRule };
	savedTerms?: SavedAgreementTerms;
	children: (openDialog: () => void) => ReactNode;
}) {
	const prepare = useMutation(api.projectSeriesAgreements.prepare);
	const toast = useToast();
	const [open, setOpen] = useState(false);
	const [billingMode, setBillingMode] = useState<BillingMode>("per_visit");
	const [paymentRule, setPaymentRule] = useState<RecurringPaymentRuleValue>({
		type: "percentage",
		installments: [{ percentage: 100, dayOffset: 30 }],
	});
	const [scopeTitle, setScopeTitle] = useState(seriesSetup.title);
	const [scopeDescription, setScopeDescription] = useState(seriesSetup.description ?? "");
	const [proposedRule, setProposedRule] = useState(seriesSetup.rule);
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const submit = async () => {
		if (isSubmitting || recurringPaymentRuleError(paymentRule))
			return;
		setIsSubmitting(true);
		setError(null);
		try {
			await prepare({
				quoteId,
				billingMode,
				paymentRule,
				expectedSeriesRevision: seriesRevision,
				proposedScope: { title: scopeTitle.trim(), description: scopeDescription.trim() || null },
				proposedRule,
			});
			setOpen(false);
			toast.success(
				"Agreement prepared",
				"Generate the approval PDF, then send it to your client."
			);
		} catch (nextError) {
			setError(convexErrorMessage(nextError, "Review the series and try again."));
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<>
			{children(() => {
				setError(null);
				setScopeTitle(savedTerms?.scope.title ?? seriesSetup.title);
				setScopeDescription(savedTerms ? savedTerms.scope.description ?? "" : seriesSetup.description ?? "");
				setProposedRule(savedTerms?.schedule.rule ?? seriesSetup.rule);
				setBillingMode(savedTerms?.billingMode ?? "per_visit");
				setPaymentRule(savedTerms?.paymentRule ?? {
					type: "percentage",
					installments: [{ percentage: 100, dayOffset: 30 }],
				});
				setOpen(true);
			})}
			<Dialog open={open} onOpenChange={(nextOpen) => !isSubmitting && setOpen(nextOpen)}>
				<DialogContent className="max-w-lg">
					<DialogHeader>
						<DialogTitle>Set up recurring agreement</DialogTitle>
						<DialogDescription>
							Use “{quoteTitle}” as the service and price for this series. Your client approves the agreement once.
						</DialogDescription>
					</DialogHeader>

					<FieldGroup className="gap-6">
						<FieldGroup className="grid gap-4 sm:grid-cols-2">
							<Field className="sm:col-span-2">
								<FieldLabel htmlFor="agreement-scope-title">Service scope</FieldLabel>
								<Input id="agreement-scope-title" value={scopeTitle} onChange={(event) => setScopeTitle(event.target.value)} />
							</Field>
							<Field className="sm:col-span-2">
								<FieldLabel htmlFor="agreement-scope-description">Scope details</FieldLabel>
								<Textarea id="agreement-scope-description" value={scopeDescription} onChange={(event) => setScopeDescription(event.target.value)} />
							</Field>
							<Field>
								<FieldLabel htmlFor="agreement-frequency">Frequency</FieldLabel>
								<Select value={proposedRule.frequency} onValueChange={(frequency) => setProposedRule({ frequency: frequency as ProjectRecurrenceRule["frequency"], interval: proposedRule.interval, ...(frequency === "weekly" ? { weekdays: proposedRule.weekdays?.length ? proposedRule.weekdays : [1] } : {}), ...(frequency === "monthly" || frequency === "yearly" ? { monthDays: proposedRule.monthDays?.length ? proposedRule.monthDays : [1] } : {}) })}>
									<SelectTrigger id="agreement-frequency"><SelectValue /></SelectTrigger>
									<SelectContent>
										<SelectItem value="daily">Daily</SelectItem>
										<SelectItem value="weekly">Weekly</SelectItem>
										<SelectItem value="monthly">Monthly</SelectItem>
										<SelectItem value="yearly">Yearly</SelectItem>
									</SelectContent>
								</Select>
							</Field>
							<Field>
								<FieldLabel htmlFor="agreement-interval">Every</FieldLabel>
								<Input id="agreement-interval" type="number" min={1} step={1} value={proposedRule.interval} onChange={(event) => setProposedRule({ ...proposedRule, interval: Number(event.target.value) })} />
							</Field>
						</FieldGroup>
						<Field>
							<FieldLabel>Billing rhythm</FieldLabel>
							<RadioGroup
								value={billingMode}
								onValueChange={(value) => setBillingMode(value as BillingMode)}
								className="grid gap-3 sm:grid-cols-2"
							>
								<label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-border p-3 has-data-checked:border-primary">
									<RadioGroupItem value="per_visit" />
									<span>
										<span className="block text-sm font-medium">Per visit</span>
										<span className="block text-sm text-muted-foreground">Draft one invoice after each completed visit.</span>
									</span>
								</label>
								<label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-border p-3 has-data-checked:border-primary">
									<RadioGroupItem value="monthly" />
									<span>
										<span className="block text-sm font-medium">Monthly</span>
										<span className="block text-sm text-muted-foreground">Combine completed visits into a monthly draft.</span>
									</span>
								</label>
							</RadioGroup>
						</Field>

						<RecurringPaymentRuleEditor value={paymentRule} onChange={setPaymentRule} />
					</FieldGroup>

					{error && (
						<div role="alert" className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger-fg">
							{error}
						</div>
					)}

					<DialogFooter showCloseButton>
						<Button
							className="min-h-11"
							disabled={isSubmitting || !scopeTitle.trim() || !Number.isSafeInteger(proposedRule.interval) || proposedRule.interval < 1 || Boolean(recurringPaymentRuleError(paymentRule))}
							onClick={() => void submit()}
						>
							{isSubmitting ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> : <FileSignature className="size-4" />}
							Set up agreement
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
