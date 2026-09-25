"use client";

import { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import type { ActivityWithUser } from "@/app/(workspace)/home/components/activity-item";
import {
	PillTabs,
	PillTabsList,
	PillTabsTrigger,
	PillTabsContent,
} from "@/components/shared/pill-tabs";
import { OverviewTab } from "./tabs/overview-tab";
import { ActivityTab } from "./tabs/activity-tab";
import { RecurringTaskSetup } from "./tabs/recurring-task-setup";
import { ProjectDetailSidebar } from "./project-detail-sidebar";

interface ProjectDetailTabsProps {
	activeTab: string;
	onTabChange: (tab: string) => void;
	project: Doc<"projects">;
	projectId: Id<"projects">;
	// Data
	tasks: Doc<"tasks">[] | undefined;
	quotes: Doc<"quotes">[] | undefined;
	invoices: Doc<"invoices">[] | undefined;
	activities: ActivityWithUser[] | undefined;
	client: Doc<"clients"> | null | undefined;
	primaryContact: Doc<"clientContacts"> | null | undefined;
	properties: Doc<"clientProperties">[] | undefined;
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
	invoices,
	activities,
	client,
	primaryContact,
	properties,
	onAddTask,
}: ProjectDetailTabsProps) {
	return (
		<PillTabs value={activeTab} onValueChange={onTabChange}>
			<div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_var(--workspace-detail-rail-width)]">
				<div className="min-w-0 pb-20">
					<PillTabsList className="overflow-x-auto">
						<PillTabsTrigger value="overview">Overview</PillTabsTrigger>
						<PillTabsTrigger value="tasks">
							Tasks{tasks && tasks.length > 0 ? ` (${tasks.length})` : ""}
						</PillTabsTrigger>
						<PillTabsTrigger value="activity">Activity</PillTabsTrigger>
					</PillTabsList>

					<PillTabsContent value="overview" className="mt-0 pt-5">
						<OverviewTab
							projectId={projectId}
							projectTitle={project.title}
							projectDescription={project.description}
							projectType={project.projectType}
							recurringSeriesId={project.recurringSeriesId}
							startDate={project.startDate}
							endDate={project.endDate}
							tasks={tasks}
							quotes={quotes}
							invoices={invoices}
						/>
					</PillTabsContent>

					<PillTabsContent value="tasks" className="mt-0 pt-5">
						<RecurringTaskSetup
							key={projectId}
							projectId={projectId}
							recurring={Boolean(project.recurringSeriesId)}
							tasks={tasks}
							onAddTask={onAddTask}
						/>
					</PillTabsContent>

					<PillTabsContent value="activity" className="mt-0 pt-5">
						<ActivityTab activities={activities} />
					</PillTabsContent>
				</div>

				<div className="hidden min-w-0 xl:block xl:pt-6">
					<div className="workspace-panel workspace-detail-rail">
						<ProjectDetailSidebar
							project={project}
							projectId={projectId}
							client={client}
							primaryContact={primaryContact}
							properties={properties}
							quotes={quotes}
							invoices={invoices}
						/>
					</div>
				</div>
			</div>

			<div className="workspace-panel mt-6 overflow-hidden xl:hidden">
				<ProjectDetailSidebar
					project={project}
					projectId={projectId}
					client={client}
					primaryContact={primaryContact}
					properties={properties}
					quotes={quotes}
					invoices={invoices}
				/>
			</div>
		</PillTabs>
	);
}
