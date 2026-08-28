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
						text: "A report answers a question about your business: how much revenue came in each month, which invoices are overdue, how work is spread across your team. You pick a data source, choose how to slice it, and the preview on the left redraws with your live data as you go. Save it once and it reruns on current data every time you open it.",
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
					{
						type: "paragraph",
						text: "A blank report starts with nothing selected. The preview asks you to pick a data source, and the rest of the settings appear once you do.",
					},
				],
			},
			{
				heading: "Set up the report",
				blocks: [
					{
						type: "paragraph",
						text: "All settings live in the panel on the right. Work down it from top to bottom.",
					},
					{
						type: "steps",
						items: [
							"Pick a **Visualization**: **Single metric** shows one figure, like total revenue this month. **Table** lists grouped totals, or raw records when nothing is grouped, except for rate metrics, which always show totals. **Bar**, **Column**, **Area**, **Pie**, **Radar**, and **Radial** draw grouped data. Your choice decides which settings appear below it.",
							"Under **Data source**, pick what you are reporting on: Clients, Projects, Tasks, Quotes, Invoices, Payments, Quote Line Items, Invoice Line Items, or Activities.",
							"Set the **Date range**. Choose a ready-made range (Today through Last Year, or All Time) or pick **Custom Range** to set exact dates. When the source has more than one date, a **Date field** picker chooses which one the range applies to, like an invoice's issued date versus its paid date.",
							"Add **Filters** to narrow the data. Each filter is a row: a field, a condition, and a value. The **And/Or** chip between rows switches how they combine, and fields from linked records work too, so line items can filter by **Quote › Status**. Date fields filter with **is before**, **is after**, and **is on**. For rules in separate groups, open **Advanced filter**: a panel opens beside the settings where you build groups of rules and drag filters between them.",
							"The **Metric** section sets what the report counts and what each row stands for. Start at the top with what to measure. The target can be the count of records, a number field, or a named rate like **Conversion rate**. Number fields get an aggregation dropdown next to the target: **Sum**, **Average**, **Min**, or **Max**. To total one record type against another, report on those records themselves and group them by the linked record, so invoices summed by **Client** gives you total invoiced per client.",
							"Under the metric, the **per** row decides what each bar, slice, or row represents, so the panel reads \"Count of records per Status\". The picker lists the source's own fields first, and entries like **Quote ›** step into a linked record, so line items can group by their quote's project or client. Typing in the search box finds fields anywhere in the chain. Date groupings offer **Day**, **Week**, and **Month** buckets, and groupings with a fixed set of values can **Include empty values** to show zero-count groups.",
							"On a Table, a **Columns** picker sits at the bottom of the **Metric** section and chooses the fields each record row shows. A table shows grouped totals or raw records, never both, so picking columns sets **per** to **None (raw rows)**, and picking a grouping clears the columns.",
						"On bar and column charts, **Segment by** splits each bar into stacked segments by a second field, like status within each month.",
							"Fine-tune a chart under **Chart options**: cap how many groups show (**Series limit**), change the ordering (**Sort**), label the axes, and draw a **Target line** at a value you set.",
						],
					},
					{
						type: "media",
						media: "image",
						caption: "The report builder with the preview on the left and settings on the right",
						asset: "reports/building-a-report/report-builder-with-the-outline-panel",
					},
					{
						type: "note",
						text: "Picking a chart type applies a sensible grouping for you if none is set; change it in the **per** row. **None (raw rows)** is available on Table reports only, since a chart needs grouped data to draw.",
					},
					{
						type: "note",
						text: "Changing the data source resets filters, metric, and columns, because they belong to the old source. OneTool asks you to confirm before it clears them.",
					},
					{
						type: "tip",
						text: "On the Business plan, click the assistant bar at the bottom of the screen, labeled **Report assistant** on report pages, and describe the report you want in plain English. The [assistant](/help/ai-assistant) fills in the builder for you, and you review and save.",
					},
				],
			},
			{
				heading: "Read the results",
				blocks: [
					{
						type: "paragraph",
						text: "The bar under the preview keeps the numbers behind the picture. **Calculated values** expands to show the total, the group count, what the report measures, and for charts the full data table. The same bar appears on saved reports, where it also has **Download CSV** to save exactly what is on screen as a spreadsheet file.",
					},
				],
			},
			{
				heading: "Save it and find it again",
				blocks: [
					{
						type: "steps",
						items: [
							"Name the report in the field at the top of the builder, and add a description if it helps. An **Unsaved changes** marker appears next to Save while there is something to keep.",
							"Click **Save report**.",
						],
					},
					{
						type: "paragraph",
						text: "Saved reports live in the **Your reports** list on the Reports page, with their type and when they were last updated. Click one to open it. From an open report, **Edit** reopens the builder and **Duplicate** makes a copy you can change without touching the original. To delete a report, hover its row in the list and click the trash icon; OneTool asks you to confirm first.",
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
				question: "Where is the table that used to sit under my chart?",
				answer: "It moved into Calculated values, in the bar under the chart. Expand it to see every group's value alongside the total.",
			},
			{
				question: "Why can't I pick None (raw rows) on a chart?",
				answer: "A chart needs grouped data to have something to draw. Switch the report type to Table to see individual records instead.",
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
