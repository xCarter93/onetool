import {
	View,
	Text,
	StyleSheet,
	ActivityIndicator,
	Pressable,
	Linking,
} from "react-native";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { colors, fontFamily, spacing, radius } from "@/lib/theme";
import { MessageSquare, Download, FileText, Sparkles } from "lucide-react-native";
import { formatRelativeTime } from "@/lib/notification-utils";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";

interface MentionFeedProps {
	entityType: "client" | "project" | "quote";
	entityId: string;
}

// Helper to parse message and identify mentions
const parseMessageParts = (
	message: string
): Array<{ text: string; isMention: boolean }> => {
	const parts: Array<{ text: string; isMention: boolean }> = [];
	const mentionRegex = /@\[([^\]]+)\]/g;
	let lastIndex = 0;
	let match;

	while ((match = mentionRegex.exec(message)) !== null) {
		// Add text before mention
		if (match.index > lastIndex) {
			parts.push({
				text: message.slice(lastIndex, match.index),
				isMention: false,
			});
		}
		// Add mention
		parts.push({
			text: match[0], // Keep the @[name] format for display
			isMention: true,
		});
		lastIndex = match.index + match[0].length;
	}

	// Add remaining text
	if (lastIndex < message.length) {
		parts.push({
			text: message.slice(lastIndex),
			isMention: false,
		});
	}

	return parts;
};

// Component to display attachments
function AttachmentItem({
	teamMessageId,
}: {
	teamMessageId: Id<"teamMessages">;
}) {
	const attachments = useQuery(
		api.messageAttachments.listByTeamMessageWithUrls,
		{
			teamMessageId,
		}
	);

	if (!attachments || attachments.length === 0) {
		return null;
	}

	const formatFileSize = (bytes: number): string => {
		if (bytes === 0) return "0 Bytes";
		const k = 1024;
		const sizes = ["Bytes", "KB", "MB"];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
	};

	const handleAttachmentPress = async (downloadUrl: string) => {
		try {
			const canOpen = await Linking.canOpenURL(downloadUrl);
			if (canOpen) {
				await Linking.openURL(downloadUrl);
			}
		} catch (error) {
			console.error("Failed to open attachment:", error);
		}
	};

	return (
		<View style={styles.attachmentsContainer}>
			{attachments.map((attachment) => {
				if (!attachment.downloadUrl) return null;

				const isPdf = attachment.mimeType === "application/pdf";
				const isImage = attachment.mimeType.startsWith("image/");

				return (
					<Pressable
						key={attachment._id}
						style={({ pressed }) => [
							styles.attachmentItem,
							pressed && styles.attachmentItemPressed,
						]}
						onPress={() => handleAttachmentPress(attachment.downloadUrl!)}
					>
						<View style={styles.attachmentIcon}>
							<FileText
								size={14}
								color={isPdf ? "#ef4444" : colors.mutedForeground}
							/>
						</View>
						<View style={styles.attachmentInfo}>
							<Text style={styles.attachmentName} numberOfLines={1}>
								{attachment.fileName}
							</Text>
							<Text style={styles.attachmentSize}>
								{formatFileSize(attachment.fileSize)}
							</Text>
						</View>
						<Download size={14} color={colors.mutedForeground} />
					</Pressable>
				);
			})}
		</View>
	);
}

export function MentionFeed({ entityType, entityId }: MentionFeedProps) {
	const messages = useQuery(api.teamMessages.listByEntity, {
		entityType,
		entityId,
	});

	// Get initials for avatar fallback
	const getInitials = (name: string) => {
		const names = name.split(" ");
		if (names.length >= 2) {
			return `${names[0][0]}${names[1][0]}`.toUpperCase();
		}
		return name.slice(0, 2).toUpperCase();
	};

	// Loading state
	if (messages === undefined) {
		return (
			<View style={styles.loadingContainer}>
				<ActivityIndicator size="large" color={colors.primary} />
				<Text style={styles.loadingText}>Loading messages...</Text>
			</View>
		);
	}

	// Empty state
	if (messages.length === 0) {
		return (
			<View style={styles.emptyContainer}>
				<View style={styles.emptyIcon}>
					<MessageSquare size={40} color={colors.mutedForeground} />
				</View>
				<Text style={styles.emptyTitle}>No messages yet</Text>
				<Text style={styles.emptyText}>
					Start a conversation by mentioning a team member with @ in the input
					below.
				</Text>
			</View>
		);
	}

	return (
		<View style={styles.feedContainer}>
			{messages.map((message) => {
				const isAutomation = message.authorType === "automation";
				return (
					<View key={message._id} style={styles.mentionItem}>
						{/* Avatar */}
						<View style={styles.avatar}>
							{isAutomation ? (
								<Sparkles size={16} color="#ffffff" />
							) : (
								<Text style={styles.avatarText}>
									{getInitials(message.authorName)}
								</Text>
							)}
						</View>

						{/* Message content */}
						<View style={styles.messageContent}>
							{/* Header */}
							<View style={styles.messageHeader}>
								<Text style={styles.authorName} numberOfLines={1}>
									{message.authorName}
								</Text>
								{isAutomation && (
									<View style={styles.automationBadge}>
										<Text style={styles.automationBadgeText}>Automation</Text>
									</View>
								)}
								<Text style={styles.timestamp}>
									{formatRelativeTime(message.createdAt)}
								</Text>
							</View>

							{/* Message text with styled mentions */}
							<View style={styles.messageBubble}>
								<Text style={styles.messageText}>
									{parseMessageParts(message.message).map((part, index) =>
										part.isMention ? (
											<Text key={index} style={styles.mentionTag}>
												{part.text}
											</Text>
										) : (
											<Text key={index}>{part.text}</Text>
										)
									)}
								</Text>
							</View>

							{/* Attachments */}
							{message.hasAttachments && (
								<AttachmentItem teamMessageId={message._id} />
							)}
						</View>
					</View>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	loadingContainer: {
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: spacing.xl * 2,
		gap: spacing.md,
	},
	loadingText: {
		fontSize: 13,
		fontFamily: fontFamily.regular,
		color: colors.mutedForeground,
	},
	emptyContainer: {
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: spacing.xl * 2,
	},
	emptyIcon: {
		width: 80,
		height: 80,
		borderRadius: 40,
		backgroundColor: colors.muted,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: spacing.md,
	},
	emptyTitle: {
		fontSize: 15,
		fontFamily: fontFamily.semibold,
		color: colors.foreground,
		marginBottom: spacing.xs,
	},
	emptyText: {
		fontSize: 13,
		fontFamily: fontFamily.regular,
		color: colors.mutedForeground,
		textAlign: "center",
		maxWidth: 280,
		lineHeight: 20,
	},
	feedContainer: {
		gap: spacing.md,
	},
	mentionItem: {
		flexDirection: "row",
		gap: spacing.sm,
	},
	avatar: {
		width: 36,
		height: 36,
		borderRadius: 18,
		backgroundColor: colors.primary,
		alignItems: "center",
		justifyContent: "center",
	},
	avatarText: {
		fontSize: 11,
		fontFamily: fontFamily.semibold,
		color: "#ffffff",
	},
	messageContent: {
		flex: 1,
		minWidth: 0,
	},
	messageHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
		marginBottom: 4,
	},
	authorName: {
		flex: 1,
		fontSize: 13,
		fontFamily: fontFamily.semibold,
		color: colors.foreground,
	},
	automationBadge: {
		backgroundColor: "rgba(139, 92, 246, 0.12)",
		paddingHorizontal: 6,
		paddingVertical: 2,
		borderRadius: 4,
	},
	automationBadgeText: {
		fontSize: 10,
		fontFamily: fontFamily.semibold,
		color: "#8b5cf6",
	},
	timestamp: {
		fontSize: 11,
		fontFamily: fontFamily.regular,
		color: colors.mutedForeground,
	},
	messageBubble: {
		backgroundColor: colors.muted,
		borderRadius: radius.md,
		padding: spacing.sm,
		borderWidth: 1,
		borderColor: colors.border,
	},
	messageText: {
		fontSize: 13,
		fontFamily: fontFamily.regular,
		color: colors.foreground,
		lineHeight: 20,
	},
	mentionTag: {
		fontSize: 13,
		fontFamily: fontFamily.semibold,
		color: colors.primary,
		backgroundColor: "rgba(59, 130, 246, 0.12)",
		paddingHorizontal: 6,
		paddingVertical: 2,
		borderRadius: 4,
		overflow: "hidden",
	},
	attachmentsContainer: {
		marginTop: spacing.xs,
		gap: spacing.xs,
	},
	attachmentItem: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
		backgroundColor: colors.card,
		borderRadius: radius.sm,
		padding: spacing.xs,
		borderWidth: 1,
		borderColor: colors.border,
	},
	attachmentItemPressed: {
		opacity: 0.7,
	},
	attachmentIcon: {
		width: 28,
		height: 28,
		borderRadius: radius.sm,
		backgroundColor: colors.muted,
		alignItems: "center",
		justifyContent: "center",
	},
	attachmentInfo: {
		flex: 1,
		minWidth: 0,
	},
	attachmentName: {
		fontSize: 11,
		fontFamily: fontFamily.medium,
		color: colors.foreground,
	},
	attachmentSize: {
		fontSize: 10,
		fontFamily: fontFamily.regular,
		color: colors.mutedForeground,
	},
});
