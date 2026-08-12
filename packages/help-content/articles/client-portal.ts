import type { HelpArticle } from "../types";

export const clientPortalArticles: HelpArticle[] = [
	{
		slug: "what-your-clients-see",
		title: "What your clients see",
		subtitle: "Every client gets a private, branded page to review quotes and pay invoices online.",
		kind: "concept",
		availability: "all",
		heroMedia: {
			media: "image",
			caption: "The client portal Home page",
			asset: "client-portal/what-your-clients-see/hero",
		},
		keywords: ["customer portal", "portal link", "client access", "branded", "self serve", "client view"],
		sections: [
			{
				heading: "One private link per client",
				blocks: [
					{
						type: "paragraph",
						text: "The client portal is a private page OneTool creates for each of your clients automatically. Every client gets their own unique link, and everything behind it is scoped to that client: their quotes, their invoices, and nothing else.",
					},
					{
						type: "paragraph",
						text: "There is no account to create and no password to remember. Your client signs in with a one-time code sent to their email, which keeps the portal both simple and private. See [How clients sign in](/help/client-portal/portal-sign-in).",
					},
				],
			},
			{
				heading: "Branded as your business",
				blocks: [
					{
						type: "paragraph",
						text: "The portal carries the business name and branding you set up in your organization settings, so the experience feels like dealing with you, not with a generic billing site. The quote your client approves and the invoice they pay both live under your brand.",
					},
				],
			},
			{
				heading: "What your client finds inside",
				blocks: [
					{
						type: "paragraph",
						text: "The portal keeps navigation to three pages:",
					},
					{
						type: "list",
						items: [
							"**Home** is the landing page after signing in.",
							"**Quotes** lists the quotes you have sent, ready to review, approve, or decline.",
							"**Invoices** lists their invoices, where they can see what is due and pay open balances by card.",
						],
					},
				],
			},
			{
				heading: "Where the portal fits in your flow",
				blocks: [
					{
						type: "paragraph",
						text: "The portal is the client-facing half of your quote and invoice flow. When you click **Send to Client** on a quote or an invoice, your client gets an email inviting them into the portal: to approve or decline the quote, or to view and pay the invoice.",
					},
					{
						type: "paragraph",
						text: "Everything your client does there flows straight back to your workspace. An approval flips the quote to Approved and records an audit trail. A card payment marks the installment paid and attaches a receipt. You never have to call to ask whether they have seen it.",
					},
					{
						type: "tip",
						text: "Online card payment needs a one-time payments setup by the organization owner. See [Setting up online payments](/help/settings-and-team/setting-up-online-payments).",
					},
				],
			},
		],
		related: [
			"client-portal/portal-sign-in",
			"client-portal/approving-quotes-and-paying-invoices",
			"getting-started/send-your-first-quote",
		],
	},
	{
		slug: "portal-sign-in",
		title: "How clients sign in",
		subtitle: "Clients sign in with an emailed code, so there is no account or password to manage.",
		kind: "howto",
		availability: "all",
		permission: "Any client contact with an email on file. No OneTool account is needed.",
		keywords: ["login", "log in", "one-time code", "otp", "verification code", "password", "email code"],
		sections: [
			{
				heading: "No passwords, just a code",
				blocks: [
					{
						type: "paragraph",
						text: "Portal sign in is built for clients who visit a few times a year. Instead of an account and a password they will forget, your client enters their email address and receives a 6-digit code. Entering the code signs them in. That is the whole process.",
					},
				],
			},
			{
				heading: "What your client does",
				blocks: [
					{
						type: "paragraph",
						text: "If a client asks how to get in, walk them through this:",
					},
					{
						type: "steps",
						items: [
							"Open the portal link. The **Sign in** screen asks for an email address.",
							"Enter the email address your business has on file for them.",
							"Watch for an email with a 6-digit code, then enter it on the **Sign in** screen. Each code works for 10 minutes.",
						],
					},
					{
						type: "media",
						media: "image",
						caption: "The portal sign in screen",
						asset: "client-portal/portal-sign-in/portal-sign-in-screen",
					},
					{
						type: "note",
						text: "A code allows up to five attempts. If it expires or stops working, your client can request a new one from the same screen.",
					},
				],
			},
			{
				heading: "Who can sign in",
				blocks: [
					{
						type: "paragraph",
						text: "Any contact on the client record with an email on file can sign in. If you deal with both an office manager and an owner, add each of them as a [contact](/help/clients/contacts-and-properties) with their email, and both can use the portal.",
					},
					{
						type: "tip",
						text: "The email on file is the portal key. Keep contact emails current on the client record so the right people can get in.",
					},
				],
			},
			{
				heading: "How long a session lasts",
				blocks: [
					{
						type: "paragraph",
						text: "A portal session lasts 24 hours. After that, the next visit asks for a fresh code. There is no remember me option, which keeps a forwarded or shared link from becoming a permanent door into their billing.",
					},
				],
			},
		],
		faq: [
			{
				question: "Does my client need to create an account?",
				answer: "No. The portal has no accounts or passwords. Your client signs in with their email and a one-time code each visit.",
			},
			{
				question: "What if the code never arrives?",
				answer: "Ask your client to check their spam folder, confirm the email on their contact record is correct, and request a new code. Codes expire after 10 minutes, so an older one sitting in the inbox may have already lapsed.",
			},
			{
				question: "How do I stop a client from using the portal?",
				answer: "Archive the client. Archived clients cannot sign in to the portal, and any session already open ends on its own within 24 hours.",
			},
		],
		related: [
			"client-portal/what-your-clients-see",
			"clients/contacts-and-properties",
			"client-portal/approving-quotes-and-paying-invoices",
		],
	},
	{
		slug: "approving-quotes-and-paying-invoices",
		title: "Approving quotes and paying invoices",
		subtitle: "See exactly what your client clicks to approve a quote and pay an invoice.",
		kind: "howto",
		availability: "all",
		permission: "Any signed-in client contact. Online card payment requires your organization to have payments set up.",
		keywords: ["signature", "sign", "decline", "card payment", "receipt", "estimate", "checkout"],
		sections: [
			{
				heading: "Approving a quote",
				blocks: [
					{
						type: "paragraph",
						text: "Only quotes you have sent appear in the portal. Drafts stay private to your workspace until you send them. Once a quote is sent, here is your client's flow:",
					},
					{
						type: "steps",
						items: [
							"Open the quote from the **Quotes** page and review the line items, totals, and terms.",
							"Sign in the **Sign to accept** panel, either by drawing a signature or typing one.",
							"Check the **I accept the scope and terms above** box.",
							"Click **Approve quote**.",
						],
					},
					{
						type: "media",
						media: "image",
						caption: "The signature panel on a quote in the client portal",
						asset: "client-portal/approving-quotes-and-paying-invoices/signature-panel-on-a-quote-in",
					},
					{
						type: "note",
						text: "Typed signatures also ask your client to consent to signing electronically before they can approve.",
					},
				],
			},
			{
				heading: "Declining a quote",
				blocks: [
					{
						type: "paragraph",
						text: "**Decline this quote** opens a short form where your client can pick a quick reason, write their own, or skip the reason entirely. The quote flips to Declined in your workspace, so you know to follow up or revise. Click **Reopen** on the quote to rework it and send it again.",
					},
				],
			},
			{
				heading: "The audit trail you keep",
				blocks: [
					{
						type: "paragraph",
						text: "Every portal approval is recorded, not just the status change. OneTool captures the time, the IP address the approval came from, and a snapshot of the exact document and line items your client agreed to. You can review it all on the quote's **Approval Audit** tab.",
					},
					{
						type: "paragraph",
						text: "For jobs where you want a formal, emailed signing request instead, use **Send for e-signature**. Both paths end with an approved quote. See [E-signatures](/help/quotes/e-signatures).",
					},
				],
			},
			{
				heading: "Paying an invoice",
				blocks: [
					{
						type: "paragraph",
						text: "When an invoice has an open balance, its portal page offers online payment by card:",
					},
					{
						type: "steps",
						items: [
							"Open the invoice from the **Invoices** page.",
							"Click the **Pay** button, which shows the amount due.",
							"Enter card details in the payment form that opens right on the page.",
							"Download or print the receipt that appears once the payment goes through.",
						],
					},
					{
						type: "media",
						media: "image",
						caption: "The embedded payment form on a portal invoice",
						asset: "client-portal/approving-quotes-and-paying-invoices/embedded-payment-form-on-a-portal",
					},
					{
						type: "note",
						text: "The **Pay** button only appears once your organization has payments set up. Until then, the portal tells your client that online payment is not yet available and to reach out to pay another way. See [Setting up online payments](/help/settings-and-team/setting-up-online-payments).",
					},
				],
			},
			{
				heading: "Invoice statuses your client sees",
				blocks: [
					{
						type: "paragraph",
						text: "The portal shows clients a simpler set of invoice statuses than your workspace uses:",
					},
					{
						type: "list",
						items: [
							"**Awaiting** means the invoice is open and waiting on payment.",
							"**Partial** means part of the total is paid and a balance remains.",
							"**Paid** means the invoice is settled in full.",
							"**Overdue** means the due date has passed with a balance still owing.",
						],
					},
				],
			},
		],
		faq: [
			{
				question: "Does my client have to use the e-signature request to approve?",
				answer: "No. The portal's approve flow works on any sent quote, whether or not you also sent an e-signature request. Send for e-signature is a separate, optional path for a formal emailed signing request, and either one ends with the quote approved.",
			},
			{
				question: "What if my client pays by cash or check?",
				answer: "Open the invoice in your workspace and click Mark as Paid. The portal stops offering online payment for that money, so nothing gets collected twice.",
			},
			{
				question: "Can my client pay in installments?",
				answer: "Yes. If you set up a [payment schedule](/help/invoices-and-payments/payment-schedules), the portal presents each installment, and the invoice shows as Partial until the full total is collected.",
			},
		],
		related: [
			"quotes/sending-quotes-and-approvals",
			"invoices-and-payments/getting-paid",
			"client-portal/portal-sign-in",
		],
	},
];
