import {
	View,
	Text,
	TextInput,
	StyleSheet,
	Pressable,
	Alert,
	Platform,
	ActivityIndicator,
} from "react-native";
import { useState, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { useAuth, useOrganization } from "@clerk/expo";
import { api } from "@onetool/backend/convex/_generated/api";
import { colors, fontFamily, spacing, radius } from "@/lib/theme";
import { Send, Paperclip, X } from "lucide-react-native";
import * as DocumentPicker from "expo-document-picker";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";

interface MentionInputProps {
	entityType: "client" | "project" | "quote";
	entityId: string;
	entityName: string;
	onMentionCreated?: () => void;
}

interface AttachmentFile {
	tempId: string;
	name: string;
	size: number;
	uri: string;
	mimeType: string;
	storageId?: Id<"_storage">;
	uploading: boolean;
	error?: string;
}

export function MentionInput({
	entityType,
	entityId,
	entityName,
	onMentionCreated,
}: MentionInputProps) {
	const [message, setMessage] = useState("");
	const [showUserList, setShowUserList] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [mentionedUsers, setMentionedUsers] = useState<
		Array<{ id: Id<"users">; name: string }>
	>([]);
	const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
	const [cursorPosition, setCursorPosition] = useState(0);
	const inputRef = useRef<TextInput>(null);

	// Fetch organization members from Clerk
	const { memberships } = useOrganization({
		memberships: {
			infinite: true,
		},
	});

	// Fetch Convex users to map Clerk users to Convex user IDs
	const convexUsers = useQuery(api.users.listByOrg);
	const createMention = useMutation(api.notifications.createMention);
	const syncUserFromClerk = useMutation(api.users.syncUserFromClerk);
	const generateUploadUrl = useMutation(
		api.messageAttachments.generateUploadUrl
	);

	// Build a map of organization users with both Clerk and Convex data
	const organizationUsers =
		memberships?.data
			?.map((membership) => {
				const clerkUser = membership.publicUserData;
				if (!clerkUser || !clerkUser.userId) return null;

				const convexUser = convexUsers?.find(
					(u) =>
						u.email === clerkUser.identifier ||
						u.externalId === clerkUser.userId
				);

				return {
					id: convexUser?._id || clerkUser.userId,
					name:
						clerkUser.firstName && clerkUser.lastName
							? `${clerkUser.firstName} ${clerkUser.lastName}`.trim()
							: clerkUser.identifier || "Unknown User",
					email: clerkUser.identifier || "",
					image: clerkUser.imageUrl || "",
					convexUserId: convexUser?._id,
				};
			})
			.filter((user): user is NonNullable<typeof user> => user !== null) || [];

	// Filter users based on search query
	const filteredUsers = organizationUsers.filter((user) =>
		user.name.toLowerCase().includes(searchQuery.toLowerCase())
	);

	// Handle text input change
	const handleTextChange = (text: string) => {
		setMessage(text);

		// Check for @ mentions
		const textBeforeCursor = text.slice(0, cursorPosition);
		const lastAtIndex = textBeforeCursor.lastIndexOf("@");

		if (lastAtIndex !== -1) {
			const searchText = textBeforeCursor.slice(lastAtIndex + 1);
			const lastMentionStart = textBeforeCursor.lastIndexOf("@[");
			const lastMentionEnd = textBeforeCursor.lastIndexOf("]");

			if (
				(lastMentionStart === -1 || lastMentionEnd > lastMentionStart) &&
				!searchText.includes(" ") &&
				!searchText.includes("[") &&
				!searchText.includes("]")
			) {
				setSearchQuery(searchText);
				setShowUserList(true);
			} else {
				setShowUserList(false);
			}
		} else {
			setShowUserList(false);
		}
	};

	// Handle user selection from dropdown
	const handleUserSelect = (
		userId: string,
		userName: string,
		convexUserId?: Id<"users">
	) => {
		const textBeforeCursor = message.slice(0, cursorPosition);
		const lastAtIndex = textBeforeCursor.lastIndexOf("@");

		if (lastAtIndex !== -1) {
			const beforeAt = message.slice(0, lastAtIndex);
			const afterCursor = message.slice(cursorPosition);
			const newMessage = `${beforeAt}@[${userName}] ${afterCursor}`;

			const finalUserId = convexUserId || (userId as Id<"users">);
			setMentionedUsers((prev) => [
				...prev,
				{ id: finalUserId, name: userName },
			]);

			setMessage(newMessage);
			setShowUserList(false);
			setCursorPosition(lastAtIndex + userName.length + 4); // +4 for @[] and space

			// Refocus input
			inputRef.current?.focus();
		}
	};

	// Handle file selection
	const handleFileSelect = async () => {
		try {
			const result = await DocumentPicker.getDocumentAsync({
				type: "*/*",
				copyToCacheDirectory: true,
				multiple: true,
			});

			if (result.canceled) return;

			const validatedAttachments: AttachmentFile[] = [];

			for (const asset of result.assets) {
				const tempId = Math.random().toString(36);

				// Validate file size (10MB limit)
				if (asset.size && asset.size > 10 * 1024 * 1024) {
					Alert.alert("File too large", `${asset.name} exceeds 10MB limit`);
					continue;
				}

				validatedAttachments.push({
					tempId,
					name: asset.name,
					size: asset.size || 0,
					uri: asset.uri,
					mimeType: asset.mimeType || "application/octet-stream",
					uploading: false,
					error: undefined,
				});
			}

			setAttachments((prev) => [...prev, ...validatedAttachments]);

			// Start uploading files
			for (const attachment of validatedAttachments) {
				const { tempId } = attachment;

				setAttachments((prev) =>
					prev.map((a) => (a.tempId === tempId ? { ...a, uploading: true } : a))
				);

				try {
					const uploadUrl = await generateUploadUrl();

					// Read file and upload
					const response = await fetch(attachment.uri);
					const blob = await response.blob();

					const uploadResult = await fetch(uploadUrl, {
						method: "POST",
						headers: { "Content-Type": attachment.mimeType },
						body: blob,
					});

					if (!uploadResult.ok) {
						throw new Error("Upload failed");
					}

					const { storageId } = (await uploadResult.json()) as {
						storageId: Id<"_storage">;
					};

					setAttachments((prev) =>
						prev.map((a) =>
							a.tempId === tempId
								? {
										...a,
										uploading: false,
										storageId: storageId as Id<"_storage">,
									}
								: a
						)
					);
				} catch (error) {
					console.error("File upload error:", error);
					setAttachments((prev) =>
						prev.map((a) =>
							a.tempId === tempId
								? { ...a, uploading: false, error: "Upload failed" }
								: a
						)
					);
				}
			}
		} catch (error) {
			console.error("Document picker error:", error);
		}
	};

	// Remove attachment
	const handleRemoveAttachment = (tempId: string) => {
		setAttachments((prev) => prev.filter((a) => a.tempId !== tempId));
	};

	// Format file size
	const formatFileSize = (bytes: number): string => {
		if (bytes === 0) return "0 Bytes";
		const k = 1024;
		const sizes = ["Bytes", "KB", "MB"];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
	};

	// Handle form submission
	const handleSubmit = async () => {
		if (!message.trim()) {
			Alert.alert("Error", "Please enter a message");
			return;
		}

		if (attachments.some((a) => a.uploading)) {
			Alert.alert("Error", "Please wait for files to finish uploading");
			return;
		}

		if (attachments.some((a) => a.error)) {
			Alert.alert("Error", "Please remove files with errors");
			return;
		}

		try {
			// Prepare attachment data
			const attachmentData = attachments
				.filter((a) => a.storageId)
				.map((a) => ({
					storageId: a.storageId!,
					fileName: a.name,
					fileSize: a.size,
					mimeType: a.mimeType,
				}));

			if (mentionedUsers.length === 0) {
				Alert.alert(
					"No recipients",
					"Please @mention a team member to notify them about this message"
				);
				return;
			}

			// Process each mentioned user
			for (const mentionedUser of mentionedUsers) {
				const user = organizationUsers.find(
					(u) =>
						u.convexUserId === mentionedUser.id || u.id === mentionedUser.id
				);

				if (!user) continue;

				let convexUserId = user.convexUserId;

				if (!convexUserId) {
					convexUserId = await syncUserFromClerk({
						clerkUserId: user.id,
						name: user.name,
						email: user.email,
						imageUrl: user.image,
					});
				}

				await createMention({
					taggedUserId: convexUserId,
					message: message,
					entityType,
					entityId,
					entityName,
					attachments: attachmentData.length > 0 ? attachmentData : undefined,
				});
			}

			// Clear form
			setMessage("");
			setMentionedUsers([]);
			setAttachments([]);

			Alert.alert("Success", "Message sent!");
			onMentionCreated?.();
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Failed to send message";
			Alert.alert("Error", errorMessage);
		}
	};

	return (
		<View style={styles.container}>
			{/* User list dropdown */}
			{showUserList && filteredUsers.length > 0 && (
				<View style={styles.userList}>
					{filteredUsers.slice(0, 5).map((user) => (
						<Pressable
							key={user.id}
							style={styles.userItem}
							onPress={() =>
								handleUserSelect(user.id, user.name, user.convexUserId)
							}
						>
							<View style={styles.userAvatar}>
								<Text style={styles.userAvatarText}>
									{user.name.slice(0, 2).toUpperCase()}
								</Text>
							</View>
							<View style={styles.userInfo}>
								<Text style={styles.userName}>{user.name}</Text>
								<Text style={styles.userEmail} numberOfLines={1}>
									{user.email}
								</Text>
							</View>
						</Pressable>
					))}
				</View>
			)}

			{/* Attachments preview */}
			{attachments.length > 0 && (
				<View style={styles.attachmentsList}>
					{attachments.map((attachment) => (
						<View key={attachment.tempId} style={styles.attachmentChip}>
							<Text style={styles.attachmentName} numberOfLines={1}>
								{attachment.name}
							</Text>
							<Text style={styles.attachmentSize}>
								{formatFileSize(attachment.size)}
							</Text>
							{attachment.uploading ? (
								<ActivityIndicator size="small" color={colors.primary} />
							) : attachment.error ? (
								<Text style={styles.attachmentError}>✕</Text>
							) : (
								<Pressable
									onPress={() => handleRemoveAttachment(attachment.tempId)}
									hitSlop={8}
								>
									<X size={16} color={colors.mutedForeground} />
								</Pressable>
							)}
						</View>
					))}
				</View>
			)}

			{/* Mentioned users indicator */}
			{mentionedUsers.length > 0 && (
				<View style={styles.mentionedIndicator}>
					<Text style={styles.mentionedText}>
						Mentioning: {mentionedUsers.map((u) => u.name).join(", ")}
					</Text>
				</View>
			)}

			{/* Input row */}
			<View style={styles.inputRow}>
				<TextInput
					ref={inputRef}
					style={styles.textInput}
					value={message}
					onChangeText={handleTextChange}
					onSelectionChange={(event) =>
						setCursorPosition(event.nativeEvent.selection.start)
					}
					placeholder="Type @ to mention someone..."
					placeholderTextColor={colors.mutedForeground}
					multiline
					textAlignVertical="top"
					numberOfLines={3}
				/>
				<View style={styles.actions}>
					<Pressable onPress={handleFileSelect} style={styles.actionButton}>
						<Paperclip size={20} color={colors.foreground} />
					</Pressable>
					<Pressable
						onPress={handleSubmit}
						style={[
							styles.sendButton,
							(!message.trim() ||
								attachments.some((a) => a.uploading || a.error)) &&
								styles.sendButtonDisabled,
						]}
						disabled={
							!message.trim() || attachments.some((a) => a.uploading || a.error)
						}
					>
						<Send size={18} color="#ffffff" />
					</Pressable>
				</View>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		gap: spacing.xs,
	},
	userList: {
		backgroundColor: colors.card,
		borderRadius: radius.md,
		borderWidth: 1,
		borderColor: colors.border,
		maxHeight: 200,
		marginBottom: spacing.xs,
	},
	userItem: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		padding: spacing.sm,
		borderBottomWidth: 1,
		borderBottomColor: colors.border,
	},
	userAvatar: {
		width: 32,
		height: 32,
		borderRadius: 16,
		backgroundColor: colors.primary,
		alignItems: "center",
		justifyContent: "center",
	},
	userAvatarText: {
		fontSize: 11,
		fontFamily: fontFamily.semibold,
		color: "#ffffff",
	},
	userInfo: {
		flex: 1,
		minWidth: 0,
	},
	userName: {
		fontSize: 13,
		fontFamily: fontFamily.medium,
		color: colors.foreground,
	},
	userEmail: {
		fontSize: 11,
		fontFamily: fontFamily.regular,
		color: colors.mutedForeground,
	},
	attachmentsList: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: spacing.xs,
		marginBottom: spacing.xs,
	},
	attachmentChip: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
		backgroundColor: colors.muted,
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.xs,
		borderRadius: radius.sm,
		maxWidth: 200,
	},
	attachmentName: {
		flex: 1,
		fontSize: 11,
		fontFamily: fontFamily.medium,
		color: colors.foreground,
	},
	attachmentSize: {
		fontSize: 10,
		fontFamily: fontFamily.regular,
		color: colors.mutedForeground,
	},
	attachmentError: {
		fontSize: 12,
		color: "#ef4444",
	},
	mentionedIndicator: {
		backgroundColor: "rgba(0, 166, 244, 0.08)",
		padding: spacing.xs,
		borderRadius: radius.sm,
		marginBottom: spacing.xs,
	},
	mentionedText: {
		fontSize: 11,
		fontFamily: fontFamily.medium,
		color: colors.primary,
	},
	inputRow: {
		flexDirection: "row",
		alignItems: "flex-end",
		gap: spacing.sm,
	},
	textInput: {
		flex: 1,
		minHeight: 80,
		maxHeight: 120,
		backgroundColor: colors.card,
		borderRadius: radius.md,
		borderWidth: 1,
		borderColor: colors.border,
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.sm,
		fontSize: 14,
		fontFamily: fontFamily.regular,
		color: colors.foreground,
	},
	actions: {
		gap: spacing.xs,
	},
	actionButton: {
		width: 40,
		height: 40,
		borderRadius: radius.md,
		backgroundColor: colors.card,
		borderWidth: 1,
		borderColor: colors.border,
		alignItems: "center",
		justifyContent: "center",
	},
	sendButton: {
		width: 40,
		height: 40,
		borderRadius: radius.md,
		backgroundColor: colors.primary,
		alignItems: "center",
		justifyContent: "center",
	},
	sendButtonDisabled: {
		opacity: 0.5,
	},
});
