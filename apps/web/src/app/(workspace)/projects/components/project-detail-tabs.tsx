"use client";

import { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import type { ActivityWithUser } from "@/app/(workspace)/home/components/activity-item";
import {
	StyledTabs,
	StyledTabsList,
	StyledTabsTrigger,
	StyledTabsContent,
} from "@/components/ui/styled";
import { OverviewTab } from "./tabs/overview-tab";
import { ActivityTab } from "./tabs/activity-tab";
import { TasksTab } from "./tabs/tasks-tab";
import { ProjectDetailSidebar } from "./project-detail-sidebar";

interface ProjectDetailTabsProps {
	activeTab: string;
	onTabChange: (tab: string) => void;
	project: Doc<"projects">;
	projectId: Id<"projects">;
	// Data
	tasks: Doc<"tasks">[] | undefined;
	quotes: Doc<"quotes">[] | undefined;
	activities: ActivityWithUser[] | undefined;
	client: Doc<"clients"> | null | undefined;
	primaryContact: Doc<"clientContacts"> | null | undefined;
	primaryProperty: Doc<"clientProperties"> | null | undefined;
	// Actions
	onAddTask: () => void;
}

export function ProjectDetailTabs({
	activeTab,
	onTabChange,
	project,
	projectId,
	tasks,
	quotes,
	activities,
	client,
	primaryContact,
	primaryProperty,
	onAddTask,
}: ProjectDetailTabsProps) {
	return (
		<StyledTabs value={activeTab} onValueChange={onTabChange}>
			{/* Two-column layout: tabs + content on left, sidebar on right */}
			<div className="flex gap-0">
				{/* Left: Tabs list + tab content */}
				<div className="flex-1 min-w-0 pr-6 pt-6 pb-20">
					<StyledTabsList className="overflow-x-auto">
						<StyledTabsTrigger value="overview">Overview</StyledTabsTrigger>
						<StyledTabsTrigger value="tasks">
							Tasks{tasks && tasks.length > 0 ? ` (${tasks.length})` : ""}
						</StyledTabsTrigger>
						<StyledTabsTrigger value="activity">Activity</StyledTabsTrigger>
					</StyledTabsList>

					<StyledTabsContent value="overview" className="mt-0 pt-5">
						<OverviewTab
							projectId={projectId}
							projectTitle={project.title}
							projectType={project.projectType}
							startDate={project.startDate}
							endDate={project.endDate}
							tasks={tasks}
							quotes={quotes}
						/>
					</StyledTabsContent>

					<StyledTabsContent value="tasks" className="mt-0 pt-5">
						<TasksTab tasks={tasks} onAddTask={onAddTask} />
					</StyledTabsContent>

					<StyledTabsContent value="activity" className="mt-0 pt-5">
						<ActivityTab activities={activities} />
					</StyledTabsContent>
				</div>

				{/* Right: Persistent sidebar (desktop) */}
				<div className="hidden xl:block w-[480px] shrink-0 border-l border-border/80 min-h-screen bg-muted/20">
					<div className="sticky top-24">
						<ProjectDetailSidebar
							project={project}
							projectId={projectId}
							client={client}
							primaryContact={primaryContact}
							primaryProperty={primaryProperty}
							quotes={quotes}
						/>
					</div>
				</div>
			</div>

			{/* Sidebar for mobile (below content) */}
			<div className="xl:hidden mt-6 border-t-2 border-border/80 pt-6 bg-muted/20 rounded-lg">
				<ProjectDetailSidebar
					project={project}
					projectId={projectId}
					client={client}
					primaryContact={primaryContact}
					primaryProperty={primaryProperty}
					quotes={quotes}
				/>
			</div>
		</StyledTabs>
	);
}
