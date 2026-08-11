import type { HelpArticle } from "../types";

export const mobileAppArticles: HelpArticle[] = [
	{
		slug: "onetool-on-iphone-and-ipad",
		title: "OneTool on iPhone and iPad",
		subtitle: "Run your day from the field with an app that stays in sync with your web workspace.",
		kind: "concept",
		availability: "all",
		heroMedia: {
			media: "image",
			caption: "The Today tab on iPhone",
			asset: "mobile-app/onetool-on-iphone-and-ipad/hero",
		},
		keywords: ["ios", "mobile", "phone", "tablet", "apple", "companion", "tab bar"],
		sections: [
			{
				heading: "A companion for the field",
				blocks: [
					{
						type: "paragraph",
						text: "The OneTool mobile app is an iOS companion to the web workspace, built for the part of your day that happens away from a desk. Check the schedule from the truck, look up a client on site, send a quote from the driveway, and record a payment at the door.",
					},
					{
						type: "paragraph",
						text: "The app uses the same account and organization as the web workspace, so both sides see the same data. A change made in the field shows up for the office, and work scheduled from the office shows up in the field.",
					},
					{
						type: "note",
						text: "The app is sign in only. You create your account and organization on the web first, then sign in on mobile. See [Signing in on mobile](/help/mobile-app/signing-in-on-mobile).",
					},
				],
			},
			{
				heading: "The four tabs",
				blocks: [
					{
						type: "paragraph",
						text: "On iPhone, the app is organized into four tabs along the bottom of the screen, with the assistant button in the center.",
					},
					{
						type: "list",
						items: [
							"**Today** shows your day at a glance: a week strip to pick a date, urgent items called out at the top, your plan for the day in order, and a peek at tomorrow. A **Me** and **Team** toggle switches between your own work and the whole team's. Your organization's activity feed opens from here too.",
							"**Work** is the hub for clients, projects, and tasks.",
							"**Money** holds your invoices and quotes, with an outstanding total up top and a chart of what you've collected recently.",
							"**Routes** plans the day's stops and gets you from one to the next. See [Planning a route](/help/routing/planning-a-route).",
						],
					},
					{
						type: "paragraph",
						text: "The center button opens the AI assistant, a Business plan feature. See [Meet the assistant](/help/ai-assistant/meet-the-assistant).",
					},
				],
			},
			{
				heading: "Send, collect, and share from the Money tab",
				blocks: [
					{
						type: "paragraph",
						text: "The **Money** tab is a combined list with an **Invoices** and **Quotes** toggle; tap any row to open the full record. From a detail screen, the buttons follow the record's status: a draft offers **Send** (with **Mark as sent** under the \u2022\u2022\u2022 menu when you delivered the quote yourself \u2014 no email goes out), a sent quote offers **Mark approved** and **Resend**, an approved quote converts to an invoice in one tap, and a sent or overdue invoice offers **Record payment** and **Share pay link**.",
					},
					{
						type: "list",
						items: [
							"**Sending** shows a preview of the document first, then emails your client a link to review it — and, for invoices, pay it — in their client portal. The client needs portal access and a primary contact email; the buttons explain what's missing if they can't be reached.",
							"**Record payment** logs a cash or check payment on the spot. The amount starts at the remaining balance and can be edited down for deposits and partial payments; the confirm button always shows the exact amount it will record.",
							"**Share pay link** opens the share sheet with the invoice's portal payment link, so a client can pay by card on their own phone while you're standing together.",
						],
					},
				],
			},
			{
				heading: "A bigger layout on iPad",
				blocks: [
					{
						type: "paragraph",
						text: "On iPad, the app replaces the tab bar with a multi-pane layout designed for the larger screen, so you can see more of your workspace at once.",
					},
				],
			},
			{
				heading: "Your profile",
				blocks: [
					{
						type: "paragraph",
						text: "Tap your avatar in the header to open your profile. It shows your organization and your role, **Admin** or **Member**, and it is where you find **Sign Out**. The organization owner also sees account and organization deletion options here.",
					},
				],
			},
		],
		related: [
			"mobile-app/signing-in-on-mobile",
			"routing/planning-a-route",
			"ai-assistant/meet-the-assistant",
		],
	},
	{
		slug: "signing-in-on-mobile",
		title: "Signing in on mobile",
		subtitle: "Sign in with the account you created on the web and pick up right where you left off.",
		kind: "howto",
		availability: "all",
		permission: "Anyone with an existing OneTool account.",
		keywords: ["login", "log in", "sign up", "invitation", "ios", "apple", "teammate"],
		sections: [
			{
				heading: "Web first, then mobile",
				blocks: [
					{
						type: "paragraph",
						text: "The mobile app is sign in only, by design. You cannot create an account or an organization inside the app; both happen on the web. Once your organization exists, the app signs you straight into it.",
					},
					{
						type: "note",
						text: "If you are brand new to OneTool, start with [Set up your organization](/help/getting-started/set-up-your-organization) on the web, then come back to the app.",
					},
				],
			},
			{
				heading: "Sign in",
				blocks: [
					{
						type: "steps",
						items: [
							"Open the OneTool app on your iPhone or iPad.",
							"Sign in with the same account and sign-in method you use on the web.",
							"Land on the **Today** tab with your schedule for the day.",
						],
					},
					{
						type: "media",
						media: "image",
						caption: "The sign-in screen on iPhone",
						asset: "mobile-app/signing-in-on-mobile/sign-in-screen-on-iphone",
					},
				],
			},
			{
				heading: "If you see a finish setup screen",
				blocks: [
					{
						type: "paragraph",
						text: "After you sign in, the app checks that your account belongs to an organization.",
					},
					{
						type: "list",
						items: [
							"If you already belong to an organization, the app activates it for you automatically and opens your workspace.",
							"If your account has no organization yet, the app asks you to finish setting up your business in the OneTool web app, then sign in here. The only action available on that screen is **Sign Out**.",
						],
					},
				],
			},
			{
				heading: "Invited teammates",
				blocks: [
					{
						type: "paragraph",
						text: "If a teammate invited you to their organization, accept the invitation and create your account on the web first. Once you belong to the organization, sign in on mobile with that same account and the app takes you straight to the shared workspace.",
					},
					{
						type: "tip",
						text: "Admins send invitations from the Team tab in organization settings. See [Inviting your team](/help/settings-and-team/inviting-your-team).",
					},
				],
			},
		],
		faq: [
			{
				question: "Can I create my account in the app?",
				answer: "No. Account and organization creation are web only. Sign up on the web, complete the setup wizard, then sign in on mobile with the same account.",
			},
			{
				question: "Why does the app tell me to finish setting up my business?",
				answer: "Your account is not part of an organization yet. Complete the setup wizard in the web app, then sign in on mobile again.",
			},
			{
				question: "Can I use Sign in with Apple?",
				answer: "Yes. Use whatever sign-in method you used when you created your account on the web, and you will land in the same organization.",
			},
		],
		related: [
			"mobile-app/onetool-on-iphone-and-ipad",
			"getting-started/set-up-your-organization",
			"settings-and-team/inviting-your-team",
		],
	},
];
