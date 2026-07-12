"use client";

import { PermissionGate } from "@/components/domain/permission-gate";
import { usePermissions } from "@/hooks/use-permissions";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { Id } from "@onetool/backend/convex/_generated/dataModel";
import { Skeleton } from "@/components/ui/skeleton";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { TaskSheet } from "@/components/shared/task-sheet";
import { EmailThreadSheet } from "@/app/(workspace)/clients/components/email-thread-sheet";
import type { EmailThreadSummary } from "@onetool/backend/convex/emailMessages";
import { ClientDetailHeader } from "@/app/(workspace)/clients/components/client-detail-header";
import { ClientDetailTabs } from "@/app/(workspace)/clients/components/client-detail-tabs";
import { useState } from "react";

function ClientDetailPageContent() {
	const params = useParams();
	const router = useRouter();
	const clientId = params.clientId as string;
	const { can } = usePermissions();
	const [isTaskSheetOpen, setIsTaskSheetOpen] = useState(false);
	const [isEmailSheetOpen, setIsEmailSheetOpen] = useState(false);
	const [emailSheetMode, setEmailSheetMode] = useState<"new" | "reply">("new");
	const [selectedThreadDocId, setSelectedThreadDocId] = useState<
		Id<"emailThreads"> | undefined
	>(undefined);
	const [activeTab, setActiveTab] = useState("overview");

	// Fetch client data
	const client = useQuery(api.clients.get, { id: clientId as Id<"clients"> });
	const clientContacts = useQuery(api.clientContacts.listByClient, {
		clientId: clientId as Id<"clients">,
	});
	const clientProperties = useQuery(api.clientProperties.listByClient, {
		clientId: clientId as Id<"clients">,
	});
	const primaryContact = useQuery(api.clientContacts.getPrimaryContact, {
		clientId: clientId as Id<"clients">,
	});
	const primaryProperty = useQuery(api.clientProperties.getPrimaryProperty, {
		clientId: clientId as Id<"clients">,
	});

	// Fetch related data. Each list endpoint is gated and throws FORBIDDEN
	// without the object's view grant, so skip it when the user can't see it.
	const quotes = useQuery(
		api.quotes.list,
		can("quotes") ? { clientId: clientId as Id<"clients"> } : "skip"
	);
	const projects = useQuery(
		api.projects.list,
		can("projects") ? { clientId: clientId as Id<"clients"> } : "skip"
	);
	const invoices = useQuery(
		api.invoices.list,
		can("invoices") ? { clientId: clientId as Id<"clients"> } : "skip"
	);
	const clientTasks = useQuery(
		api.tasks.list,
		can("tasks") ? { clientId: clientId as Id<"clients"> } : "skip"
	);

	// Fetch email threads (grouped conversations) for this client. Gated on
	// the inbox grant — skip without it to avoid a FORBIDDEN crash.
	const clientThreads = useQuery(
		api.emailMessages.listThreadsByClient,
		can("inbox") ? { clientId: clientId as Id<"clients"> } : "skip"
	) as EmailThreadSummary[] | undefined;

	// Fetch activities for this client
	const activities = useQuery(api.activities.getByEntity, {
		entityType: "client",
		entityId: clientId,
	});

	const handleComposeEmail = () => {
		setEmailSheetMode("new");
		setIsEmailSheetOpen(true);
	};

	// Loading state
	if (
		client === undefined ||
		clientContacts === undefined ||
		clientProperties === undefined ||
		primaryContact === undefined ||
		(can("quotes") && quotes === undefined) ||
		(can("projects") && projects === undefined) ||
		(can("invoices") && invoices === undefined) ||
		(can("tasks") && clientTasks === undefined) ||
		(can("inbox") && clientThreads === undefined)
	) {
		return (
			<div className="relative pl-6 pt-8 pb-20">
				<div className="mx-auto">
					<div className="space-y-6">
						<Skeleton className="h-12 w-64" />
						<Skeleton className="h-32 w-full" />
						<Skeleton className="h-64 w-full" />
						<Skeleton className="h-64 w-full" />
					</div>
				</div>
			</div>
		);
	}

	// Error state
	if (!client) {
		return (
			<div className="relative pl-6 pt-8 pb-20">
				<div className="mx-auto">
					<div className="flex flex-col items-center justify-center py-12 text-center">
						<div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center mb-4">
							<ExclamationTriangleIcon className="h-8 w-8 text-red-600 dark:text-red-400" />
						</div>
						<h3 className="text-lg font-medium text-foreground mb-2">
							Client not found
						</h3>
						<p className="text-muted-foreground">
							The client you&apos;re looking for doesn&apos;t exist or you
							don&apos;t have permission to view it.
						</p>
					</div>
				</div>
			</div>
		);
	}

	return (
		<>
			<div className="relative min-h-screen pl-6 pt-6">
				{/* Header */}
				<ClientDetailHeader
					client={client}
					clientId={clientId}
					onComposeEmail={handleComposeEmail}
					onAddTask={() => setIsTaskSheetOpen(true)}
					onCreateProject={() =>
						router.push(`/projects/new?clientId=${clientId}`)
					}
					onCreateQuote={() =>
						router.push(`/quotes/new?clientId=${clientId}`)
					}
					hasPrimaryContactEmail={!!primaryContact?.email}
				/>

				{/* Tabs span full width; sidebar is inside the tabs component */}
				<div>
					<ClientDetailTabs
						activeTab={activeTab}
						onTabChange={setActiveTab}
						client={client}
						clientId={clientId}
						projects={projects}
						quotes={quotes}
						invoices={invoices}
						activities={activities}
						threads={clientThreads}
						tasks={clientTasks}
						clientProperties={clientProperties || []}
						clientContacts={clientContacts || []}
						primaryContact={primaryContact}
						primaryProperty={primaryProperty}
						onComposeEmail={handleComposeEmail}
						onAddTask={() => setIsTaskSheetOpen(true)}
						onThreadClick={(threadDocId) => {
							setSelectedThreadDocId(threadDocId);
							setEmailSheetMode("reply");
							setIsEmailSheetOpen(true);
						}}
					/>
				</div>
			</div>

			{/* Email Thread Sheet */}
			<EmailThreadSheet
				isOpen={isEmailSheetOpen}
				onOpenChange={(open) => {
					setIsEmailSheetOpen(open);
					if (!open) setSelectedThreadDocId(undefined);
				}}
				clientId={clientId as Id<"clients">}
				threadDocId={selectedThreadDocId}
				mode={emailSheetMode}
				onComplete={() => {
					setIsEmailSheetOpen(false);
					setSelectedThreadDocId(undefined);
				}}
			/>

			<TaskSheet
				isOpen={isTaskSheetOpen}
				onOpenChange={setIsTaskSheetOpen}
				initialValues={{
					clientId: clientId as Id<"clients">,
				}}
			/>
		</>
	);
}

export default function ClientDetailPage() {
	return (
		<PermissionGate object="clients">
			<ClientDetailPageContent />
		</PermissionGate>
	);
}
