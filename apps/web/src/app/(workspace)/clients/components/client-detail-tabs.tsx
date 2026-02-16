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
import { EmailsTab } from "./tabs/emails-tab";
import { TasksTab } from "./tabs/tasks-tab";
import { PropertyTable } from "./property-table";
import { ContactTable } from "./contact-table";
import { Separator } from "@/components/ui/separator";
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
	emails: Doc<"emailMessages">[] | undefined;
	tasks: Doc<"tasks">[] | undefined;
	clientProperties: Doc<"clientProperties">[];
	clientContacts: Doc<"clientContacts">[];
	primaryContact: Doc<"clientContacts"> | null | undefined;
	primaryProperty: Doc<"clientProperties"> | null | undefined;
	// Actions
	onComposeEmail: () => void;
	onAddTask: () => void;
	onThreadClick: (threadId: string) => void;
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
	emails,
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
		<StyledTabs value={activeTab} onValueChange={onTabChange}>
			{/* Two-column layout: tabs + content on left, sidebar on right */}
			<div className="flex gap-0">
				{/* Left: Tabs list + tab content */}
				<div className="flex-1 min-w-0 pr-6 pt-6 pb-20">
					<StyledTabsList className="overflow-x-auto">
						<StyledTabsTrigger value="overview">Overview</StyledTabsTrigger>
						<StyledTabsTrigger value="activity">Activity</StyledTabsTrigger>
						<StyledTabsTrigger value="emails">
							Emails{emails && emails.length > 0 ? ` (${emails.length})` : ""}
						</StyledTabsTrigger>
						<StyledTabsTrigger value="tasks">
							Tasks{tasks && tasks.length > 0 ? ` (${tasks.length})` : ""}
						</StyledTabsTrigger>
						<StyledTabsTrigger value="properties">
							Properties & Contacts
						</StyledTabsTrigger>
					</StyledTabsList>

					<StyledTabsContent value="overview" className="mt-0 pt-5">
						<OverviewTab
							projects={projects}
							quotes={quotes}
							invoices={invoices}
							notes={client.notes || ""}
							clientId={clientId}
							clientName={client.companyName}
						/>
					</StyledTabsContent>

					<StyledTabsContent value="activity" className="mt-0 pt-5">
						<ActivityTab activities={activities} />
					</StyledTabsContent>

					<StyledTabsContent value="emails" className="mt-0 pt-5">
						<EmailsTab
							emails={emails}
							onComposeEmail={onComposeEmail}
							onThreadClick={onThreadClick}
						/>
					</StyledTabsContent>

					<StyledTabsContent value="tasks" className="mt-0 pt-5">
						<TasksTab tasks={tasks} onAddTask={onAddTask} />
					</StyledTabsContent>

					<StyledTabsContent value="properties" className="mt-0 pt-5">
						<div className="flex items-center justify-between mb-1 min-h-8">
							<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
								Properties & Contacts
							</h3>
						</div>
						<Separator className="mb-4" />
						<div className="space-y-6">
							<PropertyTable
								clientId={clientId as Id<"clients">}
								properties={clientProperties}
								hideCardWrapper
								onChange={() => {}}
							/>
							<ContactTable
								clientId={clientId as Id<"clients">}
								contacts={clientContacts}
								hideCardWrapper
								onChange={() => {}}
							/>
						</div>
					</StyledTabsContent>
				</div>

				{/* Right: Persistent sidebar (desktop) — border extends from top */}
				<div className="hidden xl:block w-[480px] shrink-0 border-l border-border/80 min-h-screen bg-muted/20">
					<div className="sticky top-24">
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

			{/* Sidebar for mobile (below content) */}
			<div className="xl:hidden mt-6 border-t-2 border-border/80 pt-6 bg-muted/20 rounded-lg">
				<ClientDetailSidebar
					client={client}
					clientId={clientId}
					primaryContact={primaryContact}
					primaryProperty={primaryProperty}
					invoices={invoices}
				/>
			</div>
		</StyledTabs>
	);
}
