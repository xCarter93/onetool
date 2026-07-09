import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach } from "vitest";
import { api } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import {
	createTestOrg,
	createTestClient,
	createTestIdentity,
} from "./test.helpers";
import { Id } from "./_generated/dataModel";

describe("EmailMessages", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	/**
	 * Helper to create a test email message
	 */
	async function createTestEmailMessage(
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		ctx: any,
		orgId: Id<"organizations">,
		clientId: Id<"clients">,
		overrides: {
			resendEmailId?: string;
			direction?: "outbound" | "inbound";
			threadId?: string;
			threadDocId?: Id<"emailThreads">;
			subject?: string;
			messageBody?: string;
			messagePreview?: string;
			fromEmail?: string;
			fromName?: string;
			toEmail?: string;
			toName?: string;
			status?: "sent" | "delivered" | "opened" | "bounced" | "complained";
			sentAt?: number;
			openedAt?: number;
			sentBy?: Id<"users">;
			hasAttachments?: boolean;
		} = {}
	): Promise<Id<"emailMessages">> {
		return await ctx.db.insert("emailMessages", {
			orgId,
			clientId,
			resendEmailId: overrides.resendEmailId ?? `resend_${Date.now()}_${Math.random()}`,
			direction: overrides.direction ?? "outbound",
			threadId: overrides.threadId,
			threadDocId: overrides.threadDocId,
			subject: overrides.subject ?? "Test Email Subject",
			messageBody: overrides.messageBody ?? "Test email body content",
			messagePreview: overrides.messagePreview,
			fromEmail: overrides.fromEmail ?? "sender@example.com",
			fromName: overrides.fromName ?? "Test Sender",
			toEmail: overrides.toEmail ?? "recipient@example.com",
			toName: overrides.toName ?? "Test Recipient",
			status: overrides.status ?? "sent",
			sentAt: overrides.sentAt ?? Date.now(),
			openedAt: overrides.openedAt,
			sentBy: overrides.sentBy,
			hasAttachments: overrides.hasAttachments,
		});
	}

	/**
	 * Helper to create a test email thread (first-class emailThreads row)
	 */
	async function createTestEmailThread(
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		ctx: any,
		orgId: Id<"organizations">,
		clientId: Id<"clients"> | null,
		overrides: {
			subjectNormalized?: string;
			subject?: string;
			lastMessagePreview?: string;
			lastMessageAt?: number;
			messageCount?: number;
			unreadCount?: number;
			status?: "open" | "archived";
			participantEmails?: string[];
		} = {}
	): Promise<Id<"emailThreads">> {
		return await ctx.db.insert("emailThreads", {
			orgId,
			clientId,
			subjectNormalized: overrides.subjectNormalized ?? "test subject",
			subject: overrides.subject ?? "Test Subject",
			lastMessagePreview: overrides.lastMessagePreview ?? "Latest preview",
			lastMessageAt: overrides.lastMessageAt ?? Date.now(),
			messageCount: overrides.messageCount ?? 1,
			unreadCount: overrides.unreadCount ?? 0,
			status: overrides.status ?? "open",
			participantEmails:
				overrides.participantEmails ?? ["sender@example.com"],
		});
	}

	describe("listByClient", () => {
		it("should return emails for a specific client", async () => {
			const { orgId, clerkUserId, clerkOrgId, clientId } = await t.run(
				async (ctx) => {
					const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
					const clientId = await createTestClient(ctx, orgId);

					// Create emails for this client
					await createTestEmailMessage(ctx, orgId, clientId, {
						subject: "Email 1",
					});
					await createTestEmailMessage(ctx, orgId, clientId, {
						subject: "Email 2",
					});

					return { orgId, clerkUserId, clerkOrgId, clientId };
				}
			);

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const emails = await asUser.query(api.emailMessages.listByClient, {
				clientId,
			});

			expect(emails).toHaveLength(2);
			expect(emails.map((e) => e.subject)).toContain("Email 1");
			expect(emails.map((e) => e.subject)).toContain("Email 2");
		});

		it("should return emails sorted by sent date descending", async () => {
			const { orgId, clerkUserId, clerkOrgId, clientId } = await t.run(
				async (ctx) => {
					const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
					const clientId = await createTestClient(ctx, orgId);

					// Create emails with different timestamps
					await createTestEmailMessage(ctx, orgId, clientId, {
						subject: "Oldest Email",
						sentAt: Date.now() - 3000,
					});
					await createTestEmailMessage(ctx, orgId, clientId, {
						subject: "Middle Email",
						sentAt: Date.now() - 2000,
					});
					await createTestEmailMessage(ctx, orgId, clientId, {
						subject: "Newest Email",
						sentAt: Date.now() - 1000,
					});

					return { orgId, clerkUserId, clerkOrgId, clientId };
				}
			);

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const emails = await asUser.query(api.emailMessages.listByClient, {
				clientId,
			});

			expect(emails).toHaveLength(3);
			// Should be sorted descending (newest first)
			expect(emails[0].subject).toBe("Newest Email");
			expect(emails[1].subject).toBe("Middle Email");
			expect(emails[2].subject).toBe("Oldest Email");
		});

		it("should return empty array when user is not authenticated", async () => {
			const { clientId } = await t.run(async (ctx) => {
				const { orgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);

				await createTestEmailMessage(ctx, orgId, clientId);

				return { clientId };
			});

			// No identity set - unauthenticated
			const emails = await t.query(api.emailMessages.listByClient, {
				clientId,
			});

			expect(emails).toEqual([]);
		});
	});

	describe("getByResendId", () => {
		it("should return email by Resend ID", async () => {
			const { orgId, clerkUserId, clerkOrgId, resendEmailId } = await t.run(
				async (ctx) => {
					const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
					const clientId = await createTestClient(ctx, orgId);

					const resendEmailId = "resend_unique_123";
					await createTestEmailMessage(ctx, orgId, clientId, {
						resendEmailId,
						subject: "Specific Email",
					});

					return { orgId, clerkUserId, clerkOrgId, resendEmailId };
				}
			);

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const email = await asUser.query(api.emailMessages.getByResendId, {
				resendEmailId,
			});

			expect(email).not.toBeNull();
			expect(email?.subject).toBe("Specific Email");
			expect(email?.resendEmailId).toBe(resendEmailId);
		});

		it("should return null for non-existent Resend ID", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				return { clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const email = await asUser.query(api.emailMessages.getByResendId, {
				resendEmailId: "non_existent_id",
			});

			expect(email).toBeNull();
		});
	});

	describe("getRecentEmails", () => {
		it("should return recent emails for the organization", async () => {
			const { orgId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);

				// Create several emails
				for (let i = 0; i < 5; i++) {
					await createTestEmailMessage(ctx, orgId, clientId, {
						subject: `Email ${i + 1}`,
					});
				}

				return { orgId, clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const emails = await asUser.query(api.emailMessages.getRecentEmails, {});

			expect(emails).toHaveLength(5);
		});

		it("should respect limit parameter", async () => {
			const { orgId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);

				// Create 10 emails
				for (let i = 0; i < 10; i++) {
					await createTestEmailMessage(ctx, orgId, clientId, {
						subject: `Email ${i + 1}`,
					});
				}

				return { orgId, clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const emails = await asUser.query(api.emailMessages.getRecentEmails, {
				limit: 3,
			});

			expect(emails).toHaveLength(3);
		});
	});

	describe("countUnopened", () => {
		it("should count unopened emails for a client", async () => {
			const { orgId, clerkUserId, clerkOrgId, clientId } = await t.run(
				async (ctx) => {
					const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
					const clientId = await createTestClient(ctx, orgId);

					// Create sent emails (unopened)
					await createTestEmailMessage(ctx, orgId, clientId, {
						status: "sent",
						openedAt: undefined,
					});
					await createTestEmailMessage(ctx, orgId, clientId, {
						status: "delivered",
						openedAt: undefined,
					});

					// Create opened email
					await createTestEmailMessage(ctx, orgId, clientId, {
						status: "opened",
						openedAt: Date.now(),
					});

					return { orgId, clerkUserId, clerkOrgId, clientId };
				}
			);

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const count = await asUser.query(api.emailMessages.countUnopened, {
				clientId,
			});

			expect(count).toBe(2);
		});

		it("should return 0 when all emails are opened", async () => {
			const { orgId, clerkUserId, clerkOrgId, clientId } = await t.run(
				async (ctx) => {
					const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
					const clientId = await createTestClient(ctx, orgId);

					// All emails are opened
					await createTestEmailMessage(ctx, orgId, clientId, {
						status: "opened",
						openedAt: Date.now(),
					});
					await createTestEmailMessage(ctx, orgId, clientId, {
						status: "opened",
						openedAt: Date.now(),
					});

					return { orgId, clerkUserId, clerkOrgId, clientId };
				}
			);

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const count = await asUser.query(api.emailMessages.countUnopened, {
				clientId,
			});

			expect(count).toBe(0);
		});
	});

	describe("getClientEmailStats", () => {
		it("should return correct email statistics for a client", async () => {
			const { orgId, clerkUserId, clerkOrgId, clientId } = await t.run(
				async (ctx) => {
					const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
					const clientId = await createTestClient(ctx, orgId);

					// Create emails with various statuses
					await createTestEmailMessage(ctx, orgId, clientId, { status: "sent" });
					await createTestEmailMessage(ctx, orgId, clientId, { status: "sent" });
					await createTestEmailMessage(ctx, orgId, clientId, { status: "delivered" });
					await createTestEmailMessage(ctx, orgId, clientId, {
						status: "opened",
						openedAt: Date.now(),
					});
					await createTestEmailMessage(ctx, orgId, clientId, { status: "bounced" });

					return { orgId, clerkUserId, clerkOrgId, clientId };
				}
			);

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const stats = await asUser.query(api.emailMessages.getClientEmailStats, {
				clientId,
			});

			expect(stats).not.toBeNull();
			expect(stats?.total).toBe(5);
			expect(stats?.sent).toBe(2);
			expect(stats?.delivered).toBe(1);
			expect(stats?.opened).toBe(1);
			expect(stats?.bounced).toBe(1);
			expect(stats?.openRate).toBe(20); // 1 opened out of 5
		});

		it("should return null for unauthenticated user", async () => {
			const { clientId } = await t.run(async (ctx) => {
				const { orgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				return { clientId };
			});

			const stats = await t.query(api.emailMessages.getClientEmailStats, {
				clientId,
			});

			expect(stats).toBeNull();
		});
	});

	describe("listThreadsByClient", () => {
		it("should return thread summaries keyed by threadDocId, newest-first", async () => {
			const { orgId, clerkUserId, clerkOrgId, clientId, mainThreadId, otherThreadId } =
				await t.run(async (ctx) => {
					const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
					const clientId = await createTestClient(ctx, orgId);

					// Older thread with 2 messages
					const mainThreadId = await createTestEmailThread(ctx, orgId, clientId, {
						subject: "Initial Message",
						subjectNormalized: "initial message",
						lastMessagePreview: "Re: Initial Message",
						lastMessageAt: Date.now() - 2000,
						messageCount: 2,
					});
					await createTestEmailMessage(ctx, orgId, clientId, {
						threadDocId: mainThreadId,
						subject: "Initial Message",
						sentAt: Date.now() - 3000,
					});
					await createTestEmailMessage(ctx, orgId, clientId, {
						threadDocId: mainThreadId,
						subject: "Re: Initial Message",
						sentAt: Date.now() - 2000,
					});

					// Newer thread with 1 message
					const otherThreadId = await createTestEmailThread(ctx, orgId, clientId, {
						subject: "Different Topic",
						subjectNormalized: "different topic",
						lastMessagePreview: "Different Topic",
						lastMessageAt: Date.now() - 1000,
						messageCount: 1,
					});
					await createTestEmailMessage(ctx, orgId, clientId, {
						threadDocId: otherThreadId,
						subject: "Different Topic",
						sentAt: Date.now() - 1000,
					});

					return {
						orgId,
						clerkUserId,
						clerkOrgId,
						clientId,
						mainThreadId,
						otherThreadId,
					};
				});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const threads = await asUser.query(api.emailMessages.listThreadsByClient, {
				clientId,
			});

			expect(threads).toHaveLength(2);

			// Sorted by latestMessageAt desc → newer thread first
			expect(threads[0].threadDocId).toBe(otherThreadId);
			expect(threads[1].threadDocId).toBe(mainThreadId);

			const mainThread = threads.find((t) => t.threadDocId === mainThreadId);
			expect(mainThread).toBeDefined();
			expect(mainThread?.messageCount).toBe(2);
			expect(mainThread?.subject).toBe("Initial Message");
			expect(mainThread?.latestMessage).toBe("Re: Initial Message");

			const otherThread = threads.find((t) => t.threadDocId === otherThreadId);
			expect(otherThread).toBeDefined();
			expect(otherThread?.messageCount).toBe(1);
		});

		it("should mark threads with unread messages via unreadCount", async () => {
			const { clerkUserId, clerkOrgId, clientId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);

				const threadId = await createTestEmailThread(ctx, orgId, clientId, {
					subject: "Incoming Email",
					subjectNormalized: "incoming email",
					unreadCount: 1,
				});
				await createTestEmailMessage(ctx, orgId, clientId, {
					threadDocId: threadId,
					direction: "inbound",
					subject: "Incoming Email",
				});

				return { clerkUserId, clerkOrgId, clientId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const threads = await asUser.query(api.emailMessages.listThreadsByClient, {
				clientId,
			});

			expect(threads).toHaveLength(1);
			expect(threads[0].hasUnread).toBe(true);
		});

		it("should exclude archived threads", async () => {
			const { clerkUserId, clerkOrgId, clientId, openThreadId } = await t.run(
				async (ctx) => {
					const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
					const clientId = await createTestClient(ctx, orgId);

					const openThreadId = await createTestEmailThread(ctx, orgId, clientId, {
						subject: "Open Thread",
						subjectNormalized: "open thread",
						status: "open",
					});
					await createTestEmailThread(ctx, orgId, clientId, {
						subject: "Archived Thread",
						subjectNormalized: "archived thread",
						status: "archived",
					});

					return { clerkUserId, clerkOrgId, clientId, openThreadId };
				}
			);

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const threads = await asUser.query(api.emailMessages.listThreadsByClient, {
				clientId,
			});

			expect(threads).toHaveLength(1);
			expect(threads[0].threadDocId).toBe(openThreadId);
		});

		it("should not return threads from other organizations", async () => {
			const { clerkUserId1, clerkOrgId1, clientId1 } = await t.run(async (ctx) => {
				const {
					orgId: orgId1,
					clerkUserId: clerkUserId1,
					clerkOrgId: clerkOrgId1,
				} = await createTestOrg(ctx, {
					clerkUserId: "user_threads_org1",
					clerkOrgId: "org_threads_1",
					orgName: "Threads Org 1",
				});
				const clientId1 = await createTestClient(ctx, orgId1);
				await createTestEmailThread(ctx, orgId1, clientId1, {
					subject: "Org 1 Thread",
					subjectNormalized: "org 1 thread",
				});

				// Second org, different client
				const { orgId: orgId2 } = await createTestOrg(ctx, {
					clerkUserId: "user_threads_org2",
					clerkOrgId: "org_threads_2",
					orgName: "Threads Org 2",
				});
				const clientId2 = await createTestClient(ctx, orgId2);
				await createTestEmailThread(ctx, orgId2, clientId2, {
					subject: "Org 2 Thread",
					subjectNormalized: "org 2 thread",
				});

				return { clerkUserId1, clerkOrgId1, clientId1 };
			});

			const asUser1 = t.withIdentity(
				createTestIdentity(clerkUserId1, clerkOrgId1)
			);

			const threads = await asUser1.query(
				api.emailMessages.listThreadsByClient,
				{ clientId: clientId1 }
			);

			expect(threads).toHaveLength(1);
			expect(threads[0].subject).toBe("Org 1 Thread");
		});
	});

	describe("getEmailThread", () => {
		it("should return all messages in a thread sorted by sent date", async () => {
			const { clerkUserId, clerkOrgId, threadDocId } = await t.run(
				async (ctx) => {
					const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
					const clientId = await createTestClient(ctx, orgId);

					const threadDocId = await createTestEmailThread(ctx, orgId, clientId, {
						subject: "Third Message",
						subjectNormalized: "first message",
						messageCount: 3,
					});

					// Create emails in the thread with different timestamps
					await createTestEmailMessage(ctx, orgId, clientId, {
						threadDocId,
						subject: "First Message",
						sentAt: Date.now() - 3000,
					});
					await createTestEmailMessage(ctx, orgId, clientId, {
						threadDocId,
						subject: "Second Message",
						sentAt: Date.now() - 2000,
					});
					await createTestEmailMessage(ctx, orgId, clientId, {
						threadDocId,
						subject: "Third Message",
						sentAt: Date.now() - 1000,
					});

					return { clerkUserId, clerkOrgId, threadDocId };
				}
			);

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const messages = await asUser.query(api.emailMessages.getEmailThread, {
				threadDocId,
			});

			expect(messages).toHaveLength(3);
			// Should be sorted ascending (oldest first for thread view)
			expect(messages?.[0].subject).toBe("First Message");
			expect(messages?.[1].subject).toBe("Second Message");
			expect(messages?.[2].subject).toBe("Third Message");
		});

		it("should include sender information for outbound emails", async () => {
			const { clerkUserId, clerkOrgId, threadDocId } = await t.run(
				async (ctx) => {
					const { orgId, clerkUserId, clerkOrgId, userId } =
						await createTestOrg(ctx);
					const clientId = await createTestClient(ctx, orgId);

					const threadDocId = await createTestEmailThread(
						ctx,
						orgId,
						clientId,
						{ subject: "With Sender", subjectNormalized: "with sender" }
					);

					await createTestEmailMessage(ctx, orgId, clientId, {
						threadDocId,
						direction: "outbound",
						sentBy: userId,
					});

					return { clerkUserId, clerkOrgId, threadDocId };
				}
			);

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const messages = await asUser.query(api.emailMessages.getEmailThread, {
				threadDocId,
			});

			expect(messages).toHaveLength(1);
			expect(messages?.[0].senderName).toBe("Test User");
		});

		it("should not return a thread that belongs to another organization", async () => {
			const { clerkUserId1, clerkOrgId1, threadDocId2 } = await t.run(
				async (ctx) => {
					const {
						orgId: orgId1,
						clerkUserId: clerkUserId1,
						clerkOrgId: clerkOrgId1,
					} = await createTestOrg(ctx, {
						clerkUserId: "user_thread_iso_1",
						clerkOrgId: "org_thread_iso_1",
						orgName: "Thread Iso Org 1",
					});
					void orgId1;

					// Second org owns the thread
					const { orgId: orgId2 } = await createTestOrg(ctx, {
						clerkUserId: "user_thread_iso_2",
						clerkOrgId: "org_thread_iso_2",
						orgName: "Thread Iso Org 2",
					});
					const clientId2 = await createTestClient(ctx, orgId2);
					const threadDocId2 = await createTestEmailThread(
						ctx,
						orgId2,
						clientId2,
						{ subject: "Org 2 Only", subjectNormalized: "org 2 only" }
					);
					await createTestEmailMessage(ctx, orgId2, clientId2, {
						threadDocId: threadDocId2,
						subject: "Org 2 Only",
					});

					return { clerkUserId1, clerkOrgId1, threadDocId2 };
				}
			);

			const asUser1 = t.withIdentity(
				createTestIdentity(clerkUserId1, clerkOrgId1)
			);

			// User in org 1 must not read org 2's thread
			const messages = await asUser1.query(
				api.emailMessages.getEmailThread,
				{ threadDocId: threadDocId2 }
			);

			expect(messages).toBeNull();
		});
	});

	describe("getEmailWithAttachments", () => {
		it("should return email with attachments when present", async () => {
			const { orgId, clerkUserId, clerkOrgId, emailId } = await t.run(
				async (ctx) => {
					const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
					const clientId = await createTestClient(ctx, orgId);

					const emailId = await createTestEmailMessage(ctx, orgId, clientId, {
						hasAttachments: true,
					});

					// Create attachments
					await ctx.db.insert("emailAttachments", {
						orgId,
						emailMessageId: emailId,
						attachmentId: `attachment_${Date.now()}`,
						filename: "document.pdf",
						contentType: "application/pdf",
						size: 1024,
						receivedAt: Date.now(),
					});

					return { orgId, clerkUserId, clerkOrgId, emailId };
				}
			);

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const emailWithAttachments = await asUser.query(
				api.emailMessages.getEmailWithAttachments,
				{ emailMessageId: emailId }
			);

			expect(emailWithAttachments).not.toBeNull();
			expect(emailWithAttachments?.hasAttachments).toBe(true);
			expect(emailWithAttachments?.attachments).toHaveLength(1);
			expect(emailWithAttachments?.attachments[0].filename).toBe("document.pdf");
		});

		it("should return email without attachments when none exist", async () => {
			const { orgId, clerkUserId, clerkOrgId, emailId } = await t.run(
				async (ctx) => {
					const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
					const clientId = await createTestClient(ctx, orgId);

					const emailId = await createTestEmailMessage(ctx, orgId, clientId, {
						hasAttachments: false,
					});

					return { orgId, clerkUserId, clerkOrgId, emailId };
				}
			);

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const emailWithAttachments = await asUser.query(
				api.emailMessages.getEmailWithAttachments,
				{ emailMessageId: emailId }
			);

			expect(emailWithAttachments).not.toBeNull();
			expect(emailWithAttachments?.attachments).toHaveLength(0);
		});
	});

	describe("organization isolation", () => {
		it("should not return emails from other organizations", async () => {
			const { clerkUserId1, clerkOrgId1, clientId1, clerkOrgId2 } = await t.run(
				async (ctx) => {
					// Create first organization with emails
					const { orgId: orgId1, clerkUserId: clerkUserId1, clerkOrgId: clerkOrgId1 } =
						await createTestOrg(ctx, {
							clerkUserId: "user_org1",
							clerkOrgId: "org_1",
							orgName: "Org 1",
						});
					const clientId1 = await createTestClient(ctx, orgId1, {
						companyName: "Client Org 1",
					});

					await createTestEmailMessage(ctx, orgId1, clientId1, {
						subject: "Email from Org 1",
					});

					// Create second organization with emails
					const { orgId: orgId2, clerkUserId: clerkUserId2, clerkOrgId: clerkOrgId2 } =
						await createTestOrg(ctx, {
							clerkUserId: "user_org2",
							clerkOrgId: "org_2",
							orgName: "Org 2",
						});
					const clientId2 = await createTestClient(ctx, orgId2, {
						companyName: "Client Org 2",
					});

					await createTestEmailMessage(ctx, orgId2, clientId2, {
						subject: "Email from Org 2",
					});

					return { clerkUserId1, clerkOrgId1, clientId1, clerkOrgId2 };
				}
			);

			const asUser1 = t.withIdentity(createTestIdentity(clerkUserId1, clerkOrgId1));

			// User 1 should only see emails from their organization
			const emails = await asUser1.query(api.emailMessages.listByClient, {
				clientId: clientId1,
			});

			expect(emails).toHaveLength(1);
			expect(emails[0].subject).toBe("Email from Org 1");
		});

		it("should not return email stats from other organizations", async () => {
			const { clerkUserId1, clerkOrgId1, clientId1 } = await t.run(
				async (ctx) => {
					// Create first organization
					const { orgId: orgId1, clerkUserId: clerkUserId1, clerkOrgId: clerkOrgId1 } =
						await createTestOrg(ctx, {
							clerkUserId: "user_stats_org1",
							clerkOrgId: "org_stats_1",
							orgName: "Stats Org 1",
						});
					const clientId1 = await createTestClient(ctx, orgId1);

					// Create emails for org 1
					await createTestEmailMessage(ctx, orgId1, clientId1, { status: "sent" });
					await createTestEmailMessage(ctx, orgId1, clientId1, { status: "opened", openedAt: Date.now() });

					// Create second organization with same client structure
					const { orgId: orgId2 } = await createTestOrg(ctx, {
						clerkUserId: "user_stats_org2",
						clerkOrgId: "org_stats_2",
						orgName: "Stats Org 2",
					});
					const clientId2 = await createTestClient(ctx, orgId2);

					// Create many more emails for org 2
					for (let i = 0; i < 10; i++) {
						await createTestEmailMessage(ctx, orgId2, clientId2, { status: "sent" });
					}

					return { clerkUserId1, clerkOrgId1, clientId1 };
				}
			);

			const asUser1 = t.withIdentity(createTestIdentity(clerkUserId1, clerkOrgId1));

			const stats = await asUser1.query(api.emailMessages.getClientEmailStats, {
				clientId: clientId1,
			});

			// Should only count org 1's emails (2 total)
			expect(stats?.total).toBe(2);
			expect(stats?.sent).toBe(1);
			expect(stats?.opened).toBe(1);
		});
	});
});
