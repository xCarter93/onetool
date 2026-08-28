import type { HelpArticle } from "../types";

export const inboxArticles: HelpArticle[] = [
	{
		slug: "unified-inbox",
		title: "The unified inbox",
		subtitle: "Work every client conversation from one shared inbox for your whole team.",
		kind: "howto",
		availability: "all",
		permission: "Admins, and members with access to the inbox.",
		keywords: ["email", "messages", "threads", "reply", "unread", "archive", "unlinked", "cc", "bcc", "attachments"],
		sections: [
			{
				heading: "One inbox for the whole team",
				blocks: [
					{
						type: "paragraph",
						text: "The inbox is your organization's shared mailbox for client email. Every message your team sends or receives lands in the same place, so anyone with access can see the full history of a conversation and pick it up where a teammate left off. There are no per-person mailboxes to check.",
					},
					{
						type: "paragraph",
						text: "Quotes and invoices you send with **Send to Client** show up here too, in that client's conversation, and their reply comes back to the same thread. The inbox holds the whole record of what you sent a client and what they said back.",
					},
					{
						type: "note",
						text: "The inbox is included on every plan. Who can see and reply is controlled per member by the inbox permission, which admins manage in [member permissions](/help/settings-and-team/member-permissions).",
					},
				],
			},
			{
				heading: "Find a conversation",
				blocks: [
					{
						type: "steps",
						items: [
							"Go to **Inbox** in the sidebar.",
							"Browse the left rail. Conversations are listed newest first; each row shows who it's with, the subject, and a preview of the last message. A dot marks unread conversations.",
							"Narrow the list with the **All**, **Unread**, and **Unlinked** filters at the top.",
							"Search by typing a contact name, client name, or subject to filter the list to matching conversations.",
						],
					},
					{
						type: "media",
						media: "image",
						caption: "The inbox, with conversations on the left and an open thread on the right",
						asset: "inbox/unified-inbox/inbox-with-conversations-on-the-left",
					},
					{
						type: "note",
						text: "The inbox shows your 300 most recent open conversations, so very old threads may not appear in the list.",
					},
				],
			},
			{
				heading: "Read and reply",
				blocks: [
					{
						type: "steps",
						items: [
							"Click a thread to open it in the right pane. OneTool marks it as read automatically. Older messages are collapsed to one line; click one to expand it.",
							"Type your reply in the box at the bottom of the thread. Use the toolbar to format it: bold, italic, underline, lists, links, and quotes.",
							"Use **Attach file** to send a photo or document with the reply.",
							"Click **Send**, or press Cmd+Enter (Ctrl+Enter on Windows).",
						],
					},
					{
						type: "paragraph",
						text: "Under each message you sent, a status line shows how it's doing: sent, delivered, or opened, with bounced and failed called out so you know a message never arrived. Files a client emailed you appear on their message, ready to download.",
					},
					{
						type: "note",
						text: "Replies go to the client's primary contact, even if a different contact sent the last message, and a reply has no Cc or Bcc lines. To copy someone, start a new email instead. Check who is marked primary before replying to anything sensitive.",
					},
					{
						type: "tip",
						text: "You can move through the list with the up and down arrow keys. A reply you've started is kept while you look at other conversations, so you can check something and come back without losing it.",
					},
				],
			},
			{
				heading: "Start a new email",
				blocks: [
					{
						type: "steps",
						items: [
							"Click **New email** at the top of the inbox.",
							"Pick the client, then the contact to send to. It defaults to their primary contact.",
							"To copy someone else, click **Add CC/BCC** and type their address on the **Cc** or **Bcc** line.",
							"Add a subject and write your message. Use **Attach file** to send photos or documents along with it.",
							"Click **Send email**.",
						],
					},
					{
						type: "paragraph",
						text: "The conversation starts already linked to that client, and their reply lands back in this inbox. A greeting and your signature are added around what you write, so the email arrives looking professional without extra work.",
					},
					{
						type: "note",
						text: "Attachments on one email can total 20MB, and program files are refused.",
					},
				],
			},
			{
				heading: "Reading the original email",
				blocks: [
					{
						type: "paragraph",
						text: "Incoming messages show just the new text, with quoted history and signatures trimmed away. If something looks missing, click **Show original message** under the text to see the full email as it was sent.",
					},
				],
			},
			{
				heading: "Link a thread to a client",
				blocks: [
					{
						type: "paragraph",
						text: "A conversation that is not yet connected to a client shows an **Unlinked** pill in its header. Until you link it, the reply box is replaced with a prompt to link the conversation, so linking is the first step to answering it.",
					},
					{
						type: "steps",
						items: [
							"Open the unlinked thread.",
							"Click **Link to client**.",
							"Pick the client the conversation belongs to.",
						],
					},
					{
						type: "paragraph",
						text: "Linking files the whole conversation under that client, so it also appears on their record. Use the **Unlinked** filter to round up every conversation that still needs a client.",
					},
					{
						type: "media",
						media: "image",
						caption: "Linking a conversation to a client",
						asset: "inbox/unified-inbox/linking-a-conversation-to-a-client",
					},
				],
			},
			{
				heading: "Mark unread and archive",
				blocks: [
					{
						type: "paragraph",
						text: "Use **Mark unread** in the thread header to flag a conversation you want to come back to. Use **Archive** to close a finished conversation and remove it from the inbox.",
					},
					{
						type: "note",
						text: "There is no archived view in the inbox, so an archived conversation will not show up under any filter. Archive a thread only when it is done.",
					},
				],
			},
		],
		faq: [
			{
				question: "Do my teammates see the same conversations?",
				answer: "Yes. The inbox is shared across your organization. Everyone with inbox access sees the same threads, including replies sent by teammates.",
			},
			{
				question: "Why can't I type a reply?",
				answer: "The conversation is not linked to a client yet. Link it to a client and the reply box appears.",
			},
			{
				question: "Who receives my reply?",
				answer: "The client's primary contact. If a client has several contacts, the reply goes to whoever is marked primary, not necessarily the person who wrote last.",
			},
			{
				question: "Can I attach a file to a reply?",
				answer: "Yes. Use Attach file below the message box. Everything on one email can total 20MB, and program files are refused. Files that clients email you appear on their messages in the inbox and on the client's Email Threads tab, ready to download.",
			},
			{
				question: "What address do my emails come from?",
				answer: "Your organization's OneTool email address, which ends in @inbound.onetool.biz. The organization owner can customize the part before the @ in [organization settings](/help/settings-and-team/organization-profile).",
			},
		],
		related: [
			"inbox/emailing-from-a-client-record",
			"settings-and-team/member-permissions",
			"clients/managing-clients",
		],
	},
	{
		slug: "emailing-from-a-client-record",
		title: "Emailing from a client record",
		subtitle: "Send and answer email for one client without leaving their page.",
		kind: "howto",
		availability: "all",
		permission: "Admins, and members with access to the inbox.",
		keywords: ["attachments", "downloads", "compose", "reply", "messages", "threads", "files", "cc", "bcc"],
		sections: [
			{
				heading: "The Email Threads tab",
				blocks: [
					{
						type: "paragraph",
						text: "Every client's page has an **Email Threads** tab, with a count of the conversations you have had with them. It is the same mailbox as the shared [inbox](/help/inbox/unified-inbox), scoped to one client. A reply sent here and a reply sent from the inbox land in the same thread, so use whichever is closer to hand.",
					},
					{
						type: "paragraph",
						text: "Composing and replying happen in a slide-over panel on top of the client's page, so their details stay in view while you write. The **Email** button on a client's quick-view drawer opens the same panel, so you get the full editor there too.",
					},
				],
			},
			{
				heading: "Compose a new email",
				blocks: [
					{
						type: "steps",
						items: [
							"Open the client and click **Compose Email** at the top of the page.",
							"Pick the recipient on the **To** line. It defaults to the client's primary contact.",
							"To copy someone else, click **Add CC/BCC** and type their address on the **Cc** or **Bcc** line.",
							"Enter a **Subject** and write your **Message**. Use the toolbar to format it: bold, italic, underline, lists, links, and quotes.",
							"Use **Attach file** to send photos or documents along with it.",
							"Click **Send email**. OneTool adds a greeting and your signature around what you wrote.",
						],
					},
					{
						type: "media",
						media: "image",
						caption: "Composing an email from a client's page",
						asset: "inbox/emailing-from-a-client-record/composing-an-email-from-a-clients",
					},
				],
			},
			{
				heading: "Reply to a conversation",
				blocks: [
					{
						type: "steps",
						items: [
							"Open the **Email Threads** tab and click a conversation to open it.",
							"Type your reply in the message box. Replies do not need a subject.",
							"Click **Send reply**, or press Cmd+Enter (Ctrl+Enter on Windows).",
						],
					},
					{
						type: "paragraph",
						text: "Each email you send shows a delivery status under the message: sent, delivered, opened, or bounced. It is an easy way to tell whether a quiet client ever saw your note.",
					},
				],
			},
			{
				heading: "Attachments",
				blocks: [
					{
						type: "paragraph",
						text: "When a client emails you a photo or document, the file appears on their message in this tab, with its name, its size, and a download button. This is the place to look for anything a client sends you.",
					},
					{
						type: "media",
						media: "image",
						caption: "An incoming message with a downloadable attachment",
						asset: "inbox/emailing-from-a-client-record/incoming-message-with-a-downloadable-attachment",
					},
					{
						type: "note",
						text: "You can send files as well as receive them. **Attach file** sits under the message box on both a new email and a reply. Everything on one email can total 20MB, and program files are refused.",
					},
				],
			},
		],
		faq: [
			{
				question: "Is this a different inbox from the Inbox page?",
				answer: "No. The Email Threads tab and the shared inbox show the same conversations. The tab is filtered to one client, while the inbox shows every client. Replies from either place go into the same thread.",
			},
			{
				question: "Who receives the email?",
				answer: "A new email goes to the contact on the To line, which defaults to the primary contact. Anyone you add on Cc or Bcc gets a copy. Replies always go to the client's primary contact.",
			},
			{
				question: "Why don't I see the Email Threads tab?",
				answer: "Email access is granted per member through the inbox permission. Ask an admin to turn it on for you.",
			},
		],
		related: [
			"inbox/unified-inbox",
			"clients/contacts-and-properties",
			"clients/managing-clients",
		],
	},
];
