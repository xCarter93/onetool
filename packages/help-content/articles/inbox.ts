import type { HelpArticle } from "../types";

export const inboxArticles: HelpArticle[] = [
	{
		slug: "unified-inbox",
		title: "The unified inbox",
		subtitle: "Work every client conversation from one shared inbox for your whole team.",
		kind: "howto",
		availability: "all",
		permission: "Admins, and members with access to the inbox.",
		keywords: ["email", "messages", "threads", "reply", "unread", "archive", "unlinked"],
		sections: [
			{
				heading: "One inbox for the whole team",
				blocks: [
					{
						type: "paragraph",
						text: "The inbox is your organization's shared mailbox for client email. Every message your team sends or receives lands in the same place, so anyone with access can see the full history of a conversation and pick it up where a teammate left off. There are no per-person mailboxes to check.",
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
							"Browse the left rail. Conversations are grouped by contact; click a contact to expand their threads, then click a thread to open it.",
							"Narrow the list with the **All**, **Unread**, and **Unlinked** filters at the top.",
							"Search by typing a client name or a subject. Matching a name expands that contact's whole group; matching a subject shows just the matching threads.",
						],
					},
					{
						type: "media",
						media: "image",
						caption: "The inbox, with conversations on the left and an open thread on the right",
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
							"Click a thread to open it in the right pane. OneTool marks it as read automatically.",
							"Type your reply in the box at the bottom of the thread.",
							"Click **Send**, or press Cmd+Enter (Ctrl+Enter on Windows).",
						],
					},
					{
						type: "note",
						text: "Replies go to the client's primary contact, even if a different contact sent the last message. Check who is marked primary before replying to anything sensitive.",
					},
					{
						type: "tip",
						text: "You can move through the list with the up and down arrow keys and press Enter to open the highlighted conversation.",
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
				answer: "Not currently. You can view and download files that arrive on email from clients, which appear on the client's Email Threads tab.",
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
		keywords: ["attachments", "downloads", "compose", "reply", "messages", "threads", "files"],
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
						text: "Composing and replying happen in a slide-over panel on top of the client's page, so their details stay in view while you write.",
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
							"Pick the recipient under **Send To**. It defaults to the client's primary contact.",
							"Enter a **Subject** and write your **Message**.",
							"Check the **Email Preview** below the message. OneTool adds a greeting and a signature around what you wrote.",
							"Click **Send Email**.",
						],
					},
					{
						type: "media",
						media: "image",
						caption: "Composing an email from a client's page",
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
							"Click **Send Reply**.",
						],
					},
					{
						type: "paragraph",
						text: "Each email you send shows a delivery status under the message: sent, delivered, opened, or bounced. It is an easy way to tell whether a quiet client ever saw your note.",
					},
				],
			},
			{
				heading: "Attachments from your clients",
				blocks: [
					{
						type: "paragraph",
						text: "When a client emails you a photo or document, the file appears on their message in this tab, with its name, its size, and a download button. This is the place to look for anything a client sends you.",
					},
					{
						type: "media",
						media: "image",
						caption: "An incoming message with a downloadable attachment",
					},
					{
						type: "note",
						text: "Attaching files to an email you send is not currently supported.",
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
				answer: "A new email goes to the contact you choose under Send To, which defaults to the primary contact. Replies always go to the client's primary contact.",
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
