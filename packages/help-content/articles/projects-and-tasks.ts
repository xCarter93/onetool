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
							"Set the **Project type**: **One-off** for work that runs once, **Recurring** for work that repeats on a schedule.",
							"Pick a **Start date**, and an **End date** if you know it. The end date cannot be before the start date.",
							"Use **Assign to** to pick the teammates doing the work, then click **Create project**.",
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
				heading: "Deleting a project",
				blocks: [
					{
						type: "paragraph",
						text: "Delete a project from the row actions on the Projects page or with **Delete** in the project header. A confirmation modal asks you to be sure, because deleting a project is permanent. Unlike clients, which are archived and can be restored, there is no way to bring a deleted project back.",
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
				answer: "Recurring projects repeat on a schedule, so they suit ongoing contracts like weekly mowing or monthly cleaning. One-off projects run once, like a repair or a spring cleanup. You can filter the Projects page by type to see each group on its own.",
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
