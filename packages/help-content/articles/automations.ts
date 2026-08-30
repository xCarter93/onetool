import type { HelpArticle } from "../types";

export const automationsArticles: HelpArticle[] = [
	{
		slug: "automations-overview",
		title: "Automations overview",
		subtitle: "Let OneTool watch your business and handle the routine follow up for you.",
		kind: "concept",
		availability: "business",
		permission: "Admins only, on the Business plan.",
		heroMedia: {
			media: "image",
			caption: "The Automations page with the monitoring dashboard",
			asset: "automations/automations-overview/hero",
		},
		keywords: ["workflow", "trigger", "rules", "monitoring", "draft", "published", "beta"],
		sections: [
			{
				heading: "What automations do",
				blocks: [
					{
						type: "paragraph",
						text: "An automation watches for something happening in your business and reacts for you. When a quote is approved, email the client. When a project wraps up, create a follow up task. You describe the reaction once, and OneTool runs it every time, without anyone remembering to do it.",
					},
					{
						type: "paragraph",
						text: "Each automation is a trigger (the event that starts it) plus a chain of steps (what happens next). You build both on a visual canvas, so the whole flow is visible at a glance. See [Building an automation](/help/automations/building-an-automation) for the walkthrough.",
					},
				],
			},
			{
				heading: "The Automations page",
				blocks: [
					{
						type: "paragraph",
						text: "**Automations** in the sidebar is home base. The top of the page is a monitoring dashboard: a throughput chart of recent activity, metric tiles with your key numbers, and any recent failures that need a look. Below it are two tabs:",
					},
					{
						type: "list",
						items: [
							"**Automations** lists every automation with its trigger, step count, and status. Click one to open it in the editor.",
							"**Runs** lists every individual run across all of your automations, with a status filter. See [Testing and run history](/help/automations/testing-and-run-history).",
						],
					},
					{
						type: "paragraph",
						text: "**Create Automation** in the top right starts a new one in the editor.",
					},
				],
			},
			{
				heading: "Draft and published",
				blocks: [
					{
						type: "paragraph",
						text: "Automations never go live by accident. Saving your work keeps it as a draft, and nothing runs until you publish. After publishing you can keep editing safely: your edits wait in the draft, and the live version keeps running the last published flow until you publish the changes.",
					},
					{
						type: "paragraph",
						text: "Each automation shows a status badge of **Draft**, **Active**, or **Paused**. An automation only runs while it is Active.",
					},
				],
			},
			{
				heading: "Who can use automations",
				blocks: [
					{
						type: "paragraph",
						text: "Automations require both an admin role and the Business plan. Members who open the page see an admin access notice, and admins on the Free plan see an upgrade prompt. Manage your plan from [Plans and billing](/help/settings-and-team/plans-and-billing).",
					},
					{
						type: "note",
						text: "Automations is currently in beta, and the editor shows a beta badge. The feature works, but the available steps and behavior may still change.",
					},
				],
			},
		],
		related: [
			"automations/building-an-automation",
			"automations/triggers-and-actions",
			"settings-and-team/plans-and-billing",
		],
	},
	{
		slug: "building-an-automation",
		title: "Building an automation",
		subtitle: "Build an automation on the visual canvas and publish it when it is ready.",
		kind: "howto",
		availability: "business",
		permission: "Admins only, on the Business plan.",
		keywords: ["editor", "canvas", "workflow", "publish", "draft", "trigger", "steps"],
		sections: [
			{
				heading: "Start in the editor",
				blocks: [
					{
						type: "paragraph",
						text: "Every automation is built in a visual editor: a canvas that shows your trigger and each step as connected blocks, in the order they run.",
					},
					{
						type: "steps",
						items: [
							"Go to **Automations** in the sidebar.",
							"Click **Create Automation**. A blank automation opens in the editor.",
							"Name the automation in the top bar, and add a description if it helps.",
						],
					},
				],
			},
			{
				heading: "Pick a trigger",
				blocks: [
					{
						type: "paragraph",
						text: "The trigger decides when your automation runs. There are four types: **Status changes**, **Record created**, **Record updated**, and **On a schedule**.",
					},
					{
						type: "steps",
						items: [
							"Choose the trigger type.",
							"For record triggers, pick which kind of record to watch: clients, projects, quotes, invoices, or tasks.",
							"Add **Entry criteria** if the automation should only fire when the record also matches certain conditions.",
						],
					},
					{
						type: "note",
						text: "A schedule trigger has no record attached, so steps that act on a record are unavailable at the top of the flow. Add **Find Records** and a **Loop** first to fetch the records you want to work on.",
					},
				],
			},
			{
				heading: "Add and configure steps",
				blocks: [
					{
						type: "paragraph",
						text: "Steps are the work your automation does. Every connection on the canvas shows a plus button; click it to insert a step at that exact point in the flow.",
					},
					{
						type: "steps",
						items: [
							"Click the plus on the connection where the new step should go.",
							"Pick a step from the picker. Steps are grouped by what they do: logic, records, communication, utilities, and flow.",
							"Configure the step in the panel that opens. Each step type has its own options, like which record to update or what an email should say.",
							"Repeat until the flow does everything you want. See [Triggers and actions](/help/automations/triggers-and-actions) for the full catalog.",
						],
					},
					{
						type: "media",
						media: "image",
						caption: "Inserting a step from the plus button on a connection",
						asset: "automations/building-an-automation/inserting-a-step-from-the-plus",
					},
					{
						type: "note",
						text: "Deleting a step shows a short undo banner for five seconds before the change is final. Deleting a **Condition** or a **Loop** removes everything inside its branches or body, not just the one block.",
					},
				],
			},
			{
				heading: "Save, then publish",
				blocks: [
					{
						type: "paragraph",
						text: "**Save** in the top bar stores your work as a draft. Nothing runs yet. Whenever your draft differs from what is live, a floating banner appears on the canvas with a publish button: **Publish workflow** the first time, **Publish changes** after that.",
					},
					{
						type: "steps",
						items: [
							"Click **Save** to store the draft.",
							"Test it first. See [Testing and run history](/help/automations/testing-and-run-history).",
							"Click **Publish workflow** when you are ready. The automation goes live and starts running on its trigger.",
						],
					},
					{
						type: "media",
						media: "video",
						caption: "Building and publishing an automation from start to finish",
						asset: "automations/building-an-automation/building-and-publishing-an-automation-from",
					},
				],
			},
			{
				heading: "The Resources and Debug tabs",
				blocks: [
					{
						type: "paragraph",
						text: "A collapsible drawer on the right side of the editor holds two tabs: **Resources** and **Debug**. The **Debug** tab is where you run safe test runs against real data and review what each step did, covered in [Testing and run history](/help/automations/testing-and-run-history).",
					},
				],
			},
		],
		faq: [
			{
				question: "Do my edits change the live automation right away?",
				answer: "No. Save keeps your edits in a draft. The live version keeps running the last published flow until you click Publish changes.",
			},
			{
				question: "I deleted the trigger and the whole canvas cleared. Why?",
				answer: "The trigger is the root of the flow, so removing it clears the canvas. The editor asks you to confirm before it does.",
			},
			{
				question: "What does the beta badge in the editor mean?",
				answer: "Automations is in beta. Your automations work, but the available steps and some behavior may still change while the feature matures.",
			},
		],
		related: [
			"automations/triggers-and-actions",
			"automations/testing-and-run-history",
		],
	},
	{
		slug: "triggers-and-actions",
		title: "Triggers and actions",
		subtitle: "Browse the catalog of triggers and steps you can combine in an automation.",
		kind: "concept",
		availability: "business",
		permission: "Admins only, on the Business plan.",
		heroMedia: {
			media: "image",
			caption: "The step picker in the automation editor",
			asset: "automations/triggers-and-actions/hero",
		},
		keywords: ["steps", "condition", "branch", "loop", "delay", "send email", "variables", "schedule"],
		sections: [
			{
				heading: "Triggers",
				blocks: [
					{
						type: "paragraph",
						text: "The trigger is the event that starts an automation. There are four types:",
					},
					{
						type: "list",
						items: [
							"**Status changes** fires when a record moves to a new status, like a quote being approved, an invoice being paid, or a sent invoice turning overdue.",
							"**Record created** fires when a new record is added.",
							"**Record updated** fires when a record's details change.",
							"**On a schedule** fires at times you set, with no record attached.",
						],
					},
					{
						type: "paragraph",
						text: "Record triggers watch one kind of record: clients, projects, quotes, invoices, or tasks. Add **Entry criteria** to narrow further, so the automation only fires when the record also matches your conditions. Criteria can combine multiple conditions with and/or logic.",
					},
				],
			},
			{
				heading: "Conditions and branches",
				blocks: [
					{
						type: "paragraph",
						text: "**Condition** checks the record and sends the flow down different branches depending on the result. That lets one automation treat different records differently, instead of you building a separate automation for each case.",
					},
				],
			},
			{
				heading: "Record steps",
				blocks: [
					{
						type: "list",
						items: [
							"**Update Record** changes the record the automation is working on.",
							"**Create Task** adds a new task.",
							"**Create Record** creates a new record.",
							"**Find Records** looks up a set of records to work with, usually feeding a **Loop**.",
						],
					},
					{
						type: "note",
						text: "Schedule triggers start with no record in scope, so a scheduled automation needs **Find Records** and a **Loop** before it can act on records.",
					},
				],
			},
			{
				heading: "Communication steps",
				blocks: [
					{
						type: "paragraph",
						text: "The communication group holds **Send Email**, **Send Notification**, and **Send Team Message**. Send Email is the one that reaches your clients, so it comes with a few guardrails worth knowing.",
					},
					{
						type: "paragraph",
						text: "**Send Email** emails the client tied to the record in scope, or a fixed list of addresses. The **Send to** field offers two options: **Client's primary contact**, resolved automatically from the record, or **Specific addresses**, where you can enter up to 10 addresses.",
					},
					{
						type: "paragraph",
						text: "Write the subject and body like a normal email, and use **Insert variable** to drop in placeholders that are filled from the record's live data when the automation runs. The message goes out on the same branded template as email you send from the [Inbox](/help/inbox/unified-inbox), and addresses that previously bounced or reported spam are dropped automatically.",
					},
					{
						type: "note",
						text: "Two guardrails apply. Your organization can send up to 200 automation emails per day, counted across every automation combined. And if your plan no longer includes automations, sends stop. In both cases the email step is skipped, not failed, and the run's timeline records the reason.",
					},
				],
			},
			{
				heading: "Timing, loops, and flow",
				blocks: [
					{
						type: "list",
						items: [
							"**Loop** repeats a set of steps for each record in a list, usually one from **Find Records**.",
							"**Delay** waits before continuing, and **Delay until** waits for a specific moment.",
							"**Aggregate** and **Adjust time** are utilities for working with sets of records and dates.",
							"**End** and **Next item** control how a flow, or a pass through a loop, finishes.",
						],
					},
				],
			},
		],
		related: [
			"automations/building-an-automation",
			"automations/testing-and-run-history",
		],
	},
	{
		slug: "testing-and-run-history",
		title: "Testing and run history",
		subtitle: "Try an automation safely, then follow what every real run did.",
		kind: "howto",
		availability: "business",
		permission: "Admins only, on the Business plan.",
		keywords: ["debug", "dry run", "logs", "failed", "skipped", "timeline", "monitor"],
		sections: [
			{
				heading: "Test runs are safe",
				blocks: [
					{
						type: "paragraph",
						text: "The editor has a built-in test mode that walks your whole automation against real data without touching anything. No records are changed and no messages or emails go out, so you can test as many times as you like, even on a draft.",
					},
					{
						type: "steps",
						items: [
							"Open the automation in the editor.",
							"Open the **Debug** tab in the drawer on the right.",
							"Pick a sample record to run against if you want a specific one.",
							"Click **Run test**.",
						],
					},
					{
						type: "paragraph",
						text: "The execution timeline shows each step with its own status. If items inside a loop fail, they are summarized inline so you can spot the pattern.",
					},
					{
						type: "media",
						media: "image",
						caption: "A test run's execution timeline in the Debug tab",
						asset: "automations/testing-and-run-history/test-runs-execution-timeline-in-the",
					},
				],
			},
			{
				heading: "Run it for real",
				blocks: [
					{
						type: "paragraph",
						text: "A test run never sends anything. When you want a published automation to run immediately with real effects, use **Run now** from the Automations table.",
					},
					{
						type: "steps",
						items: [
							"Go to **Automations** and find the automation's row.",
							"Click the play button to open the **Run now** popover.",
							"Pick a target record if the automation needs one.",
							"Click **Run now**. The published automation runs with real effects.",
						],
					},
				],
			},
			{
				heading: "The Runs tab",
				blocks: [
					{
						type: "paragraph",
						text: "The **Runs** tab on the Automations page lists every individual run across all of your automations. Filter the list by status with the status dropdown, and click an automation's name to jump into its editor.",
					},
					{
						type: "paragraph",
						text: "Each run shows one of six statuses: **Running**, **Completed**, **Completed with errors**, **Failed**, **Skipped**, or **Cancelled**.",
					},
					{
						type: "media",
						media: "image",
						caption: "The Runs tab filtered by status",
						asset: "automations/testing-and-run-history/runs-tab-filtered-by-status",
					},
				],
			},
			{
				heading: "Reading a run step by step",
				blocks: [
					{
						type: "paragraph",
						text: "Every run records an execution timeline: what each step did, its status, and the reason when a step was skipped. An email step that hits the daily cap, for example, is recorded as skipped with a note that the cap was reached, and the run itself carries on.",
					},
					{
						type: "paragraph",
						text: "To dig into the details, open the automation in the editor and use the **Debug** tab, the same place you run tests.",
					},
				],
			},
		],
		faq: [
			{
				question: "Does a test run send emails or change my data?",
				answer: "No. Test runs make no changes and send no messages or emails. Run now is the option with real effects.",
			},
			{
				question: "Why does a run show a step as skipped instead of failed?",
				answer: "Some steps skip on purpose rather than fail the whole run. Send Email skips when the daily 200 email cap is reached or when the plan no longer includes automations, and the timeline records the reason either way.",
			},
			{
				question: "Why is my automation not running at all?",
				answer: "Check its status on the Automations tab. A Draft has never been published, and edits after publishing stay in the draft until you publish the changes. An automation only runs while it is Active.",
			},
		],
		related: [
			"automations/building-an-automation",
			"automations/automations-overview",
		],
	},
];
