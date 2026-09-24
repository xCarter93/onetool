"use client";

import { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import type { EmailThreadSummary } from "@onetool/backend/convex/emailMessages";
import type { ActivityWithUser } from "@/app/(workspace)/home/components/activity-item";
import {
	PillTabs,
	PillTabsList,
	PillTabsTrigger,
	PillTabsContent,
} from "@/components/shared/pill-tabs";
import { OverviewTab } from "./tabs/overview-tab";
import { ActivityTab } from "./tabs/activity-tab";
import { EmailsTab } from "./tabs/emails-tab";
import { TasksTab } from "./tabs/tasks-tab";
import { PropertyTable } from "./property-table";
import { ContactTable } from "./contact-table";
import { ClientDetailSidebar } from "./client-detail-sidebar";

interface ClientDetailTabsProps {
	activeTab: string;
	onTabChange: (tab: string) => void;
	client: Doc<"clients">;
	clientId: string;
	// Data
	projects: Doc<"projects">[] | undefined;
	quotes: Doc<"quotes">[] | undefined;
	invoices: Doc<"invoices">[] | undefined;
	activities: ActivityWithUser[] | undefined;
	threads: EmailThreadSummary[] | undefined;
	tasks: Doc<"tasks">[] | undefined;
	clientProperties: Doc<"clientProperties">[];
	clientContacts: Doc<"clientContacts">[];
	primaryContact: Doc<"clientContacts"> | null | undefined;
	primaryProperty: Doc<"clientProperties"> | null | undefined;
	// Actions
	onComposeEmail: () => void;
	onAddTask: () => void;
	onThreadClick: (threadDocId: Id<"emailThreads">) => void;
}

export function ClientDetailTabs({
	activeTab,
	onTabChange,
	client,
	clientId,
	projects,
	quotes,
	invoices,
	activities,
	threads,
	tasks,
	clientProperties,
	clientContacts,
	primaryContact,
	primaryProperty,
	onComposeEmail,
	onAddTask,
	onThreadClick,
}: ClientDetailTabsProps) {
	return (
		<PillTabs value={activeTab} onValueChange={onTabChange}>
			<div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_var(--workspace-detail-rail-width)]">
				<div className="min-w-0 pb-20">
					<PillTabsList className="overflow-x-auto">
						<PillTabsTrigger value="overview">Overview</PillTabsTrigger>
						<PillTabsTrigger value="activity">Activity</PillTabsTrigger>
						<PillTabsTrigger value="emails">
							Email Threads
							{threads && threads.length > 0 ? ` (${threads.length})` : ""}
						</PillTabsTrigger>
						<PillTabsTrigger value="tasks">
							Tasks{tasks && tasks.length > 0 ? ` (${tasks.length})` : ""}
						</PillTabsTrigger>
						<PillTabsTrigger value="properties">
							Properties & Contacts
						</PillTabsTrigger>
					</PillTabsList>

					<PillTabsContent value="overview" className="mt-0 pt-5">
						<OverviewTab
							projects={projects}
							quotes={quotes}
							invoices={invoices}
							notes={client.notes || ""}
							clientId={clientId}
							clientName={client.companyName}
						/>
					</PillTabsContent>

					<PillTabsContent value="activity" className="mt-0 pt-5">
						<ActivityTab activities={activities} />
					</PillTabsContent>

					<PillTabsContent value="emails" className="mt-0 pt-5">
						<EmailsTab
							threads={threads}
							onComposeEmail={onComposeEmail}
							onThreadClick={onThreadClick}
						/>
					</PillTabsContent>

					<PillTabsContent value="tasks" className="mt-0 pt-5">
						<TasksTab tasks={tasks} onAddTask={onAddTask} />
					</PillTabsContent>

					<PillTabsContent value="properties" className="mt-0 pt-5">
						<div className="flex items-center justify-between mb-4 min-h-8">
							<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
								Properties & Contacts
							</h3>
						</div>
						<div className="space-y-6">
							<PropertyTable
								clientId={clientId as Id<"clients">}
								properties={clientProperties}
								onChange={() => {}}
							/>
							<ContactTable
								clientId={clientId as Id<"clients">}
								contacts={clientContacts}
								onChange={() => {}}
							/>
						</div>
					</PillTabsContent>
				</div>

				<div className="hidden min-w-0 xl:block xl:pt-6">
					<div className="workspace-panel workspace-detail-rail">
						<ClientDetailSidebar
							client={client}
							clientId={clientId}
							primaryContact={primaryContact}
							primaryProperty={primaryProperty}
							invoices={invoices}
						/>
					</div>
				</div>
			</div>

			<div className="workspace-panel mt-6 overflow-hidden xl:hidden">
				<ClientDetailSidebar
					client={client}
					clientId={clientId}
					primaryContact={primaryContact}
					primaryProperty={primaryProperty}
					invoices={invoices}
				/>
			</div>
		</PillTabs>
	);
}
