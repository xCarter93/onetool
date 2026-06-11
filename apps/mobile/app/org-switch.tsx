import {
	View,
	Text,
	Pressable,
	ActivityIndicator,
	Alert,
	Image,
	StyleSheet,
	ScrollView,
} from "react-native";
import { useEffect, useState } from "react";
import { useOrganizationList, useOrganization } from "@clerk/expo";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, Building, RefreshCw, X } from "lucide-react-native";
import { fontFamily, type, useTokens } from "@/lib/theme";
import { Avatar } from "@/components/ui";
import { CenteredModal } from "@/components/ipad/centered-modal";
import { useDevice } from "@/lib/use-device";

const MEMBERSHIP_PAGE_SIZE = 25;

function formatRole(role: string): string {
	const normalized = role.replace(/^org:/, "").replace(/[_-]/g, " ");
	return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

// Org switcher form-sheet body. Sheet chrome (detents/grabber) comes from the
// Stack.Screen options in _layout.tsx — this file is the content only.
// Clerk setActive path is ported verbatim from components/OrganizationSwitcher.tsx
// (the proven switch path); the ConvexProvider key-reinit in _layout.tsx re-scopes
// every query on org change.
export default function OrgSwitchSheet() {
	const t = useTokens();
	const insets = useSafeAreaInsets();
	const { device } = useDevice();
	const { userMemberships, setActive, isLoaded } = useOrganizationList({
		userMemberships: {
			infinite: true,
			keepPreviousData: true,
			pageSize: MEMBERSHIP_PAGE_SIZE,
		},
	});
	const { organization: activeOrg } = useOrganization();
	const [switching, setSwitching] = useState(false);

	const organizationList = userMemberships.data ?? [];
	const membershipIsLoading = Boolean(userMemberships.isLoading);
	const membershipIsFetching = Boolean(userMemberships.isFetching);
	const membershipIsError = Boolean(userMemberships.isError);
	const hasNextMembershipPage = Boolean(userMemberships.hasNextPage);
	const loadingMemberships =
		!isLoaded || (membershipIsLoading && organizationList.length === 0);

	useEffect(() => {
		if (!isLoaded || !hasNextMembershipPage || membershipIsFetching) return;
		userMemberships.fetchNext?.();
	}, [
		isLoaded,
		hasNextMembershipPage,
		membershipIsFetching,
		userMemberships.fetchNext,
	]);

	const handleOrgSwitch = async (orgId: string) => {
		try {
			setSwitching(true);

			// Switch the active organization in Clerk
			if (!setActive) {
				throw new Error("Clerk is not ready to switch organizations.");
			}
			await setActive({ organization: orgId });

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

	const content = (
		<>
			<View style={styles.header}>
				<View style={{ flex: 1 }} />
				<Text style={[styles.title, { color: t.ink }]}>
					Switch organization
				</Text>
				<View style={styles.headerAction}>
					<Pressable
						onPress={() => router.back()}
						hitSlop={8}
						accessibilityRole="button"
						accessibilityLabel="Close"
						style={styles.closeBtn}
					>
						<X size={22} color={t.sub} />
					</Pressable>
				</View>
			</View>

			{loadingMemberships ? (
				<View style={styles.state}>
					<ActivityIndicator size="small" color={t.accent} />
				</View>
			) : membershipIsError ? (
				<View style={styles.state}>
					<Building size={42} color={t.faint} />
					<Text style={[styles.emptyTitle, { color: t.ink }]}>
						Unable to load organizations
					</Text>
					<Text style={[styles.emptySub, { color: t.sub }]}>
						Check your connection and try again.
					</Text>
					<Pressable
						onPress={() => void userMemberships.revalidate?.()}
						style={({ pressed }) => [
							styles.retryButton,
							{
								backgroundColor: pressed ? t.accentMid : t.accentSoft,
							},
						]}
					>
						<RefreshCw size={16} color={t.accent} />
						<Text style={[styles.retryText, { color: t.accent }]}>Retry</Text>
					</Pressable>
				</View>
			) : (
				<ScrollView
					style={styles.list}
					contentContainerStyle={[
						styles.listContent,
						organizationList.length === 0 && styles.emptyListContent,
					]}
					showsVerticalScrollIndicator={organizationList.length > 6}
				>
					{organizationList.length > 0 ? (
						organizationList.map((membership) => {
							const org = membership.organization;
							const isActive = org.id === activeOrg?.id;
							const role = formatRole(membership.role ?? "member");

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
											<Avatar text={(org.name || "O").slice(0, 2)} size={40} />
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
											<Text style={[styles.role, { color: t.sub }]}>
												{role}
											</Text>
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

					{membershipIsFetching && organizationList.length > 0 ? (
						<View style={styles.loadingMore}>
							<ActivityIndicator size="small" color={t.accent} />
						</View>
					) : null}
				</ScrollView>
			)}

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
		</>
	);

	// iPad (Strategy B): centered card; maxHeight 86% so a long org list scrolls within it.
	if (device === "ipad") {
		return (
			<CenteredModal onScrimPress={() => router.back()} maxHeight="86%">
				<View style={[styles.padCard, { backgroundColor: t.card }]}>
					{content}
				</View>
			</CenteredModal>
		);
	}

	// iPhone — existing bottom sheet, byte-identical.
	return (
		<View
			style={[
				styles.container,
				{
					backgroundColor: t.card,
					paddingBottom: insets.bottom,
				},
			]}
		>
			<View style={[styles.grabber, { backgroundColor: t.border }]} />
			{content}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		borderTopLeftRadius: 30,
		borderTopRightRadius: 30,
		overflow: "hidden",
	},
	// iPad card (CenteredModal supplies the shell + radius + maxHeight bound).
	padCard: {
		flexShrink: 1,
		paddingTop: 18,
	},
	grabber: {
		alignSelf: "center",
		width: 44,
		height: 5,
		borderRadius: 999,
		marginTop: 10,
		marginBottom: 16,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 20,
		paddingBottom: 18,
	},
	title: {
		flex: 2,
		textAlign: "center",
		fontSize: 21,
		lineHeight: 30,
		fontFamily: fontFamily.bold,
	},
	headerAction: {
		flex: 1,
		alignItems: "flex-end",
	},
	closeBtn: {
		width: 32,
		height: 32,
		borderRadius: 999,
		alignItems: "center",
		justifyContent: "center",
	},
	state: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 32,
		gap: 10,
	},
	list: {
		flex: 1,
	},
	listContent: {
		paddingHorizontal: 16,
		paddingBottom: 24,
	},
	emptyListContent: {
		flexGrow: 1,
		justifyContent: "center",
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
		textAlign: "center",
	},
	emptySub: {
		fontSize: type.xs,
		fontFamily: fontFamily.regular,
		textAlign: "center",
	},
	retryButton: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		borderRadius: 999,
		paddingHorizontal: 14,
		paddingVertical: 10,
		marginTop: 8,
	},
	retryText: {
		fontSize: type.sm,
		fontFamily: fontFamily.semibold,
	},
	loadingMore: {
		alignItems: "center",
		paddingVertical: 12,
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
