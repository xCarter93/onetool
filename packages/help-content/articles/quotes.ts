import type { HelpArticle } from "../types";

export const quotesArticles: HelpArticle[] = [
	{
		slug: "creating-a-quote",
		title: "Creating a quote",
		subtitle: "Build a priced proposal with line items, a discount, and tax.",
		kind: "howto",
		availability: "all",
		permission: "Admins, and members with access to quotes.",
		keywords: ["estimate", "proposal", "line items", "discount", "tax", "pdf", "numbering"],
		sections: [
			{
				heading: "How quotes work",
				blocks: [
					{
						type: "paragraph",
						text: "A quote is a priced proposal for a job. You build it as a draft, add line items, and send it when it is ready. Your client approves or declines, and an approved quote converts straight into an invoice, so the price you agreed on is the price you bill.",
					},
					{
						type: "paragraph",
						text: "OneTool numbers quotes for you. Your first quote is Q-000001, and each new quote takes the next number automatically.",
					},
				],
			},
			{
				heading: "Create the quote",
				blocks: [
					{
						type: "steps",
						items: [
							"Go to **Quotes** in the sidebar and click **Create Quote**.",
							"Pick the **Client**. This is the only required field.",
							"Attach a **Project** if the quote belongs to a specific job.",
							"Give the quote a **Title**, and set a **Valid until** date if the price has a shelf life.",
							"Add a **Message to client** and any **Terms & conditions**.",
							"Click **Create quote**. OneTool creates the draft and opens the line item editor.",
						],
					},
					{
						type: "media",
						media: "image",
						caption: "The New quote dialog",
						asset: "quotes/creating-a-quote/new-quote-dialog",
					},
					{
						type: "note",
						text: "The **Valid until** date is informational. Nothing changes automatically when it passes, and the quote keeps its status. A quote only shows as Expired when an e-signature request lapses before it is signed.",
					},
				],
			},
			{
				heading: "Add line items",
				blocks: [
					{
						type: "paragraph",
						text: "Line items are the priced pieces of the job. The subtotal, tax, and total recalculate live as you edit.",
					},
					{
						type: "steps",
						items: [
							"Click **Add Line Item** and describe the work, with a unit (like hour), a rate, and a quantity.",
							"Repeat for each part of the job.",
							"Click **Add Discount** to take off a percentage (up to 100 percent) or a fixed amount.",
							"Click **Add Tax** to apply your tax rate as a percentage.",
						],
					},
					{
						type: "media",
						media: "image",
						caption: "The line item editor with a discount and tax applied",
						asset: "quotes/creating-a-quote/line-item-editor-with-a-discount",
					},
					{
						type: "tip",
						text: "Quotes convert straight into invoices later, so write line items the way you want them to appear on the bill.",
					},
				],
			},
			{
				heading: "Get a PDF",
				blocks: [
					{
						type: "paragraph",
						text: "Click **Generate PDF** in the quote header to create a PDF copy of the quote. It is available in every status, so you can produce a copy while drafting or after approval. The [e-signature flow](/help/quotes/e-signatures) also builds its signature request from the quote's PDF.",
					},
				],
			},
		],
		faq: [
			{
				question: "Do I have to pick a project?",
				answer: "No. Only the client is required. Attach a project when the quote belongs to a specific job you are already tracking.",
			},
			{
				question: "What happens when the Valid until date passes?",
				answer: "Nothing automatic. The date is informational and the quote keeps its current status. Only a lapsed e-signature request marks a quote as Expired.",
			},
			{
				question: "Can I delete a quote?",
				answer: "Yes, unless an invoice has been created from it. Delete is available in the quote header in every status, but a converted quote cannot be deleted until you remove or unlink its invoice.",
			},
		],
		related: [
			"quotes/sending-quotes-and-approvals",
			"quotes/e-signatures",
			"getting-started/send-your-first-quote",
		],
	},
	{
		slug: "sending-quotes-and-approvals",
		title: "Sending quotes and approvals",
		subtitle: "Put a quote in front of your client and record the decision, from sent to invoiced.",
		kind: "howto",
		availability: "all",
		permission: "Admins, and members with access to quotes.",
		keywords: [
			"estimate",
			"client portal",
			"mark as sent",
			"declined",
			"expired",
			"convert to invoice",
			"status",
		],
		sections: [
			{
				heading: "The quote lifecycle",
				blocks: [
					{
						type: "paragraph",
						text: "Every quote carries a status, and the buttons in the quote header change to match it.",
					},
					{
						type: "list",
						items: [
							"**Draft**: you are still building it. Only your team can see it, and the header shows **Mark as Sent**.",
							"**Sent**: live in your client's portal, awaiting a decision. The header shows **Mark Approved**.",
							"**Approved**: your client said yes. The header shows **Convert to Invoice** and **Reopen**.",
							"**Declined**: your client passed. The header shows **Reopen**.",
							"**Expired**: an e-signature request lapsed before it was signed. The header shows **Reopen**.",
						],
					},
					{
						type: "paragraph",
						text: "**Send for e-signature**, **Generate PDF**, and **Delete** are available in every status. The one exception: once an invoice has been created from a quote, the quote cannot be deleted until you remove or unlink that invoice.",
					},
				],
			},
			{
				heading: "Send the quote",
				blocks: [
					{
						type: "steps",
						items: [
							"Open the quote and give the line items and total a final look.",
							"Click **Mark as Sent**.",
						],
					},
					{
						type: "paragraph",
						text: "That is the whole send. The quote becomes visible in your client's portal, where they can approve or decline it.",
					},
					{
						type: "note",
						text: "**Mark as Sent** on its own makes the quote approvable in the portal. A formal e-signature request is a separate, optional path. See [E-signatures](/help/quotes/e-signatures).",
					},
				],
			},
			{
				heading: "What your client does",
				blocks: [
					{
						type: "paragraph",
						text: "Your client signs in to their portal with a one-time code sent to their email. On a sent quote they review the pricing, sign by typing or drawing, and click **Approve quote**. If it is not right, **Decline this quote** lets them pick a reason and add a note.",
					},
					{
						type: "media",
						media: "image",
						caption: "The approval panel in the client portal",
						asset: "quotes/sending-quotes-and-approvals/approval-panel-in-the-client-portal",
					},
					{
						type: "paragraph",
						text: "Each portal approval is recorded with the signature and an audit trail, which you can review on the quote's **Approval Audit** tab. For the full client-side walkthrough, see [What your clients see](/help/client-portal/what-your-clients-see) and [Approving quotes and paying invoices](/help/client-portal/approving-quotes-and-paying-invoices).",
					},
				],
			},
			{
				heading: "Record the decision yourself",
				blocks: [
					{
						type: "paragraph",
						text: "Clients do not always click buttons. If yours approves over the phone or on paper, record it so the quote can move on.",
					},
					{
						type: "steps",
						items: ["Open the sent quote.", "Click **Mark Approved**."],
					},
					{
						type: "paragraph",
						text: "If a declined or expired quote comes back around, click **Reopen** to pick it back up and send it again.",
					},
				],
			},
			{
				heading: "Convert to an invoice",
				blocks: [
					{
						type: "paragraph",
						text: "Once a quote is approved, billing is one click. **Convert to Invoice** creates an invoice with the same line items and totals, ready to review and send. See [Creating an invoice](/help/invoices-and-payments/creating-an-invoice).",
					},
					{
						type: "note",
						text: "Each quote converts once. If an invoice already exists for the quote, a second conversion is blocked, so the same approval is never billed twice.",
					},
					{
						type: "note",
						text: "A percentage discount on the quote is recorded as a fixed dollar amount on the invoice. The total stays the same.",
					},
				],
			},
		],
		faq: [
			{
				question: "Can my client see a draft quote?",
				answer: "No. Draft quotes are not visible in the portal. Your client sees the quote once you mark it as sent.",
			},
			{
				question: "What happens after a decline?",
				answer: "The quote moves to Declined. If the conversation continues, click Reopen to pick the quote back up and send an updated version.",
			},
			{
				question: "Can my client pay from the quote?",
				answer: "No. Payment happens on invoices. Convert the approved quote to an invoice and send it, and your client can pay it in their portal.",
			},
		],
		related: [
			"quotes/e-signatures",
			"client-portal/approving-quotes-and-paying-invoices",
			"invoices-and-payments/creating-an-invoice",
		],
	},
	{
		slug: "e-signatures",
		title: "E-signatures",
		subtitle: "Collect a formal, emailed signature that approves the quote for you.",
		kind: "howto",
		availability: "all",
		permission: "Admins, and members with access to quotes.",
		keywords: [
			"signature request",
			"esign",
			"sign",
			"countersignature",
			"signing order",
			"digital signature",
		],
		sections: [
			{
				heading: "Two paths to an approved quote",
				blocks: [
					{
						type: "paragraph",
						text: "For many jobs, a portal approval is all you need: your client signs in, signs on screen, and the quote is approved. When you want a formal, emailed signature request instead, send the quote for e-signature. OneTool builds the request from the quote's PDF, your client signs from their email, and completion approves the quote automatically.",
					},
					{
						type: "paragraph",
						text: "The two paths are independent. Sending an e-signature request does not turn off portal approval, and either one ends with an approved quote.",
					},
				],
			},
			{
				heading: "Send a signature request",
				blocks: [
					{
						type: "steps",
						items: [
							"Open the quote and click **Send for e-signature**.",
							"Wait a moment while OneTool builds the request from the quote's latest PDF and opens the embedded signing editor.",
							"Place the signature fields and review the recipients in the editor.",
							"Send the request from inside the editor. Your client receives the signature request by email.",
						],
					},
					{
						type: "media",
						media: "image",
						caption: "The embedded signing editor",
						asset: "quotes/e-signatures/embedded-signing-editor",
					},
					{
						type: "note",
						text: "Sending needs a generated PDF. Until you click **Generate PDF** on the quote, **Send for e-signature** is unavailable and the page shows **Generate a PDF for this quote first** instead of the editor.",
					},
					{
						type: "note",
						text: "Sending needs a client contact with an email address on file. If there is none, the page shows **Add a client contact first** instead of the editor.",
					},
					{
						type: "note",
						text: "If you back out before sending, a **Leave without sending?** prompt lets you choose **Keep draft**, **Discard draft**, or **Stay in editor**.",
					},
				],
			},
			{
				heading: "Add a countersigner",
				blocks: [
					{
						type: "paragraph",
						text: "Some quotes need a signature from your side too. You can require a countersignature from a team member and control who signs first.",
					},
					{
						type: "steps",
						items: [
							"Open the quote's **Signatures** tab.",
							"Turn on **Requires organization countersignature**.",
							"Pick the team member who will countersign.",
							"Drag the signers to set the order, your client first or your team member first.",
						],
					},
				],
			},
			{
				heading: "Track requests on the Signatures tab",
				blocks: [
					{
						type: "paragraph",
						text: "The **Signatures** tab shows every signature request for the quote and where it stands: Draft, Sent, Viewed, Signed, Completed, Declined, Revoked, or Expired.",
					},
					{
						type: "list",
						items: [
							"When a request reaches Completed, the quote is approved automatically. There is nothing to mark by hand.",
							"A request you saved but never sent shows **Resume editing** and **Discard**. Discarding removes only the unsent request; the quote and its PDF stay put.",
							"If a request lapses before everyone signs, it shows Expired and the quote's status becomes Expired too. Click **Reopen** on the quote to pick it back up.",
						],
					},
					{
						type: "media",
						media: "image",
						caption: "The Signatures tab with a completed request",
						asset: "quotes/e-signatures/signatures-tab-with-a-completed-request",
					},
				],
			},
			{
				heading: "Monthly send limits",
				blocks: [
					{
						type: "paragraph",
						text: "The Free plan includes 5 e-signature sends per month, and the count resets at the start of each month. The Business plan has no limit.",
					},
					{
						type: "paragraph",
						text: "If you hit the cap mid-flow, the page tells you how many sends you have used this month and shows a **View plans** link so you can upgrade.",
					},
					{
						type: "tip",
						text: "Only requests you actually send count against the limit. You can prepare a draft early and send it when the client is ready.",
					},
				],
			},
		],
		faq: [
			{
				question: "Can my client still approve in the portal after I send a signature request?",
				answer: "Yes. Portal approval and the e-signature request stay independent. Whichever your client completes first approves the quote.",
			},
			{
				question: "What happens when everyone has signed?",
				answer: "The request shows Completed and the quote is approved automatically. From there you can convert it to an invoice.",
			},
			{
				question: "What if the request expires before my client signs?",
				answer: "The request shows Expired and the quote's status becomes Expired. Reopen the quote and send a new request. On the Free plan the new send counts toward your monthly limit.",
			},
		],
		related: [
			"quotes/sending-quotes-and-approvals",
			"client-portal/approving-quotes-and-paying-invoices",
			"settings-and-team/plans-and-billing",
		],
	},
];
