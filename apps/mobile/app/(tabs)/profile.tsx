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
import { useUser, useAuth, useOrganization } from "@clerk/expo";
import { colors, spacing, fontFamily, radius } from "@/lib/theme";
import { Mail, Building, LogOut, Shield } from "lucide-react-native";
import { AppHeader } from "@/components/app-header";

export default function ProfileScreen() {
	const { user } = useUser();
	const { signOut } = useAuth();
	const { organization, membership } = useOrganization();

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
			edges={[]}
		>
			<AppHeader mode="detail" title="Profile" />
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
		fontSize: 28,
		fontFamily: fontFamily.semibold,
	},
	userName: {
		fontSize: 20,
		fontFamily: fontFamily.bold,
		color: colors.foreground,
		marginBottom: 4,
	},
	userEmail: {
		fontSize: 13,
		fontFamily: fontFamily.regular,
		color: colors.mutedForeground,
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
		fontSize: 11,
		fontFamily: fontFamily.regular,
		color: colors.mutedForeground,
	},
	detailValue: {
		fontSize: 13,
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
		fontSize: 13,
	},
	appInfo: {
		alignItems: "center",
		marginTop: spacing.lg,
	},
	appInfoText: {
		fontSize: 11,
		fontFamily: fontFamily.regular,
		color: colors.mutedForeground,
	},
	appInfoVersion: {
		fontSize: 11,
		fontFamily: fontFamily.regular,
		color: colors.mutedForeground,
		marginTop: 4,
	},
});

