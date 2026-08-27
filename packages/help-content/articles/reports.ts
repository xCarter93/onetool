import type { HelpArticle } from "../types";

export const reportsArticles: HelpArticle[] = [
	{
		slug: "building-a-report",
		title: "Building a report",
		subtitle: "Turn your client, project, quote, and invoice data into a chart or table you can save and reuse.",
		kind: "howto",
		availability: "all",
		permission: "Admins, and members with access to reports.",
		keywords: ["analytics", "chart", "graph", "metrics", "visualization", "group by", "filters"],
		sections: [
			{
				heading: "How reports work",
				blocks: [
					{
						type: "paragraph",
						text: "A report answers a question about your business: how much revenue came in each month, which invoices are overdue, how work is spread across your team. You pick a data source, choose how to slice it, and OneTool draws the result as a table or chart. Save it once and it reruns on your live data every time you open it.",
					},
				],
			},
			{
				heading: "Start a new report",
				blocks: [
					{
						type: "steps",
						items: [
							"Go to **Reports** in the sidebar.",
							"Click **Start blank** to open an empty builder. To begin from a ready-made report instead, see [Report presets](/help/reports/report-presets).",
						],
					},
				],
			},
			{
				heading: "Choose your data",
				blocks: [
					{
						type: "paragraph",
						text: "The builder's left panel has two tabs. **Outline** holds the shape of the report, and **Filters** narrows which records it counts.",
					},
					{
						type: "steps",
						items: [
							"Under **Source**, pick what you are reporting on: Clients, Projects, Tasks, Quotes, Invoices, or Activities.",
							"Set the **Date range**. Choose a ready-made range (Today through Last Year, or All Time) or pick **Custom Range** to set exact dates. A hint below the picker shows which date field the range applies to.",
							"Pick a **Group by** to decide what each bar or slice represents, like status or month. Choose **None (raw rows)** to see a plain table of matching records instead.",
							"Pick a **Measure**: the count of records, or the sum or average of a number field, like invoice totals.",
							"Open the **Filters** tab to narrow the data, for example only invoices with a certain status.",
						],
					},
					{
						type: "media",
						media: "image",
						caption: "The report builder with the Outline panel open",
						asset: "reports/building-a-report/report-builder-with-the-outline-panel",
					},
					{
						type: "note",
						text: "With **Group by** set to **None (raw rows)**, the report is always a table. Use the **Columns** picker to choose which fields the table shows.",
					},
				],
			},
			{
				heading: "Add a chart",
				blocks: [
					{
						type: "paragraph",
						text: "Every report starts as a table. To chart it, click **Add chart** at the top of the builder and pick one of six chart types: Bar, Column, Area, Pie, Radar, or Radial. **Remove chart** drops the report back to a plain table.",
					},
					{
						type: "note",
						text: "**Add chart** stays disabled until you pick a **Group by**. A chart needs grouped data to have something to draw.",
					},
					{
						type: "tip",
						text: "On the Business plan, click **Ask AI** in the builder and describe the report you want in plain English. The [assistant](/help/ai-assistant) fills in the builder for you, and you review and save.",
					},
				],
			},
			{
				heading: "Save it and find it again",
				blocks: [
					{
						type: "steps",
						items: [
							"Name the report in the field at the top of the builder, and add a description if it helps.",
							"Click **Save report**.",
						],
					},
					{
						type: "paragraph",
						text: "Saved reports live in the **Your reports** list on the Reports page, with their type and when they were last updated. Click one to open it. From an open report, **Edit** reopens the builder, **Duplicate** makes a copy you can change without touching the original, and **Download CSV** saves the data you're looking at as a spreadsheet file. To delete a report, hover its row in the list and click the trash icon; OneTool asks you to confirm first.",
					},
					{
						type: "note",
						text: "On an open chart report, **Hide chart** collapses the view to just the underlying data table. OneTool remembers that choice per report in your browser.",
					},
					{
						type: "media",
						media: "video",
						caption: "Building and saving a report from start to finish",
						asset: "reports/building-a-report/building-and-saving-a-report-from",
					},
				],
			},
		],
		faq: [
			{
				question: "Why is Add chart grayed out?",
				answer: "Charts need a Group by. When Group by is set to None (raw rows), the report is a table of individual records and there is nothing to aggregate, so pick a grouping first.",
			},
			{
				question: "Is a saved report a snapshot?",
				answer: "No. A report saves your configuration, not the numbers. It reruns on your current data every time you open it, so the results always reflect what is in OneTool right now.",
			},
			{
				question: "Who can see the reports I save?",
				answer: "Teammates with access to reports. Admins grant that access in member permissions, and can scope a member down to just the reports that member created.",
			},
			{
				question: "How much data can a report cover?",
				answer: "Every matching record in your date range. Organizations with a very large history may see a notice that results are based on the most recent records and could be incomplete.",
			},
		],
		related: [
			"reports/report-presets",
			"settings-and-team/member-permissions",
			"ai-assistant/what-you-can-ask",
		],
	},
	{
		slug: "report-presets",
		title: "Report presets",
		subtitle: "Start from a ready-made report and adjust it, instead of building from scratch.",
		kind: "howto",
		availability: "all",
		permission: "Admins, and members with access to reports.",
		keywords: ["templates", "ready-made reports", "examples", "revenue by month", "overdue invoices", "starting point"],
		sections: [
			{
				heading: "What presets are",
				blocks: [
					{
						type: "paragraph",
						text: "A preset is a ready-made report: the source, grouping, date range, and chart type come pre-filled, so you get a working answer in a couple of clicks. OneTool includes 14 presets across three groups: Revenue & money (invoices, income, and billing), Sales pipeline (quotes, leads, and conversion), and Operations (projects, tasks, and team).",
					},
					{
						type: "paragraph",
						text: "Highlights include Revenue by month, Overdue invoices, Quote conversion rate, Top clients by revenue, and Team workload.",
					},
				],
			},
			{
				heading: "Open the preset library",
				blocks: [
					{
						type: "steps",
						items: [
							"Go to **Reports** in the sidebar.",
							"Click **Browse presets**. The library opens with categories on the left and a search box.",
						],
					},
					{
						type: "media",
						media: "image",
						caption: "The preset library",
						asset: "reports/report-presets/preset-library",
					},
					{
						type: "note",
						text: "Four **Popular presets** shortcuts also sit right on the Reports page: Revenue by month, Overdue invoices, Quote conversion rate, and Projects by status. Clicking one skips the library and opens the builder with that preset loaded.",
					},
				],
			},
			{
				heading: "Pick a preset",
				blocks: [
					{
						type: "steps",
						items: [
							"Narrow the list with the category rail (**All presets**, **Revenue & money**, **Sales pipeline**, **Operations**) or type in the search box.",
							"Click a preset to select it, then click **Use preset**. The builder opens with everything filled in, including a name and description.",
						],
					},
					{
						type: "tip",
						text: "Double-click a preset row to open it in one move.",
					},
				],
			},
			{
				heading: "Save your own version",
				blocks: [
					{
						type: "paragraph",
						text: "A preset is a starting point, not a locked template. Once it opens in the builder you can change anything: swap the date range, add filters, pick a different chart, or rename it.",
					},
					{
						type: "steps",
						items: [
							"Adjust the report until it answers your question.",
							"Click **Save report**. Your version appears under **Your reports** on the Reports page.",
						],
					},
					{
						type: "note",
						text: "Saving never changes the preset itself. You can start from the same preset as many times as you like, and each save creates its own report.",
					},
				],
			},
		],
		faq: [
			{
				question: "Can I edit a preset itself?",
				answer: "No. Presets are fixed starting points built into OneTool. The report you save from one is fully yours to edit, duplicate, or delete.",
			},
			{
				question: "Do preset reports stay up to date?",
				answer: "Yes. Like any saved report, a report you create from a preset stores the configuration and reruns on your current data each time you open it.",
			},
			{
				question: "What if no preset fits?",
				answer: "Click Start blank and build the report yourself. See [Building a report](/help/reports/building-a-report) for the full walkthrough.",
			},
		],
		related: [
			"reports/building-a-report",
			"ai-assistant/what-you-can-ask",
		],
	},
];
