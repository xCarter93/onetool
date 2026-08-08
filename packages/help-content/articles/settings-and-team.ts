import type { HelpArticle } from "../types";

export const settingsAndTeamArticles: HelpArticle[] = [
	{
		slug: "organization-profile",
		title: "Your organization profile",
		subtitle: "Keep your branding and business details accurate everywhere clients see them.",
		kind: "howto",
		availability: "all",
		permission: "Admins and the organization owner; some settings are owner only.",
		keywords: ["settings", "branding", "logo", "company details", "address", "timezone", "letterhead"],
		sections: [
			{
				heading: "One place for your settings",
				blocks: [
					{
						type: "paragraph",
						text: "Organization settings is where you manage everything about your business itself, as opposed to the work you do. It is organized into tabs along the left side:",
					},
					{
						type: "list",
						items: [
							"**Overview** holds your organization name, logo, and team roster.",
							"**Team** is where you invite people and manage their access.",
							"**Business Info** holds your contact details and address.",
							"**Billing** shows your plan and subscription.",
							"**Payments** manages your Stripe account, payouts, and disputes. It appears once Stripe setup has been started.",
							"**Documents** stores organization files for quotes and invoices.",
							"**SKUs** holds your reusable products and services.",
							"**Integrations** connects QuickBooks Online and starts your Stripe payments setup.",
						],
					},
					{
						type: "media",
						media: "image",
						caption: "The organization settings tabs",
						asset: "settings-and-team/organization-profile/organization-settings-tabs",
					},
					{
						type: "note",
						text: "Some tabs are locked depending on your role and plan. The **Team**, **Payments**, and **Integrations** tabs are for admins and the owner, and **Payments**, **Documents**, **SKUs**, and **Integrations** require the Business plan.",
					},
				],
			},
			{
				heading: "Name and logo",
				blocks: [
					{
						type: "paragraph",
						text: "The **Overview** tab covers your identity. Your organization name and logo appear on quotes, invoices, and your client portal, so they are worth getting right early.",
					},
					{
						type: "steps",
						items: [
							"Open your organization settings and stay on the **Overview** tab.",
							"Edit your organization name, or upload a logo image (PNG, JPG, or WEBP up to 10 MB; SVG isn't supported).",
							"Save your changes with the footer at the bottom of the page. It reads **Unsaved changes** until you do.",
						],
					},
					{
						type: "note",
						text: "Uploading or replacing the logo is limited to the organization owner.",
					},
				],
			},
			{
				heading: "Business contact details",
				blocks: [
					{
						type: "paragraph",
						text: "The **Business Info** tab collects the details that appear on your client-facing documents: business email, phone number, website, and your full address. Start typing the address and pick it from the suggestions. You can also set your company size and your timezone here.",
					},
					{
						type: "paragraph",
						text: "If your logo uses dark colors, turn on **Invert logo colors in dark mode**. A live preview shows how your letterhead will look on quotes and invoices in both light and dark themes, so you can check it before saving.",
					},
					{
						type: "media",
						media: "image",
						caption: "The Business Info tab with the logo preview",
						asset: "settings-and-team/organization-profile/business-info-tab-with-the-logo",
					},
					{
						type: "note",
						text: "Only the organization owner can edit Business Info. Admins can see the tab, but the fields are read only for them.",
					},
				],
			},
			{
				heading: "Celebrations",
				blocks: [
					{
						type: "paragraph",
						text: "Further down the **Business Info** tab, **Celebrate wins** controls whether OneTool shows a confetti toast when a quote is approved or an invoice is paid. It is on by default, and you can turn it off if you would rather keep things quiet.",
					},
					{
						type: "paragraph",
						text: "**Who sees celebrations** decides who the toast reaches. **Admins only** is the default. Choose **Entire team** to share the moment with everyone; team members see a generic message without the client name or dollar amount.",
					},
					{
						type: "note",
						text: "Like the rest of Business Info, these settings are owner only. They save with the footer at the bottom of the page.",
					},
				],
			},
			{
				heading: "Your OneTool email address",
				blocks: [
					{
						type: "paragraph",
						text: "Also on the **Business Info** tab is your organization's OneTool email address: the address clients see when you send quotes, invoices, and messages, and the one their replies come back to. Every organization starts with an automatically generated address ending in **@inbound.onetool.biz**; you can replace the part before the @ with something recognizable, like your business name.",
					},
					{
						type: "paragraph",
						text: "Addresses use lowercase letters, numbers, and hyphens (3 to 24 characters), and must be unique across OneTool. As you type, a check mark or cross shows whether the name is available.",
					},
					{
						type: "note",
						text: "Changing the address takes effect immediately and the old address stops working, so replies to email threads you sent from the old address will no longer reach your inbox. OneTool asks you to confirm before the change is saved.",
					},
				],
			},
			{
				heading: "Integrations",
				blocks: [
					{
						type: "paragraph",
						text: "The **Integrations** tab is available on the Business plan to organization admins. It lists one card per integration, and it is where the organization owner connects a QuickBooks Online company, which prepares your account for QuickBooks sync of clients, invoices, and payments from OneTool.",
					},
					{
						type: "paragraph",
						text: "Once a company is connected, the QuickBooks card shows which company you are linked to and lets the owner choose when invoices are sent to QuickBooks, whether payments are included, and whether duplicate names are resolved automatically. **Disconnect QuickBooks** stops syncing and revokes OneTool's access; records already in QuickBooks stay there.",
					},
					{
						type: "paragraph",
						text: "Right after the first connection the QuickBooks card shows a **Setup incomplete** badge and a **Finish setup** button. Setup asks the owner to pick the income account that synced invoices should post to, and it confirms which account payments will be recorded to. Clients start syncing right away, but invoices and payments wait until setup is finished; once it is, anything waiting in the queue syncs shortly after, and the card lists the income account it posts to.",
					},
					{
						type: "paragraph",
						text: "If a record cannot reach QuickBooks, a **Sync issues** section appears below the cards listing each failed client, invoice, or payment with the reason QuickBooks gave, how many attempts were made, and when it last failed. **Retry** queues one record again, **Ignore** stops tracking that record, and **Retry all** queues every failed record at once. The section disappears when there is nothing left to fix.",
					},
					{
						type: "paragraph",
						text: "The **Stripe payments** card on the same tab is where online payments start. **Set up payments** sends the owner to Stripe's hosted onboarding, and the card shows whether setup is still incomplete or charges and payouts are enabled. Once setup has been started, a separate **Payments** tab appears in settings for payouts, disputes, and account details, and **Open Payments** on the card takes you there.",
					},
					{
						type: "note",
						text: "Connecting, changing sync settings, and disconnecting are limited to the organization owner. Other admins can see the tab.",
					},
				],
			},
			{
				heading: "Leaving or deleting the organization",
				blocks: [
					{
						type: "paragraph",
						text: "At the bottom of the **Overview** tab, anyone can use **Leave organization** to remove themselves. **Delete organization** is an admin action that removes the organization for everyone, and it asks you to re-verify your identity first. Deleting is permanent, so treat it as a last resort. After you leave or delete, OneTool switches you to another organization you belong to, or takes you to the setup screen to create a new one.",
					},
				],
			},
		],
		faq: [
			{
				question: "Where do these details show up?",
				answer: "Your name, logo, and business contact details appear on quotes, invoices, and the client portal. Keeping them current means every document you send looks professional without extra work.",
			},
			{
				question: "Why can't I edit Business Info as an admin?",
				answer: "Business Info is limited to the organization owner, the person who originally created the organization. Admins can view the tab but cannot change it.",
			},
			{
				question: "I already filled this in during setup. Do I need to do it again?",
				answer: "No. The setup wizard saves everything here. Come back to this page only when something changes, like a new phone number or a new logo.",
			},
		],
		related: [
			"getting-started/set-up-your-organization",
			"settings-and-team/inviting-your-team",
			"settings-and-team/plans-and-billing",
		],
	},
	{
		slug: "inviting-your-team",
		title: "Inviting your team",
		subtitle: "Bring your teammates into the workspace with the right role from day one.",
		kind: "howto",
		availability: "all",
		permission: "Admins and the organization owner.",
		keywords: ["invite", "teammates", "roles", "add user", "remove member", "employees", "staff"],
		sections: [
			{
				heading: "The two roles",
				blocks: [
					{
						type: "paragraph",
						text: "Everyone in your organization is either an Admin or a Member. Admins have full access to everything: all business data, organization settings, the team, and billing. They land on the Home dashboard when they sign in.",
					},
					{
						type: "paragraph",
						text: "Members are for your field team. A new member starts with access to the projects and tasks assigned to them and nothing else, and lands on Projects when they sign in. You can widen a member's access area by area, which is covered in [Member permissions](/help/settings-and-team/member-permissions).",
					},
				],
			},
			{
				heading: "Send an invitation",
				blocks: [
					{
						type: "steps",
						items: [
							"Open your organization settings and select the **Team** tab.",
							"Enter your teammate's email address.",
							"Pick a role from the dropdown: **Member** or **Admin**.",
							"Click **Send invite**.",
						],
					},
					{
						type: "media",
						media: "image",
						caption: "The Team tab with the invite form",
						asset: "settings-and-team/inviting-your-team/team-tab-with-the-invite-form",
					},
					{
						type: "paragraph",
						text: "Pending invitations appear in a list with a role badge. If you sent one by mistake, revoke it with the trash button next to it. Once your teammate accepts and signs in, they appear on the roster.",
					},
				],
			},
			{
				heading: "Change roles and remove members",
				blocks: [
					{
						type: "paragraph",
						text: "On the roster, change any member's role with the dropdown in the Role column. To remove someone, use the trash icon on their row. Removal asks you to confirm, because the person loses access immediately.",
					},
					{
						type: "note",
						text: "The organization owner's row is locked and shows an **Owner** badge. Not even an admin can change or remove the owner. You also cannot change your own role from the roster.",
					},
					{
						type: "note",
						text: "You cannot demote the last remaining admin to member. Every organization needs at least one admin, so promote someone else first.",
					},
				],
			},
		],
		faq: [
			{
				question: "What can a brand-new member see?",
				answer: "Only the projects and tasks assigned to them. Everything else, like clients, quotes, and invoices, stays out of reach until an admin grants access from the member's access page.",
			},
			{
				question: "Can I change someone's role later?",
				answer: "Yes. Use the Role dropdown on their roster row, or open their access page and switch the role there. Switching an admin back to member restores the custom permissions they had before.",
			},
			{
				question: "Can I cancel an invitation I already sent?",
				answer: "Yes. Pending invitations are listed on the Team tab until they are accepted, and each one has a revoke button.",
			},
		],
		related: [
			"settings-and-team/member-permissions",
			"projects-and-tasks/assigning-work-to-your-team",
			"settings-and-team/organization-profile",
		],
	},
	{
		slug: "member-permissions",
		title: "Member permissions",
		subtitle: "Give each member exactly the access their job needs, no more and no less.",
		kind: "howto",
		availability: "all",
		permission: "Admins and the organization owner.",
		keywords: ["access", "roles", "view only", "restrict", "assigned", "manage access", "granular"],
		sections: [
			{
				heading: "How access levels work",
				blocks: [
					{
						type: "paragraph",
						text: "Instead of an all-or-nothing role, each member gets a per-area access level across the app: Clients, Projects, Tasks, Quotes, Invoices, and more, all the way to Automations, Reports, Inbox, and Billing.",
					},
					{
						type: "list",
						items: [
							"**View** lets them open and read records in that area.",
							"**Modify** lets them create and edit. It includes View.",
							"**Delete** lets them remove records. It includes Modify and View.",
							"**All records** widens their reach from just the records connected to them (assigned to them, or reached through their projects) to everything in that area.",
						],
					},
					{
						type: "paragraph",
						text: "New members start with modify access to the projects and tasks assigned to them, and nothing else. Admins and the owner always have full access to everything, so permissions only apply to members.",
					},
				],
			},
			{
				heading: "Open the access editor",
				blocks: [
					{
						type: "steps",
						items: [
							"Open your organization settings and select the **Team** tab.",
							"Click **Manage access** on the member's row.",
						],
					},
					{
						type: "paragraph",
						text: "The editor shows a row for each area with View, Modify, Delete, and **All records** switches. Three master toggles at the top, **View all data**, **Modify all data**, and **Delete all data**, flip a whole column at once when you want to move fast.",
					},
					{
						type: "media",
						media: "image",
						caption: "The per-member access editor",
						asset: "settings-and-team/member-permissions/per-member-access-editor",
					},
					{
						type: "note",
						text: "Nothing changes until you click **Save changes** in the footer. Use **Discard** to throw away edits you have not saved.",
					},
				],
			},
			{
				heading: "Example: view access to clients",
				blocks: [
					{
						type: "paragraph",
						text: "Say a field tech needs to look up client details on site but should not edit them.",
					},
					{
						type: "steps",
						items: [
							"Open the member's access editor from the **Team** tab.",
							"Find the **Clients** row and turn on **View**.",
							"Turn on **All records** if they should see every client, or leave it off to limit them to clients connected to their own work.",
							"Click **Save changes**.",
						],
					},
					{
						type: "tip",
						text: "The roster shows a Custom badge on members with tailored access, so you can see at a glance who has been granted more than the default.",
					},
				],
			},
			{
				heading: "Granting broad access",
				blocks: [
					{
						type: "paragraph",
						text: "Turning on **Delete all data** asks you to confirm, because it gives that member admin-level reach over your data without the admin role. If someone needs that much access, consider making them an admin instead. You can switch their role right from the same page.",
					},
				],
			},
		],
		faq: [
			{
				question: "Why can't I edit an admin's permissions?",
				answer: "Admins always have full access, so the editor hides the access matrix for them. Switch them to member first if you want to limit what they can do.",
			},
			{
				question: "Can I make someone read only?",
				answer: "Yes. Give them View in each area they need, and leave Modify and Delete off. They can open records but not change them.",
			},
			{
				question: "Do changes apply immediately?",
				answer: "They apply as soon as you click Save changes. Toggling switches without saving does nothing, and Discard returns everything to the last saved state.",
			},
		],
		related: [
			"settings-and-team/inviting-your-team",
			"projects-and-tasks/assigning-work-to-your-team",
			"getting-started/navigating-the-workspace",
		],
	},
	{
		slug: "plans-and-billing",
		title: "Plans and billing",
		subtitle: "Understand what each plan includes and manage your subscription in one tab.",
		kind: "howto",
		availability: "all",
		permission: "Admins and the organization owner; members need billing access.",
		keywords: ["upgrade", "subscription", "free plan", "business plan", "pricing", "annual", "limits"],
		sections: [
			{
				heading: "Where billing lives",
				blocks: [
					{
						type: "paragraph",
						text: "Open your organization settings and select the **Billing** tab. A badge at the top shows whether you are on the **Free plan** or the **Business plan**. On the Free plan, usage meters show how many of your included clients and monthly e-signatures you have used.",
					},
					{
						type: "paragraph",
						text: "On the Free plan the same meters also sit in a small card at the bottom of the sidebar, so you can keep an eye on your limits from any page. Its Upgrade button takes you straight to the Billing tab.",
					},
				],
			},
			{
				heading: "Free vs Business",
				blocks: [
					{
						type: "paragraph",
						text: "The Free plan covers the core loop: clients, projects, tasks, quotes, and invoices. It includes up to 10 clients and 5 e-signature sends per month.",
					},
					{
						type: "paragraph",
						text: "The Business plan removes the client limit, makes e-signatures unlimited, and adds the features built for a growing operation:",
					},
					{
						type: "list",
						items: [
							"[Online payments](/help/settings-and-team/setting-up-online-payments), so clients pay invoices by card.",
							"[Client import](/help/clients/importing-clients) from a CSV file.",
							"[Documents and SKUs](/help/settings-and-team/documents-and-skus) for reusable files and line items.",
							"[Automations](/help/automations) that handle repetitive follow-up for you.",
							"The [AI assistant](/help/ai-assistant), available on every page.",
							"[Routing](/help/routing) to plan efficient driving days.",
						],
					},
					{
						type: "paragraph",
						text: "The Billing tab shows the full comparison side by side, with a **Monthly** and **Annual** price toggle.",
					},
				],
			},
			{
				heading: "Upgrade to Business",
				blocks: [
					{
						type: "steps",
						items: [
							"Open the **Billing** tab.",
							"Use the **Monthly** and **Annual** toggle to compare prices.",
							"Click **Upgrade to Business** and complete checkout in the drawer that opens.",
						],
					},
					{
						type: "media",
						media: "image",
						caption: "The Billing tab with the plan comparison",
						asset: "settings-and-team/plans-and-billing/billing-tab-with-the-plan-comparison",
					},
					{
						type: "paragraph",
						text: "Once you are subscribed, the button becomes **Manage subscription**, which opens your subscription details so you can review or change it.",
					},
				],
			},
			{
				heading: "Who can see and change billing",
				blocks: [
					{
						type: "paragraph",
						text: "Admins and the owner always have billing access. A member needs billing view access to see the tab at all, and billing modify access to upgrade or manage the subscription. With view access only, the member sees a note to ask an admin to upgrade instead of a checkout button. Access is granted per member in [Member permissions](/help/settings-and-team/member-permissions).",
					},
				],
			},
		],
		faq: [
			{
				question: "What happens when I hit a Free plan limit?",
				answer: "OneTool tells you at the moment it matters. For example, trying to send an e-signature past the monthly cap shows a notice with a View plans link that brings you to the Billing tab.",
			},
			{
				question: "Do I need the Business plan to take card payments?",
				answer: "Yes. Online payments through the client portal are a Business plan feature. Recording cash and check payments by hand works on any plan.",
			},
			{
				question: "Can I switch between monthly and annual billing?",
				answer: "The comparison table shows both prices with a toggle before you subscribe. Once subscribed, open Manage subscription on the Billing tab to review your plan details.",
			},
		],
		related: [
			"settings-and-team/setting-up-online-payments",
			"clients/importing-clients",
			"settings-and-team/organization-profile",
		],
	},
	{
		slug: "setting-up-online-payments",
		title: "Setting up online payments",
		subtitle: "Connect Stripe once and let clients pay invoices by card in their portal.",
		kind: "howto",
		availability: "business",
		permission: "The organization owner.",
		keywords: ["stripe", "payouts", "bank account", "card payments", "disputes", "chargeback", "onboarding"],
		sections: [
			{
				heading: "How payments work",
				blocks: [
					{
						type: "paragraph",
						text: "OneTool collects card payments through Stripe, connected to your own Stripe account. When a client pays an invoice in their portal, the money goes to your Stripe account and pays out to your own bank account. Stripe handles identity verification and card processing, and you manage everything from inside OneTool.",
					},
					{
						type: "note",
						text: "Only the organization owner can set up and manage payments. Admins who open the **Payments** tab see a message that only the organization owner can manage payments.",
					},
				],
			},
			{
				heading: "Connect your account",
				blocks: [
					{
						type: "steps",
						items: [
							"Open your organization settings and select the **Integrations** tab.",
							"On the **Stripe payments** card, click **Set up payments**. If you have already started, the button reads **Finish setup**.",
							"Follow Stripe's guided onboarding to enter your business details and the bank account for payouts.",
							"Return to OneTool when Stripe finishes. A **Payments** tab now appears in settings and shows your progress.",
						],
					},
					{
						type: "media",
						media: "image",
						caption: "The Payments tab before onboarding",
						asset: "settings-and-team/setting-up-online-payments/payments-tab-before-onboarding",
					},
					{
						type: "paragraph",
						text: "If you stop partway, come back and click **Finish setup** on the Stripe payments card, or **Continue onboarding** on the Payments tab, to pick up where you left off. Use **Refresh status** on the Payments tab any time to pull the latest state from Stripe.",
					},
				],
			},
			{
				heading: "Reading your status",
				blocks: [
					{
						type: "paragraph",
						text: "The tab tracks three checks from Stripe: **Details submitted**, **Charges enabled**, and **Payouts enabled**, each shown as Yes or Pending. Charges enabled is the one that matters most to your clients. Once it is Yes, invoices in the portal show a Pay button. Until then, clients see a note that online payment is not yet available.",
					},
					{
						type: "paragraph",
						text: "When everything is verified, the header reads **Payments active** with an **Active** pill. A **Restricted** pill means Stripe still needs something from you. The onboarding requirements panel shows how many items are outstanding, and **Continue onboarding** takes you to them.",
					},
				],
			},
			{
				heading: "Payouts, disputes, and account details",
				blocks: [
					{
						type: "paragraph",
						text: "Once setup is complete, three panels on the Payments tab give you Stripe's own management tools without leaving OneTool:",
					},
					{
						type: "list",
						items: [
							"**Payouts** shows your payout schedule and history.",
							"**Disputes** is where you respond to chargebacks. Submit evidence, accept the dispute, or refund the payment to resolve it.",
							"**Account details** updates the business and verification details Stripe has on file.",
						],
					},
					{
						type: "note",
						text: "These panels appear only after onboarding is fully complete. While your account is still under review, finish onboarding first.",
					},
				],
			},
		],
		faq: [
			{
				question: "Where does the money go?",
				answer: "Directly to your own Stripe account, which pays out to the bank account you set during onboarding. Manage the payout schedule from the Payouts panel on the Payments tab.",
			},
			{
				question: "Why does my account show Restricted?",
				answer: "Stripe needs more information to verify your business. Click Continue onboarding and complete the outstanding items listed in the onboarding requirements panel, then Refresh status.",
			},
			{
				question: "Can an admin set this up for me?",
				answer: "No. Payments setup and management are limited to the organization owner, since the Stripe account is tied to your business and its bank account.",
			},
			{
				question: "What do my clients see before setup is done?",
				answer: "Invoices still appear in the portal, but instead of a Pay button clients see a note that online payment is not yet available and to reach out to pay another way.",
			},
		],
		related: [
			"invoices-and-payments/getting-paid",
			"invoices-and-payments/refunds-and-disputes",
			"settings-and-team/plans-and-billing",
		],
	},
	{
		slug: "documents-and-skus",
		title: "Documents and SKUs",
		subtitle: "Keep reusable files and line items on hand so quotes come together faster.",
		kind: "howto",
		availability: "business",
		permission: "Admins and the organization owner; members need access from an admin.",
		keywords: ["files", "attachments", "catalog", "products", "services", "line items", "insurance"],
		sections: [
			{
				heading: "Two reusable libraries",
				blocks: [
					{
						type: "paragraph",
						text: "Organization settings includes two libraries that save you from redoing the same work on every quote. The **Documents** tab stores organization files you attach to quotes and invoices. The **SKUs** tab stores the products and services you sell, ready to drop into any quote as line items.",
					},
					{
						type: "note",
						text: "Both are Business plan features. On the Free plan the tabs are locked, and opening one shows a prompt to upgrade.",
					},
				],
			},
			{
				heading: "The Documents library",
				blocks: [
					{
						type: "paragraph",
						text: "Documents is a library for the files your business sends out again and again, like proof of insurance or a license. Instead of hunting for the right file each time, upload it once and attach it to quotes and invoices from the library.",
					},
					{
						type: "steps",
						items: [
							"Open your organization settings and select the **Documents** tab.",
							"Upload the files you want to keep on hand.",
							"Attach them to a quote or invoice when you build it.",
						],
					},
				],
			},
			{
				heading: "The SKU catalog",
				blocks: [
					{
						type: "paragraph",
						text: "A SKU is a product or service you sell at a standard rate, like a mowing visit, a deep clean, or a service call. Building your catalog once means every quote after that is faster to write and consistently priced.",
					},
					{
						type: "steps",
						items: [
							"Open your organization settings and select the **SKUs** tab.",
							"Add each product or service you quote regularly.",
							"When building a quote, pull the SKU in as a line item instead of retyping it.",
						],
					},
					{
						type: "media",
						media: "image",
						caption: "The SKU catalog in organization settings",
						asset: "settings-and-team/documents-and-skus/sku-catalog-in-organization-settings",
					},
					{
						type: "tip",
						text: "Start with your five most common services. Even a small catalog removes most of the retyping from quoting.",
					},
				],
			},
		],
		faq: [
			{
				question: "Can members manage documents and SKUs?",
				answer: "Yes, if an admin grants them access to those areas in the member's access editor. Otherwise these libraries are managed by admins and the owner.",
			},
			{
				question: "Does editing a SKU change quotes I already sent?",
				answer: "A SKU is a starting point for a line item. Adjust the details on the quote itself when a specific job needs a different rate or description.",
			},
			{
				question: "Why can't I see these tabs?",
				answer: "Documents and SKUs require the Business plan. On the Free plan the tabs are locked, and you can upgrade from the Billing tab.",
			},
		],
		related: [
			"quotes/creating-a-quote",
			"invoices-and-payments/creating-an-invoice",
			"settings-and-team/plans-and-billing",
		],
	},
];
