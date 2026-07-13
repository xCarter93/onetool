"use client";

import { PermissionGate } from "@/components/domain/permission-gate";
import { useCreateRecord } from "@/components/domain/create-record-provider";
import { usePermissions } from "@/hooks/use-permissions";
import { useQuery, useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { useParams, useRouter } from "next/navigation";
import { TaskSheet } from "@/components/shared/task-sheet";
import DeleteConfirmationModal from "@/components/ui/delete-confirmation-modal";
import { InvoiceGenerationModal } from "@/app/(workspace)/projects/components/invoice-generation-modal";
import { ProjectDetailHeader } from "@/app/(workspace)/projects/components/project-detail-header";
import { ProjectDetailTabs } from "@/app/(workspace)/projects/components/project-detail-tabs";
import { useState } from "react";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { Skeleton } from "@/components/ui/skeleton";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";

function ProjectDetailPageContent() {
	const params = useParams();
	const router = useRouter();
	const openCreate = useCreateRecord();
	const [isTaskSheetOpen, setIsTaskSheetOpen] = useState(false);
	const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
	const [activeTab, setActiveTab] = useState("overview");
	const { can } = usePermissions();

	const projectId = params.projectId as Id<"projects">;

	// Fetch project data
	const project = useQuery(api.projects.get, { id: projectId });

	// Skip related queries if project is null or deletion is in progress
	const projectTasks = useQuery(
		api.tasks.list,
		project === null || isDeleting || !can("tasks") ? "skip" : { projectId }
	);
	const projectQuotes = useQuery(
		api.quotes.list,
		project === null || isDeleting || !can("quotes") ? "skip" : { projectId }
	);
	const projectInvoices = useQuery(
		api.invoices.list,
		project === null || isDeleting || !can("invoices")
			? "skip"
			: { projectId }
	);
	const activities = useQuery(
		api.activities.getByEntity,
		project === null || isDeleting
			? "skip"
			: { entityType: "project" as const, entityId: projectId as string }
	);

	// Fetch client and related data
	const client = useQuery(
		api.clients.get,
		project?.clientId && can("clients") ? { id: project.clientId } : "skip"
	);
	const primaryContact = useQuery(
		api.clientContacts.getPrimaryContact,
		project?.clientId && can("clients")
			? { clientId: project.clientId }
			: "skip"
	);
	const primaryProperty = useQuery(
		api.clientProperties.getPrimaryProperty,
		project?.clientId && can("clients")
			? { clientId: project.clientId }
			: "skip"
	);

	// Mutations
	const deleteProject = useMutation(api.projects.remove);

	const confirmDeleteProject = async () => {
		setIsDeleting(true);
		try {
			await deleteProject({ id: projectId });
			// Success toast + modal close are owned by DeleteConfirmationModal.
			router.push("/projects");
		} catch (err) {
			// Re-throw so the modal shows a single error toast and stays open.
			setIsDeleting(false);
			throw err;
		}
	};

	// Loading state
	if (project === undefined) {
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

	// Project not found
	if (project === null) {
		return (
			<div className="relative pl-6 pt-8 pb-20">
				<div className="mx-auto">
					<div className="flex flex-col items-center justify-center py-12 text-center">
						<div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center mb-4">
							<ExclamationTriangleIcon className="h-8 w-8 text-red-600 dark:text-red-400" />
						</div>
						<h3 className="text-lg font-medium text-foreground mb-2">
							Project not found
						</h3>
						<p className="text-muted-foreground">
							The project you&apos;re looking for doesn&apos;t exist or you
							don&apos;t have permission to view it.
						</p>
					</div>
				</div>
			</div>
		);
	}

	// Filter approved quotes for invoice generation
	const approvedQuotes =
		projectQuotes?.filter((quote) => quote.status === "approved") || [];

	return (
		<>
			<div className="relative min-h-screen pl-6 pt-6">
				{/* Header */}
				<ProjectDetailHeader
					project={project}
					hasApprovedQuotes={approvedQuotes.length > 0}
					onAddTask={() => setIsTaskSheetOpen(true)}
					onAddQuote={() => openCreate({ type: "quote", projectId })}
					onGenerateInvoice={() => setIsInvoiceModalOpen(true)}
					onDelete={() => setIsDeleteModalOpen(true)}
				/>

				{/* Tabs + Sidebar */}
				<ProjectDetailTabs
					activeTab={activeTab}
					onTabChange={setActiveTab}
					project={project}
					projectId={projectId}
					tasks={projectTasks}
					quotes={projectQuotes}
					invoices={projectInvoices}
					activities={activities}
					client={client}
					primaryContact={primaryContact}
					primaryProperty={primaryProperty}
					onAddTask={() => setIsTaskSheetOpen(true)}
				/>
			</div>

			{/* Modals */}
			<TaskSheet
				mode="create"
				isOpen={isTaskSheetOpen}
				onOpenChange={setIsTaskSheetOpen}
				initialValues={{
					clientId: project?.clientId,
					projectId: projectId,
				}}
			/>
			<DeleteConfirmationModal
				isOpen={isDeleteModalOpen}
				onClose={() => setIsDeleteModalOpen(false)}
				onConfirm={confirmDeleteProject}
				title="Delete Project"
				itemName={project.title}
				itemType="Project"
				isArchive={false}
			/>
			<InvoiceGenerationModal
				isOpen={isInvoiceModalOpen}
				onClose={() => setIsInvoiceModalOpen(false)}
				approvedQuotes={approvedQuotes}
			/>
		</>
	);
}

export default function ProjectDetailPage() {
	return (
		<PermissionGate object="projects">
			<ProjectDetailPageContent />
		</PermissionGate>
	);
}
