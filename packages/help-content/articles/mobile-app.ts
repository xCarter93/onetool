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
		keywords: ["ios", "mobile", "phone", "tablet", "apple", "companion", "tab bar", "offline", "no signal", "sync"],
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
						text: "On iPhone, every screen sits inside the same frame: your organization and the Activity, notification and profile buttons along the top, and four tabs along the bottom. Above the tabs is a bar with a search field, the assistant button and a **+** button. The frame stays put while you move around, and a label at the top of the page shows where you are, such as **Work > Client**.",
					},
					{
						type: "list",
						items: [
							"**Today** is your schedule. A week strip picks the date, and a **Day / List** toggle switches views: Day is a timeline of the chosen day (timed work in order with a *Now* marker, plus an all-day band for projects and unscheduled tasks), while List looks ahead two weeks, grouped by day. When your organization has more than one member, a **Me** and **Team** toggle switches between your own work and the whole team's. A strip at the top shows the chosen day's visits, the amount overdue, and the quotes awaiting approval, with anything urgent called out underneath. At the end of the Day view, a card previews the next day; tap it to move there.",
							"**Work** is where you find anything. Type in the search field at the bottom of the screen to search every record: clients (including their contacts and properties), projects, quotes, invoices, and tasks, with results grouped by type. The tabs across the top narrow to one type or browse its full list. Before you search, the screen shows your favorites from the web workspace and the records you've recently opened on this device.",
							"**Money** is your money dashboard. The top of the screen shows what you are owed and how much of it is overdue, then two cells: **Quoted** (quotes waiting on a client) and **Unpaid** (invoices still owed). A chart shows what you've collected over the last six months, with this month's total under it. **Record** opens your invoices so you can pick one to record a payment on, and **New quote** starts a quote. Below that, **Needs attention** lists your overdue invoices and the quotes a client has been sitting on, and **Payments** lists your recent payments. Tap any row to open that record. On iPhone, tapping the **Quoted** or **Unpaid** cell jumps to that list on **Work**; on iPad the cells are read-only, so use the tabs on **Work** to browse.",
							"**Routes** plans the day's stops and gets you from one to the next. See [Planning a route](/help/routing/planning-a-route).",
						],
					},
					{
						type: "paragraph",
						text: "On the other tabs, tapping the search field jumps straight to Work with the field ready to type. The sparkle button next to it opens the AI assistant, available on every plan. On the Free plan the assistant allows 10 messages per day for your organization, and a counter above the message field shows how many are left; the allowance resets at midnight UTC. See [Meet the assistant](/help/ai-assistant/meet-the-assistant).",
					},
				],
			},
			{
				heading: "Create anything with the + button",
				blocks: [
					{
						type: "paragraph",
						text: "The **+** button in the bar above the tabs opens a menu of **New quote**, **New client**, **New task**, and **New project**; you only see the ones your role can create. On iPad, the same menu is behind the **+** next to the assistant bar at the bottom of the screen. Every create opens as a sheet over the screen you were on.",
					},
					{
						type: "list",
						items: [
							"**New project** is built for speed: pick a client, type a title, optionally set a start date, and it's created. If the client isn't in OneTool yet, tap **+ New client** inside the picker to add them with just a name and phone without leaving the form. You can also start a project straight from a client's detail screen.",
							"**New quote** picks a client and creates a draft, then opens it so you can add line items right away.",
							"**New client** asks for the company, a primary contact, and a property, then opens the new client. **New task** saves the task and keeps you where you were, with a short confirmation at the top of the screen.",
							"Clients and projects are unlimited on every plan, so creating from the app is never capped. The Free plan's monthly document send meter applies the same as on the web: the send preview shows how many sends you have left this month and explains when the allowance runs out. Resending an already-sent document is always free.",
						],
					},
				],
			},
			{
				heading: "Send, collect, and share from the Money tab",
				blocks: [
					{
						type: "paragraph",
						text: "You reach a record from the **Money** dashboard rows, or from the **Invoices** and **Quotes** chips on **Work**; tap any row to open the full record. On a detail screen, the main action for the record's status sits at the bottom of the screen, above the tabs. Up to two more sit beside it, and anything further is under the \u2022\u2022\u2022 menu at the top of the record: a draft offers **Send** (with **Mark as sent** under the \u2022\u2022\u2022 menu when you delivered the quote yourself, so no email goes out), a sent quote offers **Get signature** (the client picks who's signing, signs on your screen, and the quote is approved with the signature saved to its approval history; on iPhone the signing area turns sideways on its own, so you keep holding the phone upright, and iPad signs full-width) plus **Resend** and a manual **Mark approved**, an approved quote converts to an invoice in one tap, and a sent or overdue invoice offers **Record payment** and **Share pay link**.",
					},
					{
						type: "list",
						items: [
							"**Sending** shows a preview of the document first, then emails your client a link to review it (and, for invoices, pay it) in their client portal. The client needs portal access and a primary contact email; the buttons explain what's missing if they can't be reached.",
							"**Record payment** logs a cash or check payment on the spot. The amount starts at the remaining balance and can be edited down for deposits and partial payments; the confirm button always shows the exact amount it will record.",
							"**Share pay link** opens the share sheet with the invoice's portal payment link, so a client can pay by card on their own phone while you're standing together.",
							"**Line items** are editable right on the record: tap a row to change its description, quantity, unit, or rate, or tap **Add line item** below the list, and the total updates as you type. Draft quotes edit directly; a sent quote asks to move back to draft first (its portal link pauses until you resend), while invoices stay editable until a payment is recorded.",
							"**Extend valid until** (under the ••• menu on a sent or expired quote) picks a new date without emailing the client, and extending an expired quote makes it available in the portal again.",
						],
					},
				],
			},
			{
				heading: "Working without signal",
				blocks: [
					{
						type: "paragraph",
						text: "The app keeps your day on the phone. Once you've signed in with a connection, you can open the app in a basement or a dead zone and still see **Today**, **Routes**, and the records you've opened, each marked with how old it is. After seven days without a connection, the app hides that saved data until it can check your access again.",
					},
					{
						type: "list",
						items: [
							"Complete or reopen a task, and edit a task's details.",
							"Start a route, mark stops visited or skipped, and finish the route.",
							"Change a project's status or details, or a client's details.",
							"Post in team chat. Attachments need a connection.",
							"Record a cash or check payment.",
							"Get a signature on a sent quote, as long as the phone has the quote's current document. When the app opens with signal, it prepares the documents for your sent quotes automatically.",
						],
					},
					{
						type: "paragraph",
						text: "Anything you change offline is saved on the phone the moment you tap. A status line just above the search bar at the bottom of the screen shows how many changes are waiting. They send by themselves once you're back in range with the app open. If you closed the app, they stay saved on the phone and send the next time you open it. Creating records, sending quotes and invoices, editing line items, uploading files, and planning routes need a connection; the app tells you when you try.",
					},
					{
						type: "paragraph",
						text: "If the same record changed while you were offline, the app doesn't overwrite it. For example, the invoice was paid online or the quote was edited on the web. The status line at the bottom of the screen says how many changes need attention; tap it to open **Sync issues**, which shows what happened and lets you retry a change or mark it handled. A cash payment that couldn't be recorded stays on the phone until you mark it handled.",
					},
					{
						type: "note",
						text: "Signing out with changes that haven't synced asks first, because signing out would discard them.",
					},
				],
			},
			{
				heading: "Photos and documents on a record",
				blocks: [
					{
						type: "paragraph",
						text: "Client and project detail screens each have a **Documents** section for the files that belong to that job. Tap **Upload document** to attach from your photo library, take a photo on the spot, or pick a file from the Files app, and tap any document in the list to open it. Files can be up to 10 MB, and everything you attach in the field shows up on the record in the web workspace too.",
					},
				],
			},
			{
				heading: "A bigger layout on iPad",
				blocks: [
					{
						type: "paragraph",
						text: "On iPad, the app uses the same layout as the web workspace: a sidebar with your organization, the four areas plus **Activity**, and your profile and notifications, next to a page where lists and records sit side by side. The assistant bar and the **+** menu sit at the bottom of the page.",
					},
				],
			},
			{
				heading: "Notifications and team chat",
				blocks: [
					{
						type: "paragraph",
						text: "The bell opens your notifications list, and the app can also push the important ones to your lock screen: **mentions** (a teammate tagged you in team chat), **automation messages** from your workflows, and **payments and approvals** (an invoice was paid or a quote was approved). Team chat lives on every client, project, and quote detail screen, so you can tag a teammate right from the record you are looking at.",
					},
					{
						type: "paragraph",
						text: "To choose which of these reach your lock screen, tap the gear at the top of the notifications list, or open **Notifications** from your profile. Everything starts on, and the toggles only control pushes on your device: your in-app notifications list always shows the full history. If you record a payment or approve a quote yourself, the app celebrates with your team but skips buzzing your own phone.",
					},
				],
			},
			{
				heading: "Your profile",
				blocks: [
					{
						type: "paragraph",
						text: "Tap your avatar to open your profile. On iPhone it sits at the top of the screen; on iPad it's at the bottom of the sidebar. It shows your organization and your role, **Admin** or **Member**, and it is where you find **Sign out**. The organization owner's **Delete account** also deletes the organization.",
					},
					{
						type: "paragraph",
						text: "Your profile is also where you share your community page in person: tap **Share QR code** to open a full-screen code for the page. The screen jumps to full brightness and stays awake so a customer can scan it with their camera, and the buttons below share the code image or save it to Photos for printing. Your community page needs to be published on the web first; see [Your public page](/help/community/your-public-page).",
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
							"If your account has no organization yet, the app asks you to finish setting up your business in the OneTool web app, then sign in here. The only action available on that screen is **Sign out**.",
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
