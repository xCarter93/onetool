"use client";

import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { AlertTriangle, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/domain/status-badge";
import { usePermissions } from "@/hooks/use-permissions";
import { useToast } from "@/hooks/use-toast";
import { convexErrorMessage } from "@/lib/convex-error";
import { useState } from "react";

export function RecurringVisitBilling({ projectId, recurring }: { projectId: Id<"projects">; recurring: boolean }) {
	const { can, hasAllRecords, isLoading } = usePermissions();
	const canView = recurring && can("projects") && can("quotes") && can("invoices") && hasAllRecords("projects") && hasAllRecords("quotes") && hasAllRecords("invoices");
	const canModify = canView && can("invoices", "modify");
	const billing = useQuery(api.recurringBilling.getVisit, canView ? { projectId } : "skip");
	const additions = useQuery(api.recurringBilling.listBillableAdditions, canView ? { projectId } : "skip");
	const draftVisit = useMutation(api.recurringBilling.draftVisit);
	const resolve = useMutation(api.recurringBilling.resolve);
	const setBillableAddition = useMutation(api.recurringBilling.setBillableAddition);
	const toast = useToast();
	const [pending, setPending] = useState<string | null>(null);

	if (isLoading || (canView && billing === undefined)) return <Skeleton className="h-20 w-full" />;
	if (!canView || !billing || billing.state === "ineligible") return null;

	const runDraft = async () => {
		setPending("draft");
		try {
			const invoiceId = await draftVisit({ projectId });
			toast.success(invoiceId ? "Invoice drafted" : "Billing checked", invoiceId ? "The recurring invoice draft is ready for review." : "No invoice was due yet.");
		} catch (error) {
			toast.error("Draft failed", convexErrorMessage(error, "Review the billing setup and try again."));
		} finally {
			setPending(null);
		}
	};

	const runResolution = async (resolution: "rebill" | "defer" | "nonbillable") => {
		if (!billing.allocationId) return;
		setPending(resolution);
		try {
			await resolve({ allocationId: billing.allocationId, resolution });
			toast.success("Billing decision saved", resolution === "rebill" ? "A replacement draft will be prepared." : resolution === "defer" ? "This visit will stay in billing review." : "This visit will not be billed automatically.");
		} catch (error) {
			toast.error("Decision failed", convexErrorMessage(error, "Review the invoice and try again."));
		} finally {
			setPending(null);
		}
	};
	const changeAddition = async (quoteId: Id<"quotes">, selected: boolean) => {
		setPending(String(quoteId));
		try {
			await setBillableAddition({ quoteId, selected });
			toast.success("Billable work updated", selected ? "This approved quote will be included in recurring billing." : "This quote will remain separate from recurring billing.");
		} catch (error) {
			toast.error("Update failed", convexErrorMessage(error, "Review the quote approval and try again."));
		} finally {
			setPending(null);
		}
	};

	return (
		<div className="space-y-3 rounded-md border border-border p-3">
			<div className="flex items-center justify-between gap-3">
				<p className="text-sm font-medium text-foreground">Recurring visit billing</p>
				<StatusBadge status={billing.state} appearance="outline" />
			</div>
			{billing.reason && (
				<p className="flex gap-2 text-sm text-muted-foreground">
					<AlertTriangle className="mt-0.5 size-4 shrink-0" /> {billing.reason}
				</p>
			)}
			<div className="flex flex-wrap gap-2">
				{billing.quoteId && <Button nativeButton={false} size="sm" variant="outline" render={<Link href={`/quotes/${billing.quoteId}`} />}><FileText className="size-4" /> View quote</Button>}
				{billing.invoiceId && <Button nativeButton={false} size="sm" variant="outline" render={<Link href={`/invoices/${billing.invoiceId}`} />}><FileText className="size-4" /> View invoice</Button>}
				{billing.state === "ready" && <Button size="sm" disabled={!canModify || pending !== null} onClick={() => void runDraft()}>{pending === "draft" && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />}Draft invoice</Button>}
				{(billing.state === "review" || billing.state === "deferred") && billing.allocationId && (
					<>
						<Button size="sm" disabled={!canModify || pending !== null} onClick={() => void runResolution("rebill")}>Rebill</Button>
						<Button size="sm" variant="outline" disabled={!canModify || pending !== null} onClick={() => void runResolution("defer")}>Defer</Button>
						<Button size="sm" variant="outline" disabled={!canModify || pending !== null} onClick={() => void runResolution("nonbillable")}>Do not bill</Button>
					</>
				)}
			</div>
			{additions && additions.length > 0 && (
				<div className="space-y-2 border-t border-border pt-3">
					<p className="text-xs font-medium text-muted-foreground">Additional approved work</p>
					{additions.map((addition) => (
						<label key={addition.quoteId} className="flex items-start gap-2 text-sm">
							<Checkbox checked={addition.selected} disabled={!canModify || !addition.eligible || pending !== null} onCheckedChange={(checked) => void changeAddition(addition.quoteId, checked === true)} />
							<span><span className="block text-foreground">{addition.title || addition.quoteNumber || "Additional quote"}</span><span className="block text-xs text-muted-foreground">{addition.quoteNumber ? `${addition.quoteNumber} · ` : ""}{addition.eligible ? "Select to include in recurring billing" : `Not eligible while ${addition.status}`}</span></span>
						</label>
					))}
				</div>
			)}
		</div>
	);
}
