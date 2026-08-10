import type { HelpArticle } from "../types";

export const communityArticles: HelpArticle[] = [
	{
		slug: "your-public-page",
		title: "Your public community page",
		subtitle: "Claim a free public page for your business, build it out in private, and publish it when it is ready.",
		kind: "howto",
		availability: "all",
		permission: "Admins, and members with access to the community page.",
		keywords: [
			"public page",
			"community",
			"claim",
			"publish",
			"draft",
			"banner",
			"gallery",
			"light mode",
			"dark mode",
			"layout",
			"brand color",
			"accent color",
			"logo color",
			"showcase",
			"storefront",
			"directory",
			"page url",
			"seo",
		],
		sections: [
			{
				heading: "What your community page is",
				blocks: [
					{
						type: "paragraph",
						text: "Your community page is a free public landing page for your business, hosted by OneTool at onetool.biz/communities/your-page-url. It can show a banner, your logo, a bio, a photo gallery, your services and pricing, business hours, credentials, and social links, and it includes a built-in form visitors use to request a quote.",
					},
					{
						type: "note",
						text: "If **Community** appears grayed out in your sidebar with a coming soon message, the feature is not enabled for your organization yet.",
					},
				],
			},
			{
				heading: "Claim your page",
				blocks: [
					{
						type: "steps",
						items: [
							"Go to **Community** in the sidebar.",
							"Enter a **Page title**. It starts as your organization name, and you can change it later.",
							"Pick a **Page URL**. Only lowercase letters, numbers, and hyphens are allowed, and the checker tells you whether your choice is **Available** or **Taken**.",
							"Click **Claim your page**.",
						],
					},
					{
						type: "paragraph",
						text: "Your page starts as a private draft. Nothing is public until you publish, so you can take your time building it out.",
					},
					{
						type: "media",
						media: "image",
						caption: "Claiming a community page with a title and URL",
						asset: "community/your-public-page/claiming-a-community-page-with-a",
					},
				],
			},
			{
				heading: "Build out the sections",
				blocks: [
					{
						type: "paragraph",
						text: "Click **Edit page** to open the editor. It has ten sections, and the Community page tracks how many you have filled in.",
					},
					{
						type: "list",
						items: [
							"**Main Page Settings**: banner image, avatar or logo, page title, page URL, and an SEO description for search engines.",
							"**Design**: three tabs. **Layout** picks the shape of your public page, **Brand** sets light or dark and your accent color, and **Sections** controls the order your public sections appear in, the layout each one uses, and a switch to leave any of them off.",
							"**Business Info**: your name and title, **Licensed**, **Bonded**, and **Insured** badges, year established, license number, certifications, business hours, and social links.",
							"**Bio**: tell visitors who you are and what makes your business different.",
							"**Image Gallery**: up to 5 photos of your work.",
							"**Services**: describe what you offer and where, plus a short **Service list** of the jobs you take on. Those become the options a visitor can pick from on your quote form.",
							"**Pricing**: structured tiers or a free-form pricing write-up. Each tier can list what is included, and you can mark one tier as **Most chosen** to draw the eye to it.",
							"**Common Questions**: up to 12 question-and-answer pairs. Answer what people ask on the phone and they stop having to call to find out.",
							"**Team**: up to 12 people, each with a name and an optional role, short bio, and photo. A visitor deciding who to let into their home is reassured by a face.",
						],
					},
					{
						type: "tip",
						text: "Already uploaded a logo in your organization profile? Click **Use Organization Logo** instead of uploading it again.",
					},
					{
						type: "note",
						text: "Image limits: the banner can be up to 10 MB, gallery photos up to 5 MB each, and the avatar and team photos up to 2 MB.",
					},
					{
						type: "note",
						text: "The **Open today** line on your public page follows the time zone set in your [organization profile](/help/settings-and-team/organization-profile), so an out-of-area visitor still sees your day, not theirs.",
					},
					{
						type: "tip",
						text: "Click **Preview** at any time to see the page as a visitor would, without publishing anything.",
					},
				],
			},
			{
				heading: "Watch the page change as you edit",
				blocks: [
					{
						type: "paragraph",
						text: "On a wide screen the editor shows a **Live preview** beside the form. It updates as you type, and it always shows your draft, including changes you have not saved yet.",
					},
					{
						type: "paragraph",
						text: "Switch between **Desktop** and **Mobile** above the preview to see how the page reflows on a phone. Most visitors arrive on a phone, so it is worth a look before you publish.",
					},
					{
						type: "paragraph",
						text: "If a section is switched on but has nothing in it, the preview shows a note in its place with a button that takes you straight to the field that fills it. Those notes are only in the editor. Visitors never see them, and an empty section simply does not appear on the published page.",
					},
					{
						type: "note",
						text: "On a narrower screen there is no room for the side-by-side preview. Use **Preview** in the header instead, which opens the same page full screen.",
					},
				],
			},
			{
				heading: "Pick the shape of your page",
				blocks: [
					{
						type: "paragraph",
						text: "The **Layout** tab under **Design** offers three shapes. They all use the same content you have already entered, and only the arrangement changes, so you can switch between them and watch the preview to see which suits your business.",
					},
					{
						type: "list",
						items: [
							"**Showcase**: photos of your work lead the page, sitting beside your business name where a visitor sees them first, with the quote form pinned alongside as they read. Best if you have photos of finished jobs.",
							"**Storefront**: your plans come first and the quote form sits above your sections, wide and hard to miss. Best if you sell set plans or price ranges.",
							"**Directory**: a compact listing. Your hours, credentials, service list and area sit at the top next to a **Call** button, and the quote form comes at the end. Best if you have no photos yet.",
						],
					},
					{
						type: "note",
						text: "Showcase is what every page starts as. Switching layouts never deletes anything. A section you have filled in stays filled in, wherever the new layout puts it.",
					},
				],
			},
			{
				heading: "Set your colors",
				blocks: [
					{
						type: "paragraph",
						text: "The **Brand** tab under **Design** sets two things: whether your page is light or dark, and the accent color used for buttons, links and highlights.",
					},
					{
						type: "paragraph",
						text: "Light or dark is your choice, not your visitor's. Everyone who lands on your page sees the one you picked, whatever their own phone is set to.",
					},
					{
						type: "paragraph",
						text: "For the accent, pick one of the eight presets, use the color well to choose your own, or type a hex value such as #00a6f4. If you have uploaded a logo, **Use my logo** reads the main color straight off it.",
					},
					{
						type: "note",
						text: "Colors are shown as they will appear on your page. If the shade you pick would be hard to read on your background, OneTool darkens or lightens it just enough to stay legible, and says so underneath. Your logo, banner and photos are never changed.",
					},
				],
			},
			{
				heading: "Choose what appears, and in what order",
				blocks: [
					{
						type: "paragraph",
						text: "The **Sections** tab under **Design** lists the six sections of your public page: **About us**, **What we do**, **Plans & pricing**, **Our work**, **Common questions**, and **Meet the team**. Drag a row to move it, and use the switch to leave a section off the page entirely.",
					},
					{
						type: "paragraph",
						text: "Two sections offer a choice of layout, shown as buttons under the section name. **Our work** can be a **Carousel**, one large photo at a time, or a **Grid** that shows every photo at once. **Plans & pricing** can be **Cards**, one box per plan with its full feature list, or a **Price list**, one compact row per plan. Pick either and the preview updates straight away.",
					},
					{
						type: "note",
						text: "The pricing layouts describe the plan cards, so they only appear while **Plans & pricing** is set to tiers. A pricing write-up has no layout to choose.",
					},
					{
						type: "note",
						text: "A section only appears once it has something in it. An empty one stays off the page whether or not its switch is on, so you never publish a heading with nothing under it.",
					},
					{
						type: "paragraph",
						text: "The quote request form is always last and cannot be switched off. It is how visitors reach you.",
					},
					{
						type: "tip",
						text: "The jump links at the top of your public page follow the same order, so reordering sections reorders the menu too.",
					},
				],
			},
			{
				heading: "Publish and update",
				blocks: [
					{
						type: "steps",
						items: [
							"While the page is private, **Save Draft** stores your changes without making anything public.",
							"When you are ready, click **Publish**. Your page goes live at its public URL.",
							"Use **Copy link** to share the URL and **View live** to open the public page.",
						],
					},
					{
						type: "note",
						text: "Once the page is live, the save button reads **Save Changes**, and saving pushes your edits straight to the public page. There is no separate publish step for updates.",
					},
					{
						type: "paragraph",
						text: "**Make Private** takes the page offline at any time. Your content is kept, so you can keep editing and publish again later.",
					},
					{
						type: "note",
						text: "Changing your **Page URL** after publishing breaks links to the old address. Anything you have already shared on business cards or social media will stop working, so pick a URL you can keep.",
					},
				],
			},
			{
				heading: "What visitors see",
				blocks: [
					{
						type: "paragraph",
						text: "Visitors see only published content, plus your organization's name, email, phone, and website. Credentials appear as badges: **Licensed**, **Bonded**, and **Insured**, years in business, and your certifications.",
					},
					{
						type: "note",
						text: "Your license number is never shown publicly, even when you enter it in Business Info. Only the credential badges themselves appear on the page.",
					},
					{
						type: "note",
						text: "Published pages can be indexed by search engines, and the **SEO Description** field controls how yours appears in search results. Your page may also be featured in the community showcase on the OneTool website.",
					},
				],
			},
		],
		faq: [
			{
				question: "Does the community page cost anything?",
				answer: "No. It is included on every plan.",
			},
			{
				question: "Who on my team can edit the page?",
				answer: "Admins, and members an admin has granted the community permission in [member permissions](/help/settings-and-team/member-permissions).",
			},
			{
				question: "Can I take my page down?",
				answer: "Yes. Click **Make Private** in the editor. The page goes offline immediately and your content is kept as a draft.",
			},
			{
				question: "Can I change my page URL later?",
				answer: "Yes, as long as the new URL is available. Links to the old address stop working, so share the new one everywhere you posted it.",
			},
		],
		related: [
			"community/capturing-leads",
			"settings-and-team/member-permissions",
			"settings-and-team/organization-profile",
		],
	},
	{
		slug: "capturing-leads",
		title: "Capturing leads from your page",
		subtitle: "Quote requests from visitors become follow-up tasks for your team automatically.",
		kind: "howto",
		availability: "all",
		permission: "Admins, and members with access to the community page and tasks.",
		keywords: [
			"leads",
			"quote request",
			"interest form",
			"follow up",
			"tasks",
			"visitors",
			"requests inbox",
			"add as client",
			"qr code",
			"share",
			"page views",
			"performance",
			"conversion",
		],
		sections: [
			{
				heading: "The quote request form",
				blocks: [
					{
						type: "paragraph",
						text: "Every live community page includes a **Get a Free Quote** form. A visitor enters their name and email, optionally a phone number and a message about their project, and clicks **Request a Quote**. If you have filled in a **Service list** in the Services section, they can also pick which service they need. They see a confirmation that you will get back to them within one business day.",
					},
					{
						type: "media",
						media: "image",
						caption: "The quote request form on a public community page",
						asset: "community/capturing-leads/quote-request-form-on-a-public",
					},
				],
			},
			{
				heading: "Where requests land",
				blocks: [
					{
						type: "paragraph",
						text: "Every submission shows up in two places. It lands in **Requests from your page** at the bottom of your **Community** page, and it also creates a task in your workspace named **Follow up:** plus the visitor's name, scheduled for the next business day at 9:00 AM and assigned to an admin. The task description holds everything the visitor entered: their name, email, phone, the service they picked, message, and which page the request came from.",
					},
					{
						type: "note",
						text: "OneTool does not send you an email when a request arrives. Check the requests list on your Community page or **Tasks** for new follow-ups, or [build an automation](/help/automations/building-an-automation) that notifies you whenever a task is created.",
					},
				],
			},
			{
				heading: "Follow up on a request",
				blocks: [
					{
						type: "paragraph",
						text: "The requests list opens on **New** so you only see what has not been picked up yet. Switch to **All** for the full history.",
					},
					{
						type: "steps",
						items: [
							"Open **Community** and find the request in **Requests from your page**.",
							"Open the **⋯** menu at the end of the row. **Reply by email** opens a message to the address they gave you; the email under their name is a link too.",
							"Use **Add as client** when the conversation turns into real work. That creates a client record with them as the primary contact and moves the request to **Client**.",
							"Use **Send quote** to start a quote. If they are not a client yet, this adds them first, then opens the new quote form.",
							"Mark a request **Contacted** or **Quoted** as you work it, or **Archive** one you are not pursuing.",
						],
					},
				],
			},
			{
				heading: "Reading the numbers",
				blocks: [
					{
						type: "paragraph",
						text: "The **Performance** panel at the top of your Community page covers the last **7**, **30**, or **90** days. **Page views** counts visits to your public page. **Quote requests** counts submissions. **Visit to request** is requests divided by views. **Median first response** is how long a request typically waits before you pick it up, and **N waiting** counts requests still sitting in **New**.",
					},
					{
						type: "note",
						text: "**Median first response** measures the moment you act on a request in OneTool: adding the person as a client, sending a quote, or marking the request **Contacted**. An email you send from your own mail app is invisible to OneTool, so mark the request as you go if you want this number to mean anything.",
					},
					{
						type: "paragraph",
						text: "Views are counted by OneTool itself, not by an outside analytics service. A visit is counted once per browsing session, and repeated hits from the same address are throttled, so the figure is a reasonable count of real visits rather than an exact one.",
					},
				],
			},
			{
				heading: "Share your page",
				blocks: [
					{
						type: "paragraph",
						text: "**QR & share kit** in the page header, and **Share** on the page card, both open the share kit: a QR code you can download as a **PNG** for print or an **SVG** that scales to any size, your page link, and paste-ready wording for a social bio, a post or text message, and an email signature.",
					},
				],
			},
		],
		faq: [
			{
				question: "Will I get an email when someone submits the form?",
				answer: "No. Requests appear as tasks in your workspace. If you want a notification, build an automation that reacts to new tasks.",
			},
			{
				question: "Does a request create a client record?",
				answer: "Not on its own. A request creates an entry in your Requests inbox and a follow-up task. It becomes a client only when you choose **Add as client** (or **Send quote**, which adds them first), so strangers and bots never end up in your client list.",
			},
			{
				question: "What do the request statuses mean?",
				answer: "**New** is untouched. **Contacted** and **Quoted** are yours to set as you work the request. **Client** is set automatically when you add the person as a client. **Archived** hides a request you are not pursuing.",
			},
			{
				question: "What stops spam submissions?",
				answer: "The form has built-in protections that limit repeated submissions, and obvious bot entries are dropped automatically. Some noise can still get through, so treat unexpected requests with normal caution.",
			},
		],
		related: [
			"community/your-public-page",
			"projects-and-tasks/working-with-tasks",
			"automations/building-an-automation",
		],
	},
];
