import type { HelpArticle } from "../types";

export const routingArticles: HelpArticle[] = [
	{
		slug: "planning-a-route",
		title: "Planning a route",
		subtitle: "Turn your day's stops into an optimized driving route on the map.",
		kind: "howto",
		availability: "business",
		permission: "Admins, and members with access to clients.",
		keywords: ["directions", "driving", "map", "stops", "optimize", "gas stations", "navigation"],
		sections: [
			{
				heading: "The Routing page",
				blocks: [
					{
						type: "paragraph",
						text: "Routing turns a day of visits into a drivable plan. You pick a start point, add the stops you need to hit, and OneTool draws the route on a map with drive times between stops.",
					},
					{
						type: "paragraph",
						text: "Open **Routing** in the sidebar. The page has two tabs: **Today** for the route you are driving today, and **Saved routes** for named routes you keep and reuse. The panel on the left holds your stop list and controls, and the map on the right shows the route.",
					},
					{
						type: "paragraph",
						text: "If your organization has more than one member, a selector next to the tabs switches between **My route**, a teammate's route, and **Whole team**, so each person can have their own plan for the day.",
					},
					{
						type: "tip",
						text: "On the **Today** tab, **Plan from schedule** builds the stop list for you from the day's scheduled tasks and projects. Running it again replaces the stops already on the list.",
					},
				],
			},
			{
				heading: "Set your start location",
				blocks: [
					{
						type: "paragraph",
						text: "Every route starts somewhere, usually your shop or home base.",
					},
					{
						type: "steps",
						items: [
							"Under **Start location**, click **Use business address** to start from your business address.",
							"Or type any address and pick it from the suggestions.",
							"Turn on **Return to start (round trip)** if you end the day back where you began.",
						],
					},
				],
			},
			{
				heading: "Add your stops",
				blocks: [
					{
						type: "paragraph",
						text: "Stops can come straight from your client records or from any address you type.",
					},
					{
						type: "steps",
						items: [
							"Click **Client property** to search your clients' service addresses and add one as a stop.",
							"Click **Address** to type any other address, like a supplier or a job site that is not in your client list.",
							"Drag stops to change the order, and remove any stop you do not need.",
						],
					},
					{
						type: "media",
						media: "image",
						caption: "Adding stops from client properties and typed addresses",
					},
					{
						type: "note",
						text: "A route can hold up to 23 stops. A client property only appears in the picker once it has an address, so fill in property addresses first.",
					},
				],
			},
			{
				heading: "Compute the route",
				blocks: [
					{
						type: "paragraph",
						text: "With your stops in place, compute the route to see it drawn on the map with drive times.",
					},
					{
						type: "steps",
						items: [
							"Click **Optimize order** to let OneTool reorder your stops for the shortest overall drive.",
							"Or click **Route as listed** to keep your order and just calculate the drive.",
							"Review the result on the map. A badge shows whether the order is **Optimized** or **Manual order**.",
						],
					},
					{
						type: "media",
						media: "image",
						caption: "An optimized route drawn on the map",
					},
					{
						type: "paragraph",
						text: "If a stop cannot be reached by road, it is flagged in red after computing. Fix the address or remove the stop, then compute again.",
					},
					{
						type: "note",
						text: "On larger routes, roughly a dozen stops or more, OneTool switches to a faster approximate optimization and the badge reads **Optimized (approximate)**. Computing a route also saves your current changes.",
					},
				],
			},
			{
				heading: "Show gas stations along the way",
				blocks: [
					{
						type: "paragraph",
						text: "Once a route is computed, turn on **Gas stations along route** to see stations near your path on the map. Use **Max detour** to control how far off the route a station can be: 5, 10, or 15 minutes.",
					},
				],
			},
		],
		faq: [
			{
				question: "How many stops can a route have?",
				answer: "Up to 23. If Plan from schedule finds more stops than that, it keeps the first 23 and tells you how many were left off.",
			},
			{
				question: "Why is one of my stops flagged as unreachable?",
				answer: "The address could not be reached by road, which usually means it is missing or imprecise. Update the address on the client property or the stop, or remove the stop, then compute the route again.",
			},
			{
				question: "Can I check off stops as I drive?",
				answer: "Yes, on the Today route. Each stop has a checkmark button that marks it visited, and the list shows how many stops you have visited. If the stop is linked to a task, OneTool also offers to mark the task done.",
			},
			{
				question: "Can the assistant plan my route?",
				answer: "Yes. Ask the [assistant](/help/ai-assistant/what-you-can-ask) to build today's route from your schedule, add or remove stops, or optimize the order.",
			},
		],
		related: [
			"routing/saved-routes",
			"clients/contacts-and-properties",
			"projects-and-tasks/working-with-tasks",
		],
	},
	{
		slug: "saved-routes",
		title: "Saved routes",
		subtitle: "Keep the routes you drive often and reuse them for recurring runs.",
		kind: "howto",
		availability: "business",
		permission: "Admins, and members with access to clients.",
		keywords: ["reuse", "recurring", "weekly", "route library", "template", "loop"],
		sections: [
			{
				heading: "Why save a route",
				blocks: [
					{
						type: "paragraph",
						text: "If you drive the same loop every week, like a Thursday mowing run, you should not have to rebuild it every time. Save the route once under a name, then load it onto any day's plan when you need it.",
					},
				],
			},
			{
				heading: "Name and save a route",
				blocks: [
					{
						type: "paragraph",
						text: "Build the route the way you want it first: start location, stops, and order. See [Planning a route](/help/routing/planning-a-route).",
					},
					{
						type: "steps",
						items: [
							"Enter a name in the **Route name** field, something you will recognize later, like Thursday north loop.",
							"Click **Save route**.",
							"The badge next to the name changes from **Not saved yet** to **Saved route**.",
						],
					},
					{
						type: "media",
						media: "image",
						caption: "Naming and saving a route",
					},
					{
						type: "tip",
						text: "Use **New route** to start building a separate route from scratch.",
					},
				],
			},
			{
				heading: "The Saved routes tab",
				blocks: [
					{
						type: "paragraph",
						text: "The **Saved routes** tab lists your saved routes. Pick one to load it into the panel and see it on the map.",
					},
					{
						type: "note",
						text: "Editing a saved route creates an unsaved draft of it. A bar with **Discard** and **Save changes** appears; click **Save changes** to keep your edits. If you switch routes or leave the page without saving, your edits are discarded.",
					},
				],
			},
			{
				heading: "Reuse a saved route for a recurring run",
				blocks: [
					{
						type: "steps",
						items: [
							"Open the **Saved routes** tab and select the route.",
							"Click **Use today**. OneTool copies the route into today's plan on the **Today** tab.",
							"Click **Optimize order** or **Route as listed** to compute it, then drive your day and check off stops as you visit them.",
						],
					},
					{
						type: "note",
						text: "**Use today** works on a copy. Anything you change on today's route, like reordering or removing a stop, leaves the saved original untouched.",
					},
				],
			},
		],
		faq: [
			{
				question: "Does changing today's route change the saved one?",
				answer: "No. Use today makes a copy for the day. The saved route stays exactly as you saved it until you edit it on the Saved routes tab and click Save changes.",
			},
			{
				question: "Do saved routes update with my schedule?",
				answer: "No. A saved route is a fixed list of stops. To build a route from the day's scheduled tasks and projects, use Plan from schedule on the Today tab instead.",
			},
			{
				question: "Can the assistant work with saved routes?",
				answer: "Yes. Ask the [assistant](/help/ai-assistant/what-you-can-ask) to show a saved route by name or to build today's route from one.",
			},
		],
		related: ["routing/planning-a-route", "ai-assistant/what-you-can-ask"],
	},
];
