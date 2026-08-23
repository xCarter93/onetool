import type { HelpArticle } from "../types";

export const clientsArticles: HelpArticle[] = [
	{
		slug: "managing-clients",
		title: "Managing clients",
		subtitle: "Keep every customer organized with statuses, search, and a history that never gets lost.",
		kind: "howto",
		availability: "all",
		permission: "Admins, and members with access to clients.",
		keywords: ["customer", "kanban", "board", "archive", "restore", "lead", "status", "search"],
		sections: [
			{
				heading: "The Clients list",
				blocks: [
					{
						type: "paragraph",
						text: "**Clients** in the sidebar opens your full client list. Every company or household you work for lives here, along with their contacts, service addresses, and every project, quote, invoice, and email tied to them.",
					},
					{
						type: "paragraph",
						text: "The list has two views, switched with the **Table** and **Kanban** toggle. The table is best for scanning and searching a long list. The kanban board groups clients into columns by status, and dragging a card from one column to another updates the client's status in one move.",
					},
					{
						type: "paragraph",
						text: "Click a row, or the eye icon, to preview a client in a drawer without leaving the list.",
					},
					{
						type: "media",
						media: "image",
						caption: "The Clients list in the table view",
						asset: "clients/managing-clients/clients-list-in-the-table-view",
					},
					{
						type: "note",
						text: "Archived clients do not appear on the kanban board. Use the table view to find them.",
					},
				],
			},
			{
				heading: "Client statuses",
				blocks: [
					{
						type: "paragraph",
						text: "Every client has one of four statuses:",
					},
					{
						type: "list",
						items: [
							"**Lead** is a prospect you have not started work for yet.",
							"**Active** is a current customer.",
							"**Inactive** is a customer you are not currently serving.",
							"**Archived** removes the client from your working list while keeping their history.",
						],
					},
					{
						type: "paragraph",
						text: "You pick a status when you create the client. Prospects usually start as **Lead** and move to **Active** once you win the work. On the kanban board, dragging the card between columns is all it takes.",
					},
				],
			},
			{
				heading: "Search and filters",
				blocks: [
					{
						type: "paragraph",
						text: "The search box matches client names and the primary contact's name and email, so you can find a client by the person you deal with even if you forget the company name. A status filter narrows the list further.",
					},
					{
						type: "note",
						text: "By default the list carries an **is not Archived** filter, which keeps archived clients out of view. Remove that filter chip to see archived clients again.",
					},
				],
			},
			{
				heading: "Archive and restore",
				blocks: [
					{
						type: "paragraph",
						text: "When you stop working with a client, archive them instead of deleting. Archiving is a soft delete: the client disappears from the default view, but every project, quote, invoice, and email stays attached, and you can bring the client back at any time.",
					},
					{
						type: "steps",
						items: [
							"Find the client in the table and open the row actions.",
							"Click the trash icon, then confirm. The client's status changes to **Archived**.",
							"To restore, remove the **is not Archived** filter chip so archived clients are visible.",
							"Click the restore icon (a circular arrow) on the archived row. The client comes back with everything intact.",
						],
					},
				],
			},
			{
				heading: "The client detail page",
				blocks: [
					{
						type: "paragraph",
						text: "Click into a client to open their full record. The header gives you one-click actions for the things you do most, each already linked to this client: **Compose Email**, **Add Task**, **Create Project**, and **Create Quote**.",
					},
					{
						type: "list",
						items: [
							"**Overview** shows the client's details.",
							"**Activity** shows the history of this client record.",
							"**Email Threads** collects your email conversations with this client, with a count badge.",
							"**Tasks** lists the tasks tied to this client, also with a count.",
							"**Properties & Contacts** manages the people and service addresses. See [Contacts and properties](/help/clients/contacts-and-properties).",
						],
					},
					{
						type: "paragraph",
						text: "A summary sidebar stays on the right of the page with the primary contact, the primary property, and an invoice summary, so the essentials are always in view.",
					},
					{
						type: "note",
						text: "If your organization has QuickBooks Online connected, the sidebar adds a **QuickBooks** row showing when this client last synced. The row is hidden when QuickBooks is not connected or the client has not synced yet.",
					},
					{
						type: "media",
						media: "image",
						caption: "A client detail page with the Overview tab open",
						asset: "clients/managing-clients/client-detail-page-with-the-overview",
					},
				],
			},
		],
		faq: [
			{
				question: "What happens to a client's history when I archive them?",
				answer: "Nothing is removed. Archiving only changes the client's status and hides them behind the default filter. Their projects, quotes, invoices, and emails all stay in place, and restoring the client brings everything back into view.",
			},
			{
				question: "How many clients can I have?",
				answer: "As many as you like. Clients are unlimited on every plan, including Free. The Free plan meters document sends, e-signatures, assistant messages, saved reports, and CSV import rows instead.",
			},
			{
				question: "Why do I not see the Clients page?",
				answer: "Access to clients is a permission. Members do not have it by default; an admin can grant it from your team settings. See [Member permissions](/help/settings-and-team/member-permissions).",
			},
		],
		related: [
			"clients/contacts-and-properties",
			"clients/importing-clients",
			"inbox/emailing-from-a-client-record",
		],
	},
	{
		slug: "contacts-and-properties",
		title: "Contacts and properties",
		subtitle: "Track every person you talk to and every address you service under one client.",
		kind: "howto",
		availability: "all",
		permission: "Admins, and members with access to clients.",
		keywords: ["address", "service location", "primary", "phone number", "job title", "residential", "commercial"],
		sections: [
			{
				heading: "People and places",
				blocks: [
					{
						type: "paragraph",
						text: "A client is rarely one person at one address. A property manager might have an office contact and a maintenance contact, plus a dozen buildings you service. OneTool models this directly: every client can hold multiple contacts (the people you talk to) and multiple properties (the addresses where you do the work).",
					},
					{
						type: "paragraph",
						text: "One contact and one property on each client are marked **Primary**, shown with a star. The primary pair appears in the summary sidebar on the client page, so the main person and the main address are always one glance away.",
					},
				],
			},
			{
				heading: "The Properties & Contacts tab",
				blocks: [
					{
						type: "paragraph",
						text: "Open a client and go to the **Properties & Contacts** tab. It shows a table of contacts and a table of properties, and you add, edit, and delete rows right in place. There is no separate form to fill out.",
					},
					{
						type: "media",
						media: "image",
						caption: "The Properties & Contacts tab on a client record",
						asset: "clients/contacts-and-properties/properties-and-contacts-tab-on-a",
					},
					{
						type: "note",
						text: "New rows show an **Unsaved** badge until you save them. Cancelling or deleting an unsaved row just discards it; deleting a saved row removes it from the client record.",
					},
				],
			},
			{
				heading: "Add a contact",
				blocks: [
					{
						type: "steps",
						items: [
							"Open the client and go to **Properties & Contacts**.",
							"Add a new row in the contacts table.",
							"Fill in the contact's first and last name, email, phone, and job title. First and last name are required.",
							"Save the row. The **Unsaved** badge disappears once the contact is stored. If a required field is empty, the row stays open and marks what is missing.",
						],
					},
				],
			},
			{
				heading: "Add a property",
				blocks: [
					{
						type: "steps",
						items: [
							"Add a new row in the properties table.",
							"Start typing the street address. Picking one of the suggestions fills in the city, state, and ZIP for you.",
							"Check the address: street, city, state, and ZIP are all required.",
							"Tick **Primary** if this is the client's main address, then save the row.",
						],
					},
					{
						type: "note",
						text: "A property name and a property type are set on the new client form or in a CSV import. The properties table covers the address fields only, so a property added here is identified by its address.",
					},
					{
						type: "tip",
						text: "Projects and client tasks can be tied to a specific property. When a client has more than one, you pick which property the job is for. The picker shows the property's name when it has one and the street address when it does not.",
					},
				],
			},
			{
				heading: "Set the primary contact and property",
				blocks: [
					{
						type: "paragraph",
						text: "A checkbox on each row marks the primary contact and the primary property. When you create a client, the contact and address from the new client form become the primary ones, and you can change that here as the account grows.",
					},
				],
			},
		],
		faq: [
			{
				question: "Which property does a new project use?",
				answer: "If the client has one property, it is selected automatically. If they have more than one, the project form asks you to pick.",
			},
			{
				question: "Can I add contacts and properties while creating the client?",
				answer: "The new client form includes one primary contact and one optional primary address. Add the rest from the Properties & Contacts tab after the client is created.",
			},
		],
		related: [
			"clients/managing-clients",
			"getting-started/add-your-first-client",
			"projects-and-tasks/creating-and-managing-projects",
		],
	},
	{
		slug: "importing-clients",
		title: "Importing clients",
		subtitle: "Bring your existing client list into OneTool from a CSV file in three steps.",
		kind: "howto",
		availability: "all",
		permission: "Admins, and members with access to clients.",
		keywords: ["csv", "spreadsheet", "upload", "migration", "bulk", "duplicates", "excel", "transfer"],
		sections: [
			{
				heading: "What import does",
				blocks: [
					{
						type: "paragraph",
						text: "If your client list lives in a spreadsheet, you do not have to retype it. The import wizard reads a CSV file, matches its columns to OneTool's client fields for you, checks for duplicates, and creates the clients in one pass.",
					},
					{
						type: "paragraph",
						text: "Start by exporting your current list to a CSV file with one client per row.",
					},
					{
						type: "note",
						text: "Import works on every plan. The Free plan includes 2,000 imported rows in total, and the wizard shows how many you have left. The Business plan has no lifetime cap, though imports on any plan are limited to 2,000 rows per day.",
					},
				],
			},
			{
				heading: "Step 1: Upload",
				blocks: [
					{
						type: "steps",
						items: [
							"Go to **Clients** and click **Import Clients**.",
							"Upload your CSV file on the **Upload** step.",
						],
					},
				],
			},
			{
				heading: "Step 2: Map Columns",
				blocks: [
					{
						type: "paragraph",
						text: "The **Map Columns** step matches each column in your file to a client field in OneTool. The matching is done for you by AI, and each suggestion carries a confidence level so you can see which ones deserve a second look.",
					},
					{
						type: "steps",
						items: [
							"Review each suggested match. Low-confidence matches are the ones to check first.",
							"Change any mapping that landed on the wrong field.",
							"Continue to the review step once the mappings look right.",
						],
					},
					{
						type: "media",
						media: "image",
						caption: "The Map Columns step with suggested matches",
						asset: "clients/importing-clients/map-columns-step-with-suggested-matches",
					},
				],
			},
			{
				heading: "Step 3: Review",
				blocks: [
					{
						type: "paragraph",
						text: "The **Review** step shows every row before anything is created and checks your file against the clients you already have. Rows whose names closely match an existing client are marked **Skipped (duplicate)** so you do not import the same client twice.",
					},
					{
						type: "steps",
						items: [
							"Scan the rows marked **Skipped (duplicate)**. The match is based on the name, including close spellings.",
							"Un-skip a row if it is genuinely a different client and you want it imported anyway.",
							"Finish the import. OneTool creates a client for each row that is not skipped.",
						],
					},
					{
						type: "tip",
						text: "Duplicate matching is fuzzy on purpose, so Smith Landscaping and Smith Landscaping LLC can be flagged as the same client. Close calls are paused for your judgment instead of imported blind.",
					},
				],
			},
		],
		faq: [
			{
				question: "What file format can I import?",
				answer: "A CSV file. Every spreadsheet tool, including Excel and Google Sheets, can export your list as a CSV.",
			},
			{
				question: "What if a column is mapped to the wrong field?",
				answer: "Change it on the Map Columns step. Each AI suggestion is a starting point, and nothing is created until you finish the Review step.",
			},
			{
				question: "Why is a row marked Skipped (duplicate)?",
				answer: "Its name closely matches a client you already have. If it really is a different client, un-skip the row and it imports normally.",
			},
			{
				question: "Can I import during setup?",
				answer: "Yes. The organization setup wizard includes an optional Import data step where you can upload a CSV, or you can skip it and import later from the Clients page.",
			},
		],
		related: [
			"clients/managing-clients",
			"settings-and-team/plans-and-billing",
			"getting-started/set-up-your-organization",
		],
	},
];
