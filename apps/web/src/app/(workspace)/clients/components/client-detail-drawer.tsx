"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import {
	Archive,
	Building2,
	ExternalLink,
	FileText,
	FolderKanban,
	Loader2,
	Mail,
	Plus,
	Receipt,
	RotateCcw,
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
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { TaskSheet } from "@/components/shared/task-sheet";
import {
	DetailDrawer,
	DrawerField,
	DrawerFieldGrid,
	DrawerSection,
	DrawerSkeleton,
	RelatedRow,
	formatActivityTime,
	formatCurrency,
} from "@/components/shared/detail-drawer";
import { useToast } from "@/hooks/use-toast";
import { SendClientEmailPopover } from "./send-client-email-popover";

type ClientStatus = Doc<"clients">["status"];

const STATUS_LABEL: Record<ClientStatus, string> = {
	lead: "Lead",
	active: "Active",
	inactive: "Inactive",
	archived: "Archived",
};

const STATUS_BADGE: Record<
	ClientStatus,
	React.ComponentProps<typeof Badge>["variant"]
> = {
	lead: "warning-light",
	active: "success-light",
	inactive: "secondary",
	archived: "secondary",
};

// Status Select options exclude "archived" — archiving/restoring is a separate,
// explicit action in the header, not a status the user picks from the dropdown.
const STATUS_ORDER: ClientStatus[] = ["lead", "active", "inactive"];

// Turn a hyphenated enum value ("word-of-mouth") into a readable label.
function prettify(value: string): string {
	return value
		.split("-")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

// Split a composed "First Last" name into the shape the email popover expects.
function splitName(name: string): { firstName: string; lastName: string } {
	const [firstName, ...rest] = name.trim().split(/\s+/);
	return { firstName: firstName ?? "", lastName: rest.join(" ") };
}

export interface ClientDetailDrawerProps {
	clientId: Id<"clients"> | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function ClientDetailDrawer({
	clientId,
	open,
	onOpenChange,
}: ClientDetailDrawerProps) {
	const router = useRouter();
	const toast = useToast();
	const preview = useQuery(
		api.clients.getPreview,
		clientId ? { id: clientId } : "skip"
	);
	const archiveClient = useMutation(api.clients.archive);
	const restoreClient = useMutation(api.clients.restore);
	const [emailOpen, setEmailOpen] = React.useState(false);

	const loading = clientId !== null && preview === undefined;
	const notFound = clientId !== null && preview === null;
	const data = preview ?? null;
	const client = data?.client ?? null;

	const openRecord = () => {
		if (!clientId) return;
		onOpenChange(false);
		router.push(`/clients/${clientId}`);
	};

	const handleArchive = async () => {
		if (!clientId) return;
		try {
			await archiveClient({ id: clientId });
			toast.success(
				"Client Archived",
				`${client?.companyName ?? "Client"} has been archived. It will be permanently deleted in 7 days.`
			);
			onOpenChange(false);
		} catch (error) {
			console.error("Failed to archive client:", error);
			toast.error(
				"Archive Failed",
				"Failed to archive the client. Please try again."
			);
		}
	};

	const handleRestore = async () => {
		if (!clientId) return;
		try {
			await restoreClient({ id: clientId });
			toast.success(
				"Client Restored",
				`${client?.companyName ?? "Client"} has been restored and is now active.`
			);
		} catch (error) {
			console.error("Failed to restore client:", error);
			toast.error(
				"Restore Failed",
				"Failed to restore the client. Please try again."
			);
		}
	};

	const activeCount = data?.related.projects.active ?? 0;
	const contactEmail = data?.primaryContact?.email ?? null;
	const emailName = data?.primaryContact
		? splitName(data.primaryContact.name)
		: null;

	const title = client?.companyName ?? (loading ? "Loading…" : "Client");

	return (
		<DetailDrawer
			open={open}
			onOpenChange={onOpenChange}
			eyebrow="Client"
			icon={
				<span className="bg-primary/10 text-primary flex size-7 shrink-0 items-center justify-center rounded-md">
					<Building2 className="size-4" />
				</span>
			}
			title={title}
			badge={
				client ? (
					<Badge variant={STATUS_BADGE[client.status]} size="lg">
						{STATUS_LABEL[client.status]}
					</Badge>
				) : null
			}
			description={
				data
					? `${activeCount} active project${activeCount === 1 ? "" : "s"}`
					: undefined
			}
			actions={
				<>
					<Button size="sm" onClick={openRecord}>
						<ExternalLink className="size-3.5" />
						Open client
					</Button>
					<TaskSheet
						mode="create"
						initialValues={{ clientId: clientId ?? undefined }}
						trigger={
							<Button variant="outline" size="sm">
								<Plus className="size-3.5" />
								Add Task
							</Button>
						}
					/>
					{client && contactEmail && emailName ? (
						<SendClientEmailPopover
							isOpen={emailOpen}
							onOpenChange={setEmailOpen}
							clientId={client._id}
							clientName={client.companyName}
							primaryContact={{
								firstName: emailName.firstName,
								lastName: emailName.lastName,
								email: contactEmail,
							}}
						>
							<Button variant="outline" size="sm">
								<Mail className="size-3.5" />
								Email
							</Button>
						</SendClientEmailPopover>
					) : null}
					{client && client.status === "archived" ? (
						<Button variant="outline" size="sm" onClick={handleRestore}>
							<RotateCcw className="size-3.5" />
							Restore
						</Button>
					) : client ? (
						<Button variant="outline" size="sm" onClick={handleArchive}>
							<Archive className="size-3.5" />
							Archive
						</Button>
					) : null}
				</>
			}
		>
			{loading ? (
				<DrawerSkeleton />
			) : notFound ? (
				<p className="text-muted-foreground p-5 text-sm">Client not found</p>
			) : !data || !client ? (
				<DrawerSkeleton />
			) : (
				<>
					{/* Hero — status + project engagement */}
					<DrawerSection>
						<div className="flex items-center justify-between gap-2">
							<div className="text-muted-foreground flex items-center gap-2 text-sm">
								<FolderKanban className="size-4" />
								<span>Projects</span>
							</div>
							<Badge variant={STATUS_BADGE[client.status]}>
								{STATUS_LABEL[client.status]}
							</Badge>
						</div>
						<p className="text-foreground text-sm">
							<span className="text-2xl font-semibold tabular-nums">
								{data.related.projects.active}
							</span>{" "}
							<span className="text-muted-foreground">
								of {data.related.projects.count} projects active
							</span>
						</p>
					</DrawerSection>

					{/* Status control (archived clients use Restore instead) */}
					{client.status !== "archived" ? (
						<DrawerSection label="Status">
							<StatusControl
								key={client.status}
								clientId={client._id}
								currentStatus={client.status}
							/>
						</DrawerSection>
					) : null}

					{/* Contact */}
					<DrawerSection label="Contact">
						{data.primaryContact ? (
							<div className="flex flex-col gap-1">
								<span className="text-foreground text-sm font-medium">
									{data.primaryContact.name}
								</span>
								{data.primaryContact.jobTitle ? (
									<span className="text-muted-foreground text-xs">
										{data.primaryContact.jobTitle}
									</span>
								) : null}
								{data.primaryContact.email ? (
									<a
										href={`mailto:${data.primaryContact.email}`}
										className="text-primary text-sm hover:underline"
									>
										{data.primaryContact.email}
									</a>
								) : null}
								{data.primaryContact.phone ? (
									<span className="text-foreground text-sm">
										{data.primaryContact.phone}
									</span>
								) : null}
							</div>
						) : (
							<p className="text-muted-foreground text-sm">No primary contact</p>
						)}
					</DrawerSection>

					{/* Details */}
					<DrawerSection label="Details">
						<DrawerFieldGrid>
							<DrawerField label="Address">{data.address ?? "—"}</DrawerField>
							<DrawerField label="Lead Source">
								{client.leadSource ? prettify(client.leadSource) : "—"}
							</DrawerField>
							<DrawerField label="Comm Preference">
								{client.communicationPreference ?? "—"}
							</DrawerField>
							<DrawerField label="Tags">
								{client.tags.length ? client.tags.join(", ") : "—"}
							</DrawerField>
						</DrawerFieldGrid>
					</DrawerSection>

					{/* Related */}
					<DrawerSection label="Related">
						<div className="flex flex-col gap-2.5">
							<RelatedRow
								icon={<FolderKanban className="size-4" />}
								label="Projects"
								count={data.related.projects.count}
								value={`${data.related.projects.active} active`}
							/>
							<RelatedRow
								icon={<FileText className="size-4" />}
								label="Quotes"
								count={data.related.quotes.count}
								value={formatCurrency(data.related.quotes.total)}
								valueLabel="quoted"
							/>
							<RelatedRow
								icon={<Receipt className="size-4" />}
								label="Invoices"
								count={data.related.invoices.count}
								value={formatCurrency(data.related.invoices.outstanding)}
								valueLabel="outstanding"
							/>
						</div>
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
 * client's current status; the parent keys this by status so it re-seeds after
 * a save, and the Sheet unmounts it on close so it re-seeds on reopen.
 */
function StatusControl({
	clientId,
	currentStatus,
}: {
	clientId: Id<"clients">;
	currentStatus: ClientStatus;
}) {
	const updateClient = useMutation(api.clients.update);
	const toast = useToast();
	const [status, setStatus] = React.useState<ClientStatus>(currentStatus);
	const [saving, setSaving] = React.useState(false);
	const dirty = status !== currentStatus;

	const handleSave = async () => {
		if (!dirty) return;
		setSaving(true);
		try {
			await updateClient({ id: clientId, status });
		} catch (err) {
			console.error("Failed to update client status:", err);
			toast.error("Couldn't update client", "Please try again.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<>
			<div className="flex items-center gap-2">
				<Select
					value={status}
					onValueChange={(v) => setStatus(v as ClientStatus)}
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
					<Button size="sm" disabled={saving} onClick={handleSave}>
						{saving && <Loader2 className="size-3.5 animate-spin" />}
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
