"use client";

import React from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
	Plus,
	Workflow,
	Trash2,
	Pencil,
	Lock,
	Zap,
	ArrowRight,
	Power,
	PowerOff,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import DeleteConfirmationModal from "@/components/ui/delete-confirmation-modal";
import { StyledButton } from "@/components/ui/styled/styled-button";
import { useRoleAccess } from "@/hooks/use-role-access";
import { useFeatureAccess } from "@/hooks/use-feature-access";

// Format object type for display
const formatObjectType = (type: string) => {
	return type.charAt(0).toUpperCase() + type.slice(1);
};

// Format trigger for display
const formatTrigger = (trigger: {
	objectType: string;
	fromStatus?: string;
	toStatus: string;
}) => {
	const fromPart = trigger.fromStatus ? `from "${trigger.fromStatus}" ` : "";
	return `When ${formatObjectType(trigger.objectType)} changes ${fromPart}to "${trigger.toStatus}"`;
};

// Get badge variant for object type
const getObjectTypeBadgeVariant = (type: string) => {
	switch (type) {
		case "quote":
			return "default" as const;
		case "project":
			return "secondary" as const;
		case "client":
			return "outline" as const;
		case "invoice":
			return "default" as const;
		case "task":
			return "secondary" as const;
		default:
			return "outline" as const;
	}
};

// Premium feature gate component
function PremiumGate({ children }: { children: React.ReactNode }) {
	const { isAdmin, isLoading: roleLoading } = useRoleAccess();
	const { hasPremiumAccess, isLoading: featureLoading } = useFeatureAccess();
	const router = useRouter();

	if (roleLoading || featureLoading) {
		return (
			<div className="relative p-6 space-y-6">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-3">
						<div className="w-1.5 h-6 bg-linear-to-b from-primary to-primary/60 rounded-full" />
						<div>
							<h1 className="text-2xl font-bold text-foreground">Automations</h1>
							<p className="text-muted-foreground text-sm">Loading...</p>
						</div>
					</div>
				</div>
				<Card>
					<CardContent className="py-12">
						<div className="flex items-center justify-center">
							<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
						</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	if (!isAdmin || !hasPremiumAccess) {
		return (
			<div className="relative p-6 space-y-6">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-3">
						<div className="w-1.5 h-6 bg-linear-to-b from-primary to-primary/60 rounded-full" />
						<div>
							<h1 className="text-2xl font-bold text-foreground">Automations</h1>
							<p className="text-muted-foreground text-sm">
								Automate your workflows
							</p>
						</div>
					</div>
				</div>
				<Card className="group relative backdrop-blur-md overflow-hidden ring-1 ring-border/20 dark:ring-border/40">
					<div className="absolute inset-0 bg-linear-to-br from-white/10 via-white/5 to-transparent dark:from-white/5 dark:via-white/2 dark:to-transparent rounded-2xl" />
					<CardContent className="relative z-10 py-16">
						<div className="flex flex-col items-center justify-center text-center max-w-md mx-auto">
							<div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
								<Lock className="h-10 w-10 text-primary" />
							</div>
							<h3 className="mb-2 text-xl font-semibold text-foreground">
								{!isAdmin
									? "Admin Access Required"
									: "Premium Feature"}
							</h3>
							<p className="text-muted-foreground mb-6">
								{!isAdmin
									? "Only organization administrators can access and manage workflow automations."
									: "Workflow automations are available on the Business plan. Upgrade to automate your workflows and save time."}
							</p>
							{!hasPremiumAccess && isAdmin && (
								<StyledButton
									intent="primary"
									onClick={() => router.push("/subscription")}
								>
									Upgrade to Business
								</StyledButton>
							)}
						</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	return <>{children}</>;
}

function AutomationsContent() {
	const router = useRouter();
	const toast = useToast();
	const [deleteModalOpen, setDeleteModalOpen] = useState(false);
	const [automationToDelete, setAutomationToDelete] = useState<{
		id: string;
		name: string;
	} | null>(null);

	const automations = useQuery(api.automations.list);
	const toggleActive = useMutation(api.automations.toggleActive);
	const deleteAutomation = useMutation(api.automations.remove);

	const handleToggleActive = async (id: string) => {
		try {
			await toggleActive({ id: id as Id<"workflowAutomations"> });
		} catch (error) {
			console.error("Failed to toggle automation:", error);
			toast.error("Error", "Failed to toggle automation status");
		}
	};

	const handleDelete = (id: string, name: string) => {
		setAutomationToDelete({ id, name });
		setDeleteModalOpen(true);
	};

	const confirmDelete = async () => {
		if (automationToDelete) {
			try {
				await deleteAutomation({
					id: automationToDelete.id as Id<"workflowAutomations">,
				});
				setDeleteModalOpen(false);
				setAutomationToDelete(null);
				toast.success(
					"Automation Deleted",
					`"${automationToDelete.name}" has been deleted.`
				);
			} catch (error) {
				console.error("Failed to delete automation:", error);
				toast.error("Error", "Failed to delete automation");
			}
		}
	};

	const isLoading = automations === undefined;
	const isEmpty = !isLoading && automations.length === 0;

	// Count active automations
	const activeCount = automations?.filter((a) => a.isActive).length ?? 0;

	return (
		<div className="relative p-6 space-y-6">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="w-1.5 h-6 bg-linear-to-b from-primary to-primary/60 rounded-full" />
					<div>
						<h1 className="text-2xl font-bold text-foreground">Automations</h1>
						<p className="text-muted-foreground text-sm">
							Automate your workflows with no-code triggers and actions
						</p>
					</div>
				</div>
				<StyledButton
					intent="primary"
					icon={<Plus className="h-4 w-4" />}
					onClick={() => router.push("/automations/editor")}
				>
					Create Automation
				</StyledButton>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
				<Card className="group relative backdrop-blur-md overflow-hidden ring-1 ring-border/20 dark:ring-border/40">
					<div className="absolute inset-0 bg-linear-to-br from-white/10 via-white/5 to-transparent dark:from-white/5 dark:via-white/2 dark:to-transparent rounded-2xl" />
					<CardHeader className="relative z-10">
						<CardTitle className="flex items-center gap-2 text-base">
							<Workflow className="size-4" /> Total Automations
						</CardTitle>
						<CardDescription>All automations in your workspace</CardDescription>
					</CardHeader>
					<CardContent className="relative z-10">
						<div className="text-3xl font-semibold">
							{automations?.length ?? 0}
						</div>
					</CardContent>
				</Card>
				<Card className="group relative backdrop-blur-md overflow-hidden ring-1 ring-border/20 dark:ring-border/40">
					<div className="absolute inset-0 bg-linear-to-br from-white/10 via-white/5 to-transparent dark:from-white/5 dark:via-white/2 dark:to-transparent rounded-2xl" />
					<CardHeader className="relative z-10">
						<CardTitle className="text-base">Active</CardTitle>
						<CardDescription>Currently running automations</CardDescription>
					</CardHeader>
					<CardContent className="relative z-10">
						<div className="text-3xl font-semibold text-green-600 dark:text-green-400">
							{activeCount}
						</div>
					</CardContent>
				</Card>
				<Card className="group relative backdrop-blur-md overflow-hidden ring-1 ring-border/20 dark:ring-border/40">
					<div className="absolute inset-0 bg-linear-to-br from-white/10 via-white/5 to-transparent dark:from-white/5 dark:via-white/2 dark:to-transparent rounded-2xl" />
					<CardHeader className="relative z-10">
						<CardTitle className="text-base">Total Runs</CardTitle>
						<CardDescription>Times automations have triggered</CardDescription>
					</CardHeader>
					<CardContent className="relative z-10">
						<div className="text-3xl font-semibold">
							{automations?.reduce((acc, a) => acc + (a.triggerCount || 0), 0) ??
								0}
						</div>
					</CardContent>
				</Card>
			</div>

			<Card className="group relative backdrop-blur-md overflow-hidden ring-1 ring-border/20 dark:ring-border/40">
				<div className="absolute inset-0 bg-linear-to-br from-white/10 via-white/5 to-transparent dark:from-white/5 dark:via-white/2 dark:to-transparent rounded-2xl" />
				<CardHeader className="relative z-10 border-b">
					<CardTitle>Your Automations</CardTitle>
					<CardDescription>
						Manage your workflow automations
					</CardDescription>
				</CardHeader>
				<CardContent className="relative z-10 px-0">
					{isLoading ? (
						<div className="px-6 py-12">
							<div className="flex items-center justify-center">
								<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
							</div>
						</div>
					) : isEmpty ? (
						<div className="px-6 py-12 text-center">
							<div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-muted">
								<Zap className="h-12 w-12 text-muted-foreground" />
							</div>
							<h3 className="mb-2 text-lg font-semibold text-foreground">
								No automations yet
							</h3>
							<p className="mx-auto mb-6 max-w-sm text-muted-foreground">
								Create your first automation to start saving time. Automations
								run in the background when specific events occur.
							</p>
							<StyledButton
								intent="primary"
								icon={<Plus className="h-4 w-4" />}
								onClick={() => router.push("/automations/editor")}
							>
								Create Your First Automation
							</StyledButton>
						</div>
					) : (
						<div className="px-6">
							<div className="overflow-hidden rounded-lg border">
								<Table>
									<TableHeader className="bg-muted sticky top-0 z-10">
										<TableRow>
											<TableHead>Name</TableHead>
											<TableHead>Trigger</TableHead>
											<TableHead>Actions</TableHead>
											<TableHead>Runs</TableHead>
											<TableHead>Status</TableHead>
											<TableHead className="w-[100px]"></TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{automations.map((automation) => (
											<TableRow key={automation._id}>
												<TableCell>
													<div className="flex flex-col">
														<span className="font-medium text-foreground">
															{automation.name}
														</span>
														{automation.description && (
															<span className="text-muted-foreground text-xs line-clamp-1">
																{automation.description}
															</span>
														)}
													</div>
												</TableCell>
												<TableCell>
													<div className="flex items-center gap-2">
														<Badge
															variant={getObjectTypeBadgeVariant(
																automation.trigger.objectType
															)}
														>
															{formatObjectType(automation.trigger.objectType)}
														</Badge>
														<ArrowRight className="h-3 w-3 text-muted-foreground" />
														<span className="text-sm text-muted-foreground">
															{automation.trigger.toStatus}
														</span>
													</div>
												</TableCell>
												<TableCell>
													<span className="text-sm text-foreground">
														{automation.nodes.filter((n) => n.type === "action")
															.length}{" "}
														action
														{automation.nodes.filter((n) => n.type === "action")
															.length !== 1
															? "s"
															: ""}
													</span>
												</TableCell>
												<TableCell>
													<span className="text-sm text-foreground">
														{automation.triggerCount || 0}
													</span>
												</TableCell>
												<TableCell>
													<Button
														intent="outline"
														size="sm"
														onPress={() => handleToggleActive(automation._id)}
														className={`gap-1.5 ${
															automation.isActive
																? "text-green-600 hover:text-green-700 border-green-200 hover:border-green-300 dark:text-green-400 dark:border-green-800 dark:hover:border-green-700"
																: "text-muted-foreground"
														}`}
													>
														{automation.isActive ? (
															<Power className="h-3.5 w-3.5" />
														) : (
															<PowerOff className="h-3.5 w-3.5" />
														)}
														{automation.isActive ? "Active" : "Inactive"}
													</Button>
												</TableCell>
												<TableCell>
													<div className="flex items-center gap-2">
														<Button
															intent="outline"
															size="sq-sm"
															onPress={() =>
																router.push(
																	`/automations/editor?id=${automation._id}`
																)
															}
															aria-label={`Edit ${automation.name}`}
														>
															<Pencil className="size-4" />
														</Button>
														<Button
															intent="outline"
															size="sq-sm"
															onPress={() =>
																handleDelete(automation._id, automation.name)
															}
															className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
															aria-label={`Delete ${automation.name}`}
														>
															<Trash2 className="size-4" />
														</Button>
													</div>
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</div>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Delete Confirmation Modal */}
			{automationToDelete && (
				<DeleteConfirmationModal
					isOpen={deleteModalOpen}
					onClose={() => setDeleteModalOpen(false)}
					onConfirm={confirmDelete}
					title="Delete Automation"
					itemName={automationToDelete.name}
					itemType="Automation"
				/>
			)}
		</div>
	);
}

export default function AutomationsPage() {
	return (
		<PremiumGate>
			<AutomationsContent />
		</PremiumGate>
	);
}

