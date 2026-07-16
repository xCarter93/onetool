"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import {
	CheckCircle2,
	ExternalLink,
	Loader2,
	Lock,
	Receipt,
	Send,
} from "lucide-react";

import { StatusBadge } from "@/components/domain/status-badge";
import {
	ActionButtonGroup,
	type RecordAction,
} from "@/components/domain/action-button-group";
import { Badge } from "@/components/ui/badge";
import { usePermissions } from "@/hooks/use-permissions";
import {
	Timeline,
	TimelineContent,
	TimelineIndicator,
	TimelineItem,
	TimelineSeparator,
	TimelineTitle,
} from "@/components/reui/timeline";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	DetailDrawer,
	DrawerField,
	DrawerFieldGrid,
	DrawerSection,
	DrawerSkeleton,
	formatActivityTime,
} from "@/components/shared/detail-drawer";
import { formatCurrency } from "@/lib/money";
import { useToast } from "@/hooks/use-toast";

type InvoiceStatus = Doc<"invoices">["status"];
type PaymentStatus = Doc<"payments">["status"];

const STATUS_LABEL: Record<InvoiceStatus, string> = {
	draft: "Draft",
	sent: "Sent",
	paid: "Paid",
	overdue: "Overdue",
	cancelled: "Cancelled",
};

// Status options offered in the drawer's editable control. "overdue" is a
// computed state, so it only appears when the invoice is currently overdue.
const STATUS_ORDER: InvoiceStatus[] = ["draft", "sent", "paid", "cancelled"];

const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
	pending: "Pending",
	sent: "Sent",
	paid: "Paid",
	refunded: "Refunded",
	overdue: "Overdue",
	cancelled: "Cancelled",
};

function formatDate(ts: number | null | undefined): string {
	if (!ts) return "—";
	return new Date(ts).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

// Overdue is computed from a past-due "sent" invoice. Reads the clock inside a
// module helper so the component render stays pure.
function getEffectiveStatus(status: InvoiceStatus, dueDate: number): InvoiceStatus {
	return status === "sent" && dueDate < Date.now() ? "overdue" : status;
}

export interface InvoiceDetailDrawerProps {
	invoiceId: Id<"invoices"> | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function InvoiceDetailDrawer({
	invoiceId,
	open,
	onOpenChange,
}: InvoiceDetailDrawerProps) {
	const router = useRouter();
	const { can, isLoading: permissionsLoading } = usePermissions();
	const canModify = can("invoices", "modify");
	const showReadOnly = !permissionsLoading && !canModify;
	const toast = useToast();
	const preview = useQuery(
		api.invoices.getPreview,
		invoiceId ? { id: invoiceId } : "skip"
	);
	const markPaid = useMutation(api.invoices.markPaid);
	const updateInvoice = useMutation(api.invoices.update);
	const [pending, setPending] = React.useState(false);

	const loading = invoiceId !== null && preview === undefined;
	const notFound = invoiceId !== null && preview === null;
	const data = preview ?? null;
	const invoice = data?.invoice ?? null;
	const client = data?.client ?? null;
	const project = data?.project ?? null;

	// Computed display status (overdue when a sent invoice is past due).
	const effectiveStatus = invoice
		? getEffectiveStatus(invoice.status, invoice.dueDate)
		: null;
	const canMarkPaid =
		effectiveStatus !== null &&
		effectiveStatus !== "paid" &&
		effectiveStatus !== "cancelled";

	const openRecord = () => {
		if (!invoiceId) return;
		onOpenChange(false);
		router.push(`/invoices/${invoiceId}`);
	};

	const handleMarkPaid = async () => {
		if (!invoiceId) return;
		setPending(true);
		try {
			await markPaid({ id: invoiceId });
		} catch (err) {
			console.error("Failed to mark invoice paid:", err);
			toast.error("Couldn't mark paid", "Please try again.");
		} finally {
			setPending(false);
		}
	};

	const handleSend = async () => {
		if (!invoiceId) return;
		setPending(true);
		try {
			await updateInvoice({ id: invoiceId, status: "sent" });
		} catch (err) {
			console.error("Failed to send invoice:", err);
			toast.error("Couldn't send invoice", "Please try again.");
		} finally {
			setPending(false);
		}
	};

	const recordActions: RecordAction[] = [
		{
			key: "open-invoice",
			label: "Open invoice",
			icon: <ExternalLink className="size-3.5" />,
			onClick: openRecord,
			variant: "default",
			slot: "start",
		},
		{
			key: "mark-paid",
			label: "Mark paid",
			icon: <CheckCircle2 className="size-3.5" />,
			onClick: handleMarkPaid,
			variant: "default",
			slot: "start",
			disabled: pending || !can("invoices", "modify"),
			hidden: !canMarkPaid,
		},
		{
			key: "send",
			label: "Send",
			icon: <Send className="size-3.5" />,
			onClick: handleSend,
			variant: "outline",
			slot: "secondary",
			disabled: pending || !can("invoices", "modify"),
			hidden: effectiveStatus !== "draft",
		},
	];

	const title = invoice
		? `#${invoice.invoiceNumber}`
		: loading
			? "Loading…"
			: "Invoice";

	return (
		<DetailDrawer
			open={open}
			onOpenChange={onOpenChange}
			eyebrow={
				invoice ? `Invoice #${invoice.invoiceNumber}` : "Invoice"
			}
			icon={
				<span className="bg-primary/10 text-primary flex size-7 shrink-0 items-center justify-center rounded-md">
					<Receipt className="size-4" />
				</span>
			}
			title={title}
			badge={
				<>
					{invoice && effectiveStatus ? (
						<StatusBadge status={effectiveStatus} size="lg">
							{STATUS_LABEL[effectiveStatus]}
						</StatusBadge>
					) : null}
					{showReadOnly ? (
						<Badge variant="secondary" className="gap-1">
							<Lock className="h-3 w-3" />
							Read Only
						</Badge>
					) : null}
				</>
			}
			description={data ? (client?.companyName ?? "No client") : undefined}
			actions={<ActionButtonGroup actions={recordActions} />}
		>
			{loading ? (
				<DrawerSkeleton />
			) : notFound ? (
				<p className="text-muted-foreground p-5 text-sm">Invoice not found</p>
			) : !data || !invoice || !effectiveStatus ? (
				<DrawerSkeleton />
			) : (
				<>
					{/* Amount hero */}
					<DrawerSection>
						<div className="text-muted-foreground flex items-center gap-2 text-sm">
							<Receipt className="size-4" />
							<span>Amount due</span>
						</div>
						<div className="flex items-end justify-between gap-3">
							<span className="text-foreground text-3xl font-semibold tabular-nums">
								{formatCurrency(invoice.total)}
							</span>
							<StatusBadge status={effectiveStatus} size="lg">
								{STATUS_LABEL[effectiveStatus]}
							</StatusBadge>
						</div>
						<div className="flex flex-col gap-1.5">
							<Progress
								value={data.paymentSummary.percentPaid}
								className="h-1.5"
							/>
							<div className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
								<span>
									{formatCurrency(data.paymentSummary.paidAmount)} paid ·{" "}
									{formatCurrency(data.paymentSummary.remainingAmount)} remaining
								</span>
								<span>{data.paymentSummary.percentPaid}% paid</span>
							</div>
						</div>
					</DrawerSection>

					{/* Status control */}
					<DrawerSection label="Status">
						<StatusControl
							key={effectiveStatus}
							invoiceId={invoice._id}
							currentStatus={effectiveStatus}
							canModify={canModify}
						/>
					</DrawerSection>

					{/* Payment schedule */}
					<DrawerSection label="Payment schedule">
						{data.payments.length ? (
							<div className="flex flex-col gap-2.5">
								{data.payments.map((payment) => (
									<div
										key={payment._id}
										className="flex items-center justify-between gap-3"
									>
										<div className="flex min-w-0 flex-col">
											<span className="text-foreground truncate text-sm font-medium">
												{payment.description ?? "Payment"}
											</span>
											<span className="text-muted-foreground text-xs">
												Due {formatDate(payment.dueDate)}
												{payment.paidAt
													? ` · Paid ${formatDate(payment.paidAt)}`
													: ""}
											</span>
										</div>
										<div className="flex shrink-0 items-center gap-2">
											<StatusBadge status={payment.status} size="lg">
												{PAYMENT_STATUS_LABEL[payment.status]}
											</StatusBadge>
											<span className="text-foreground text-sm font-medium tabular-nums">
												{formatCurrency(payment.paymentAmount)}
											</span>
										</div>
									</div>
								))}
							</div>
						) : (
							<p className="text-muted-foreground text-sm">
								No payment schedule
							</p>
						)}
					</DrawerSection>

					{/* Details */}
					<DrawerSection label="Details">
						<DrawerFieldGrid>
							<DrawerField label="Client">
								{client?.companyName ?? "—"}
							</DrawerField>
							<DrawerField label="Project">{project?.title ?? "—"}</DrawerField>
							<DrawerField label="Issued">
								{formatDate(invoice.issuedDate)}
							</DrawerField>
							<DrawerField label="Due">{formatDate(invoice.dueDate)}</DrawerField>
							<DrawerField label="From quote">
								{data.sourceQuote?.quoteNumber
									? `#${data.sourceQuote.quoteNumber}`
									: "—"}
							</DrawerField>
						</DrawerFieldGrid>
					</DrawerSection>

					{/* Activity (last 7 days) */}
					<DrawerSection label="Activity">
						{data.activities.length ? (
							<Timeline defaultValue={data.activities.length}>
								{data.activities.map((activity, index) => (
									<TimelineItem
										key={activity._id}
										step={index + 1}
										className="pb-5! last:pb-0!"
									>
										<TimelineSeparator className="bg-border!" />
										<TimelineIndicator className="bg-primary size-2.5! border-primary!" />
										<TimelineTitle className="text-foreground text-sm font-normal leading-snug">
											{activity.description}
										</TimelineTitle>
										<TimelineContent className="text-xs">
											{formatActivityTime(activity.timestamp)} ·{" "}
											{activity.userName}
										</TimelineContent>
									</TimelineItem>
								))}
							</Timeline>
						) : (
							<p className="text-muted-foreground text-sm">
								No activity in the last 7 days
							</p>
						)}
					</DrawerSection>
				</>
			)}
		</DetailDrawer>
	);
}

/**
 * Status Select with a save-when-dirty button. State initializes from the
 * invoice's current (effective) status; the parent keys this by status so it
 * re-seeds after a save, and the Sheet unmounts it on close so it re-seeds on
 * reopen — which is why setState in an effect is unnecessary here.
 */
function StatusControl({
	invoiceId,
	currentStatus,
	canModify,
}: {
	invoiceId: Id<"invoices">;
	currentStatus: InvoiceStatus;
	canModify: boolean;
}) {
	const updateInvoice = useMutation(api.invoices.update);
	const toast = useToast();
	const [status, setStatus] = React.useState<InvoiceStatus>(currentStatus);
	const [saving, setSaving] = React.useState(false);
	const dirty = status !== currentStatus;

	// Include "overdue" only when the invoice is currently overdue (computed).
	const options: InvoiceStatus[] =
		currentStatus === "overdue"
			? ["draft", "sent", "overdue", "paid", "cancelled"]
			: STATUS_ORDER;

	const handleSave = async () => {
		if (!dirty) return;
		setSaving(true);
		try {
			await updateInvoice({ id: invoiceId, status });
		} catch (err) {
			console.error("Failed to update invoice status:", err);
			toast.error("Couldn't update status", "Please try again.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<>
			<div className="flex items-center gap-2">
				<Select
					value={status}
					onValueChange={(v) => setStatus(v as InvoiceStatus)}
					disabled={!canModify}
				>
					<SelectTrigger className="h-9 flex-1">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{options.map((s) => (
							<SelectItem key={s} value={s}>
								{STATUS_LABEL[s]}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{dirty ? (
					<Button size="sm" disabled={saving} onClick={handleSave}>
						{saving && <Loader2 className="h-4 w-4 animate-spin" />}
						{saving ? "Saving…" : "Save"}
					</Button>
				) : null}
			</div>
			{dirty ? (
				<p className="text-warning text-xs">Unsaved status change</p>
			) : null}
		</>
	);
}
