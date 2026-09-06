import type { HelpArticle } from "../types";

export const projectsAndTasksArticles: HelpArticle[] = [
	{
		slug: "creating-and-managing-projects",
		title: "Creating and managing projects",
		subtitle: "Set up a job for a client and track it from planned to completed.",
		kind: "howto",
		availability: "all",
		permission: "Admins, and members with access to projects.",
		keywords: ["job", "work order", "kanban", "one-off", "recurring", "generate invoice", "delete"],
		sections: [
			{
				heading: "What a project is",
				blocks: [
					{
						type: "paragraph",
						text: "A project is one unit of work for one client: a gutter cleaning, a remodel, a weekly mowing contract. The project collects the tasks, quotes, and invoices for that job, so anyone on your team can open it and see where things stand.",
					},
				],
			},
			{
				heading: "Create a project",
				blocks: [
					{
						type: "steps",
						items: [
							"Go to **Projects** in the sidebar and click **Create Project**.",
							"Pick the **Client** the job is for. If the client has more than one property, choose the **Property** too; with a single property it is selected for you.",
							"Enter a **Project title**, and a **Description** if the crew needs context.",
							"Set the **Project type**: **One-off** for work that runs once, or **Recurring** to show the recurring schedule options.",
							"Pick a **Start date**, and an **End date** if you know it. Recurring projects require a start date. These dates describe the first visit; use **Ends** in the recurring schedule to stop the whole series. The end date cannot be before the start date.",
							"For recurring work, choose the schedule and its end condition, then review the upcoming visits. Use **Assign to** to pick the teammates doing the work, then click **Create project** to save the project and schedule together.",
						],
					},
					{
						type: "media",
						media: "image",
						caption: "The Create Project dialog",
						asset: "projects-and-tasks/creating-and-managing-projects/create-project-dialog",
					},
					{
						type: "note",
						text: "Assigning matters beyond scheduling. Members see the projects assigned to them by default, so this field controls whose list the job lands on. See [Assigning work to your team](/help/projects-and-tasks/assigning-work-to-your-team).",
					},
				],
			},
			{
				heading: "Table and Kanban views",
				blocks: [
					{
						type: "paragraph",
						text: "The Projects page shows your work as a **Table** or a **Kanban** board; a toggle above the list switches between them. Every project has one of four statuses: **Planned**, **In Progress**, **Completed**, or **Cancelled**.",
					},
					{
						type: "paragraph",
						text: "The board has a column for each status. Drag a project card between columns to update its status as the job moves along. The table is better for scanning and filtering a long list.",
					},
					{
						type: "paragraph",
						text: "To narrow the list, filter by **Status**, **Type**, **Client**, or **Start date**, or use the search box. Search matches the project title, type, status, and client name.",
					},
				],
			},
			{
				heading: "The project page",
				blocks: [
					{
						type: "paragraph",
						text: "Open a project to see its whole story. The header gives you quick actions: **Add Task**, **Add Quote**, **Generate Invoice**, and **Delete**. Below it, three tabs organize the detail: **Overview**, **Tasks** (with a count badge), and **Activity**. A sidebar stays in view with the client, the primary contact, properties, and the project's quotes and invoices.",
					},
					{
						type: "paragraph",
						text: "**Generate Invoice** builds an invoice from the project's approved quotes, so it stays unavailable until at least one quote on the project is **Approved**. Send a quote, get the approval, and the button comes to life.",
					},
					{
						type: "paragraph",
						text: "The Overview tab's schedule calendar shows the month at a glance: the project's start-to-end range, each task on its scheduled day, and small markers on the days quotes were sent or approved and invoices were sent or paid. Click a task on the calendar to open and edit it.",
					},
					{
						type: "media",
						media: "image",
						caption: "A project page with the Overview tab open",
						asset: "projects-and-tasks/creating-and-managing-projects/project-page-with-the-overview-tab",
					},
				],
			},
			{
				heading: "Set up recurring visits",
				blocks: [
					{ type: "steps", items: [
						"For an existing project with a start date, choose **Set up recurrence** in the right sidebar beside its type and dates. Its client and property define the series, and this project counts as the first occurrence.",
						"Choose a schedule preset or **Custom**. You can select weekdays, monthly dates or an ordinal weekday, and seasonal months.",
						"Under **Ends**, choose **Never**, **On a date**, or **After a number of visits**. Review the preview, then save.",
					] },
					{ type: "paragraph", text: "OneTool creates separate planned projects for the next 90 days and includes the next visit for less frequent schedules. Each new visit repeats the project details and duration. Tasks, quotes and invoices remain separate records for each visit. Setting up recurrence does not copy them automatically; save selected tasks from the project’s Tasks tab or use Copy to future projects on a quote to save draft quote setup." },
					{ type: "paragraph", text: "The right sidebar shows the recurring schedule and series state. Use **View series** there to see the next visit and occurrence history; the series page links back to the project you came from. The Projects list also offers a **Series** filter. Viewing a whole series requires organization-wide project access; changing it also requires permission to modify projects." },
					{ type: "tip", text: "A monthly date such as the 31st uses the month's last day when needed. A fifth weekday that does not exist is skipped. The original schedule stays anchored, including across daylight-saving changes." },
				],
			},
			{
				heading: "Change or pause recurring work",
				blocks: [
					{ type: "paragraph", text: "With organization-wide project access and permission to modify projects, the first time you save a reusable detail on a recurring project, choose **This project** or **This and future projects**. The visible **Edit scope** control remembers your choice until you leave that project. It applies to details such as the title, description, property and assigned users. Dates and status changes always affect only the current visit." },
					{ type: "paragraph", text: "Future edits preserve individually changed fields on other visits. **Edit** in the series Schedule section lets you preview a new cadence. Started, invoiced and individually changed visits are preserved; changing a schedule does not erase their history." },
					{ type: "paragraph", text: "Use **Skip visit** for an unstarted, uninvoiced visit you do not need. It leaves the later schedule intact and can be restored while the series is active. Skipped visits and their tasks are hidden from active schedule views." },
					{ type: "paragraph", text: "For a visit cancelled by the series, the Status area offers **Resume series** instead of the normal status editor. Once the series is active, choose **Restore visit** to return an eligible cancelled visit to Planned, including a past visit. Visits you skipped or cancelled individually are not automatically restored when the series resumes. If the original count or Until date has been reached, resume does not extend it; restore an existing visit or deliberately edit the schedule." },
					{ type: "paragraph", text: "**Pause series** suspends upcoming unstarted visits. **End series** stops generation and cancels eligible upcoming visits. You can use **Resume series** from either state: review the preview to return eligible visits dated today or later to Planned. The original cadence, occurrence limit and Until date stay in place; resuming does not add replacement visits for missed dates. Started, completed and invoiced work stays intact." },
				],
			},
			{
				heading: "Deleting a project",
				blocks: [
					{
						type: "paragraph",
						text: "Delete a project from the row actions on the Projects page or with **Delete** in the project header. A confirmation modal asks you to be sure, because deleting a project is permanent. Unlike clients, which are archived and can be restored, there is no way to bring a deleted project back.",
					},
					{
						type: "paragraph",
						text: "A project linked to a recurring series cannot be deleted if it has a quote or invoice. Set it to **Cancelled** to preserve that history. Deleting an eligible visit does not delete its series or cause that visit to be created again.",
					},
					{
						type: "tip",
						text: "If you just want a finished or abandoned job out of your active list, set its status to **Completed** or **Cancelled** instead of deleting it. You keep the history.",
					},
				],
			},
		],
		faq: [
			{
				question: "When should I use a recurring project?",
				answer: "Use recurring visits for ongoing work like weekly mowing or monthly cleaning. Choose Recurring in the New project dialog to configure a schedule during creation, or use Set up recurrence in an existing dated project's sidebar. Changing the type on an existing project alone still only labels the work. One-off projects suit a repair or a spring cleanup.",
			},
			{
				question: "Why is Generate Invoice not clickable?",
				answer: "The project has no approved quote yet. Generate Invoice creates the invoice from the project's approved quotes, so create a quote, send it, and record the client's approval first.",
			},
			{
				question: "Can I get a deleted project back?",
				answer: "No. Deleting a project is permanent, with no restore. If you might need the job's history later, mark it Completed or Cancelled rather than deleting it.",
			},
		],
		related: [
			"projects-and-tasks/working-with-tasks",
			"projects-and-tasks/assigning-work-to-your-team",
			"getting-started/create-your-first-project",
		],
	},
	{
		slug: "working-with-tasks",
		title: "Working with tasks",
		subtitle: "Put the day to day work on a schedule with dates, assignees, and repeats.",
		kind: "howto",
		availability: "all",
		permission: "Admins, and members with access to tasks.",
		keywords: ["to-do", "schedule", "due date", "repeat", "recurring", "overdue", "assignee"],
		sections: [
			{
				heading: "External and internal tasks",
				blocks: [
					{
						type: "paragraph",
						text: "A task is a scheduled piece of work with a date, an assignee, and a status. Every task is one of two types:",
					},
					{
						type: "list",
						items: [
							"**External (Client Task)**: work for a client. It requires a client, and you can link it to a project and, when the client has more than one property, to a specific property.",
							"**Internal (Team Task)**: work for your own team, like a supply run or truck maintenance. No client involved.",
						],
					},
					{
						type: "paragraph",
						text: "Whatever the type, a task moves through four statuses: **Pending**, **In Progress**, **Completed**, or **Cancelled**.",
					},
					{
						type: "note",
						text: "Switching a task's type from External to Internal clears the selected project and property, since both belong to the client side. Changing the client clears them too.",
					},
				],
			},
			{
				heading: "Create a task",
				blocks: [
					{
						type: "paragraph",
						text: "Tasks are created and edited in a slide-over panel that works the same everywhere. Open it with **New Task** on the Tasks page, or **Add Task** on a client or project.",
					},
					{
						type: "steps",
						items: [
							"Choose the **Task Type**. For an external task, pick the **Client**, plus a **Project** and **Property** if they apply.",
							"Enter a **Task Title**, and a **Description** if it helps.",
							"Pick the **Date**. Add a **Start Time** and **End Time** if the visit has a set window.",
							"Set the **Status**, and use **Assign To** to pick who does the work.",
							"Click **Create Task**.",
						],
					},
					{
						type: "media",
						media: "image",
						caption: "The task panel with an external task filled in",
						asset: "projects-and-tasks/working-with-tasks/task-panel-with-an-external-task",
					},
				],
			},
			{
				heading: "Repeat a task on a schedule",
				blocks: [
					{
						type: "paragraph",
						text: "For work that happens on a rhythm, change **Repeat** from **No repeat** to **Daily**, **Weekly**, **Monthly**, or **Yearly**. Once you choose a repeat, a **Repeat Until** date is required, so every series has a clear end.",
					},
				],
			},
			{
				heading: "Copy tasks to recurring projects",
				blocks: [
					{ type: "steps", items: [
						"Open the **Tasks** tab on a project that belongs to an active recurring series. Create and save the task you want to repeat.",
						"Choose **Copy** on that task’s row to open **Copy to future projects?**. Review how many tasks will be created, updated or preserved, then choose **Copy task**.",
						"The task appears in **Future task setup**. OneTool uses that saved version when it creates later visits. Editing the source task alone does not change the saved setup; copy it forward again to publish those changes.",
					] },
					{ type: "paragraph", text: "Copies receive fresh Pending status, the saved title, description, times and assignment, and a date shifted relative to each project’s start date. They do not create a second standalone task recurrence. Only eligible later planned visits are populated; started or invoiced work is preserved." },
					{ type: "paragraph", text: "Copying again updates untouched pending copies without duplicating them. Manually created tasks and copies that were edited, started, completed or deleted are preserved. A deleted copy stays deleted." },
					{ type: "paragraph", text: "Use **Remove** in **Future task setup**, review the preview, then choose **Remove task setup** to stop future generation and remove eligible untouched pending copies. This leaves the original task and protected copies in place. Deleting the original task alone does not remove its saved setup; you can still remove the setup from another project in the series." },
					{ type: "paragraph", text: "Task copy-forward requires organization-wide access to projects and tasks, plus permission to modify both. Removing saved setup also requires permission to delete tasks. These built-in recurring-project controls are available on Free and Business." },
				],
			},
			{
				heading: "Your list, grouped by urgency",
				blocks: [
					{
						type: "paragraph",
						text: "The **Tasks** page sorts everything into sections so the most pressing work sits on top: **Overdue**, **Today**, **This Week**, **Upcoming**, **Completed**, and **Cancelled**. Each section is its own small table, and empty sections stay out of the way.",
					},
					{
						type: "paragraph",
						text: "Narrow the list with filters for **Status**, **Client**, **Project**, **Assignee**, and **Date**, or use the search box.",
					},
					{
						type: "media",
						media: "image",
						caption: "The Tasks page grouped into Overdue, Today, and This Week",
						asset: "projects-and-tasks/working-with-tasks/tasks-page-grouped-into-overdue-today",
					},
				],
			},
			{
				heading: "Complete work in one click",
				blocks: [
					{
						type: "paragraph",
						text: "Click the circular status icon at the start of a task's row to mark it completed. Click it again to reopen it as pending. There is no need to open the task itself. For bigger changes, the pencil icon opens the task for editing and the trash icon deletes it after a confirmation.",
					},
					{
						type: "note",
						text: "Cancelled tasks cannot be toggled from the row. To bring one back, open it with the pencil icon and change its **Status**.",
					},
				],
			},
		],
		faq: [
			{
				question: "Where else do tasks show up?",
				answer: "Besides the Tasks page, every task appears on the Tasks tab of its project, and external tasks also appear on the client's Tasks tab. It is the same task in every view.",
			},
			{
				question: "Can I reopen a completed task?",
				answer: "Yes. Click the status icon on its row to toggle it back to pending, or open the task with the pencil icon and change its status.",
			},
			{
				question: "Can a task belong to a project without a client?",
				answer: "No. Only external tasks link to a project, and an external task always has a client. Internal tasks stand alone with no client or project.",
			},
		],
		related: [
			"projects-and-tasks/creating-and-managing-projects",
			"projects-and-tasks/assigning-work-to-your-team",
		],
	},
	{
		slug: "assigning-work-to-your-team",
		title: "Assigning work to your team",
		subtitle: "Understand how assignment controls what each teammate sees and works on.",
		kind: "concept",
		availability: "all",
		heroMedia: {
			media: "image",
			caption: "A member's view of the Projects page",
			asset: "projects-and-tasks/assigning-work-to-your-team/hero",
		},
		keywords: ["assignee", "crew", "team member", "visibility", "permissions", "field tech"],
		sections: [
			{
				heading: "Assignment decides what members see",
				blocks: [
					{
						type: "paragraph",
						text: "When you assign a project or task to a teammate, you are doing two things at once: scheduling the work and putting it in front of the right person. By default, members see the projects and tasks assigned to them, not the whole company's list.",
					},
					{
						type: "paragraph",
						text: "That default keeps a field tech's view focused. They sign in, land on **Projects**, and see their own jobs and their own task list. Admins work with the full list across the organization.",
					},
				],
			},
			{
				heading: "Where assignment happens",
				blocks: [
					{
						type: "paragraph",
						text: "Projects take a whole crew. The **Assign to** field in the Create Project dialog accepts multiple teammates, so everyone on the job shares it.",
					},
					{
						type: "paragraph",
						text: "Tasks take one person. Set the assignee with **Assign To** when you create the task, or change it later by opening the task with the pencil icon on its row. One name per task keeps it clear who owns each visit.",
					},
				],
			},
			{
				heading: "How assignment pairs with permissions",
				blocks: [
					{
						type: "paragraph",
						text: "Assignment and permissions work together. Assignment puts a specific job in front of a specific person. Permissions set the boundaries of what a member can reach at all. By default, members can view and update their assigned projects and tasks, and nothing else.",
					},
					{
						type: "paragraph",
						text: "Admins can widen either side. A member can be granted access to all projects and tasks, not just assigned ones, or given access to other areas like the client list. The details live in [Member permissions](/help/settings-and-team/member-permissions).",
					},
					{
						type: "note",
						text: "Some actions cross areas. Creating a project starts with picking a client, so the **Client** field in the Create Project dialog is disabled for members without access to clients.",
					},
				],
			},
			{
				heading: "When a teammate cannot see a job",
				blocks: [
					{
						type: "paragraph",
						text: "If someone says a job is missing from their view, check two things in order. First, is the project or task actually assigned to them. Second, do they have access to projects and tasks at all. Assignment puts work in view; permissions decide what is reachable.",
					},
				],
			},
		],
		related: [
			"settings-and-team/member-permissions",
			"settings-and-team/inviting-your-team",
			"projects-and-tasks/working-with-tasks",
		],
	},
];
