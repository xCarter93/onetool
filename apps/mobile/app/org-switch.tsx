import {
	View,
	Text,
	Pressable,
	ScrollView,
	ActivityIndicator,
	Alert,
	Image,
	StyleSheet,
} from "react-native";
import { useState } from "react";
import { useOrganizationList, useOrganization } from "@clerk/expo";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, Building } from "lucide-react-native";
import { fontFamily, type, useTokens } from "@/lib/theme";
import { Avatar } from "@/components/ui";

// Org switcher form-sheet body. Sheet chrome (detents/grabber) comes from the
// Stack.Screen options in _layout.tsx — this file is the content only.
// Clerk setActive path is ported verbatim from components/OrganizationSwitcher.tsx
// (the proven switch path); the ConvexProvider key-reinit in _layout.tsx re-scopes
// every query on org change.
export default function OrgSwitchSheet() {
	const t = useTokens();
	const insets = useSafeAreaInsets();
	const { userMemberships, setActive, isLoaded } = useOrganizationList({
		userMemberships: {
			infinite: true,
		},
	});
	const { organization: activeOrg } = useOrganization();
	const [switching, setSwitching] = useState(false);

	const handleOrgSwitch = async (orgId: string) => {
		try {
			setSwitching(true);

			// Switch the active organization in Clerk
			await setActive?.({ organization: orgId });

			// Settle so Clerk finishes updating before the ConvexProvider key-reinit fires
			await new Promise((resolve) => setTimeout(resolve, 500));

			// Dismiss the sheet — ConvexProvider re-scopes queries via its key prop
			router.back();
		} catch (error) {
			console.error("Failed to switch organization:", error);
			Alert.alert("Error", "Failed to switch organization. Please try again.", [
				{ text: "OK" },
			]);
		} finally {
			setSwitching(false);
		}
	};

	if (!isLoaded) {
		return (
			<View style={[styles.container, styles.center]}>
				<ActivityIndicator size="small" color={t.accent} />
			</View>
		);
	}

	const organizationList = userMemberships?.data || [];

	return (
		<View style={[styles.container, { backgroundColor: t.card }]}>
			<View style={[styles.header, { borderBottomColor: t.line }]}>
				<Text style={[styles.title, { color: t.ink }]}>
					Switch organization
				</Text>
				<Pressable onPress={() => router.back()} hitSlop={8}>
					<Text style={[styles.cancel, { color: t.sub }]}>Cancel</Text>
				</Pressable>
			</View>

			<ScrollView
				style={styles.list}
				contentContainerStyle={{
					paddingHorizontal: 16,
					paddingTop: 12,
					paddingBottom: insets.bottom + 24,
				}}
			>
				{organizationList.length > 0 ? (
					organizationList.map((membership) => {
						const org = membership.organization;
						const isActive = org.id === activeOrg?.id;
						const role =
							membership.role.charAt(0).toUpperCase() +
							membership.role.slice(1);

						return (
							<Pressable
								key={org.id}
								onPress={() => handleOrgSwitch(org.id)}
								disabled={switching || isActive}
								style={({ pressed }) => [
									styles.row,
									{
										backgroundColor: isActive
											? t.surface
											: pressed
												? t.surface
												: "transparent",
										borderColor: isActive ? t.accent : t.line,
									},
								]}
							>
								<View style={styles.rowLeft}>
									{org.imageUrl ? (
										<Image
											source={{ uri: org.imageUrl }}
											style={styles.orgImage}
										/>
									) : (
										<Avatar text={org.name[0] || "O"} size={40} />
									)}
									<View style={styles.rowText}>
										<Text
											style={[
												styles.orgName,
												{
													color: t.ink,
													fontFamily: isActive
														? fontFamily.semibold
														: fontFamily.regular,
												},
											]}
											numberOfLines={1}
										>
											{org.name}
										</Text>
										<Text style={[styles.role, { color: t.sub }]}>{role}</Text>
									</View>
								</View>
								{isActive && <Check size={20} color={t.accent} />}
							</Pressable>
						);
					})
				) : (
					<View style={styles.empty}>
						<Building size={48} color={t.faint} />
						<Text style={[styles.emptyTitle, { color: t.ink }]}>
							No organizations found
						</Text>
						<Text style={[styles.emptySub, { color: t.sub }]}>
							You can create one from the web app.
						</Text>
					</View>
				)}
			</ScrollView>

			{switching && (
				<View
					style={[
						StyleSheet.absoluteFill,
						styles.overlay,
						{ backgroundColor: "rgba(255,255,255,0.9)" },
					]}
				>
					<ActivityIndicator size="large" color={t.accent} />
					<Text style={[styles.overlayText, { color: t.ink }]}>
						Switching organization...
					</Text>
				</View>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	center: {
		alignItems: "center",
		justifyContent: "center",
	},
	// Own padded header row above the list. minHeight + grabber clearance keep
	// the title/Cancel from colliding with the first org row; the hairline border
	// visually anchors the header so the list scrolls beneath, not under, it.
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		minHeight: 56,
		paddingHorizontal: 16,
		paddingTop: 24,
		paddingBottom: 14,
		borderBottomWidth: StyleSheet.hairlineWidth,
	},
	list: {
		flex: 1,
	},
	title: {
		fontSize: 18,
		fontFamily: fontFamily.bold,
		letterSpacing: -0.3,
	},
	cancel: {
		fontSize: type.body,
		fontFamily: fontFamily.medium,
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		padding: 12,
		borderRadius: 14,
		borderWidth: 1,
		marginBottom: 8,
	},
	rowLeft: {
		flexDirection: "row",
		alignItems: "center",
		flex: 1,
		gap: 12,
	},
	orgImage: {
		width: 40,
		height: 40,
		borderRadius: 12,
	},
	rowText: {
		flex: 1,
	},
	orgName: {
		fontSize: type.body,
	},
	role: {
		fontSize: type.xs,
		fontFamily: fontFamily.regular,
		marginTop: 2,
	},
	empty: {
		alignItems: "center",
		paddingVertical: 48,
		gap: 8,
	},
	emptyTitle: {
		fontSize: type.body,
		fontFamily: fontFamily.semibold,
		marginTop: 8,
	},
	emptySub: {
		fontSize: type.xs,
		fontFamily: fontFamily.regular,
	},
	overlay: {
		alignItems: "center",
		justifyContent: "center",
		gap: 12,
	},
	overlayText: {
		fontSize: type.body,
		fontFamily: fontFamily.medium,
	},
});
