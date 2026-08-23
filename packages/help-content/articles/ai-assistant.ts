import type { HelpArticle } from "../types";

export const aiAssistantArticles: HelpArticle[] = [
	{
		slug: "meet-the-assistant",
		title: "Meet the assistant",
		subtitle: "Ask questions about your business and hand off small jobs from any page in OneTool.",
		kind: "concept",
		availability: "all",
		heroMedia: {
			media: "image",
			caption: "The assistant panel open in the workspace",
			asset: "ai-assistant/meet-the-assistant/hero",
		},
		keywords: ["ai", "chat", "chatbot", "copilot", "pin", "sidebar"],
		sections: [
			{
				heading: "What the assistant is",
				blocks: [
					{
						type: "paragraph",
						text: "The assistant is a chat built into your workspace. Ask it a question in plain English and it looks up the answer in your live OneTool data: today's schedule, an unpaid invoice, the last email a client sent. Ask it to do something and it can make the change for you.",
					},
					{
						type: "paragraph",
						text: "It is not a generic chatbot with canned answers. Every reply comes from a live lookup against your own clients, projects, quotes, invoices, and schedule, so the answer reflects your business right now.",
					},
				],
			},
			{
				heading: "Opening the panel",
				blocks: [
					{
						type: "paragraph",
						text: "The **Assistant** dock floats at the bottom center of every workspace page. Click it to open the chat panel, and press Escape or the close button to put it away. On a phone the chat slides up from the bottom edge instead.",
					},
					{
						type: "paragraph",
						text: "By default the panel floats above the page, so you can keep it open while you move around. On larger screens you can also pin it, which docks the chat as a side column on the right until you unpin it.",
					},
					{
						type: "paragraph",
						text: "Type your message and press Enter to send it. Shift and Enter adds a new line.",
					},
				],
			},
			{
				heading: "It knows what you are looking at",
				blocks: [
					{
						type: "paragraph",
						text: "When you have a record open, a banner under the panel header shows what is **In context**. Open a client and you can ask about them without typing their name; the assistant already knows who you mean. The same applies in the report builder, where the assistant can see the report you are editing.",
					},
					{
						type: "paragraph",
						text: "The suggested prompts in an empty conversation change with context too. You will see different starting points on the routing page, in the report builder, and on a record's page.",
					},
				],
			},
			{
				heading: "Past conversations",
				blocks: [
					{
						type: "paragraph",
						text: "The history button in the panel header lists your past conversations by title and date, and clicking one reopens it. Use **New conversation** to start fresh when you change topics.",
					},
				],
			},
			{
				heading: "Who can use it",
				blocks: [
					{
						type: "paragraph",
						text: "The assistant is available on every plan and to every member of your organization, not just admins. On the Free plan your organization shares 10 messages a day across the team, and the count resets at midnight UTC. The panel shows how many are left, and tells you when they run out. The Business plan has no daily limit.",
					},
					{
						type: "paragraph",
						text: "It also respects each member's permissions. If your role does not include access to an area, the assistant tells you it cannot help with that request instead of showing you the data.",
					},
					{
						type: "note",
						text: "The assistant can make real changes when you ask for them. Double-check anything important, like a status change or an updated client detail.",
					},
				],
			},
		],
		related: [
			"ai-assistant/what-you-can-ask",
			"settings-and-team/plans-and-billing",
			"getting-started/navigating-the-workspace",
		],
	},
	{
		slug: "what-you-can-ask",
		title: "What you can ask",
		subtitle: "See what the assistant can look up, the changes it can make, and how to phrase your requests.",
		kind: "concept",
		availability: "all",
		heroMedia: {
			media: "image",
			caption: "Asking the assistant about the week's schedule",
			asset: "ai-assistant/what-you-can-ask/hero",
		},
		keywords: ["prompts", "examples", "ai", "chat", "capabilities", "commands"],
		sections: [
			{
				heading: "Questions it can answer",
				blocks: [
					{
						type: "paragraph",
						text: "The assistant can look up almost anything in your workspace. Ask about:",
					},
					{
						type: "list",
						items: [
							"**Your schedule and tasks**, like what is on for tomorrow or which tasks are still unassigned.",
							"**Clients, projects, quotes, and invoices**, from one record's details to which invoices are overdue.",
							"**Emails**, searching a client's correspondence and pulling up a thread.",
							"**Documents, your team, and recent activity** across the organization.",
							"**Automations and their runs**, like whether anything failed overnight.",
						],
					},
				],
			},
			{
				heading: "Stats, reports, and charts",
				blocks: [
					{
						type: "paragraph",
						text: "Ask how the business is doing and the assistant answers with your real numbers. On the Business plan it can also build reports for you and change how they are charted. Ask for a chart of revenue by month and it creates the report; open a saved report in the [report builder](/help/reports/building-a-report) and it can adjust the setup for you.",
					},
				],
			},
			{
				heading: "Changes it can make",
				blocks: [
					{
						type: "paragraph",
						text: "Beyond answering questions, the assistant can act on your behalf:",
					},
					{
						type: "list",
						items: [
							"Create new tasks and update existing ones.",
							"Update clients and projects, like changing a status or correcting a detail.",
							"Plan a driving route, adjust it, and optimize the stop order, on the Business plan. See [Planning a route](/help/routing/planning-a-route).",
							"Take you places. Ask it to open a record or a page and it navigates there for you.",
						],
					},
				],
			},
			{
				heading: "Example prompts",
				blocks: [
					{
						type: "paragraph",
						text: "Phrase requests the way you would say them out loud. A few examples:",
					},
					{
						type: "list",
						items: [
							"\"What's on the schedule tomorrow?\"",
							"\"Which invoices are overdue?\"",
							"\"Create a task to service the Hendersons' AC on Friday morning.\"",
							"\"Mark the Riverside cleanup project as completed.\"",
							"\"Show me revenue by month this year as a chart.\"",
							"\"Plan tomorrow's route and put the stops in the best order.\"",
							"\"Did the Garcias email us back about the fence quote?\"",
						],
					},
				],
			},
			{
				heading: "What it will not do",
				blocks: [
					{
						type: "paragraph",
						text: "A few things stay in your hands. The assistant cannot send emails, cannot create or edit quotes or invoices, cannot create new clients or projects, and cannot build or change automations. It can look all of those up and answer questions about them, but the change itself happens on the page.",
					},
					{
						type: "tip",
						text: "When you hit something the assistant cannot change, ask it to take you to the right page and finish there.",
					},
				],
			},
		],
		related: [
			"ai-assistant/meet-the-assistant",
			"reports/building-a-report",
			"routing/planning-a-route",
		],
	},
];
