"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import {
	CheckCircle2,
	ExternalLink,
	FileText,
	PenLine,
	Receipt,
	XCircle,
} from "lucide-react";

import { Badge } from "@/components/reui/badge";
import {
	Timeline,
	TimelineContent,
	TimelineIndicator,
	TimelineItem,
	TimelineSeparator,
	TimelineTitle,
} from "@/components/reui/timeline";
import { StyledButton } from "@/components/ui/styled";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
	DetailDrawer,
	DrawerField,
	DrawerFieldGrid,
	DrawerSection,
	DrawerSkeleton,
	formatActivityTime,
	formatCurrency,
} from "@/components/shared/detail-drawer";

type QuoteStatus = Doc<"quotes">["status"];

const STATUS_LABEL: Record<QuoteStatus, string> = {
	draft: "Draft",
	sent: "Sent",
	approved: "Approved",
	declined: "Declined",
	expired: "Expired",
};

const STATUS_BADGE: Record<
	QuoteStatus,
	React.ComponentProps<typeof Badge>["variant"]
> = {
	draft: "secondary",
	sent: "warning-light",
	approved: "success-light",
	declined: "destructive-light",
	expired: "secondary",
};

const STATUS_ORDER: QuoteStatus[] = [
	"draft",
	"sent",
	"approved",
	"declined",
	"expired",
];

function formatDate(ts: number | null | undefined): string {
	if (!ts) return "—";
	return new Date(ts).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

export interface QuoteDetailDrawerProps {
	quoteId: Id<"quotes"> | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function QuoteDetailDrawer({
	quoteId,
	open,
	onOpenChange,
}: QuoteDetailDrawerProps) {
	const router = useRouter();
	const toast = useToast();
	const updateQuote = useMutation(api.quotes.update);
	const createInvoice = useMutation(api.invoices.createFromQuote);
	const [converting, setConverting] = React.useState(false);

	const preview = useQuery(
		api.quotes.getPreview,
		quoteId ? { id: quoteId } : "skip"
	);

	const loading = quoteId !== null && preview === undefined;
	const notFound = quoteId !== null && preview === null;
	const data = preview ?? null;
	const quote = data?.quote ?? null;

	const openRecord = () => {
		if (!quoteId) return;
		onOpenChange(false);
		router.push(`/quotes/${quoteId}`);
	};

	// Reuse the dedicated embedded-sending route: it already calls
	// createEmbeddedSignatureRequest and handles the limit / no-signer / editor
	// states, so we just hand off rather than re-implement the flow here.
	const sendForSignature = () => {
		if (!quoteId) return;
		onOpenChange(false);
		router.push(`/quotes/${quoteId}/sign`);
	};

	const setStatus = async (status: QuoteStatus) => {
		if (!quoteId) return;
		try {
			await updateQuote({ id: quoteId, status });
		} catch (err) {
			console.error("Failed to update quote status:", err);
			toast.error("Couldn't update quote", "Please try again.");
		}
	};

	const convertToInvoice = async () => {
		if (!quoteId) return;
		setConverting(true);
		try {
			const invoiceId = await createInvoice({ quoteId });
			toast.success("Invoice created", "Converted from this quote.");
			onOpenChange(false);
			router.push(`/invoices/${invoiceId}`);
		} catch (err) {
			console.error("Failed to convert quote to invoice:", err);
			toast.error(
				"Couldn't convert quote",
				err instanceof Error ? err.message : "Please try again."
			);
		} finally {
			setConverting(false);
		}
	};

	const eyebrow = quote?.quoteNumber ? `Quote #${quote.quoteNumber}` : "Quote";
	const title =
		quote?.title ||
		(quote?.quoteNumber
			? `#${quote.quoteNumber}`
			: loading
				? "Loading…"
				: "Quote");

	const canSend = quote?.status === "draft" || quote?.status === "sent";
	const canDecide = quote?.status === "sent";
	const canConvert = quote?.status === "approved" && data?.hasInvoice !== true;

	return (
		<DetailDrawer
			open={open}
			onOpenChange={onOpenChange}
			eyebrow={eyebrow}
			icon={
				<span className="bg-primary/10 text-primary flex size-7 shrink-0 items-center justify-center rounded-md">
					<FileText className="size-4" />
				</span>
			}
			title={title}
			badge={
				quote ? (
					<Badge variant={STATUS_BADGE[quote.status]} size="lg">
						{STATUS_LABEL[quote.status]}
					</Badge>
				) : null
			}
			description={
				data
					? `${data.client?.companyName ?? "No client"} · ${
							data.project?.title ?? "No project"
						}`
					: undefined
			}
			actions={
				quote ? (
					<>
						{canSend ? (
							<StyledButton
								intent="primary"
								size="sm"
								icon={<PenLine className="size-3.5" />}
								label="Send for e-signature"
								showArrow={false}
								onClick={sendForSignature}
							/>
						) : null}
						{canDecide ? (
							<>
								<StyledButton
									intent="success"
									size="sm"
									icon={<CheckCircle2 className="size-3.5" />}
									label="Approve"
									showArrow={false}
									onClick={() => void setStatus("approved")}
								/>
								<StyledButton
									intent="destructive"
									size="sm"
									icon={<XCircle className="size-3.5" />}
									label="Decline"
									showArrow={false}
									onClick={() => void setStatus("declined")}
								/>
							</>
						) : null}
						{canConvert ? (
							<StyledButton
								intent="primary"
								size="sm"
								icon={<Receipt className="size-3.5" />}
								label={converting ? "Converting…" : "Convert to invoice"}
								showArrow={false}
								disabled={converting}
								onClick={convertToInvoice}
							/>
						) : quote.status === "approved" && data?.hasInvoice ? (
							<span className="text-muted-foreground text-xs">
								Invoice already created
							</span>
						) : null}
						<StyledButton
							intent="outline"
							size="sm"
							icon={<ExternalLink className="size-3.5" />}
							label="Open quote"
							showArrow={false}
							onClick={openRecord}
						/>
					</>
				) : null
			}
		>
			{loading ? (
				<DrawerSkeleton />
			) : notFound ? (
				<p className="text-muted-foreground p-5 text-sm">Quote not found</p>
			) : !data || !quote ? (
				<DrawerSkeleton />
			) : (
				<>
					{/* Total hero */}
					<DrawerSection>
						<div className="flex items-end justify-between gap-3">
							<div className="flex flex-col">
								<span className="text-muted-foreground text-xs">
									Total
								</span>
								<span className="text-foreground text-3xl font-semibold tabular-nums">
									{formatCurrency(data.totals.total)}
								</span>
							</div>
							<Badge variant={STATUS_BADGE[quote.status]} size="lg">
								{STATUS_LABEL[quote.status]}
							</Badge>
						</div>
						<span className="text-muted-foreground text-xs">
							Subtotal {formatCurrency(data.totals.subtotal)} · Tax{" "}
							{formatCurrency(data.totals.taxAmount)}
						</span>
					</DrawerSection>

					{/* Status control */}
					<DrawerSection label="Status">
						<StatusControl
							key={quote.status}
							quoteId={quote._id}
							currentStatus={quote.status}
						/>
					</DrawerSection>

					{/* Line items (top 3) */}
					<DrawerSection label="Line items">
						{data.lineItems.length ? (
							<div className="flex flex-col gap-2.5">
								{data.lineItems.slice(0, 3).map((li) => (
									<div
										key={li._id}
										className="flex items-start justify-between gap-3"
									>
										<div className="flex min-w-0 flex-col">
											<span className="text-foreground truncate text-sm font-medium">
												{li.description}
											</span>
											<span className="text-muted-foreground text-xs">
												{li.quantity} {li.unit} × {formatCurrency(li.rate)}
											</span>
										</div>
										<span className="text-foreground shrink-0 text-sm font-medium tabular-nums">
											{formatCurrency(li.amount)}
										</span>
									</div>
								))}
								{data.lineItems.length > 3 ? (
									<span className="text-muted-foreground text-xs">
										+{data.lineItems.length - 3} more
									</span>
								) : null}
							</div>
						) : (
							<p className="text-muted-foreground text-sm">No line items</p>
						)}
					</DrawerSection>

					{/* Details */}
					<DrawerSection label="Details">
						<DrawerFieldGrid>
							<DrawerField label="Client">
								{data.client?.companyName ?? "—"}
							</DrawerField>
							<DrawerField label="Project">
								{data.project?.title ?? "—"}
							</DrawerField>
							<DrawerField label="Valid Until">
								{formatDate(quote.validUntil)}
							</DrawerField>
							{quote.sentAt ? (
								<DrawerField label="Sent">
									{formatDate(quote.sentAt)}
								</DrawerField>
							) : null}
							{quote.approvedAt ? (
								<DrawerField label="Approved">
									{formatDate(quote.approvedAt)}
								</DrawerField>
							) : null}
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
 * quote's current status; the parent keys this by status so it re-seeds after
 * a save, and the Sheet unmounts it on close so it re-seeds on reopen.
 */
function StatusControl({
	quoteId,
	currentStatus,
}: {
	quoteId: Id<"quotes">;
	currentStatus: QuoteStatus;
}) {
	const updateQuote = useMutation(api.quotes.update);
	const toast = useToast();
	const [status, setStatus] = React.useState<QuoteStatus>(currentStatus);
	const [saving, setSaving] = React.useState(false);
	const dirty = status !== currentStatus;

	const handleSave = async () => {
		if (!dirty) return;
		setSaving(true);
		try {
			await updateQuote({ id: quoteId, status });
		} catch (err) {
			console.error("Failed to update quote status:", err);
			toast.error("Couldn't update quote", "Please try again.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<>
			<div className="flex items-center gap-2">
				<Select
					value={status}
					onValueChange={(v) => setStatus(v as QuoteStatus)}
				>
					<SelectTrigger className="h-9 flex-1">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{STATUS_ORDER.map((s) => (
							<SelectItem key={s} value={s}>
								{STATUS_LABEL[s]}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{dirty ? (
					<StyledButton
						intent="primary"
						size="sm"
						label={saving ? "Saving…" : "Save"}
						showArrow={false}
						disabled={saving}
						onClick={handleSave}
					/>
				) : null}
			</div>
			{dirty ? (
				<p className="text-warning text-xs">Unsaved status change</p>
			) : null}
		</>
	);
}
