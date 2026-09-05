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
						text: "Some tabs are locked depending on your role. The **Team**, **Payments**, and **Integrations** tabs are for admins and the owner. Everything on them works on any plan except QuickBooks sync, which needs the Business plan.",
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
						text: "The **Integrations** tab is available to organization admins on any plan. It lists one card per integration: **Stripe payments**, which works on every plan, and **QuickBooks Online**, which needs the Business plan. It is where the organization owner connects a QuickBooks Online company, which prepares your account for QuickBooks sync of clients, invoices, and payments from OneTool.",
					},
					{
						type: "paragraph",
						text: "Once a company is connected, the QuickBooks card shows which company you are linked to and lets the owner choose when invoices are sent to QuickBooks, whether payments are included, and whether duplicate names are resolved automatically. Cancelling an invoice that already synced voids it in QuickBooks rather than deleting it. **Disconnect QuickBooks** stops syncing and revokes OneTool's access; records already in QuickBooks stay there.",
					},
					{
						type: "paragraph",
						text: "Right after the first connection the QuickBooks card shows a **Setup incomplete** badge and a **Finish setup** button. Setup asks the owner to pick the income account that synced invoices should post to, and it confirms which account payments will be recorded to. That account is used for every item OneTool creates in QuickBooks: one item per line-item SKU, plus a fallback **OneTool Service** item for lines without a SKU. A SKU's item is created the first time it is invoiced, and it is renamed in QuickBooks when you rename the SKU in OneTool. Clients start syncing right away, but invoices and payments wait until setup is finished; once it is, anything waiting in the queue syncs shortly after, and the card lists the income account it posts to. Payments are recorded to your QuickBooks company's Undeposited Funds account; if the company has no such account, payment syncs appear under **Sync issues** until one exists, while invoices keep syncing.",
					},
					{
						type: "paragraph",
						text: "Once setup is finished, OneTool offers to import the customers already in your QuickBooks company. **Import customers** on the QuickBooks card fetches them in the background, so you can close the dialog while it runs. Nothing is created yet: the fetch only works out a plan. A QuickBooks customer whose name matches one of your clients is proposed as a link to that client, a customer with no match is proposed as a new client, a customer that matches more than one client is marked as needing review, and sub-customers with an address come in as job-site properties on their parent's client. Imported addresses are placed on the map automatically.",
					},
					{
						type: "paragraph",
						text: "When the fetch finishes the card reads **Review import** and takes you to the review page, which lists every customer with what will happen to it. You can change any of them: search for a different client to link to, import a customer as a new client, or choose not to import it at all. Customers under **Needs review** have to be decided before you can continue. **Import** applies the plan and shows its progress, and **Discard** throws the plan away without creating anything. Nothing is written to your clients, and nothing is pushed to QuickBooks, until you click Import. You can run the import again at any time from the same card: customers that are already linked stay as they are, and only new or unmatched customers come up for review.",
					},
					{
						type: "paragraph",
						text: "If you need to point OneTool at a different QuickBooks company, **Reset & connect** clears every sync link to the old company and sends the owner back to QuickBooks to pick a new one. Your OneTool records are untouched and nothing is deleted in QuickBooks, but sync history cannot be relinked automatically afterwards.",
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
			"settings-and-team/quickbooks-sync",
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
					{
						type: "paragraph",
						text: "The Free plan includes 5 team members and the Business plan includes 20, counting yourself. Pending invitations hold a seat, and at the cap the invite form tells you before anything is sent. Upgrade from the **Billing** tab to raise the allowance, covered in [Plans and billing](/help/settings-and-team/plans-and-billing).",
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
			{
				question: "How many people can I invite?",
				answer: "The Free plan includes 5 team members and the Business plan includes 20, counting yourself. Members and pending invitations both count toward the limit, and at the cap the Team tab blocks new invitations until a seat frees up. Upgrade from the Billing tab to raise the allowance.",
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
						text: "Open your organization settings and select the **Billing** tab. A badge at the top shows whether you are on the **Free plan** or the **Business plan**. On the Free plan, usage meters show how many document sends, e-signatures, daily assistant messages, saved reports, and imported rows you have used.",
					},
					{
						type: "paragraph",
						text: "On the Free plan your top three meters, document sends, e-signatures, and today's assistant messages, also sit in a small card at the bottom of the sidebar; the Billing tab shows all five. Its Upgrade button takes you straight to the Billing tab. During your 14-day Business trial the desktop header shows a countdown pill with the days left instead, and the meter card appears when the trial ends.",
					},
				],
			},
			{
				heading: "Free vs Business",
				blocks: [
					{
						type: "paragraph",
						text: "The Free plan covers the core loop with unlimited clients and unlimited active projects. It includes 5 team members, 20 document sends per month, 5 e-signatures per month, 10 AI assistant messages per day, 5 saved reports, and 2,000 CSV import rows in total. Online payments through Stripe are included too.",
					},
					{
						type: "paragraph",
						text: "Every new organization also starts on a 14-day Business trial, with no credit card and nothing to cancel. When it ends you continue on Free with all of your data intact. [Limits and fair use](/help/settings-and-team/limits-and-fair-use) walks through each meter in detail, including the 10 bonus document sends you get in any month where you collect a Stripe payment.",
					},
					{
						type: "paragraph",
						text: "The Business plan lifts every usage meter, raises your team from 5 seats to 20, and adds the features built for a growing operation:",
					},
					{
						type: "list",
						items: [
							"[Automations](/help/automations) that handle repetitive follow-up for you.",
							"[Routing](/help/routing) to plan efficient driving days.",
							"[QuickBooks sync](/help/settings-and-team/quickbooks-sync) for your clients, invoices, and payments.",
							"[AI report generation](/help/reports), so you can describe a report and have it built for you.",
							"Removing the OneTool badge from your client portal.",
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
							"Click **Upgrade to Business** (labeled **Subscribe to Business** while your trial is running) and complete checkout in the drawer that opens.",
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
					{
						type: "paragraph",
						text: "Through November 23, 2026, a launch offer appears on the Billing tab: a promo code for 20% off your first year on the annual plan, or 50% off your first 3 months on monthly. Click the code to copy it, then enter it at checkout under **Add promo code**.",
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
				answer: "OneTool tells you at the moment it matters. Sending a quote or invoice past the 20 monthly document sends, a sixth e-signature, an eleventh assistant message in a day, a sixth saved report, or importing past 2,000 rows all show a notice naming the limit you reached. The e-signature notice includes a View plans button, and the Billing tab is always one click away for the rest. Adding a team member past the seat limit is blocked on the Team tab before the invitation goes out.",
			},
			{
				question: "Can my clients pay online?",
				answer: "Yes, on every plan, including Free. Connect Stripe once from the Integrations tab and clients pay by card from the portal, with the money landing in your own Stripe account. Recording cash and check payments by hand also works on any plan.",
			},
			{
				question: "Can I switch between monthly and annual billing?",
				answer: "The comparison table shows both prices with a toggle before you subscribe. Once subscribed, open Manage subscription on the Billing tab to review your plan details.",
			},
			{
				question: "What happens if I cancel my subscription?",
				answer: "You can cancel any time from Manage subscription on the Billing tab. Your organization keeps Business until the end of the billing period you already paid for, then continues on the Free plan with all of its data intact. Subscription fees are not refunded, so cancelling an annual plan three months in leaves you nine more months of Business rather than money back. We correct genuine billing errors, and consumers in the EU may have a 14 day withdrawal right on a first purchase, depending on local consumer law.",
			},
		],
		related: [
			"settings-and-team/setting-up-online-payments",
			"clients/importing-clients",
			"settings-and-team/organization-profile",
		],
	},
	{
		slug: "limits-and-fair-use",
		title: "Limits and fair use",
		subtitle: "Know exactly what the Free plan includes so nothing stops you mid-job.",
		kind: "howto",
		availability: "all",
		permission: "Anyone can see the meters; upgrading needs billing access.",
		keywords: ["limits", "quota", "cap", "usage", "meter", "seats", "sends", "trial", "fair use"],
		sections: [
			{
				heading: "The Free plan is metered, not locked",
				blocks: [
					{
						type: "paragraph",
						text: "OneTool's Free plan is not a stripped-down version of the product. Almost every feature is there, including online payments, the AI assistant, AI CSV import, custom SKUs, and organization documents. What Free limits is volume, through five usage meters. Clients and active projects are unlimited, so you can put your whole book of business in on day one.",
					},
					{
						type: "list",
						items: [
							"**20 document sends per calendar month.** A send is a quote or an invoice sent to a client.",
							"**5 e-signature requests per calendar month.**",
							"**10 AI assistant messages per day**, counted against the UTC day.",
							"**5 saved reports** at a time.",
							"**2,000 imported CSV rows** for the life of your account.",
						],
					},
					{
						type: "paragraph",
						text: "The **Billing** tab shows where you stand on all five meters, and the first three, document sends, e-signatures, and today's assistant messages, sit in a small card at the bottom of the sidebar so you can check them from any page.",
					},
				],
			},
			{
				heading: "Bonus sends when you collect a payment",
				blocks: [
					{
						type: "paragraph",
						text: "Any month in which you collect a Stripe payment adds **10 extra document sends** to that month's allowance, taking you from 20 to 30. The bonus applies to the month the payment lands in, and it starts over with the rest of your sends on the 1st.",
					},
					{
						type: "tip",
						text: "Connecting Stripe from the **Integrations** tab costs nothing and works on Free, so the bonus is there for the taking as soon as one client pays online.",
					},
				],
			},
			{
				heading: "What happens when you reach a limit",
				blocks: [
					{
						type: "paragraph",
						text: "Nothing is deleted and nothing is hidden. The action you tried is held back and OneTool shows a notice naming the limit you reached and when it resets. Everything already in your account stays exactly where it is, and the **Billing** tab always shows where each meter stands.",
					},
					{
						type: "list",
						items: [
							"**Document sends** reset on the 1st of each month.",
							"**E-signature requests** reset on the 1st of each month.",
							"**Assistant messages** reset at midnight UTC.",
							"**Saved reports** are a running count, so deleting one frees a slot straight away.",
							"**Imported rows** are a lifetime total and do not reset.",
						],
					},
				],
			},
			{
				heading: "Team seats",
				blocks: [
					{
						type: "paragraph",
						text: "Free includes 5 team members and Business includes 20, counting yourself. Members and pending invitations both count toward the limit, so revoking an unused invitation frees a seat. At the cap, the Team tab blocks new invitations until a seat opens or you upgrade. [Inviting your team](/help/settings-and-team/inviting-your-team) covers sending and revoking invitations.",
					},
				],
			},
			{
				heading: "Your 14-day Business trial",
				blocks: [
					{
						type: "paragraph",
						text: "Every new organization starts on a 14-day Business trial automatically. There is no credit card to enter and nothing to cancel. While the trial runs, a countdown pill in the desktop header shows the days left instead of the usage card.",
					},
					{
						type: "paragraph",
						text: "When the 14 days are up your organization simply continues on Free. All of your clients, projects, quotes, invoices, and files stay exactly as they are, and the usage meters take over from the countdown pill.",
					},
				],
			},
			{
				heading: "What the Business plan adds",
				blocks: [
					{
						type: "paragraph",
						text: "Business makes every meter above unlimited and raises your team from 5 seats to 20. It also unlocks the features built for a growing operation:",
					},
					{
						type: "list",
						items: [
							"[Automations](/help/automations) that handle repetitive follow-up for you.",
							"[Routing](/help/routing) to plan efficient driving days.",
							"[QuickBooks sync](/help/settings-and-team/quickbooks-sync) for your clients, invoices, and payments.",
							"[AI report generation](/help/reports), so you can describe a report and have it built for you.",
							"Removing the OneTool badge from your client portal.",
						],
					},
					{
						type: "paragraph",
						text: "Business is $30 per month, or $300 per year. Free accounts get best-effort support, and Business accounts get a 24-hour response.",
					},
				],
			},
		],
		faq: [
			{
				question: "What counts as a document send?",
				answer: "Sending a quote or an invoice to a client. Drafting, editing, previewing, and downloading a PDF do not count, and resending the same document to chase a reply does not spend a second send.",
			},
			{
				question: "Do my clients and projects count against anything?",
				answer: "No. Clients and active projects are unlimited on every plan, including Free.",
			},
			{
				question: "I deleted a saved report. Do I get the slot back?",
				answer: "Yes. Saved reports are counted as a running total rather than a monthly allowance, so deleting one frees a slot immediately.",
			},
			{
				question: "Do I have to cancel the trial?",
				answer: "No. The trial takes no card details and ends on its own after 14 days, at which point your organization continues on Free with all of its data intact.",
			},
		],
		related: [
			"settings-and-team/plans-and-billing",
			"settings-and-team/inviting-your-team",
		],
	},
	{
		slug: "setting-up-online-payments",
		title: "Setting up online payments",
		subtitle: "Connect Stripe once and let clients pay invoices by card in their portal.",
		kind: "howto",
		availability: "all",
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
							"Follow Stripe's guided onboarding to enter your business details and the bank account for payouts. A **Payments** tab appears in settings as soon as setup starts, and shows your progress.",
							"Return to OneTool when Stripe finishes, and check the **Payments** tab for your verification status.",
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
		slug: "quickbooks-sync",
		title: "QuickBooks sync: what syncs and what doesn't",
		subtitle: "Know exactly which records reach QuickBooks so your books stay clean without double entry.",
		kind: "howto",
		availability: "business",
		permission: "Connecting and settings are owner only; every admin can see sync status.",
		keywords: [
			"quickbooks",
			"qbo",
			"accounting",
			"sync",
			"intuit",
			"bookkeeping",
			"income account",
			"sync errors",
		],
		sections: [
			{
				heading: "OneTool is the source of truth",
				blocks: [
					{
						type: "paragraph",
						text: "The QuickBooks integration syncs one way: from OneTool to QuickBooks. Records you create and update in OneTool are pushed to QuickBooks automatically, usually within a couple of minutes. Changes made inside QuickBooks are never pulled back into OneTool, and the next time a synced record changes in OneTool it is pushed again, replacing edits made on the QuickBooks side.",
					},
					{
						type: "tip",
						text: "Treat OneTool as the place where client, invoice, and payment records are edited, and QuickBooks as the place your books live. The one exception is the customer import, which brings your existing QuickBooks customers into OneTool. It is usually run once when you first connect, but it is safe to run again any time.",
					},
				],
			},
			{
				heading: "What syncs",
				blocks: [
					{
						type: "list",
						items: [
							"**Clients** become QuickBooks customers. They sync when created and again whenever their details change.",
							"**Invoices** sync when you send them (or when created, if the owner changes the timing on the Integrations tab), and edits to an already synced invoice sync again. Cancelling a synced invoice voids it in QuickBooks.",
							"**Payments** are recorded against the matching QuickBooks invoice when they are paid, if payment sync is turned on.",
							"**SKUs** become QuickBooks items the first time they are invoiced, posting to the income account chosen during setup. Lines without a SKU use the fallback **OneTool Service** item.",
						],
					},
				],
			},
			{
				heading: "What never syncs",
				blocks: [
					{
						type: "list",
						items: [
							"**Quotes and estimates.** Only invoices and their payments reach QuickBooks.",
							"**Deletes.** Deleting a record in OneTool never deletes it in QuickBooks; the record simply stops updating.",
							"**Refunds and disputes.** Record those in QuickBooks directly.",
							"**Card processing fees and payouts.** Stripe fees and payout deposits are not broken out in QuickBooks.",
							"**History from before you connected.** Older invoices and payments are not backfilled. Editing an older invoice after connecting does sync it.",
						],
					},
				],
			},
			{
				heading: "Seeing sync status on a record",
				blocks: [
					{
						type: "paragraph",
						text: "Synced invoices and clients show a **QuickBooks** row in the detail sidebar and in the quick-look drawer, with how long ago they last synced. A warning icon on that row means the record reached QuickBooks but came back different, most often because QuickBooks Automated Sales Tax adjusted the tax amount based on the addresses involved.",
					},
					{
						type: "paragraph",
						text: "When a record cannot reach QuickBooks at all, it appears under **Sync issues** on the Integrations tab with the reason QuickBooks gave, and admins get an in-app notification the first time something fails. Fix the cause, then use **Retry**; the notification clears once the list is empty.",
					},
				],
			},
			{
				heading: "Common sync errors",
				blocks: [
					{
						type: "list",
						items: [
							"**Duplicate name.** QuickBooks requires customer names to be unique across customers, vendors, and employees. OneTool links to an exact customer match automatically; otherwise it adds a numeric suffix when **Auto-resolve duplicate names** is on, or reports the conflict under Sync issues when it is off.",
							"**Missing Undeposited Funds account.** Payments are recorded to your Undeposited Funds account. If your QuickBooks company does not have one, payment syncs fail under Sync issues until it exists; invoices still sync.",
							"**Closed accounting period.** QuickBooks rejects changes to a period your accountant has closed. Reopen the period or ignore the item.",
						],
					},
				],
			},
		],
		faq: [
			{
				question: "I edited a customer in QuickBooks. Will my change stay?",
				answer: "Only until that client next changes in OneTool. Sync is one way, so OneTool's version replaces QuickBooks edits on the next sync. Make record edits in OneTool.",
			},
			{
				question: "Why is my tax amount different in QuickBooks?",
				answer: "QuickBooks Automated Sales Tax recalculates tax from the addresses on the invoice and can override the amount OneTool sent. When that happens the record shows a warning on its QuickBooks row so you can review it.",
			},
			{
				question: "Do my old invoices get synced when I connect?",
				answer: "No. Sync starts from the moment you connect, and existing invoices and payments stay where they are. Editing an older invoice after connecting syncs it. Existing QuickBooks customers can be brought in with the customer import, which you can run whenever you need it.",
			},
			{
				question: "What happens if I disconnect?",
				answer: "Syncing stops and OneTool's access is revoked, but everything already in QuickBooks stays there. Reconnecting the same QuickBooks company picks up where it left off.",
			},
		],
		related: [
			"settings-and-team/organization-profile",
			"invoices-and-payments/creating-an-invoice",
			"clients/importing-clients",
		],
	},
	{
		slug: "documents-and-skus",
		title: "Documents and SKUs",
		subtitle: "Keep reusable files and line items on hand so quotes come together faster.",
		kind: "howto",
		availability: "all",
		permission: "The shared library is admin controlled; members need documents access from an admin. Client and project files follow each person's own client and project visibility.",
		keywords: ["files", "attachments", "catalog", "products", "services", "line items", "insurance"],
		sections: [
			{
				heading: "Two reusable libraries",
				blocks: [
					{
						type: "paragraph",
						text: "OneTool has two libraries that save you from redoing the same work on every quote. **Documents** is its own page in the sidebar, under **Resources**, and it holds every file your business keeps on hand. The **SKUs** tab in organization settings stores the products and services you sell, ready to drop into any quote as line items.",
					},
					{
						type: "note",
						text: "Both libraries are available on every plan, including Free.",
					},
				],
			},
			{
				heading: "The Documents page",
				blocks: [
					{
						type: "paragraph",
						text: "Documents opens on your shared library, the files the whole business works from, like proof of insurance, licenses, spec sheets, and site photos. It accepts PDFs, images, Office documents, and CSV or text files up to 25 MB each. Organize files into folders, switch between a list and a card grid, and search or filter by type when the library grows.",
					},
					{
						type: "steps",
						items: [
							"Select **Documents** in the sidebar, under **Resources**.",
							"Upload files with the **Upload** button or by dragging them onto the library; they land in the folder you are viewing.",
							"Use **New Folder** to organize files, and the row menu's **Move** action to rearrange them later.",
							"Attach PDFs to a quote or invoice when you build it.",
						],
					},
					{
						type: "note",
						text: "Only PDFs can be appended to quote and invoice PDFs. Other file types live in the library for your team's reference.",
					},
					{
						type: "paragraph",
						text: "Selecting a file's **Details** opens a panel where you can rename it, give it a description, preview images, or download it. Select several rows at once to download or delete them together, and use the **Recent** view in the sidebar to jump back to the latest uploads. Deleting a file or folder is permanent, and deleting a folder also deletes everything inside it.",
					},
				],
			},
			{
				heading: "The Clients section",
				blocks: [
					{
						type: "paragraph",
						text: "Alongside the shared library, Documents has a **Clients** section that fills itself in. Any file attached to a client or a project shows up there automatically, organized client by client and then project by project, so you can find a job's paperwork without opening the record. Quote and invoice PDFs your team generates land here too. The section starts with your newest 200 files; select **Show older files** at the bottom to bring in the rest.",
					},
					{
						type: "note",
						text: "Generated quote and invoice PDFs are read only here. Client and project files are live: upload into a client or project folder directly, or from the record itself, and rename or delete them in either place. The folders themselves are managed for you.",
					},
					{
						type: "paragraph",
						text: "This section respects the access each teammate already has. Someone who only sees their assigned clients and projects sees only those files here, so nothing new is exposed by putting them in one place.",
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
				answer: "Yes, if an admin grants them access to those areas in the member's access editor. Otherwise the shared library and the SKU catalog are managed by admins and the owner.",
			},
			{
				question: "Does editing a SKU change quotes I already sent?",
				answer: "A SKU is a starting point for a line item. Adjust the details on the quote itself when a specific job needs a different rate or description.",
			},
			{
				question: "Why can't I see Documents or SKUs?",
				answer: "Both are for admins and the organization owner by default. A member sees the Documents page once an admin grants either documents grant from the member's access editor, though the shared library itself needs the organization documents grant. The SKUs tab appears once an admin grants access to SKUs. There is no plan requirement.",
			},
		],
		related: [
			"quotes/creating-a-quote",
			"invoices-and-payments/creating-an-invoice",
			"settings-and-team/plans-and-billing",
		],
	},
];
