"use client";

import { Doc } from "@onetool/backend/convex/_generated/dataModel";
import { StatusProgressBar } from "@/components/shared/status-progress-bar";
import { StickyDetailHeader } from "@/components/shared/sticky-detail-header";
import { ListTodo, FileText, Receipt, Route, Trash2 } from "lucide-react";
import {
	ActionButtonGroup,
	type RecordAction,
} from "@/components/domain/action-button-group";
import { AnimatePresence, motion } from "motion/react";
import {
	isRoutableProperty,
	useAddToRoute,
} from "@/components/shared/add-to-route";
import { usePermissions } from "@/hooks/use-permissions";
import { cn } from "@/lib/utils";

interface ProjectDetailHeaderProps {
	project: Doc<"projects">;
	hasApprovedQuotes: boolean;
	/** The project's client's properties; undefined while still loading. */
	properties: Doc<"clientProperties">[] | undefined;
	onAddTask: () => void;
	onAddQuote: () => void;
	onGenerateInvoice: () => void;
	onDelete: () => void;
}

export function ProjectDetailHeader({
	project,
	hasApprovedQuotes,
	properties,
	onAddTask,
	onAddQuote,
	onGenerateInvoice,
	onDelete,
}: ProjectDetailHeaderProps) {
	const { can } = usePermissions();
	const {
		addToRoute,
		isAdding,
		disabled: routeDisabled,
		disabledReason: routeDisabledReason,
	} = useAddToRoute();

	// Mirrors the backend's resolution: the project's own property, else the
	// client's primary. Undefined properties means "still loading" — don't
	// blame the project for an address the query hasn't returned yet.
	const propertiesLoading = properties === undefined;
	const routeTarget = project.propertyId
		? properties?.find((p) => p._id === project.propertyId)
		: properties?.find((p) => p.isPrimary);
	const routeBlockedReason = propertiesLoading
		? undefined
		: (routeDisabledReason ??
			(!routeTarget
				? "This project has no property address"
				: !isRoutableProperty(routeTarget)
					? "This project's address isn't mapped yet"
					: undefined));

	const actions: RecordAction[] = [
		{
			key: "add-task",
			label: "Add Task",
			icon: <ListTodo className="h-4 w-4" />,
			slot: "secondary",
			variant: "outline",
			onClick: onAddTask,
			disabled: !can("tasks", "modify"),
			disabledReason: "You don't have permission to add tasks",
		},
		{
			key: "add-quote",
			label: "Add Quote",
			icon: <FileText className="h-4 w-4" />,
			slot: "secondary",
			variant: "outline",
			onClick: onAddQuote,
			disabled: !can("quotes", "modify"),
			disabledReason: "You don't have permission to add quotes",
		},
		{
			key: "generate-invoice",
			label: "Generate Invoice",
			icon: <Receipt className="h-4 w-4" />,
			slot: "secondary",
			variant: "outline",
			onClick: onGenerateInvoice,
			disabled: !hasApprovedQuotes || !can("invoices", "modify"),
			disabledReason: !hasApprovedQuotes
				? "Requires an approved quote"
				: "You don't have permission to generate invoices",
		},
		{
			key: "add-to-route",
			label: "Add to Route",
			icon: <Route className="h-4 w-4" />,
			slot: "secondary",
			variant: "outline",
			onClick: () =>
				void addToRoute({
					propertyId: routeTarget?._id,
					clientId: project.clientId,
					projectId: project._id,
				}),
			loading: isAdding,
			loadingLabel: "Adding…",
			disabled: propertiesLoading || routeDisabled || !!routeBlockedReason,
			disabledReason: routeBlockedReason,
		},
		{
			key: "delete",
			label: "Delete",
			icon: <Trash2 className="h-4 w-4" />,
			slot: "end",
			variant: "destructive",
			onClick: onDelete,
			disabled: !can("projects", "delete"),
			disabledReason: "You don't have permission to delete this project",
		},
	];

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
					<ActionButtonGroup actions={actions} className="shrink-0" />
				</div>
			)}
		</StickyDetailHeader>
	);
}
