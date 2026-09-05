import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach } from "vitest";
import { api } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import {
	createTestOrg,
	createTestIdentity,
	addMemberToOrg,
} from "./test.helpers";
import { Id } from "./_generated/dataModel";

describe("Notifications", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	describe("create", () => {
		it("should create a notification with valid data", async () => {
			const { userId, orgId, clerkUserId, clerkOrgId } = await t.run(
				async (ctx) => {
					return await createTestOrg(ctx);
				}
			);

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const notificationId = await asUser.mutation(api.notifications.create, {
				userId,
				notificationType: "task_reminder",
				title: "Task Due Soon",
				message: "Your task is due in 1 hour",
				entityType: "task",
				entityId: "task_123",
				actionUrl: "/tasks/task_123",
			});

			expect(notificationId).toBeDefined();

			const notification = await asUser.query(api.notifications.get, {
				id: notificationId,
			});

			expect(notification).toMatchObject({
				userId,
				notificationType: "task_reminder",
				title: "Task Due Soon",
				message: "Your task is due in 1 hour",
				isRead: false,
				orgId,
			});
		});

		it("should reject notification with empty title", async () => {
			const { userId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				return await createTestOrg(ctx);
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			await expect(
				asUser.mutation(api.notifications.create, {
					userId,
					notificationType: "task_reminder",
					title: "   ",
					message: "Valid message",
				})
			).rejects.toThrowError("Notification title is required");
		});

		it("should reject notification with empty message", async () => {
			const { userId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				return await createTestOrg(ctx);
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			await expect(
				asUser.mutation(api.notifications.create, {
					userId,
					notificationType: "task_reminder",
					title: "Valid Title",
					message: "",
				})
			).rejects.toThrowError("Notification message is required");
		});

		it("should reject scheduled time in the past", async () => {
			const { userId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				return await createTestOrg(ctx);
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			await expect(
				asUser.mutation(api.notifications.create, {
					userId,
					notificationType: "task_reminder",
					title: "Valid Title",
					message: "Valid message",
					scheduledFor: Date.now() - 1000, // 1 second in the past
				})
			).rejects.toThrowError("Scheduled time must be in the future");
		});
	});

	describe("get", () => {
		it("should return a specific notification by ID", async () => {
			const { userId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				return await createTestOrg(ctx);
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const notificationId = await asUser.mutation(api.notifications.create, {
				userId,
				notificationType: "invoice_overdue",
				title: "Invoice Overdue",
				message: "Invoice #123 is overdue",
			});

			const notification = await asUser.query(api.notifications.get, {
				id: notificationId,
			});

			expect(notification).toMatchObject({
				notificationType: "invoice_overdue",
				title: "Invoice Overdue",
				message: "Invoice #123 is overdue",
			});
		});
	});

	describe("markRead", () => {
		it("should mark a notification as read", async () => {
			const { userId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				return await createTestOrg(ctx);
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const notificationId = await asUser.mutation(api.notifications.create, {
				userId,
				notificationType: "payment_received",
				title: "Payment Received",
				message: "You received a payment of $500",
			});

			// Mark as read
			await asUser.mutation(api.notifications.markRead, {
				id: notificationId,
			});

			const notification = await asUser.query(api.notifications.get, {
				id: notificationId,
			});

			expect(notification?.isRead).toBe(true);
			expect(notification?.readAt).toBeDefined();
		});

		it("should throw error when marking already read notification", async () => {
			const { userId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				return await createTestOrg(ctx);
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const notificationId = await asUser.mutation(api.notifications.create, {
				userId,
				notificationType: "payment_received",
				title: "Payment Received",
				message: "You received a payment",
			});

			// Mark as read first time
			await asUser.mutation(api.notifications.markRead, {
				id: notificationId,
			});

			// Try to mark as read again
			await expect(
				asUser.mutation(api.notifications.markRead, {
					id: notificationId,
				})
			).rejects.toThrowError("Notification is already read");
		});
	});

	describe("markUnread", () => {
		it("should mark a notification as unread", async () => {
			const { userId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				return await createTestOrg(ctx);
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const notificationId = await asUser.mutation(api.notifications.create, {
				userId,
				notificationType: "project_deadline",
				title: "Project Deadline",
				message: "Project deadline approaching",
			});

			// Mark as read first
			await asUser.mutation(api.notifications.markRead, {
				id: notificationId,
			});

			// Then mark as unread
			await asUser.mutation(api.notifications.markUnread, {
				id: notificationId,
			});

			const notification = await asUser.query(api.notifications.get, {
				id: notificationId,
			});

			expect(notification?.isRead).toBe(false);
			expect(notification?.readAt).toBeUndefined();
		});

		it("should throw error when marking already unread notification", async () => {
			const { userId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				return await createTestOrg(ctx);
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const notificationId = await asUser.mutation(api.notifications.create, {
				userId,
				notificationType: "project_deadline",
				title: "Project Deadline",
				message: "Project deadline approaching",
			});

			// Notification is unread by default
			await expect(
				asUser.mutation(api.notifications.markUnread, {
					id: notificationId,
				})
			).rejects.toThrowError("Notification is already unread");
		});
	});

	describe("markMultipleRead", () => {
		it("should mark multiple notifications as read", async () => {
			const { userId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				return await createTestOrg(ctx);
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const id1 = await asUser.mutation(api.notifications.create, {
				userId,
				notificationType: "task_reminder",
				title: "Task 1",
				message: "Task 1 reminder",
			});

			const id2 = await asUser.mutation(api.notifications.create, {
				userId,
				notificationType: "task_reminder",
				title: "Task 2",
				message: "Task 2 reminder",
			});

			const id3 = await asUser.mutation(api.notifications.create, {
				userId,
				notificationType: "task_reminder",
				title: "Task 3",
				message: "Task 3 reminder",
			});

			const result = await asUser.mutation(api.notifications.markMultipleRead, {
				ids: [id1, id2, id3],
			});

			expect(result.updated).toBe(3);

			// Verify all are marked as read
			const n1 = await asUser.query(api.notifications.get, { id: id1 });
			const n2 = await asUser.query(api.notifications.get, { id: id2 });
			const n3 = await asUser.query(api.notifications.get, { id: id3 });

			expect(n1?.isRead).toBe(true);
			expect(n2?.isRead).toBe(true);
			expect(n3?.isRead).toBe(true);
		});
	});

	describe("remove", () => {
		it("should delete a notification", async () => {
			const { userId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				return await createTestOrg(ctx);
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const notificationId = await asUser.mutation(api.notifications.create, {
				userId,
				notificationType: "team_assignment",
				title: "Team Assignment",
				message: "You have been assigned to a team",
			});

			// Delete the notification
			await asUser.mutation(api.notifications.remove, {
				id: notificationId,
			});

			// Should not be found
			const notification = await asUser.query(api.notifications.get, {
				id: notificationId,
			});
			expect(notification).toBeNull();
		});
	});

	describe("cleanupOldNotifications", () => {
		// Note: _creationTime is set automatically by Convex and cannot be controlled in tests,
		// so we cannot easily test deletion of truly "old" notifications. Instead, we verify
		// the function works correctly when no old notifications exist.
		it("should not delete recent read notifications", async () => {
			const { userId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				return await createTestOrg(ctx);
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			// Create notifications (these will have current _creationTime)
			const id1 = await asUser.mutation(api.notifications.create, {
				userId,
				notificationType: "task_reminder",
				title: "Recent Notification 1",
				message: "This is recent",
			});

			await asUser.mutation(api.notifications.create, {
				userId,
				notificationType: "task_reminder",
				title: "Recent Notification 2",
				message: "This is also recent",
			});

			// Mark one as read
			await asUser.mutation(api.notifications.markRead, { id: id1 });

			// Cleanup notifications older than 30 days - should delete nothing since all are recent
			const result = await asUser.mutation(
				api.notifications.cleanupOldNotifications,
				{ daysOld: 30 }
			);

			expect(result.deletedCount).toBe(0);

			// Both notifications should still exist
			const afterCleanup = await asUser.query(
				api.notifications.listForCurrentUser,
				{}
			);
			expect(afterCleanup.notifications).toHaveLength(2);
		});

		it("should not delete unread notifications regardless of age", async () => {
			const { userId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				return await createTestOrg(ctx);
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			// Create unread notifications
			await asUser.mutation(api.notifications.create, {
				userId,
				notificationType: "task_reminder",
				title: "Unread Notification",
				message: "This is unread",
			});

			const result = await asUser.mutation(
				api.notifications.cleanupOldNotifications,
				{ daysOld: 30 }
			);

			// Should not delete unread notifications
			expect(result.deletedCount).toBe(0);

			// Notification should still exist
			const afterCleanup = await asUser.query(
				api.notifications.listForCurrentUser,
				{}
			);
			expect(afterCleanup.notifications).toHaveLength(1);
		});

		it("should reject daysOld less than 1", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				return await createTestOrg(ctx);
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			await expect(
				asUser.mutation(api.notifications.cleanupOldNotifications, {
					daysOld: 0,
				})
			).rejects.toThrowError("Days old must be at least 1");
		});
	});

	describe("organization isolation", () => {
		it("should not return notifications from other organizations", async () => {
			// Create first org with a notification
			const { userId: user1Id, clerkUserId: clerkUser1, clerkOrgId: clerkOrg1 } =
				await t.run(async (ctx) => {
					return await createTestOrg(ctx, {
						userName: "User 1",
						userEmail: "user1@example.com",
						orgName: "Org 1",
						clerkUserId: "user_1",
						clerkOrgId: "org_1",
					});
				});

			// Create second org with a notification
			const { userId: user2Id, clerkUserId: clerkUser2, clerkOrgId: clerkOrg2 } =
				await t.run(async (ctx) => {
					return await createTestOrg(ctx, {
						userName: "User 2",
						userEmail: "user2@example.com",
						orgName: "Org 2",
						clerkUserId: "user_2",
						clerkOrgId: "org_2",
					});
				});

			const asUser1 = t.withIdentity(createTestIdentity(clerkUser1, clerkOrg1));
			const asUser2 = t.withIdentity(createTestIdentity(clerkUser2, clerkOrg2));

			// Create notification in org 1
			await asUser1.mutation(api.notifications.create, {
				userId: user1Id,
				notificationType: "task_reminder",
				title: "Org 1 Notification",
				message: "This belongs to org 1",
			});

			// Create notification in org 2
			await asUser2.mutation(api.notifications.create, {
				userId: user2Id,
				notificationType: "task_reminder",
				title: "Org 2 Notification",
				message: "This belongs to org 2",
			});

			// User 1 should only see org 1's notifications
			const user1Notifications = await asUser1.query(
				api.notifications.listForCurrentUser,
				{}
			);
			expect(user1Notifications.notifications).toHaveLength(1);
			expect(user1Notifications.notifications[0].title).toBe(
				"Org 1 Notification"
			);

			// User 2 should only see org 2's notifications
			const user2Notifications = await asUser2.query(
				api.notifications.listForCurrentUser,
				{}
			);
			expect(user2Notifications.notifications).toHaveLength(1);
			expect(user2Notifications.notifications[0].title).toBe(
				"Org 2 Notification"
			);
		});

		it("should not allow accessing notifications from another organization", async () => {
			// Create first org
			const {
				userId: user1Id,
				orgId: org1Id,
				clerkUserId: clerkUser1,
				clerkOrgId: clerkOrg1,
			} = await t.run(async (ctx) => {
				return await createTestOrg(ctx, {
					userName: "User 1",
					userEmail: "user1@example.com",
					orgName: "Org 1",
					clerkUserId: "user_1",
					clerkOrgId: "org_1",
				});
			});

			// Create second org
			const { clerkUserId: clerkUser2, clerkOrgId: clerkOrg2 } = await t.run(
				async (ctx) => {
					return await createTestOrg(ctx, {
						userName: "User 2",
						userEmail: "user2@example.com",
						orgName: "Org 2",
						clerkUserId: "user_2",
						clerkOrgId: "org_2",
					});
				}
			);

			const asUser1 = t.withIdentity(createTestIdentity(clerkUser1, clerkOrg1));
			const asUser2 = t.withIdentity(createTestIdentity(clerkUser2, clerkOrg2));

			// Create notification in org 1
			const notificationId = await asUser1.mutation(api.notifications.create, {
				userId: user1Id,
				notificationType: "task_reminder",
				title: "Secret Notification",
				message: "This should not be accessible by org 2",
			});

			// User 2 should not be able to access this notification
			await expect(
				asUser2.mutation(api.notifications.markRead, {
					id: notificationId,
				})
			).rejects.toThrowError("Notification does not belong to your organization");
		});
	});

	describe("update", () => {
		it("should update notification fields", async () => {
			const { userId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				return await createTestOrg(ctx);
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const notificationId = await asUser.mutation(api.notifications.create, {
				userId,
				notificationType: "task_reminder",
				title: "Original Title",
				message: "Original message",
			});

			await asUser.mutation(api.notifications.update, {
				id: notificationId,
				title: "Updated Title",
				message: "Updated message",
			});

			const notification = await asUser.query(api.notifications.get, {
				id: notificationId,
			});

			expect(notification?.title).toBe("Updated Title");
			expect(notification?.message).toBe("Updated message");
		});

		it("should reject empty title on update", async () => {
			const { userId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				return await createTestOrg(ctx);
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const notificationId = await asUser.mutation(api.notifications.create, {
				userId,
				notificationType: "task_reminder",
				title: "Original Title",
				message: "Original message",
			});

			await expect(
				asUser.mutation(api.notifications.update, {
					id: notificationId,
					title: "   ",
				})
			).rejects.toThrowError("Notification title cannot be empty");
		});

		it("should throw error when no updates provided", async () => {
			const { userId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				return await createTestOrg(ctx);
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const notificationId = await asUser.mutation(api.notifications.create, {
				userId,
				notificationType: "task_reminder",
				title: "Original Title",
				message: "Original message",
			});

			await expect(
				asUser.mutation(api.notifications.update, {
					id: notificationId,
				})
			).rejects.toThrowError("No valid updates provided");
		});
	});
});
