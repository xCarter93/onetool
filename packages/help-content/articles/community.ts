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
			"themes",
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
						text: "Click **Edit page** to open the editor. It has seven sections, and the Community page tracks how many you have filled in.",
					},
					{
						type: "list",
						items: [
							"**Main Page Settings**: banner image, avatar or logo, page title, page URL, and an SEO description for search engines.",
							"**Design**: pick one of three visual themes, **Clean Professional**, **Bold & Expressive**, or **Warm & Approachable**.",
							"**Business Info**: your name and title, **Licensed**, **Bonded**, and **Insured** badges, year established, license number, certifications, business hours, and social links.",
							"**Bio**: tell visitors who you are and what makes your business different.",
							"**Image Gallery**: up to 5 photos of your work.",
							"**Services**: describe what you offer and where, plus a short **Service list** of the jobs you take on. Those become the options a visitor can pick from on your quote form.",
							"**Pricing**: structured tiers or a free-form pricing write-up. Each tier can list what is included, and you can mark one tier as **Most chosen** to draw the eye to it.",
						],
					},
					{
						type: "tip",
						text: "Already uploaded a logo in your organization profile? Click **Use Organization Logo** instead of uploading it again.",
					},
					{
						type: "note",
						text: "Image limits: the banner and gallery photos can each be up to 5 MB, and the avatar up to 2 MB.",
					},
					{
						type: "tip",
						text: "Click **Preview** at any time to see the page as a visitor would, without publishing anything.",
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
						text: "Each submission creates a task in your workspace named **Follow up:** plus the visitor's name, scheduled for the next business day at 9:00 AM and assigned to an admin. The task description holds everything the visitor entered: their name, email, phone, the service they picked, message, and which page the request came from.",
					},
					{
						type: "note",
						text: "OneTool does not send you an email when a request arrives. Check **Tasks** for new follow-ups, or [build an automation](/help/automations/building-an-automation) that notifies you whenever a task is created.",
					},
				],
			},
			{
				heading: "Follow up on a request",
				blocks: [
					{
						type: "steps",
						items: [
							"Open the task from **Tasks** or your Home calendar.",
							"Reach out to the visitor by email or phone using the details in the task description.",
							"If the conversation turns into real work, [add them as a client](/help/clients/managing-clients) so quotes, projects, and invoices have somewhere to live.",
							"Mark the task complete when you have made contact.",
						],
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
				answer: "No. It creates a follow-up task only. You decide whether to add the person as a client once you have talked to them.",
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
