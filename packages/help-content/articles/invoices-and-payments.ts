import type { HelpArticle } from "../types";

export const invoicesAndPaymentsArticles: HelpArticle[] = [
	{
		slug: "creating-an-invoice",
		title: "Creating an invoice",
		subtitle: "Bill for your work by converting an approved quote or starting from scratch.",
		kind: "howto",
		availability: "all",
		permission: "Admins, and members with access to invoices.",
		keywords: ["billing", "bill", "convert quote", "numbering", "statuses", "pdf", "draft"],
		sections: [
			{
				heading: "Two ways to start",
				blocks: [
					{
						type: "paragraph",
						text: "An invoice is the bill for a job. Most invoices start as an approved quote, so the client is billed exactly what they agreed to. You can also create one from scratch when there is no quote behind the work.",
					},
				],
			},
			{
				heading: "Convert an approved quote",
				blocks: [
					{
						type: "steps",
						items: [
							"Open the approved quote.",
							"Click **Convert to Invoice**.",
							"Review the new invoice. The line items and totals are copied over, so there is nothing to retype.",
						],
					},
					{
						type: "media",
						media: "image",
						caption: "Converting an approved quote into an invoice",
						asset: "invoices-and-payments/creating-an-invoice/converting-an-approved-quote-into-an",
					},
					{
						type: "note",
						text: "Converting is one time only. Once a quote has an invoice, OneTool blocks a second conversion so the same approval is never billed twice. If you need to bill beyond the quote, create a separate invoice from scratch.",
					},
				],
			},
			{
				heading: "Create one from scratch",
				blocks: [
					{
						type: "paragraph",
						text: "When there is no quote, create the invoice directly from the **Invoices** page. New invoices start as drafts, and you add what you are billing for in the line item grid on the invoice itself.",
					},
				],
			},
			{
				heading: "Edit the line items",
				blocks: [
					{
						type: "paragraph",
						text: "Line items live on the invoice's Overview tab in a spreadsheet-style grid. Click any cell and type. Press **Enter** to move down a row, and again on the last row to add a new one. The arrow keys move between cells, and **New row** at the bottom adds one at any time.",
					},
					{
						type: "steps",
						items: [
							"Copy rows from a spreadsheet and paste them into the grid to create a line for each row.",
							"Click **SKU** on a row to fill its description, unit, rate, and cost from your saved price list.",
							"Drag the handle on the left of a row to reorder it, and tick the row checkboxes to duplicate or delete several rows at once.",
						],
					},
					{
						type: "paragraph",
						text: "Nothing needs saving by hand. Every edit saves on its own and the marker in the **Line Items** header reads **All changes saved** once it lands.",
					},
					{
						type: "paragraph",
						text: "The footer below the grid sets a **Discount**, either a dollar amount or a percentage chosen with the **$** and **%** buttons inside the field, and a **Tax** rate as a percentage, the same way quotes work. The **Client view** button beside them controls which columns print on the client's copy: quantities, unit prices, line totals, and the grand total. Cost and margin are internal and never printed. Use **Preview Document** in the **Line Items** header to see the exact PDF in a modal before generating it, and watch the **Generated PDF** preview in the right rail, whose colored header turns amber when the invoice has changed since the last PDF was generated.",
					},
					{
						type: "note",
						text: "Paid and cancelled invoices lock their line items and pricing, and so does any invoice with a payment that has settled, been refunded, or been disputed. A bill cannot change after money has moved. The grid switches to read only and explains why.",
					},
				],
			},
			{
				heading: "Numbering and statuses",
				blocks: [
					{
						type: "paragraph",
						text: "OneTool numbers invoices for you automatically, starting at INV-000001. Each invoice is in one of five statuses:",
					},
					{
						type: "list",
						items: [
							"**Draft**: you are still working on it, and it is not visible in the client portal.",
							"**Sent**: the client has been billed and payment is open.",
							"**Paid**: the invoice is settled.",
							"**Overdue**: the invoice was sent and its due date has passed. OneTool moves it there for you at 1:00 AM in your organization's timezone, the morning after the due date, and notifies the organization owner. An invoice that was already more than a week past due moves quietly instead, with no notification and no automation, so a long-neglected backlog does not suddenly start chasing clients. It stays overdue until the client pays, or until you move the installments to later dates.",
							"**Cancelled**: the invoice is void.",
						],
					},
				],
			},
			{
				heading: "Actions on the invoice",
				blocks: [
					{
						type: "paragraph",
						text: "The buttons at the top of the invoice change with its status:",
					},
					{
						type: "list",
						items: [
							"A draft shows **Mark as Sent** and **Mark as Paid**.",
							"A sent or overdue invoice shows **Mark as Paid** and **Revert to Draft**.",
							"A paid invoice shows **Reopen**.",
							"A cancelled invoice shows **Reopen (Draft)**.",
						],
					},
					{
						type: "paragraph",
						text: "**Send to Client** is available until the invoice is paid or cancelled, and reads **Resend to Client** once it has gone out. **Generate PDF** produces a PDF copy of the invoice and is always available, and **Cancel** asks for confirmation before it voids the invoice.",
					},
					{
						type: "media",
						media: "image",
						caption: "The invoice header with its status actions",
						asset: "invoices-and-payments/creating-an-invoice/invoice-header-with-its-status-actions",
					},
				],
			},
		],
		faq: [
			{
				question: "Can I convert the same quote twice?",
				answer: "No. A quote converts to an invoice once. If you try again, OneTool tells you an invoice already exists for that quote. Create an invoice from scratch if you need to bill more.",
			},
			{
				question: "Why does my invoice show as overdue?",
				answer: "It was sent and its due date has passed. OneTool moves sent invoices to Overdue on its own, at 1:00 AM in your organization's timezone the morning after the due date, and notifies the organization owner. Invoices that were already more than a week past due move quietly, without a notification. It stays overdue until the client pays, online through the portal or with you recording the payment. If they need more time, reschedule the installments. Once the last one is due in the future, the invoice goes back to Sent.",
			},
			{
				question: "Can I edit an invoice after sending it?",
				answer: "Yes. Click **Revert to Draft** on a sent invoice to move it back to draft, make your changes, then send it again.",
			},
		],
		related: [
			"invoices-and-payments/payment-schedules",
			"invoices-and-payments/getting-paid",
			"quotes/sending-quotes-and-approvals",
		],
	},
	{
		slug: "payment-schedules",
		title: "Payment schedules",
		subtitle: "Split an invoice into dated installments so big jobs get paid in stages.",
		kind: "howto",
		availability: "all",
		permission: "Admins, and members with access to invoices.",
		keywords: ["installments", "deposit", "split invoice", "due dates", "partial", "milestones"],
		sections: [
			{
				heading: "What a payment schedule is",
				blocks: [
					{
						type: "paragraph",
						text: "A payment schedule splits an invoice into dated installments, like a deposit up front and the balance on completion. Each installment has its own amount and due date, and your client pays them through the portal as they come due.",
					},
					{
						type: "paragraph",
						text: "By default an invoice has a single installment called **Full Payment** for the whole total. If the whole amount is due at once, you never need to touch the schedule.",
					},
					{
						type: "note",
						text: "Invoices converted from a quote start with the **Full Payment** row right away. Invoices created from scratch get it automatically when you send them.",
					},
					{
						type: "paragraph",
						text: "The invoice's own due date is the last installment's date. Move that installment and the invoice's deadline moves with it.",
					},
				],
			},
			{
				heading: "Configure the schedule",
				blocks: [
					{
						type: "steps",
						items: [
							"Open the invoice and go to the **Payment Schedule** tab.",
							"Click **Configure**.",
							"Add an installment for each payment you expect. Give each one an amount, a due date, and a description if it helps.",
							"Adjust the amounts until the installments add up exactly to the invoice total, not a cent over or under.",
						],
					},
					{
						type: "media",
						media: "image",
						caption: "Configuring a payment schedule",
						asset: "invoices-and-payments/payment-schedules/configuring-a-payment-schedule",
					},
					{
						type: "note",
						text: "Paid, refunded, and voided installments are locked. You can rework the unpaid ones, but money you have already collected or returned stays where it is.",
					},
				],
			},
			{
				heading: "Track each installment",
				blocks: [
					{
						type: "paragraph",
						text: "The **Payment Schedule** tab shows every installment as a card with a status pill: Pending, Sent, Paid, Overdue, or Cancelled. Your client sees the schedule on the invoice in their portal, and a partly paid invoice shows there as partial until the last installment settles.",
					},
				],
			},
		],
		faq: [
			{
				question: "Can I change the schedule after the client has paid an installment?",
				answer: "Yes. Open **Configure** again and adjust the unpaid installments. Paid and refunded installments are locked, so money you have already collected is never redistributed.",
			},
			{
				question: "How do I give a client more time on an overdue invoice?",
				answer: "Open the invoice and click **Reschedule payments** on the overdue banner, or click **Configure** on the Payment Schedule tab. Give the unpaid installments later dates. **Shift dates** moves them all by the same number of days at once. When the last installment is due in the future, the invoice goes back to Sent.",
			},
			{
				question: "Why is the schedule empty on a new invoice?",
				answer: "An invoice created from scratch has no installments until you configure them or send it. Sending adds the default **Full Payment** row automatically. Invoices converted from a quote start with that row from the beginning.",
			},
			{
				question: "Do the installments have to match the invoice total?",
				answer: "Yes, exactly. OneTool will not save a schedule that adds up to more or less than the invoice total.",
			},
		],
		related: [
			"invoices-and-payments/creating-an-invoice",
			"invoices-and-payments/getting-paid",
			"client-portal/approving-quotes-and-paying-invoices",
		],
	},
	{
		slug: "getting-paid",
		title: "Getting paid",
		subtitle: "Send the invoice, let clients pay by card in their portal, and record cash or check payments.",
		kind: "howto",
		availability: "all",
		permission: "Admins, and members with access to invoices.",
		keywords: ["stripe", "card payment", "receipt", "cash", "check", "send to client", "portal", "custom email", "attachments", "cc", "bcc"],
		sections: [
			{
				heading: "Send the invoice",
				blocks: [
					{
						type: "paragraph",
						text: "**Send to Client** does two things: it marks the invoice as sent and emails your client a link to view and pay it in their portal.",
					},
					{
						type: "steps",
						items: [
							"Open the invoice and review the total.",
							"Open the **⋯** menu in the invoice header and click **Send to Client**.",
							"Choose **Portal template** for the branded email, or **Custom email** to write your own subject and message.",
						],
					},
					{
						type: "paragraph",
						text: "The portal template is fixed wording, and you see a preview of the exact email before it goes out. A custom email has your subject and message only, with no automatic greeting, signature, or footer. The portal button is added underneath it either way. That button reads **View & pay invoice** once online payments are set up, and **View invoice online** until then.",
					},
					{
						type: "note",
						text: "Sending requires the client to have a primary contact with an email address on file. Add one on the client record first if it is missing. To send the same link again later, use **Resend to Client**. On the Free plan the modal says how many sends you have left this month. The first send of an invoice uses one, and resending is free. You can also send straight from the invoice list: open an invoice\u2019s quick-view drawer and use the same action there.",
					},
				],
			},
			{
				heading: "Recipients and attachments",
				blocks: [
					{
						type: "paragraph",
						text: "Both email choices share the same recipient lines and attachment tray.",
					},
					{
						type: "list",
						items: [
							"**Recipients.** **To** starts with the primary contact. Click **Add CC/BCC** to reveal the other two lines, which take any address you type. A custom email lets you type any address on the **To** line as well. Any typed address can receive the email, but only an email saved as a contact on this client can sign in to view or pay the invoice. The portal template keeps **To** on the client's own contacts.",
							"**The invoice PDF.** The most recent version you generated is attached already. Remove it with the X, or use the clock icon to pick an older version.",
							"**Your own files.** **Attach file** adds photos, receipts, and anything else the client asked for. All attachments together can total 20MB, and program files are refused.",
						],
					},
					{
						type: "note",
						text: "If you edited the invoice after generating its PDF, the attachment reads **Content changed since generation**. The refresh button beside it rebuilds the PDF from the current numbers. Sending the older version is still allowed, so this is a warning rather than a block.",
					},
					{
						type: "paragraph",
						text: "Every invoice you send this way lands in the client's conversation in your [inbox](/help/inbox/unified-inbox), and their reply comes back to the same place. If an address has hard-bounced or marked one of your emails as spam, the send is refused and OneTool names the address.",
					},
				],
			},
			{
				heading: "How clients pay by card",
				blocks: [
					{
						type: "paragraph",
						text: "Your client signs in to their portal with a one-time code sent to their email, no account or password needed. On the invoice they see a pay button for the amount due, enter their card in a secure payment form, and pay without leaving the page.",
					},
					{
						type: "paragraph",
						text: "The charge goes straight to your own connected Stripe account and pays out to your bank. Setting up payments takes a few minutes and is done once by the organization owner. See [Setting up online payments](/help/settings-and-team/setting-up-online-payments).",
					},
					{
						type: "note",
						text: "Until online payments are set up, the portal tells your client that online payment is not yet available and asks them to reach out to pay another way.",
					},
					{
						type: "media",
						media: "image",
						caption: "Paying an invoice in the client portal",
						asset: "invoices-and-payments/getting-paid/paying-an-invoice-in-the-client",
					},
				],
			},
			{
				heading: "Receipts",
				blocks: [
					{
						type: "paragraph",
						text: "When a card payment succeeds, OneTool records the card brand and last four digits on the installment, along with a link to the Stripe receipt. Your client also gets a receipt in the portal they can download or print.",
					},
				],
			},
			{
				heading: "Record cash and check payments",
				blocks: [
					{
						type: "paragraph",
						text: "Money you collect outside the portal still needs to land in OneTool so your records stay right. When a client pays in cash or by check, open the invoice and click **Mark as Paid**. The invoice becomes paid and every outstanding installment is settled, so the portal never offers to collect the same money twice.",
					},
					{
						type: "media",
						media: "image",
						caption: "Marking an invoice as paid",
						asset: "invoices-and-payments/getting-paid/marking-an-invoice-as-paid",
					},
				],
			},
		],
		faq: [
			{
				question: "Do my clients need an account to pay?",
				answer: "No account or password. They sign in to their portal with a one-time code sent to their email. A portal session lasts 24 hours, and after that they simply request a new code.",
			},
			{
				question: "Where does the money go?",
				answer: "Directly to your organization's connected Stripe account, then out to your bank. The organization owner can see the payout schedule and history in the Payments tab of your organization settings.",
			},
			{
				question: "Why does my client see that online payment is not available?",
				answer: "Your organization has not finished setting up online payments. The organization owner can finish onboarding from the Payments tab in your organization settings. Once charges are enabled, the pay button appears.",
			},
		],
		related: [
			"settings-and-team/setting-up-online-payments",
			"client-portal/approving-quotes-and-paying-invoices",
			"invoices-and-payments/refunds-and-disputes",
		],
	},
	{
		slug: "refunds-and-disputes",
		title: "Refunds and disputes",
		subtitle: "Understand what a refund does to an invoice and where chargebacks get resolved.",
		kind: "concept",
		availability: "all",
		heroMedia: {
			media: "image",
			caption: "The Disputes panel in the Payments tab",
			asset: "invoices-and-payments/refunds-and-disputes/hero",
		},
		keywords: ["chargeback", "stripe", "evidence", "reopened balance", "card payment", "reversal"],
		sections: [
			{
				heading: "Two ways money comes back",
				blocks: [
					{
						type: "paragraph",
						text: "A refund is money you choose to return to a client after a card payment. A dispute, sometimes called a chargeback, is when the client asks their card issuer to reverse a charge instead of coming to you. OneTool tracks both against the payment they belong to, and Stripe handles the card side.",
					},
				],
			},
			{
				heading: "Refunds start in Stripe",
				blocks: [
					{
						type: "paragraph",
						text: "You issue a refund from the Stripe dashboard, not from OneTool. Find the payment, refund all or part of it, and OneTool records what Stripe reports. A notification tells you the amount and which invoice it landed on.",
					},
				],
			},
			{
				heading: "What a refund does to the invoice",
				blocks: [
					{
						type: "paragraph",
						text: "Refunded money stops counting as collected, so the invoice's balance reopens by that amount. An invoice is only Paid when nothing is owed on it, so one that read Paid moves back to Sent.",
					},
					{
						type: "paragraph",
						text: "That balance is not payable again. A refunded installment is closed, so the portal labels the invoice Refunded and drops the Pay button instead of asking your client to pay the same money twice.",
					},
					{
						type: "paragraph",
						text: "Your client sees the refund on the installment it came from, with the amount that went back to their card. They do not see why, so tell them directly when you issue one.",
					},
				],
			},
			{
				heading: "Where disputes are handled",
				blocks: [
					{
						type: "paragraph",
						text: "Disputes are handled in Stripe's own dispute tools, embedded inside OneTool. Open your organization settings, go to the **Payments** tab, and expand **Disputes**. From there you respond to a chargeback by submitting evidence, accepting the dispute, or refunding the payment to resolve it.",
					},
					{
						type: "paragraph",
						text: "The panel is Stripe's, so what you submit there goes straight to Stripe and the card networks. Only the organization owner sees it, and it appears once payment onboarding is fully complete.",
					},
				],
			},
		],
		related: [
			"invoices-and-payments/getting-paid",
			"settings-and-team/setting-up-online-payments",
		],
	},
];
