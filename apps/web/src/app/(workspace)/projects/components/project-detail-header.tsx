"use client";

import { Doc } from "@onetool/backend/convex/_generated/dataModel";
import { ProminentStatusBadge } from "@/components/shared/prominent-status-badge";
import { ListTodo, FileText, Receipt, Trash2 } from "lucide-react";
import { StyledButton } from "@/components/ui/styled/styled-button";

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
		<div className="border-b border-border pb-4 mb-0">
			<div className="flex items-center justify-between gap-4">
				<div className="flex items-center gap-3 min-w-0 flex-1">
					<h1 className="text-2xl font-bold text-foreground truncate">
						{project.title}
					</h1>
					<ProminentStatusBadge
						status={project.status}
						size="large"
						showIcon={true}
						entityType="project"
					/>
				</div>

				{/* Right side - Quick action buttons */}
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
		</div>
	);
}
