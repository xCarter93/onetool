"use client";

import { Doc } from "@onetool/backend/convex/_generated/dataModel";
import { StatusProgressBar } from "@/components/shared/status-progress-bar";
import { StickyDetailHeader } from "@/components/shared/sticky-detail-header";
import { ListTodo, FileText, Receipt, Trash2 } from "lucide-react";
import { StyledButton } from "@/components/ui/styled/styled-button";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";

interface ProjectDetailHeaderProps {
	project: Doc<"projects">;
	hasApprovedQuotes: boolean;
	onAddTask: () => void;
	onAddQuote: () => void;
	onGenerateInvoice: () => void;
	onDelete: () => void;
}

export function ProjectDetailHeader({
	project,
	hasApprovedQuotes,
	onAddTask,
	onAddQuote,
	onGenerateInvoice,
	onDelete,
}: ProjectDetailHeaderProps) {
	return (
		<StickyDetailHeader>
			{(isSticky) => (
				<div className="flex items-center justify-between gap-4">
					<h1
						className={cn(
							"font-bold text-foreground truncate shrink-0 transition-all duration-300",
							isSticky ? "text-lg" : "text-2xl"
						)}
					>
						{project.title}
					</h1>
					<AnimatePresence initial={false}>
						{!isSticky && (
							<motion.div
								className="flex-1 min-w-0 max-w-3xl"
								initial={{ opacity: 0, height: 0, scaleY: 0 }}
								animate={{ opacity: 1, height: "auto", scaleY: 1 }}
								exit={{ opacity: 0, height: 0, scaleY: 0 }}
								transition={{ duration: 0.25, ease: "easeOut" }}
								style={{ originY: 0 }}
							>
								<StatusProgressBar
									status={project.status}
									steps={[
										{ id: "planned", name: "Planned", order: 1 },
										{ id: "in-progress", name: "In Progress", order: 2 },
										{ id: "completed", name: "Completed", order: 3 },
									]}
									events={[
										{ type: "planned", timestamp: project._creationTime },
										...(project.startDate
											? [{ type: "in-progress", timestamp: project.startDate }]
											: []),
										...(project.endDate && project.status === "completed"
											? [{ type: "completed", timestamp: project.endDate }]
											: []),
									]}
									failureStatuses={["cancelled"]}
									successStatuses={["completed"]}
								/>
							</motion.div>
						)}
					</AnimatePresence>
					<div className="flex items-center gap-2 shrink-0">
						<StyledButton
							intent="outline"
							size="sm"
							onClick={onAddTask}
							icon={<ListTodo className="h-4 w-4" />}
							label="Add Task"
							showArrow={false}
						/>
						<StyledButton
							intent="outline"
							size="sm"
							onClick={onAddQuote}
							icon={<FileText className="h-4 w-4" />}
							label="Add Quote"
							showArrow={false}
						/>
						<StyledButton
							intent="outline"
							size="sm"
							onClick={onGenerateInvoice}
							icon={<Receipt className="h-4 w-4" />}
							label="Generate Invoice"
							showArrow={false}
							disabled={!hasApprovedQuotes}
						/>
						<StyledButton
							intent="destructive"
							size="sm"
							onClick={onDelete}
							icon={<Trash2 className="h-4 w-4" />}
							label="Delete"
							showArrow={false}
						/>
					</div>
				</div>
			)}
		</StickyDetailHeader>
	);
}
