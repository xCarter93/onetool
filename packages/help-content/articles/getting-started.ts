import type { HelpArticle } from "../types";

export const gettingStartedArticles: HelpArticle[] = [
	{
		slug: "welcome-to-onetool",
		title: "Welcome to OneTool",
		subtitle: "Learn what OneTool is and how it helps you run your service business.",
		kind: "concept",
		availability: "all",
		heroMedia: {
			media: "image",
			caption: "The OneTool workspace",
			asset: "getting-started/welcome-to-onetool/hero",
		},
		keywords: ["introduction", "overview", "what is onetool", "field service"],
		sections: [
			{
				heading: "What is OneTool?",
				blocks: [
					{
						type: "paragraph",
						text: "OneTool is a business management platform for small field service businesses. Cleaning companies, landscapers, HVAC techs, and other trades use it to run the office side of the business from one place: clients, projects, quotes, invoices, payments, email, and scheduling.",
					},
					{
						type: "paragraph",
						text: "Instead of juggling spreadsheets, a separate invoicing tool, and a shared email account, your whole team works from the same workspace. When a client approves a quote, everyone sees it. When an invoice gets paid, your numbers update on the spot.",
					},
				],
			},
			{
				heading: "How work flows through OneTool",
				blocks: [
					{
						type: "paragraph",
						text: "Most businesses follow the same loop, and OneTool is built around it:",
					},
					{
						type: "list",
						items: [
							"**Clients** hold every customer, their contacts, and their service addresses.",
							"**Projects** track the jobs you do for a client, one time or recurring.",
							"**Tasks** put the day to day work on a schedule and assign it to your team.",
							"**Quotes** send priced proposals your client can approve and sign online.",
							"**Invoices** bill for the work, and clients can pay by card through their portal.",
						],
					},
					{
						type: "paragraph",
						text: "Around that loop you get a shared email [inbox](/help/inbox), workflow [automations](/help/automations), an [AI assistant](/help/ai-assistant), driving [routes](/help/routing), and custom [reports](/help/reports).",
					},
				],
			},
			{
				heading: "Where to start",
				blocks: [
					{
						type: "paragraph",
						text: "The articles in this section walk you through your first week in order: set up your organization, add a client, create a project, send a quote, and collect your first payment. Each one takes a few minutes.",
					},
					{
						type: "tip",
						text: "You can try everything on the Free plan. Features that need the Business plan are marked in each article.",
					},
				],
			},
		],
		related: [
			"getting-started/set-up-your-organization",
			"getting-started/navigating-the-workspace",
		],
	},
	{
		slug: "set-up-your-organization",
		title: "Set up your organization",
		subtitle: "Create your organization and fill in your business details in five short steps.",
		kind: "howto",
		availability: "all",
		permission: "The person who signs up becomes the organization owner.",
		keywords: ["onboarding", "signup", "create account", "organization", "logo", "wizard"],
		sections: [
			{
				heading: "Before you begin",
				blocks: [
					{
						type: "paragraph",
						text: "Sign up for OneTool on the web. After you create your account, a short setup wizard collects everything OneTool needs to represent your business on quotes, invoices, and the client portal.",
					},
					{
						type: "note",
						text: "If a teammate invited you to an existing organization, the wizard skips organization creation and takes you straight to your details.",
					},
				],
			},
			{
				heading: "Step 1: Create your organization",
				blocks: [
					{
						type: "paragraph",
						text: "The **Organization** step asks for your first name, last name, and organization name, plus an optional logo.",
					},
					{
						type: "steps",
						items: [
							"Enter your **First Name** and **Last Name**.",
							"Enter your **Organization Name**. This is the business name your clients will see.",
							"Upload a logo if you have one. You can add or change it later in your organization settings.",
							"Click **Create Organization**.",
						],
					},
					{
						type: "media",
						media: "image",
						caption: "The Organization step of the setup wizard",
						asset: "getting-started/set-up-your-organization/organization-step-of-the-setup-wizard",
					},
				],
			},
			{
				heading: "Step 2: Add your business info",
				blocks: [
					{
						type: "paragraph",
						text: "The **Business info** step collects the contact details that appear on your client-facing documents.",
					},
					{
						type: "steps",
						items: [
							"Enter your **Business Email** and **Phone Number**.",
							"Add your **Company Website** if you have one.",
							"Type your business address and pick it from the suggestions.",
							"If your logo is dark, turn on **Invert logo colors in dark mode** and check the preview tiles.",
						],
					},
				],
			},
			{
				heading: "Steps 3 and 4: Company size and plan",
				blocks: [
					{
						type: "paragraph",
						text: "Pick the size of your team, then choose a plan. The **Plan** step shows the Free and Business plans with a monthly or annual toggle. You can start on Free and upgrade later from Billing.",
					},
				],
			},
			{
				heading: "Step 5: Import your clients (optional)",
				blocks: [
					{
						type: "paragraph",
						text: "If you already keep a client list in a spreadsheet, the **Import data** step can bring it in from a CSV file. Import is a Business plan feature, so on the Free plan you can skip this step and add clients by hand.",
					},
					{
						type: "steps",
						items: [
							"Upload your CSV file, or click **Skip** to finish without importing.",
							"Click **Complete Setup**. OneTool saves everything and opens your dashboard.",
						],
					},
					{
						type: "media",
						media: "video",
						caption: "Setting up an organization from start to finish",
						asset: "getting-started/set-up-your-organization/setting-up-an-organization-from-start",
					},
				],
			},
		],
		faq: [
			{
				question: "Can I change these details later?",
				answer: "Yes. Everything from this wizard lives in your organization settings under Overview and Business Info, and admins can edit most of it at any time. Business details are editable by the organization owner.",
			},
			{
				question: "Why does the wizard ask for my name again?",
				answer: "Some sign in methods, like Sign in with Apple, only share your name the very first time you use them. OneTool asks here so your name is always filled in correctly on your account.",
			},
		],
		related: [
			"getting-started/add-your-first-client",
			"settings-and-team/plans-and-billing",
			"clients/importing-clients",
		],
	},
	{
		slug: "navigating-the-workspace",
		title: "Navigating the workspace",
		subtitle: "Get to know the sidebar, your landing page, and where everything lives.",
		kind: "concept",
		availability: "all",
		heroMedia: {
			media: "image",
			caption: "The workspace with the sidebar open",
			asset: "getting-started/navigating-the-workspace/hero",
		},
		keywords: ["sidebar", "navigation", "home", "dashboard", "admin", "member", "layout"],
		sections: [
			{
				heading: "The sidebar",
				blocks: [
					{
						type: "paragraph",
						text: "The left sidebar is how you move around OneTool. Each entry is one area of your business: Home, Clients, Projects, Tasks, Quotes, Invoices, Inbox, Automations, Routing, Reports, and your organization settings.",
					},
					{
						type: "paragraph",
						text: "What you see depends on your role and permissions. Members only see the areas an admin has given them access to, so a field tech might see just Projects and Tasks.",
					},
				],
			},
			{
				heading: "Home is for admins",
				blocks: [
					{
						type: "paragraph",
						text: "Admins land on **Home** after signing in: a dashboard with your key numbers, this week's schedule, a map of client locations, and a Needs Attention list of overdue tasks and unpaid invoices. Members land on **Projects** instead, since Home is an admin view.",
					},
				],
			},
			{
				heading: "The assistant is always nearby",
				blocks: [
					{
						type: "paragraph",
						text: "On the Business plan, the AI assistant sits in a floating dock at the bottom center of every page. Open it to ask questions about your data or to get something done without leaving the page you are on. Read more in [Meet the assistant](/help/ai-assistant).",
					},
				],
			},
			{
				heading: "Light and dark themes",
				blocks: [
					{
						type: "paragraph",
						text: "OneTool follows your system theme and you can switch it manually. Your client-facing pages, like quotes and the portal, always stay clean and readable regardless of your theme.",
					},
				],
			},
		],
		related: [
			"getting-started/search-your-workspace",
			"getting-started/add-your-first-client",
			"settings-and-team/member-permissions",
		],
	},
	{
		slug: "search-your-workspace",
		title: "Search your workspace",
		subtitle: "Jump to any record, page, or create action from one search box.",
		kind: "howto",
		availability: "all",
		heroMedia: {
			media: "image",
			caption: "The search palette open over the workspace",
			asset: "getting-started/search-your-workspace/hero",
		},
		keywords: [
			"search",
			"command palette",
			"cmd k",
			"ctrl k",
			"find",
			"quick open",
			"shortcut",
		],
		sections: [
			{
				heading: "Opening search",
				blocks: [
					{
						type: "paragraph",
						text: "Press **⌘K** on a Mac or **Ctrl+K** on Windows from anywhere in the workspace, or click the **Search** box at the top of the sidebar. Press Escape to close it.",
					},
				],
			},
			{
				heading: "What it finds",
				blocks: [
					{
						type: "paragraph",
						text: "Type at least two characters and results appear grouped by type, closest matches first. Matching starts from the beginning of each word: typing \"hen\" finds \"Henderson\", and a bare number like \"1042\" finds quote Q-1042.",
					},
					{
						type: "list",
						items: [
							"**Clients**, matched by company name, notes, or tags, and also by a contact's name or a property's address, so searching \"Henderson\" or \"Maple St\" finds the right client.",
							"**Projects**, by title, description, or project number.",
							"**Quotes**, by title, quote number, or their message text.",
							"**Invoices**, by invoice number.",
							"**Tasks**, by title or description. Selecting a task opens it right there for editing.",
						],
					},
					{
						type: "paragraph",
						text: "Selecting any other result takes you to that record's page.",
					},
				],
			},
			{
				heading: "Navigate and create",
				blocks: [
					{
						type: "paragraph",
						text: "Before you type, the palette lists the workspace pages you can open and quick **Create** actions for a new client, project, quote, or task, matching the sidebar's Quick Actions menu.",
					},
					{
						type: "note",
						text: "Search respects your permissions. Members only see pages, actions, and records their role gives them access to.",
					},
				],
			},
		],
		related: [
			"getting-started/navigating-the-workspace",
			"ai-assistant/meet-the-assistant",
		],
	},
	{
		slug: "add-your-first-client",
		title: "Add your first client",
		subtitle: "Create a client record with a contact and a service address.",
		kind: "howto",
		availability: "all",
		permission: "Admins, and members with access to clients.",
		keywords: ["client", "customer", "contact", "address", "property", "create client"],
		sections: [
			{
				heading: "What a client holds",
				blocks: [
					{
						type: "paragraph",
						text: "A client is a company or household you work for. Each client record holds one or more contacts (the people you talk to) and one or more properties (the addresses where you do the work), plus every project, quote, invoice, and email tied to them.",
					},
				],
			},
			{
				heading: "Create the client",
				blocks: [
					{
						type: "steps",
						items: [
							"Go to **Clients** in the sidebar.",
							"Click **Add Client**.",
							"Enter the company name and pick a status. New prospects usually start as **Lead**; paying customers are **Active**.",
							"Fill in the primary contact: first name, last name, email, and phone.",
							"Add the primary address if you know it. Start typing and pick the address from the suggestions.",
							"Set a preferred contact method, add any tags or notes, then click **Create client**.",
						],
					},
					{
						type: "media",
						media: "image",
						caption: "The new client form",
						asset: "getting-started/add-your-first-client/new-client-form",
					},
					{
						type: "note",
						text: "The client's email matters more than it looks. It is how they sign in to their portal to approve quotes and pay invoices later.",
					},
				],
			},
			{
				heading: "Table or board",
				blocks: [
					{
						type: "paragraph",
						text: "The Clients page shows your list as a table or a board. The board groups clients by status, and dragging a card between columns updates the status. The table is better for searching and filtering a long list.",
					},
				],
			},
			{
				heading: "Archiving instead of deleting",
				blocks: [
					{
						type: "paragraph",
						text: "When you stop working with a client, archive them from the row actions. Archived clients disappear from the default view but keep their full history, and you can restore them at any time. The default filter hides archived clients; remove it to see them again.",
					},
				],
			},
		],
		faq: [
			{
				question: "How many clients can I have?",
				answer: "The Free plan includes up to 10 clients. The Business plan has no limit, and also includes importing clients from a CSV file.",
			},
			{
				question: "Can a client have more than one address?",
				answer: "Yes. Open the client and use the Properties & Contacts tab to add as many properties and contacts as you need. One of each is marked as primary.",
			},
		],
		related: [
			"clients/managing-clients",
			"clients/contacts-and-properties",
			"getting-started/create-your-first-project",
		],
	},
	{
		slug: "create-your-first-project",
		title: "Create your first project",
		subtitle: "Turn a job into a project with dates, an assigned team, and tasks.",
		kind: "howto",
		availability: "all",
		permission: "Admins, and members with access to projects.",
		keywords: ["project", "job", "work", "kanban", "planned", "recurring", "one-off"],
		sections: [
			{
				heading: "What a project is",
				blocks: [
					{
						type: "paragraph",
						text: "A project is a unit of work for one client: a spring cleanup, a bathroom remodel, a weekly mowing contract. Projects collect the tasks, quotes, and invoices for that job so you can see its whole story in one place.",
					},
				],
			},
			{
				heading: "Create the project",
				blocks: [
					{
						type: "steps",
						items: [
							"Go to **Projects** and click **Create Project**.",
							"Pick the **Client**. If the client has more than one property, choose which one this job is for.",
							"Give the project a title, and a description if it helps.",
							"Choose **One-off** for a single job or **Recurring** for work that repeats on a schedule.",
							"Set the start date, and an end date if you know it.",
							"Assign the teammates who will do the work, then create the project.",
						],
					},
					{
						type: "media",
						media: "image",
						caption: "The new project dialog",
						asset: "getting-started/create-your-first-project/new-project-dialog",
					},
				],
			},
			{
				heading: "Track it on the board",
				blocks: [
					{
						type: "paragraph",
						text: "Projects move through four statuses: **Planned**, **In Progress**, **Completed**, and **Cancelled**. On the board view, drag a project between columns to update its status as the job moves along.",
					},
					{
						type: "tip",
						text: "Members see the projects assigned to them, so assigning the right people is also how you put a job on their radar.",
					},
				],
			},
			{
				heading: "Add tasks to the project",
				blocks: [
					{
						type: "paragraph",
						text: "Open the project and use **Add Task** to break the job into scheduled steps. Each task gets a date, an optional time window, and an assignee. Tasks roll up to the project and also appear on the shared Tasks page and calendar.",
					},
				],
			},
		],
		faq: [
			{
				question: "What is the difference between a project and a task?",
				answer: "A project is the whole job for a client. Tasks are the scheduled pieces of work inside it, each with its own date, assignee, and status. Small jobs are often one project with a single task.",
			},
			{
				question: "Can I delete a project?",
				answer: "Yes, from the project page or the row actions, after a confirmation. Deleting a project is permanent, unlike clients, which are archived and restorable.",
			},
		],
		related: [
			"projects-and-tasks/creating-and-managing-projects",
			"projects-and-tasks/working-with-tasks",
			"getting-started/send-your-first-quote",
		],
	},
	{
		slug: "send-your-first-quote",
		title: "Send your first quote",
		subtitle: "Build a priced proposal and send it to your client for approval.",
		kind: "howto",
		availability: "all",
		permission: "Admins, and members with access to quotes.",
		keywords: ["quote", "proposal", "estimate", "line items", "approve", "send"],
		sections: [
			{
				heading: "How quotes work",
				blocks: [
					{
						type: "paragraph",
						text: "A quote is a priced proposal for a job. It starts as a draft, you send it, and your client approves or declines it from their portal. Approved quotes convert straight into invoices, so the price you agreed on is the price you bill.",
					},
				],
			},
			{
				heading: "Create the quote",
				blocks: [
					{
						type: "steps",
						items: [
							"Go to **Quotes** and click **Create Quote**.",
							"Pick the **Client**, and the project this quote belongs to if there is one.",
							"Give the quote a title, and set a **Valid until** date if the price has a shelf life.",
							"Add a short message to your client and any terms, then click **Create quote**.",
						],
					},
					{
						type: "paragraph",
						text: "OneTool numbers quotes for you automatically, starting at Q-000001.",
					},
				],
			},
			{
				heading: "Add line items",
				blocks: [
					{
						type: "paragraph",
						text: "After you create the quote, OneTool opens the line item editor.",
					},
					{
						type: "steps",
						items: [
							"Click **Add Line Item** and describe the work, with a unit, a rate, and a quantity.",
							"Repeat for each part of the job. The subtotal updates as you go.",
							"Use **Add Discount** for a percentage or fixed discount, and **Add Tax** to apply your tax rate.",
						],
					},
					{
						type: "media",
						media: "image",
						caption: "The quote line item editor",
						asset: "getting-started/send-your-first-quote/quote-line-item-editor",
					},
					{
						type: "tip",
						text: "If you quote the same services often, save them as SKUs in your organization settings and reuse them instead of retyping.",
					},
				],
			},
			{
				heading: "Send it",
				blocks: [
					{
						type: "steps",
						items: [
							"Open the quote and review the total.",
							"Click **Mark as Sent**. The quote becomes visible in your client's portal, where they can approve or decline it with a signature.",
						],
					},
					{
						type: "note",
						text: "For a formal signature ceremony with an emailed signing request, use **Send for e-signature** instead. Both paths end with an approved quote.",
					},
				],
			},
		],
		faq: [
			{
				question: "What do the quote statuses mean?",
				answer: "Draft means you are still working on it. Sent means the client can see and act on it. Approved and Declined record their decision, and Expired means an e-signature request lapsed before it was signed.",
			},
			{
				question: "Can I approve a quote myself?",
				answer: "Yes. If a client approves verbally or on paper, open the quote and click Mark Approved to record the decision.",
			},
		],
		related: [
			"quotes/creating-a-quote",
			"quotes/e-signatures",
			"getting-started/invoice-and-get-paid",
		],
	},
	{
		slug: "invoice-and-get-paid",
		title: "Invoice and get paid",
		subtitle: "Turn an approved quote into an invoice and collect payment online.",
		kind: "howto",
		availability: "all",
		permission: "Admins, and members with access to invoices.",
		keywords: ["invoice", "payment", "billing", "stripe", "paid", "convert quote"],
		sections: [
			{
				heading: "From quote to invoice",
				blocks: [
					{
						type: "paragraph",
						text: "The fastest way to bill is to convert an approved quote. The invoice copies the line items and totals exactly, so there is nothing to retype and no risk of billing a different number than the client approved.",
					},
					{
						type: "steps",
						items: [
							"Open the approved quote.",
							"Click **Convert to Invoice**. OneTool creates the invoice with the same line items and gives it the next invoice number.",
							"Review the invoice, then click **Send to Client**. Your client gets an email inviting them to view and pay it in their portal.",
						],
					},
					{
						type: "media",
						media: "image",
						caption: "Converting an approved quote into an invoice",
						asset: "getting-started/invoice-and-get-paid/converting-an-approved-quote-into-an",
					},
					{
						type: "note",
						text: "You can also create an invoice from scratch on the Invoices page when there is no quote behind the work.",
					},
				],
			},
			{
				heading: "Let clients pay by card",
				blocks: [
					{
						type: "paragraph",
						text: "Once your organization has payments set up, your client sees a **Pay** button on the invoice in their portal and can pay by card on the spot. The payment lands in your own Stripe account and pays out to your bank.",
					},
					{
						type: "paragraph",
						text: "Setting up payments takes a few minutes and is done once by the organization owner. See [Setting up online payments](/help/settings-and-team/setting-up-online-payments).",
					},
				],
			},
			{
				heading: "Record other payments",
				blocks: [
					{
						type: "paragraph",
						text: "Paid in cash or by check? Open the invoice and click **Mark as Paid**. The invoice closes out and the portal stops offering the online payment, so nothing gets collected twice.",
					},
				],
			},
			{
				heading: "Split large invoices",
				blocks: [
					{
						type: "paragraph",
						text: "For bigger jobs you can split an invoice into installments, like a deposit up front and the balance on completion. Open the invoice's **Payment Schedule** tab and click **Configure** to set the amounts and due dates. The installments must add up exactly to the invoice total.",
					},
				],
			},
		],
		faq: [
			{
				question: "What do the invoice statuses mean?",
				answer: "Draft is unsent, Sent is awaiting payment, Paid is settled, and Cancelled is void. An invoice past its due date shows as Overdue until it is paid.",
			},
			{
				question: "Do my clients need an account to pay?",
				answer: "No account or password. They sign in to their portal with a one-time code sent to their email, then view and pay the invoice there.",
			},
		],
		related: [
			"invoices-and-payments/creating-an-invoice",
			"settings-and-team/setting-up-online-payments",
			"client-portal/what-your-clients-see",
		],
	},
];
