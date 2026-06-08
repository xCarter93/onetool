import {
	Modal,
	View,
	Text,
	StyleSheet,
	Pressable,
	ScrollView,
	KeyboardAvoidingView,
	Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, fontFamily, spacing, radius } from "@/lib/theme";
import { X, MessageSquare } from "lucide-react-native";
import { MentionFeed } from "./MentionFeed";
import { MentionInput } from "./MentionInput";
import { useState } from "react";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";

interface MentionModalProps {
	visible: boolean;
	onClose: () => void;
	entityType: "client" | "project" | "quote";
	entityId: Id<"clients"> | Id<"projects"> | Id<"quotes">;
	entityName: string;
}

export function MentionModal({
	visible,
	onClose,
	entityType,
	entityId,
	entityName,
}: MentionModalProps) {
	const [refreshKey, setRefreshKey] = useState(0);

	const handleMentionCreated = () => {
		// Trigger a refresh by updating the key
		setRefreshKey((prev) => prev + 1);
	};

	return (
		<Modal
			visible={visible}
			animationType="slide"
			presentationStyle="pageSheet"
			onRequestClose={onClose}
		>
			<SafeAreaView style={styles.container} edges={["top", "bottom"]}>
				<KeyboardAvoidingView
					behavior={Platform.OS === "ios" ? "padding" : "height"}
					style={styles.keyboardAvoid}
					keyboardVerticalOffset={0}
				>
					{/* Header */}
					<View style={styles.header}>
						<View style={styles.headerContent}>
							<View style={styles.headerIcon}>
								<MessageSquare size={20} color={colors.primary} />
							</View>
							<View style={styles.headerText}>
								<Text style={styles.headerTitle}>Team Communication</Text>
								<Text style={styles.headerSubtitle}>
									Mention team members about this {entityType}
								</Text>
							</View>
						</View>
						<Pressable onPress={onClose} style={styles.closeButton}>
							<X size={24} color={colors.foreground} />
						</Pressable>
					</View>

					{/* Content */}
					<ScrollView
						style={styles.content}
						contentContainerStyle={styles.contentContainer}
						keyboardShouldPersistTaps="handled"
					>
						{/* Message Feed */}
						<View key={refreshKey} style={styles.feedContainer}>
							<MentionFeed
								entityType={entityType}
								entityId={entityId.toString()}
							/>
						</View>
					</ScrollView>

					{/* Input at bottom */}
					<View style={styles.inputContainer}>
						<MentionInput
							entityType={entityType}
							entityId={entityId.toString()}
							entityName={entityName}
							onMentionCreated={handleMentionCreated}
						/>
					</View>
				</KeyboardAvoidingView>
			</SafeAreaView>
		</Modal>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: colors.background,
	},
	keyboardAvoid: {
		flex: 1,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.sm,
		borderBottomWidth: 1,
		borderBottomColor: colors.border,
		backgroundColor: colors.card,
	},
	headerContent: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
	},
	headerIcon: {
		width: 36,
		height: 36,
		borderRadius: radius.md,
		backgroundColor: "rgba(0, 166, 244, 0.08)",
		alignItems: "center",
		justifyContent: "center",
	},
	headerText: {
		flex: 1,
	},
	headerTitle: {
		fontSize: 14,
		fontFamily: fontFamily.semibold,
		color: colors.foreground,
	},
	headerSubtitle: {
		fontSize: 11,
		fontFamily: fontFamily.regular,
		color: colors.mutedForeground,
		marginTop: 2,
	},
	closeButton: {
		padding: spacing.xs,
		marginLeft: spacing.sm,
	},
	content: {
		flex: 1,
	},
	contentContainer: {
		padding: spacing.md,
	},
	feedContainer: {
		marginBottom: spacing.md,
	},
	inputContainer: {
		padding: spacing.md,
		borderTopWidth: 1,
		borderTopColor: colors.border,
		backgroundColor: colors.card,
	},
});
