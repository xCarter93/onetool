"use client";

import { Id, Doc } from "@onetool/backend/convex/_generated/dataModel";
import { api } from "@onetool/backend/convex/_generated/api";
import { useQuery, useMutation } from "convex/react";
import { BuildingOffice2Icon, PencilIcon } from "@heroicons/react/24/outline";
import { ProminentStatusBadge } from "@/components/shared/prominent-status-badge";
import {
	StyledSelect,
	StyledSelectTrigger,
	StyledSelectContent,
	SelectValue,
	SelectItem,
} from "@/components/ui/styled";
import { EmailThreadListPopover } from "./email-thread-list-popover";
import {
	Popover,
	PopoverTrigger,
	PopoverContent,
} from "@/components/ui/popover";
import {
	Plus,
	FolderOpen,
	Receipt,
	FileText,
	ClipboardList,
	Heart,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS = ["lead", "active", "inactive", "archived"] as const;

function formatStatus(status: string): string {
	return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatDate(timestamp?: number) {
	if (!timestamp) return "Not set";
	return new Date(timestamp).toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
}

function getStatusColor(status: string) {
	switch (status) {
		case "lead":
			return "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400";
		case "active":
		case "paid":
		case "approved":
		case "completed":
			return "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400";
		case "sent":
		case "pending":
		case "in-progress":
			return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400";
		case "inactive":
		case "cancelled":
		case "overdue":
			return "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400";
		case "draft":
			return "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400";
		default:
			return "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400";
	}
}

interface ClientHeaderProps {
	client: Doc<"clients">;
	clientId: string;
	isEditing: boolean;
	onEditClick: () => void;
	statusValue: string;
	onStatusChange: (value: string) => void;
	emailCount: number;
	projects: Doc<"projects">[] | undefined;
	quotes: Doc<"quotes">[] | undefined;
	invoices: Doc<"invoices">[] | undefined;
	tasks: Doc<"tasks">[] | undefined;
	onTaskSheetOpen: () => void;
}

export function ClientHeader({
	client,
	clientId,
	isEditing,
	onEditClick,
	statusValue,
	onStatusChange,
	emailCount,
	projects,
	quotes,
	invoices,
	tasks,
	onTaskSheetOpen,
}: ClientHeaderProps) {
	const router = useRouter();
	const toast = useToast();

	// Favorite functionality
	const isFavorited = useQuery(api.favorites.isFavorited, {
		clientId: clientId as Id<"clients">,
	});
	const toggleFavorite = useMutation(api.favorites.toggle);

	const handleToggleFavorite = async () => {
		try {
			const result = await toggleFavorite({
				clientId: clientId as Id<"clients">,
			});
			if (result.action === "added") {
				toast.success("Added to favorites");
			} else {
				toast.success("Removed from favorites");
			}
		} catch {
			toast.error("Failed to update favorites");
		}
	};

	return (
		<div className="mb-8">
			<div className="flex items-start justify-between gap-6 mb-6">
				<div className="flex items-start gap-6">
					<div className="flex items-center justify-center w-16 h-16 rounded-lg bg-linear-to-br from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-700 shrink-0 shadow-md">
						<BuildingOffice2Icon className="h-8 w-8 text-white" />
					</div>
					<div className="flex-1 min-w-0">
						<div className="flex items-center gap-3 flex-wrap mb-2">
							<h1 className="text-3xl font-bold text-gray-900 dark:text-white">
								{client.companyName}
							</h1>
							{isEditing ? (
								<StyledSelect
									value={statusValue}
									onValueChange={onStatusChange}
								>
									<StyledSelectTrigger className="w-auto">
										<SelectValue />
									</StyledSelectTrigger>
									<StyledSelectContent>
										{STATUS_OPTIONS.map((status) => (
											<SelectItem key={status} value={status}>
												{formatStatus(status)}
											</SelectItem>
										))}
									</StyledSelectContent>
								</StyledSelect>
							) : (
								<ProminentStatusBadge
									status={client.status}
									size="large"
									showIcon={true}
									entityType="client"
								/>
							)}
							<button
								onClick={handleToggleFavorite}
								className={cn(
									"p-2 rounded-md transition-colors",
									"hover:bg-gray-100 dark:hover:bg-gray-800",
									"focus:outline-none focus:ring-2 focus:ring-rose-500/50"
								)}
								aria-label={isFavorited ? "Remove from favorites" : "Add to favorites"}
							>
								<Heart
									className={cn(
										"h-7 w-7 transition-colors",
										isFavorited
											? "fill-rose-500 text-rose-500"
											: "text-gray-400 hover:text-rose-400"
									)}
								/>
							</button>
						</div>
						{!isEditing && (
							<button
								onClick={onEditClick}
								className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80 font-medium transition-colors"
							>
								<PencilIcon className="h-4 w-4" />
								Edit Details
							</button>
						)}
					</div>
				</div>
			</div>

			{/* Related Items Quick Links - Salesforce inspired */}
			<div className="grid grid-cols-2 md:grid-cols-5 gap-3">
				{/* Messages */}
				<EmailThreadListPopover clientId={clientId as Id<"clients">}>
					<button className="flex flex-col items-center justify-center p-4 rounded-lg border border-gray-300 dark:border-white/20 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all">
						<div className="flex items-center gap-2 mb-1">
							<svg
								className="w-5 h-5 text-indigo-600 dark:text-indigo-400"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth="2"
									d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
								/>
							</svg>
							<span className="text-2xl font-bold text-gray-900 dark:text-white">
								{emailCount}
							</span>
						</div>
						<span className="text-xs font-medium text-gray-600 dark:text-gray-400">
							Messages
						</span>
					</button>
				</EmailThreadListPopover>

				{/* Projects */}
				<Popover>
					<PopoverTrigger asChild>
						<button className="flex flex-col items-center justify-center p-4 rounded-lg border border-gray-300 dark:border-white/20 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all">
							<div className="flex items-center gap-2 mb-1">
								<svg
									className="w-5 h-5 text-purple-600 dark:text-purple-400"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth="2"
										d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
									/>
								</svg>
								<span className="text-2xl font-bold text-gray-900 dark:text-white">
									{projects?.length || 0}
								</span>
							</div>
							<span className="text-xs font-medium text-gray-600 dark:text-gray-400">
								Projects
							</span>
						</button>
					</PopoverTrigger>
					<PopoverContent
						className="w-96 p-0 bg-white dark:bg-gray-900"
						align="start"
						side="bottom"
					>
						<div className="p-4 border-b border-gray-200 dark:border-white/10">
							<div className="flex items-center justify-between">
								<h3 className="font-semibold text-gray-900 dark:text-white">
									Projects
								</h3>
								<Button
									intent="outline"
									size="sm"
									onPress={() =>
										router.push(`/projects/new?clientId=${clientId}`)
									}
								>
									<Plus className="h-4 w-4 mr-2" />
									New
								</Button>
							</div>
						</div>
						<div className="max-h-96 overflow-y-auto">
							{projects && projects.length > 0 ? (
								<div className="p-2">
									{projects.map((project: Doc<"projects">) => (
										<div
											key={project._id}
											className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
											onClick={() => router.push(`/projects/${project._id}`)}
										>
											<div className="flex items-center gap-3 flex-1 min-w-0">
												<div
													className={`w-2 h-2 rounded-full shrink-0 ${
														project.status === "completed"
															? "bg-green-500"
															: project.status === "in-progress"
																? "bg-yellow-500"
																: "bg-blue-500"
													}`}
												/>
												<div className="flex-1 min-w-0">
													<p className="font-medium text-sm text-gray-900 dark:text-white truncate">
														{project.title}
													</p>
													{project.description && (
														<p className="text-xs text-gray-500 dark:text-gray-400 truncate">
															{project.description}
														</p>
													)}
												</div>
											</div>
											<Badge
												className={getStatusColor(project.status)}
												variant="outline"
											>
												{formatStatus(project.status)}
											</Badge>
										</div>
									))}
								</div>
							) : (
								<div className="p-8 text-center">
									<FolderOpen className="h-12 w-12 text-gray-400 dark:text-gray-600 mx-auto mb-3" />
									<p className="text-sm text-gray-500 dark:text-gray-400">
										No projects yet
									</p>
								</div>
							)}
						</div>
					</PopoverContent>
				</Popover>

				{/* Quotes */}
				<Popover>
					<PopoverTrigger asChild>
						<button className="flex flex-col items-center justify-center p-4 rounded-lg border border-gray-300 dark:border-white/20 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all">
							<div className="flex items-center gap-2 mb-1">
								<svg
									className="w-5 h-5 text-green-600 dark:text-green-400"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth="2"
										d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z"
									/>
								</svg>
								<span className="text-2xl font-bold text-gray-900 dark:text-white">
									{quotes?.length || 0}
								</span>
							</div>
							<span className="text-xs font-medium text-gray-600 dark:text-gray-400">
								Quotes
							</span>
						</button>
					</PopoverTrigger>
					<PopoverContent
						className="w-96 p-0 bg-white dark:bg-gray-900"
						align="start"
						side="bottom"
					>
						<div className="p-4 border-b border-gray-200 dark:border-white/10">
							<div className="flex items-center justify-between">
								<h3 className="font-semibold text-gray-900 dark:text-white">
									Quotes
								</h3>
								<Button
									intent="outline"
									size="sm"
									onPress={() =>
										router.push(`/quotes/new?clientId=${clientId}`)
									}
								>
									<Plus className="h-4 w-4 mr-2" />
									New
								</Button>
							</div>
						</div>
						<div className="max-h-96 overflow-y-auto">
							{quotes && quotes.length > 0 ? (
								<div className="p-2">
									{quotes.map((quote: Doc<"quotes">) => (
										<div
											key={quote._id}
											className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
											onClick={() => router.push(`/quotes/${quote._id}`)}
										>
											<div className="flex items-center gap-3 flex-1 min-w-0">
												<div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
												<div className="flex-1 min-w-0">
													<p className="font-medium text-sm text-gray-900 dark:text-white truncate">
														Quote #{quote.quoteNumber}
													</p>
													{quote.title && (
														<p className="text-xs text-gray-500 dark:text-gray-400 truncate">
															{quote.title}
														</p>
													)}
												</div>
											</div>
											<div className="text-right shrink-0">
												{quote.total && (
													<p className="font-medium text-sm text-gray-900 dark:text-white">
														${quote.total.toLocaleString()}
													</p>
												)}
												<Badge
													className={getStatusColor(quote.status || "draft")}
													variant="outline"
												>
													{quote.status || "draft"}
												</Badge>
											</div>
										</div>
									))}
								</div>
							) : (
								<div className="p-8 text-center">
									<Receipt className="h-12 w-12 text-gray-400 dark:text-gray-600 mx-auto mb-3" />
									<p className="text-sm text-gray-500 dark:text-gray-400">
										No quotes yet
									</p>
								</div>
							)}
						</div>
					</PopoverContent>
				</Popover>

				{/* Invoices */}
				<Popover>
					<PopoverTrigger asChild>
						<button className="flex flex-col items-center justify-center p-4 rounded-lg border border-gray-300 dark:border-white/20 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all">
							<div className="flex items-center gap-2 mb-1">
								<svg
									className="w-5 h-5 text-orange-600 dark:text-orange-400"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth="2"
										d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
									/>
								</svg>
								<span className="text-2xl font-bold text-gray-900 dark:text-white">
									{invoices?.length || 0}
								</span>
							</div>
							<span className="text-xs font-medium text-gray-600 dark:text-gray-400">
								Invoices
							</span>
						</button>
					</PopoverTrigger>
					<PopoverContent
						className="w-96 p-0 bg-white dark:bg-gray-900"
						align="start"
						side="bottom"
					>
						<div className="p-4 border-b border-gray-200 dark:border-white/10">
							<div className="flex items-center justify-between">
								<h3 className="font-semibold text-gray-900 dark:text-white">
									Invoices
								</h3>
								<Button
									intent="outline"
									size="sm"
									onPress={() =>
										toast.info(
											"Create Invoice",
											"Invoice creation functionality coming soon!"
										)
									}
								>
									<Plus className="h-4 w-4 mr-2" />
									New
								</Button>
							</div>
						</div>
						<div className="max-h-96 overflow-y-auto">
							{invoices && invoices.length > 0 ? (
								<div className="p-2">
									{invoices.map((invoice: Doc<"invoices">) => (
										<div
											key={invoice._id}
											className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
											onClick={() =>
												toast.info(
													"View Invoice",
													"Invoice detail page coming soon!"
												)
											}
										>
											<div className="flex items-center gap-3 flex-1 min-w-0">
												<div
													className={`w-2 h-2 rounded-full shrink-0 ${
														invoice.status === "paid"
															? "bg-green-500"
															: invoice.status === "sent"
																? "bg-yellow-500"
																: "bg-red-500"
													}`}
												/>
												<div className="flex-1 min-w-0">
													<p className="font-medium text-sm text-gray-900 dark:text-white truncate">
														Invoice #{invoice.invoiceNumber}
													</p>
													<p className="text-xs text-gray-500 dark:text-gray-400">
														{formatDate(invoice._creationTime)}
													</p>
												</div>
											</div>
											<div className="text-right shrink-0">
												{invoice.total && (
													<p className="font-medium text-sm text-gray-900 dark:text-white">
														${invoice.total.toLocaleString()}
													</p>
												)}
												<Badge
													className={getStatusColor(invoice.status)}
													variant="outline"
												>
													{invoice.status}
												</Badge>
											</div>
										</div>
									))}
								</div>
							) : (
								<div className="p-8 text-center">
									<FileText className="h-12 w-12 text-gray-400 dark:text-gray-600 mx-auto mb-3" />
									<p className="text-sm text-gray-500 dark:text-gray-400">
										No invoices yet
									</p>
								</div>
							)}
						</div>
					</PopoverContent>
				</Popover>

				{/* Tasks */}
				<Popover>
					<PopoverTrigger asChild>
						<button className="flex flex-col items-center justify-center p-4 rounded-lg border border-gray-300 dark:border-white/20 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all">
							<div className="flex items-center gap-2 mb-1">
								<svg
									className="w-5 h-5 text-blue-600 dark:text-blue-400"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth="2"
										d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
									/>
								</svg>
								<span className="text-2xl font-bold text-gray-900 dark:text-white">
									{tasks?.length || 0}
								</span>
							</div>
							<span className="text-xs font-medium text-gray-600 dark:text-gray-400">
								Tasks
							</span>
						</button>
					</PopoverTrigger>
					<PopoverContent
						className="w-96 p-0 bg-white dark:bg-gray-900"
						align="end"
						side="bottom"
					>
						<div className="p-4 border-b border-gray-200 dark:border-white/10">
							<div className="flex items-center justify-between">
								<h3 className="font-semibold text-gray-900 dark:text-white">
									Tasks
								</h3>
								<Button intent="outline" size="sm" onPress={onTaskSheetOpen}>
									<Plus className="h-4 w-4 mr-2" />
									New
								</Button>
							</div>
						</div>
						<div className="max-h-96 overflow-y-auto">
							{tasks && tasks.length > 0 ? (
								<div className="p-2">
									{tasks.map((task: Doc<"tasks">) => (
										<div
											key={task._id}
											className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-white/5 rounded-lg transition-colors"
										>
											<div className="flex items-center gap-3 flex-1 min-w-0">
												<div
													className={`w-2 h-2 rounded-full shrink-0 ${
														task.status === "completed"
															? "bg-green-500"
															: task.status === "cancelled"
																? "bg-red-500"
																: "bg-yellow-500"
													}`}
												/>
												<div className="flex-1 min-w-0">
													<p className="font-medium text-sm text-gray-900 dark:text-white truncate">
														{task.title}
													</p>
													{task.date && (
														<p className="text-xs text-gray-500 dark:text-gray-400">
															{formatDate(task.date)}
														</p>
													)}
												</div>
											</div>
											<Badge
												className={getStatusColor(task.status)}
												variant="outline"
											>
												{task.status}
											</Badge>
										</div>
									))}
								</div>
							) : (
								<div className="p-8 text-center">
									<ClipboardList className="h-12 w-12 text-gray-400 dark:text-gray-600 mx-auto mb-3" />
									<p className="text-sm text-gray-500 dark:text-gray-400">
										No tasks yet
									</p>
								</div>
							)}
						</div>
					</PopoverContent>
				</Popover>
			</div>
		</div>
	);
}
