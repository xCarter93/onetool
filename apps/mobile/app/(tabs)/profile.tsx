import {
	View,
	Text,
	ScrollView,
	Alert,
	Image,
	Pressable,
	StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState } from "react";
import { useUser, useAuth, useOrganization } from "@clerk/expo";
import { colors, spacing, fontFamily, radius } from "@/lib/theme";
import { Mail, Building, LogOut, Shield, Bell } from "lucide-react-native";
import { NotificationModal } from "@/components/NotificationModal";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";

export default function ProfileScreen() {
	const [notificationModalVisible, setNotificationModalVisible] =
		useState(false);
	const { user } = useUser();
	const { signOut } = useAuth();
	const { organization, membership } = useOrganization();

	// Fetch notification count for badge
	const notificationData = useQuery(api.notifications.listForCurrentUser, {
		limit: 1,
	});
	const unreadCount = notificationData?.unreadCount || 0;

	const handleSignOut = () => {
		Alert.alert("Sign Out", "Are you sure you want to sign out?", [
			{ text: "Cancel", style: "cancel" },
			{
				text: "Sign Out",
				style: "destructive",
				onPress: () => signOut(),
			},
		]);
	};

	return (
		<SafeAreaView
			style={{ flex: 1, backgroundColor: colors.background }}
			edges={["bottom"]}
		>
			<ScrollView
				style={{ flex: 1 }}
				contentContainerStyle={{ padding: spacing.md }}
			>
				{/* User Avatar & Name */}
				<View style={styles.profileHeader}>
					{user?.imageUrl ? (
						<Image
							source={{ uri: user.imageUrl }}
							style={styles.avatar}
						/>
					) : (
						<View style={styles.avatarPlaceholder}>
							<Text style={styles.avatarText}>
								{user?.firstName?.[0] ||
									user?.emailAddresses[0]?.emailAddress[0]?.toUpperCase()}
							</Text>
						</View>
					)}

					<Text style={styles.userName}>
						{user?.firstName} {user?.lastName}
					</Text>
					<Text style={styles.userEmail}>
						{user?.primaryEmailAddress?.emailAddress}
					</Text>
				</View>

				{/* Notifications Button */}
				<Pressable
					style={styles.notificationButton}
					onPress={() => setNotificationModalVisible(true)}
				>
					<View style={styles.notificationButtonContent}>
						<Bell size={20} color={colors.foreground} />
						<Text style={styles.notificationButtonText}>Notifications</Text>
					</View>
					{unreadCount > 0 && (
						<View style={styles.notificationBadge}>
							<Text style={styles.notificationBadgeText}>
								{unreadCount > 9 ? "9+" : unreadCount}
							</Text>
						</View>
					)}
				</Pressable>

				{/* Account Details */}
				<View style={styles.detailsCard}>
					{/* Email */}
					<View style={styles.detailRow}>
						<Mail size={20} color={colors.mutedForeground} />
						<View style={styles.detailContent}>
							<Text style={styles.detailLabel}>Email</Text>
							<Text style={styles.detailValue}>
								{user?.primaryEmailAddress?.emailAddress}
							</Text>
						</View>
					</View>

					{/* Organization */}
					{organization && (
						<View style={[styles.detailRow, styles.detailRowBorder]}>
							<Building size={20} color={colors.mutedForeground} />
							<View style={styles.detailContent}>
								<Text style={styles.detailLabel}>Organization</Text>
								<Text style={styles.detailValue}>{organization.name}</Text>
							</View>
						</View>
					)}

					{/* Role */}
					{membership && (
						<View style={[styles.detailRow, styles.detailRowBorder]}>
							<Shield size={20} color={colors.mutedForeground} />
							<View style={styles.detailContent}>
								<Text style={styles.detailLabel}>Role</Text>
								<Text style={styles.detailValue}>
									{membership.role.charAt(0).toUpperCase() +
										membership.role.slice(1)}
								</Text>
							</View>
						</View>
					)}
				</View>

				{/* Sign Out Button */}
				<Pressable style={styles.signOutButton} onPress={handleSignOut}>
					<LogOut size={20} color={colors.danger} />
					<Text style={styles.signOutText}>Sign Out</Text>
				</Pressable>

				{/* App Info */}
				<View style={styles.appInfo}>
					<Text style={styles.appInfoText}>OneTool Mobile</Text>
					<Text style={styles.appInfoVersion}>Version 1.0.0</Text>
				</View>
			</ScrollView>

			{/* Notification Modal */}
			<NotificationModal
				visible={notificationModalVisible}
				onClose={() => setNotificationModalVisible(false)}
			/>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	profileHeader: {
		alignItems: "center",
		marginBottom: spacing.lg,
		paddingVertical: spacing.lg,
	},
	avatar: {
		width: 80,
		height: 80,
		borderRadius: 40,
		marginBottom: spacing.md,
	},
	avatarPlaceholder: {
		width: 80,
		height: 80,
		borderRadius: 40,
		backgroundColor: colors.primary,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: spacing.md,
	},
	avatarText: {
		color: "#fff",
		fontSize: 32,
		fontFamily: fontFamily.semibold,
	},
	userName: {
		fontSize: 22,
		fontFamily: fontFamily.bold,
		color: colors.foreground,
		marginBottom: 4,
	},
	userEmail: {
		fontSize: 14,
		fontFamily: fontFamily.regular,
		color: colors.mutedForeground,
	},
	notificationButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingVertical: spacing.md,
		paddingHorizontal: spacing.md,
		borderRadius: radius.lg,
		marginBottom: spacing.md,
		backgroundColor: colors.muted,
	},
	notificationButtonContent: {
		flexDirection: "row",
		alignItems: "center",
	},
	notificationButtonText: {
		marginLeft: spacing.sm,
		fontFamily: fontFamily.semibold,
		fontSize: 15,
		color: colors.foreground,
	},
	notificationBadge: {
		backgroundColor: colors.danger,
		borderRadius: 10,
		minWidth: 24,
		height: 24,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 6,
	},
	notificationBadgeText: {
		color: "#fff",
		fontSize: 12,
		fontFamily: fontFamily.semibold,
	},
	detailsCard: {
		backgroundColor: colors.muted,
		borderRadius: radius.lg,
		padding: spacing.md,
	},
	detailRow: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: spacing.sm,
	},
	detailRowBorder: {
		marginTop: spacing.sm,
		borderTopWidth: 1,
		borderTopColor: colors.border,
	},
	detailContent: {
		marginLeft: spacing.md,
		flex: 1,
	},
	detailLabel: {
		fontSize: 12,
		fontFamily: fontFamily.regular,
		color: colors.mutedForeground,
	},
	detailValue: {
		fontSize: 15,
		fontFamily: fontFamily.regular,
		color: colors.foreground,
	},
	signOutButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: spacing.md,
		borderRadius: radius.md,
		marginTop: spacing.lg,
		backgroundColor: colors.muted,
	},
	signOutText: {
		marginLeft: spacing.sm,
		color: colors.danger,
		fontFamily: fontFamily.semibold,
		fontSize: 15,
	},
	appInfo: {
		alignItems: "center",
		marginTop: spacing.lg,
	},
	appInfoText: {
		fontSize: 12,
		fontFamily: fontFamily.regular,
		color: colors.mutedForeground,
	},
	appInfoVersion: {
		fontSize: 12,
		fontFamily: fontFamily.regular,
		color: colors.mutedForeground,
		marginTop: 4,
	},
});

