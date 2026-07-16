"use client";

import { Doc } from "@onetool/backend/convex/_generated/dataModel";
import { Id } from "@onetool/backend/convex/_generated/dataModel";
import {
	GlassCard,
	GlassCardHeader,
	GlassCardTitle,
	GlassCardContent,
} from "@/components/shared/glass-card";
import {
	PillTabs,
	PillTabsContent,
	PillTabsList,
	PillTabsTrigger,
} from "@/components/shared/pill-tabs";
import {
	Empty,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
	EmptyDescription,
} from "@/components/ui/empty";
import { Badge } from "@/components/ui/badge";
import { FolderOpen, Receipt, FileText, ClipboardList } from "lucide-react";
import { formatCurrency } from "@/lib/money";

// Helper function to format status for display
function formatStatus(status: string): string {
	return status.charAt(0).toUpperCase() + status.slice(1);
}

// Helper function to format date
function formatDate(timestamp?: number) {
	if (!timestamp) return "Not set";
	return new Date(timestamp).toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
}

interface RelatedItemsSectionProps {
	projects: Doc<"projects">[] | undefined;
	quotes: Doc<"quotes">[] | undefined;
	invoices: Doc<"invoices">[] | undefined;
	tasks: Doc<"tasks">[] | undefined;
}

export function RelatedItemsSection({
	projects,
	quotes,
	invoices,
	tasks,
}: RelatedItemsSectionProps) {
	return (
		<GlassCard>
			<GlassCardHeader>
				<GlassCardTitle className="text-xl">Related Items</GlassCardTitle>
			</GlassCardHeader>
			<GlassCardContent>
				<PillTabs defaultValue="projects" className="w-full">
					<PillTabsList className="overflow-x-auto">
						<PillTabsTrigger value="projects">
							Projects ({projects?.length || 0})
						</PillTabsTrigger>
						<PillTabsTrigger value="quotes">
							Quotes ({quotes?.length || 0})
						</PillTabsTrigger>
						<PillTabsTrigger value="invoices">
							Invoices ({invoices?.length || 0})
						</PillTabsTrigger>
						<PillTabsTrigger value="tasks">
							Tasks ({tasks?.length || 0})
						</PillTabsTrigger>
					</PillTabsList>

					{/* Projects Tab */}
					<PillTabsContent value="projects">
						{projects && projects.length > 0 ? (
							<div className="space-y-3">
								{projects.map((project: Doc<"projects">) => (
									<div
										key={project._id}
										className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
									>
										<div className="flex items-start justify-between">
											<div className="flex-1">
												<h4 className="font-medium text-gray-900 dark:text-white mb-1">
													{project.title}
												</h4>
												{project.description && (
													<p className="text-sm text-gray-600 dark:text-gray-400">
														{project.description}
													</p>
												)}
											</div>
											<Badge
												variant="outline"
												className={`shrink-0 ml-4 ${
													project.status === "completed"
														? "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400"
														: project.status === "in-progress"
														? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400"
														: "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-900/20 dark:text-gray-400"
												}`}
											>
												{formatStatus(project.status)}
											</Badge>
										</div>
									</div>
								))}
							</div>
						) : (
							<Empty>
								<EmptyHeader>
									<EmptyMedia variant="icon">
										<FolderOpen />
									</EmptyMedia>
									<EmptyTitle>No projects</EmptyTitle>
									<EmptyDescription>
										No projects have been created for this client yet.
									</EmptyDescription>
								</EmptyHeader>
							</Empty>
						)}
					</PillTabsContent>

					{/* Quotes Tab */}
					<PillTabsContent value="quotes">
						{quotes && quotes.length > 0 ? (
							<div className="space-y-3">
								{quotes.map((quote: Doc<"quotes">) => (
									<div
										key={quote._id}
										className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
									>
										<div className="flex items-start justify-between">
											<div className="flex-1">
												<h4 className="font-medium text-gray-900 dark:text-white mb-1">
													Quote #{quote.quoteNumber}
												</h4>
												{quote.title && (
													<p className="text-sm text-gray-600 dark:text-gray-400">
														{quote.title}
													</p>
												)}
											</div>
											<div className="text-right shrink-0 ml-4">
												<Badge
													variant="outline"
													className={`mb-1 ${
														quote.status === "approved"
															? "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400"
															: quote.status === "sent"
															? "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400"
															: "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-900/20 dark:text-gray-400"
													}`}
												>
													{formatStatus(quote.status)}
												</Badge>
												<p className="text-sm font-medium text-gray-900 dark:text-white">
													{formatCurrency(quote.total)}
												</p>
											</div>
										</div>
									</div>
								))}
							</div>
						) : (
							<Empty>
								<EmptyHeader>
									<EmptyMedia variant="icon">
										<Receipt />
									</EmptyMedia>
									<EmptyTitle>No quotes</EmptyTitle>
									<EmptyDescription>
										No quotes have been created for this client yet.
									</EmptyDescription>
								</EmptyHeader>
							</Empty>
						)}
					</PillTabsContent>

					{/* Invoices Tab */}
					<PillTabsContent value="invoices">
						{invoices && invoices.length > 0 ? (
							<div className="space-y-3">
								{invoices.map((invoice: Doc<"invoices">) => (
									<div
										key={invoice._id}
										className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
									>
										<div className="flex items-start justify-between">
											<div className="flex-1">
												<h4 className="font-medium text-gray-900 dark:text-white mb-1">
													Invoice #{invoice.invoiceNumber}
												</h4>
												<p className="text-sm text-gray-600 dark:text-gray-400">
													{formatDate(invoice._creationTime)}
												</p>
											</div>
											<div className="text-right shrink-0 ml-4">
												<Badge
													variant="outline"
													className={`mb-1 ${
														invoice.status === "paid"
															? "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400"
															: invoice.status === "sent"
															? "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400"
															: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400"
													}`}
												>
													{formatStatus(invoice.status)}
												</Badge>
												<p className="text-sm font-medium text-gray-900 dark:text-white">
													{formatCurrency(invoice.total)}
												</p>
											</div>
										</div>
									</div>
								))}
							</div>
						) : (
							<Empty>
								<EmptyHeader>
									<EmptyMedia variant="icon">
										<FileText />
									</EmptyMedia>
									<EmptyTitle>No invoices</EmptyTitle>
									<EmptyDescription>
										This client hasn&apos;t been billed yet.
									</EmptyDescription>
								</EmptyHeader>
							</Empty>
						)}
					</PillTabsContent>

					{/* Tasks Tab */}
					<PillTabsContent value="tasks">
						{tasks && tasks.length > 0 ? (
							<div className="space-y-3">
								{tasks.map((task: Doc<"tasks">) => (
									<div
										key={task._id}
										className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
									>
										<div className="flex items-start justify-between">
											<div className="flex-1">
												<h4 className="font-medium text-gray-900 dark:text-white mb-1">
													{task.title}
												</h4>
												{task.description && (
													<p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
														{task.description}
													</p>
												)}
												<p className="text-xs text-gray-500 dark:text-gray-400">
													Date: {new Date(task.date).toLocaleDateString()}
													{task.startTime && ` ${task.startTime}`}
												</p>
											</div>
											<Badge
												variant="outline"
												className={`shrink-0 ml-4 ${
													task.status === "completed"
														? "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400"
														: task.status === "in-progress"
														? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400"
														: "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-900/20 dark:text-gray-400"
												}`}
											>
												{formatStatus(task.status)}
											</Badge>
										</div>
									</div>
								))}
							</div>
						) : (
							<Empty>
								<EmptyHeader>
									<EmptyMedia variant="icon">
										<ClipboardList />
									</EmptyMedia>
									<EmptyTitle>No tasks</EmptyTitle>
									<EmptyDescription>
										No tasks have been scheduled for this client yet.
									</EmptyDescription>
								</EmptyHeader>
							</Empty>
						)}
					</PillTabsContent>
				</PillTabs>
			</GlassCardContent>
		</GlassCard>
	);
}

